import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { deleteDocument, DocumentUploadError, getDocument, notifyDocumentsChanged, renameDocument, subscribeDocuments, uploadDocuments } from "../lib/documents/client";
import type { DocumentSummary, DraftFile } from "../lib/documents/types";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  if (originalChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalChannel); else Reflect.deleteProperty(globalThis, "BroadcastChannel");
});

function localFile(id: string, name = "booking.pdf"): DraftFile {
  return { id, file: new File(["%PDF-1.7"], name, { type: "application/pdf" }) };
}
function summary(id: string, name = "booking.pdf", status: DocumentSummary["status"] = "ready"): DocumentSummary {
  return { id, name, originalName: name, mediaType: "application/pdf", size: 8, status, createdAt: "2026-10-26T12:00:00Z", updatedAt: "2026-10-26T12:00:00Z", revision: 1, usages: [] };
}

test("document upload preserves successful files and retries failed reservations with their original IDs", async () => {
  const files = [localFile("first"), localFile("second")];
  const ready = new Set<string>();
  const reservations: string[] = [];
  let failSecond = true;
  let puts = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target === "/api/trips/trip/documents") {
      const { id } = JSON.parse(String(init?.body));
      reservations.push(id);
      return Response.json({ document: summary(id), ready: ready.has(id), uploadUrl: `https://storage.test/${id}` });
    }
    if (target.startsWith("https://storage.test/")) { puts++; return new Response(null, { status: 200 }); }
    const id = target.split("/").at(-2)!;
    if (id === "second" && failSecond) return Response.json({ error: "Temporary storage error." }, { status: 503 });
    ready.add(id);
    return Response.json(summary(id));
  };
  await assert.rejects(uploadDocuments("trip", files, "library", () => {}), error => {
    assert.ok(error instanceof DocumentUploadError);
    assert.deepEqual(error.completed.map(file => file.id), ["first"]);
    return true;
  });
  failSecond = false;
  const retried = await uploadDocuments("trip", files, "library", () => {});
  assert.deepEqual(retried.map(file => file.id), ["first", "second"]);
  assert.deepEqual(reservations, ["first", "second", "first", "second"]);
  assert.equal(puts, 3, "the previously finalized file must not transfer again");
});

test("saved documents refresh metadata and never upload another object", async () => {
  const requests: string[] = [];
  const draft: DraftFile = { id: "existing", saved: true, file: { name: "old-name.pdf", size: 8, type: "application/pdf" } };
  globalThis.fetch = async (url, init) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    return Response.json(summary("existing", "renamed.pdf"));
  };
  const documents = await uploadDocuments("trip", [draft], "chat", () => {});
  assert.equal(documents[0].name, "renamed.pdf");
  assert.deepEqual(requests, ["GET /api/trips/trip/documents/existing"]);
  globalThis.fetch = async () => Response.json(summary("existing", "renamed.pdf", "deleting"));
  await assert.rejects(uploadDocuments("trip", [draft], "chat", () => {}), /no longer available/);
});

test("lost upload response is reconciled by finalization without losing the document", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).endsWith("/documents")) return Response.json({ document: summary("one"), ready: false, uploadUrl: "https://storage.test/one" });
    if (init?.method === "PUT") throw new Error("Response lost after storage accepted the bytes.");
    return Response.json(summary("one"));
  };
  const saved = await uploadDocuments("trip", [localFile("one")], "library", () => {});
  assert.equal(saved[0].id, "one");
  assert.deepEqual(calls, ["POST /api/trips/trip/documents", "PUT https://storage.test/one", "POST /api/trips/trip/documents/one/finalize"]);
});

test("same-named documents retain distinct IDs and existing originals are not overwritten", async () => {
  const ids: string[] = [];
  const upserts: string[] = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith("/documents")) {
      const { id } = JSON.parse(String(init?.body));
      ids.push(id);
      return Response.json({ document: summary(id), ready: false, uploadUrl: `https://storage.test/${id}` });
    }
    if (init?.method === "PUT") { upserts.push(new Headers(init.headers).get("x-upsert")!); return new Response(null); }
    return Response.json(summary(target.split("/").at(-2)!));
  };
  const files = await uploadDocuments("trip", [localFile("a"), localFile("b")], "library", () => {});
  assert.deepEqual(ids, ["a", "b"]);
  assert.deepEqual(files.map(file => file.id), ["a", "b"]);
  assert.deepEqual(upserts, ["false", "false"]);
});

test("rename conflict surfaces to the caller and a deliberate reload can supply a fresh revision", async () => {
  const expected: number[] = [];
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ ...summary("a", "changed-in-another-tab.pdf"), revision: 2 });
    const body = JSON.parse(String(init.body));
    expected.push(body.revision);
    if (body.revision !== 2) return Response.json({ error: "This document changed. Reload it before trying again." }, { status: 409 });
    return Response.json({ ...summary("a", body.name), revision: 3 });
  };
  await assert.rejects(renameDocument("trip", "a", "mine.pdf", 1), /Reload/);
  assert.deepEqual(expected, [1], "the client must not silently retry a stale mutation");
  const current = await getDocument("trip", "a");
  const saved = await renameDocument("trip", "a", "mine.pdf", current.revision);
  assert.equal(saved.revision, 3);
  assert.deepEqual(expected, [1, 2]);
});

test("pending deletion is a successful state, not a claim that bytes are already erased", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "DELETE");
    assert.deepEqual(JSON.parse(String(init?.body)), { revision: 1 });
    return Response.json(summary("a", "booking.pdf", "deleting"), { status: 202 });
  };
  assert.equal((await deleteDocument("trip", "a", 1)).status, "deleting");
});

test("document notifications are safe without browser globals and restricted channels do not fail uploads", async () => {
  assert.doesNotThrow(() => notifyDocumentsChanged("trip"));
  assert.doesNotThrow(() => subscribeDocuments("trip", () => {})());
  const events: Event[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (event: Event) => { events.push(event); return true; } } });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: class { constructor() { throw new Error("Disabled by browser policy"); } } });
  assert.doesNotThrow(() => notifyDocumentsChanged("trip"));
  assert.equal(events.length, 1);
  globalThis.fetch = async () => Response.json({ document: summary("a"), ready: true });
  const saved = await uploadDocuments("trip", [localFile("a")], "library", () => {});
  assert.equal(saved[0].id, "a");
});

test("uploads canonicalize browser MIME and reject binary text before reserving storage", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith("/documents")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.mediaType, "text/csv");
      return Response.json({ document: { ...summary(body.id, body.name), mediaType: "text/csv", size: body.size }, ready: false, uploadUrl: "https://storage.test/csv" });
    }
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("content-type"), "text/csv");
      return Response.json({});
    }
    return Response.json({ ...summary("csv", "data.csv"), mediaType: "text/csv" });
  };
  await uploadDocuments("trip", [{ id: "csv", file: new File(["city,value\nRoma,1"], "data.csv", { type: "application/vnd.ms-excel" }) }], "chat", () => {});
  assert.equal(calls.length, 3);
  calls.length = 0;
  await assert.rejects(uploadDocuments("trip", [{ id: "bad", file: new File([new Uint8Array([255])], "bad.txt", { type: "text/plain" }) }], "library", () => {}), /UTF-8/);
  assert.equal(calls.length, 0);
});
