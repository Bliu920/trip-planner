import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { asSchema } from "ai";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, seed, databaseFetch, reference, conversation } from "./chat-fixture";
import { handleChat } from "../services/assistant";
import { loadConversation } from "../services/assistant/conversation-store";
import { providerStream } from "./chat-fixture";
import { replyFailureText } from "../lib/chat/failure";
import { functionStream, examplePlan } from "./plan-fixture";
import { beginTurn, saveReply } from "../services/assistant/conversation-store";
import { openSession } from "../services/workspace";
import { prepareDocument } from "../services/documents";
import { workspaceRpc } from "../services/workspace/database";
import { getPlan, savePlan } from "../services/plans";
import { artifactTools } from "../services/assistant/agent/tools/artifacts";
import { ActionRun } from "../services/assistant/agent/actions";
import type { DraftRow } from "../services/workspace/drafts/model";
let db: PGlite, files: Map<string,string>;
const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "AGENT_WEB_SEARCH", "AGENT_DURABLE_DRAFTS", "HEIGIT_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL"];
const previous = keys.map(key => process.env[key]);
before(async () => { db = await createDatabase(); });
after(() => db.close());
beforeEach(async () => {
  await seed(db); files = new Map();
  Object.assign(process.env, { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_fixture", AGENT_WEB_SEARCH: "false", AGENT_DURABLE_DRAFTS: "true", OPENAI_API_KEY: "fixture", OPENAI_MODEL: "gpt-6-luna" });
  delete process.env.HEIGIT_API_KEY;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url)); assert.equal(target.hostname, "db.example", "No live provider or map calls.");
    const root = "/storage/v1/object/";
    if (target.pathname.startsWith(root + "authenticated/")) return new Response(files.get(target.pathname.slice((root + "authenticated/").length)) ?? null, { status: files.has(target.pathname.slice((root + "authenticated/").length)) ? 200 : 404 });
    if (target.pathname.startsWith(root) && init?.method === "POST") { files.set(target.pathname.slice(root.length), String(init.body)); return Response.json({}); }
    return databaseFetch(db, target, init);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; keys.forEach((key,i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
async function start(last: string | null = null, retry = false, id = "draft-user") {
  const generation = randomUUID(), controller = new AbortController();
  const turn = await beginTurn(reference, { conversationId: conversation, expectedLastId: last, retry, message: retry ? null : { id, text: "Plan three days in Rome, November 5 to 7, with our existing hotel and researched estimates." } }, generation);
  const env = await openSession(reference, conversation, turn.responseId, generation, controller.signal), run = new ActionRun(env), tools = artifactTools(env, run);
  return { env, run, tools, turn, generation, controller };
}
type Session = Awaited<ReturnType<typeof start>>;
async function call(session: Session, name: keyof Session["tools"], input: unknown, callId: string = randomUUID()) {
  const tool = session.tools[name]!;
  const parsed = await asSchema<unknown>(tool.inputSchema).validate!(input);
  assert.equal(parsed.success, true, JSON.stringify(parsed));
  if (!parsed.success) throw new Error("Invalid fixture input");
  // Exercise the actual registration boundary.
  return await tool.execute!(parsed.value as never, { toolCallId: callId, messages: [], abortSignal: session.controller.signal, context: {} }) as import("../lib/actions").ActionResult;
}
const row = async (operation: string) => (await db.query<DraftRow>("select * from public.planning_drafts where operation_id=$1", [operation])).rows[0];
const effective = (session: Session) => (session.env.artifacts!.readPlan({ view: "effective", selector: "full", ids: [] }) as { plan: ReturnType<typeof examplePlan> }).plan;
async function header(session: Session) {
  const result = await call(session, "createPlan", { plan: { startDate: "2026-11-05", days: [{ id: "day-1", title: "Art" }, { id: "day-2", title: "Food" }, { id: "day-3", title: "Gardens" }] }, userProvided: true }, "header");
  assert.equal(result.outcome, "succeeded", JSON.stringify(result));
}
async function visit(session: Session, id = "visit-1", dayId = "day-1", identity = "day-one") {
  const result = await call(session, "editPlan", { operations: [{ type: "addActivity", id, dayId, title: "Colosseum", placeId: "place_001", startTime: "09:00", durationMinutes: 90 }] }, identity);
  assert.equal(result.outcome, "succeeded", JSON.stringify(result));
  return result;
}
async function interrupt(session: Session) { await saveReply(reference, conversation, session.turn.responseId, session.generation, "Interrupted", "interrupted"); }
async function budget(session: Session) {
  const handle = session.env.recordWebSources!(["https://example.com/rate"], "2026-10-29T10:00:00Z")![0].sourceId;
  await call(session, "createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Synthetic test.", exclusions: [] } });
  const result = await call(session, "editBudget", { operations: [{ type: "addCost", id: "entry-1", label: "Admission", category: "activities", planItemIds: ["visit-1"], unit: "admission", quantity: 1, min: 18, max: 25, priceScope: "per_person", assumptions: "Synthetic rate.", sources: [{ sourceId: handle, detail: "Synthetic admission range." }] }, { type: "review" }] });
  assert.equal(result.outcome, "succeeded", JSON.stringify(result));
}
test("exact-input Retry restores accepted work, sources and mutation identity without partial publication", async () => {
  const first = await start(); await header(first); await visit(first); await budget(first);
  assert.equal((await getPlan(reference)).plan, null);
  const saved = await row(first.turn.responseId); assert.equal(saved.status, "active"); assert.ok(saved.payload);
  await interrupt(first); assert.equal((await row(first.turn.responseId)).status, "interrupted");
  const next = await start(first.turn.responseId, true);
  assert.equal(next.env.workProgress?.resumed, true); assert.equal(next.run.needsRecovery, true);
  assert.equal(effective(next).items["visit-1"].title, "Colosseum"); assert.ok(next.env.evidenceSources!().some(s => s.url === "https://example.com/rate"));
  const version = (await row(first.turn.responseId)).version;
  const replay = await visit(next); assert.equal((replay.data as { replayed: boolean }).replayed, true);
  assert.equal((await row(first.turn.responseId)).version, version); assert.equal(Object.keys(effective(next).items).length, 1);
  const result = await call(next, "commit", { summary: "Recovered trip", handledInputIds: [] });
  assert.equal(result.effect, "persisted", JSON.stringify(result)); assert.ok((await getPlan(reference)).plan);
  const published = await row(first.turn.responseId); assert.equal(published.status, "published"); assert.equal(published.payload, null);
  assert.equal((await db.query("select * from public.planning_commits")).rows.length, 1);
});
test("a new message with identical text does not inherit another operation's overlay", async () => {
  const first = await start(); await header(first); await visit(first); await interrupt(first);
  const next = await start(first.turn.responseId, false, "another-input");
  assert.equal(next.env.workProgress?.resumed, false); assert.equal(effective(next) ?? null, null);
  assert.equal((await row(first.turn.responseId)).status, "interrupted");
});
test("new generation rejects all old-generation progress and tracking writes", async () => {
  const first = await start(); await header(first); await interrupt(first);
  const next = await start(first.turn.responseId, true); const before = await row(first.turn.responseId);
  const result = await call(first, "editPlan", { operations: [{ type: "updateDay", id: "day-1", changes: { title: "Old generation" } }] });
  assert.notEqual(result.outcome, "succeeded"); assert.deepEqual(await row(first.turn.responseId), before);
  assert.equal(effective(next).days[0].title, "Art");
});
test("a lost progress response is verified by write identity without repeating the mutation", async () => {
  const session = await start(), fetcher = globalThis.fetch; let lost = false, puts = 0;
  globalThis.fetch = async (url, init) => { if (String(url).endsWith("/planning_draft_put")) { puts++; const response = await fetcher(url, init); if (!lost) { lost = true; throw new TypeError("network response lost"); } return response; } return fetcher(url, init); };
  await header(session); assert.equal(puts, 1); assert.equal((await row(session.turn.responseId)).version, 1);
  assert.equal(effective(session).days.length, 3); assert.equal(await session.env.workProgress!.verify(), true);
});
test("an unconfirmed progress write rolls back memory and stops further edits", async () => {
  const session = await start(), fetcher = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).endsWith("/planning_draft_put")) throw new TypeError("network unavailable"); return fetcher(url, init); };
  const result = await call(session, "createPlan", { plan: { startDate: null, days: [{ id: "day-1", title: "One" }, { id: "day-2", title: "Two" }, { id: "day-3", title: "Three" }] } });
  assert.equal(result.code, "DRAFT_WRITE_UNCONFIRMED"); assert.equal(result.recovery.action, "stop"); assert.equal(session.run.shouldStop, true);
  assert.equal(effective(session) ?? null, null); assert.equal(await session.env.workProgress!.verify(), false);
  assert.equal((await row(session.turn.responseId)).version, 0);
});
test("cancellation keeps the last confirmed snapshot and performs no further progress writes", async () => {
  const session = await start(); await header(session); const before = await row(session.turn.responseId);
  session.controller.abort(new DOMException("Stopped", "AbortError"));
  const result = await call(session, "editPlan", { operations: [{ type: "updateDay", id: "day-1", changes: { title: "Too late" } }] });
  assert.notEqual(result.outcome, "succeeded"); assert.deepEqual(await row(session.turn.responseId), before);
});
test("manual publication conflicts with an old base and never silently merges it", async () => {
  const session = await start(); await header(session); await visit(session);
  await savePlan(reference, 0, examplePlan(), randomUUID()); await interrupt(session);
  const payload = (await row(session.turn.responseId)).payload;
  await assert.rejects(start(session.turn.responseId, true), (error: unknown) => (error as { code: string }).code === "PLAN_CONFLICT");
  assert.equal((await row(session.turn.responseId)).payload, payload);
  assert.deepEqual((await getPlan(reference)).plan!.days, examplePlan().days);
});
test("early Brief publication advances its own recovery base atomically", async () => {
  const session = await start();
  const result = await call(session, "saveBrief", { expectedRevision: 0, markdown: "# Preferences\nArt. Original input: draft-user." });
  assert.equal(result.outcome, "succeeded", JSON.stringify(result));
  const saved = await row(session.turn.responseId); assert.equal(saved.base_revision, (await getPlan(reference)).revision); assert.ok(saved.base_revision > 0);
  await header(session); await interrupt(session); const next = await start(session.turn.responseId, true);
  assert.equal(next.env.workProgress?.resumed, true); assert.equal(effective(next).days.length, 3);
});
test("known deletion tombstones survive Retry and rejected fields remain independently blocking", async () => {
  const session = await start(); await header(session); await visit(session);
  await call(session, "editPlan", { operations: [{ type: "removeItem", id: "visit-1" }] });
  await call(session, "editPlan", { operations: [{ type: "updateActivity", id: "missing", changes: { startTime: "12:00" } }] });
  await interrupt(session); const next = await start(session.turn.responseId, true);
  const duplicate = await call(next, "editPlan", { operations: [{ type: "removeItem", id: "visit-1" }] });
  assert.equal(duplicate.outcome, "succeeded", JSON.stringify(duplicate));
  const manifest = next.env.artifacts!.manifest() as { rejectedEdits: { artifact: string }[] };
  assert.ok(manifest.rejectedEdits.some(issue => issue.artifact.includes("missing")));
});
test("disabling recovery cannot silently discard an existing unfinished candidate", async () => {
  const session = await start(); await header(session); await interrupt(session); process.env.AGENT_DURABLE_DRAFTS = "false";
  await assert.rejects(start(session.turn.responseId, true), (error: unknown) => (error as { code: string }).code === "DRAFT_DISABLED");
  assert.ok((await row(session.turn.responseId)).payload);
});
test("staged documents and exact source versions survive a fresh session and publish together", async () => {
  const first = await start(); await header(first); await visit(first); await budget(first);
  const created = await call(first, "createDocument", { name: "Research notes.md", kind: "research", content: "# Sources\nSynthetic admission evidence, checked October 29." });
  assert.equal(created.outcome, "succeeded", JSON.stringify(created)); const documentId = (created.data as { id: string }).id;
  await interrupt(first); const next = await start(first.turn.responseId, true);
  const text = await call(next, "readDocument", { id: documentId, view: "effective", contentRevision: null });
  assert.match((text.data as { content: string }).content, /Synthetic admission/);
  assert.equal((text.data as { proposedContentRevision: number }).proposedContentRevision, 1);
  const committed = await call(next, "commit", { summary: "Recovered research and plan", handledInputIds: [] });
  assert.equal(committed.effect, "persisted", JSON.stringify(committed));
  assert.equal((await db.query<{ content_revision: number }>("select content_revision from attachments where id=$1", [documentId])).rows[0].content_revision, 1);
});
test("research observations preserve the requirement for a genuine follow-up across Retry", async () => {
  process.env.AGENT_WEB_SEARCH = "true";
  const first = await start(); await header(first); await visit(first);
  await call(first, "createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Synthetic scope.", exclusions: [] } });
  await call(first, "editBudget", { operations: [{ type: "addCost", id: "unknown", label: "Admission", category: "activities", planItemIds: ["visit-1"], unit: "admission", quantity: 1, min: null, max: null, priceScope: "per_person", pricing: "unknown", assumptions: "Direct evidence unavailable.", sources: [] }] });
  await interrupt(first); const next = await start(first.turn.responseId, true);
  const gap = { entryId: "unknown", reason: "not_found", explanation: "No applicable direct or comparable evidence was found in the synthetic follow-up." };
  const premature = await call(next, "resolveBudgetGaps", { gaps: [gap] }); assert.equal(premature.outcome, "blocked");
  next.env.recordWebResearch!();
  const afterResearch = await call(next, "resolveBudgetGaps", { gaps: [gap] }); assert.equal(afterResearch.outcome, "succeeded", JSON.stringify(afterResearch));
  await call(next, "editBudget", { operations: [{ type: "review" }] });
  await interrupt(next); const third = await start(next.turn.responseId, true);
  const published = await call(third, "commit", { summary: "Explicit unknown after research", handledInputIds: [] });
  assert.equal(published.effect, "persisted", JSON.stringify(published));
});
test("a lost final publication response verifies the receipt and published draft marker", async () => {
  const session = await start(); await header(session); await visit(session); await budget(session);
  const fetcher = globalThis.fetch; let commits = 0;
  globalThis.fetch = async (url, init) => { const response = await fetcher(url, init); if (String(url).endsWith("/planning_commit_budget")) { commits++; throw new TypeError("commit response lost"); } return response; };
  const result = await call(session, "commit", { summary: "Lost response", handledInputIds: [] });
  assert.equal(result.effect, "persisted", JSON.stringify(result)); assert.equal(commits, 1);
  assert.equal((await row(session.turn.responseId)).status, "published"); assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
});
test("explicit reload discards an overlay and rebinds its private base without auto-merging", async () => {
  const session = await start(); await header(session); await visit(session);
  await savePlan(reference, 0, examplePlan(), randomUUID());
  const reset = await call(session, "reloadWorkspace", {}); assert.equal(reset.outcome, "succeeded", JSON.stringify(reset));
  const base = await getPlan(reference); assert.equal((await row(session.turn.responseId)).base_revision, base.revision);
  assert.deepEqual(effective(session).items, base.plan!.items);
  await interrupt(session); const resumed = await start(session.turn.responseId, true);
  assert.deepEqual(effective(resumed).items, base.plan!.items);
});
test("expiration is explicit and prunes the old private payload rather than restoring it", async () => {
  const first = await start(); await header(first); await interrupt(first);
  await db.query("update planning_drafts set expires_at=now()-interval '1 second' where operation_id=$1", [first.turn.responseId]);
  await assert.rejects(start(first.turn.responseId, true), (error: unknown) => (error as { code: string }).code === "DRAFT_EXPIRED");
  const expired = await row(first.turn.responseId); assert.equal(expired.payload, null); assert.equal(expired.status, "discarded");
});
test("a corrupt source index is classified as invalid recovery, without a provider request", async () => {
  const first = await start(); await header(first); await interrupt(first);
  const saved = await row(first.turn.responseId), payload = JSON.parse(saved.payload!);
  payload.evidence = [1,2].map(() => ({ sourceId: "s1", url: "https://example.com/evidence", documentId: null, documentRevision: null, checkedAt: "2026-10-29T10:00:00Z", title: "Synthetic" }));
  await db.query("update planning_drafts set payload=$1 where operation_id=$2", [JSON.stringify(payload), first.turn.responseId]);
  await assert.rejects(start(first.turn.responseId, true), (error: unknown) => (error as { code: string }).code === "DRAFT_INVALID");
});
test("anonymous roles cannot read private snapshots or call draft RPCs", async () => {
  const session = await start(); await header(session);
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select payload from planning_drafts"), /permission denied/);
    await assert.rejects(db.query("select planning_draft_read($1,$2,$3)", [reference, session.turn.responseId, session.generation]), /permission denied/);
  } finally { await db.exec("reset role"); }
});

test("an early Brief lost response reuses one write identity and checkpoints the advanced base", async () => {
  const session = await start(), fetcher = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, init) => { const response = await fetcher(url, init); if (String(url).endsWith("/planning_save_brief") && ++calls === 1) throw new TypeError("brief response lost"); return response; };
  const result = await call(session, "saveBrief", { expectedRevision: 0, markdown: "# Preferences\nArt. Source draft-user." });
  assert.equal(result.effect, "persisted", JSON.stringify(result));
  assert.equal((await row(session.turn.responseId)).base_revision, (await getPlan(reference)).revision);
  assert.equal((await db.query("select * from document_versions")).rows.length, 1);
});

test("a rejected transaction cannot publish a document, itinerary or private draft marker halfway", async () => {
  const session = await start(); await header(session); await visit(session); await budget(session);
  const before = await row(session.turn.responseId);
  const write = await prepareDocument(reference, { id: randomUUID(), kind: "working", name: "Planning decisions.md", markdown: "Synthetic planning choice.", expectedRevision: 0 }, "agent");
  const draftBudget = (session.env.artifacts!.readBudget({ view: "effective", selector: "full", ids: [] }) as { budget: import("../lib/budget").Budget }).budget;
  const invalid = structuredClone(draftBudget); invalid.entries[0].sources[0] = { ...invalid.entries[0].sources[0], url: null, documentId: randomUUID(), documentRevision: 1 };
  await assert.rejects(workspaceRpc("planning_commit_budget", { p_trip: reference, p_operation: session.turn.responseId, p_generation: session.generation, p_expected: before.base_revision, p_plan: effective(session), p_writes: [write.id], p_sources: [], p_handled: ["draft-user"], p_summary: "Must roll back", p_budget: invalid, p_budget_reviewed: true }), (error: unknown) => (error as { code: string }).code === "PLAN_SOURCE");
  assert.equal((await getPlan(reference)).plan, null); assert.equal((await db.query("select * from planning_commits")).rows.length, 0);
  assert.equal((await db.query("select * from document_versions")).rows.length, 0); assert.deepEqual(await row(session.turn.responseId), before);
});
test("snapshot CAS rejects stale versions, changed write identities and cross-trip access", async () => {
  const session = await start(); await header(session); const saved = await row(session.turn.responseId);
  const parameters = { p_trip: reference, p_operation: session.turn.responseId, p_generation: session.generation, p_base: saved.base_revision, p_expected: saved.version - 1, p_write: randomUUID(), p_payload: saved.payload, p_rebase: false };
  await assert.rejects(workspaceRpc("planning_draft_put", parameters), (error: unknown) => (error as { code: string }).code === "DRAFT_CONFLICT");
  await assert.rejects(workspaceRpc("planning_draft_put", { ...parameters, p_write: saved.last_write, p_payload: saved.payload!.replace('"planRequired":true', '"planRequired":false') }), (error: unknown) => (error as { code: string }).code === "DRAFT_INVALID");
  assert.equal(await workspaceRpc("planning_draft_read", { p_trip: "9d4dc012-9723-41ac-8a0c-de0e254c7562", p_operation: session.turn.responseId, p_generation: session.generation }), null);
  assert.deepEqual(await row(session.turn.responseId), saved);
});
test("restored user commitments remain protected against an unrelated follow-up edit", async () => {
  const first = await start(); await header(first); await visit(first); await budget(first);
  await call(first, "editPlan", { operations: [{ type: "setCommitment", id: "visit-1", keep: true, reservation: "booked", fixedStart: true }] });
  await call(first, "editBudget", { operations: [{ type: "review" }] });
  await interrupt(first); const next = await start(first.turn.responseId, true);
  assert.equal((effective(next).items["visit-1"] as import("../lib/plan").ActivityItem).timing.start?.binding, "fixed");
  const saved = await call(next, "commit", { summary: "Preserve booking", handledInputIds: [] }); assert.equal(saved.effect, "persisted", JSON.stringify(saved));
  await saveReply(reference, conversation, next.turn.responseId, next.generation, "Saved", "complete");
  const later = await start(next.turn.responseId, false, "later-input");
  const changed = await call(later, "editPlan", { operations: [{ type: "updateActivity", id: "visit-1", changes: { startTime: "12:00" } }] });
  assert.equal(changed.outcome, "blocked"); assert.equal((await getPlan(reference)).plan!.items["visit-1"].reservation?.state, "booked");
});

test("the real chat path reports verified progress after interruption and Retry publishes the resumed overlay once", async () => {
  const fetcher = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).hostname === "db.example") return fetcher(url, init);
    assert.equal(new URL(String(url)).hostname, "api.openai.com", "Only the scripted provider transport is allowed.");
    const body = JSON.parse(String(init?.body)); requests++;
    for (const part of body.input) if (part.type === "function_call") assert.equal("editToken" in JSON.parse(part.arguments), false);
    if (requests === 1) return functionStream("createPlan", { plan: { startDate: null, days: [{ id: "day-1", title: "Art" }, { id: "day-2", title: "Food" }, { id: "day-3", title: "Gardens" }] } });
    const activity = (day: number) => ({ type: "addActivity", id: `visit-${day}`, dayId: `day-${day}`, title: "Colosseum", placeId: "place_001", startTime: "09:00", durationMinutes: 90 });
    if (requests === 2) return functionStream("editPlan", { operations: [activity(1)] });
    if (requests === 3) return Response.json({ error: { message: "Synthetic unavailable service", type: "api_error", code: "server_is_overloaded" } }, { status: 503 });
    if (requests === 4) {
      assert.match(JSON.stringify(body), /resumed\\?":true/);
      assert.match(JSON.stringify(body), /visit-1/);
      assert.equal(body.tool_choice, "required", "Restored unfinished work cannot be answered without concrete completion work.");
      return functionStream("editPlan", { operations: [activity(2), activity(3)] });
    }
    if (requests === 5) return functionStream("createBudget", { budget: { currency: "EUR", scope: "per_person", travelers: 2, limit: 600, assumptions: "Synthetic scope.", exclusions: [] } });
    if (requests === 6) return functionStream("editBudget", { operations: [{ type: "addCost", id: "cost", label: "Unpriced fixture", category: "activities", planItemIds: ["visit-1"], unit: "admission", quantity: 1, min: null, max: null, pricing: "unknown", priceScope: "per_person", assumptions: "Synthetic research disabled.", sources: [] }] });
    if (requests === 7) return functionStream("resolveBudgetGaps", { gaps: [{ entryId: "cost", reason: "search_unavailable", explanation: "Synthetic offline environment has no research or comparable evidence." }] });
    if (requests === 8) return functionStream("editBudget", { operations: [{ type: "review" }] });
    if (requests === 9) return functionStream("commit", { summary: "Resumed all three days", handledInputIds: [] });
    assert.equal(body.tool_choice, "none"); return providerStream();
  };
  const request = (body: unknown) => new Request(`http://localhost/api/trips/${reference}/chat`, { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const first = await handleChat(request({ conversationId: conversation, expectedLastId: null, retry: false, message: { id: "sdk-draft-user", text: "Plan three days in Rome." } }), reference);
  await first.text(); const transcript = await loadConversation(reference, conversation), failed = transcript.messages.at(-1)!;
  const failure = failed.parts.find(part => part.type === "data-failure")?.data;
  assert.equal(failure?.code, "provider_error"); assert.equal(failure?.progressSaved, true);
  assert.match(replyFailureText(failure!.code, failure), /service failed.*Some planning progress is saved/);
  assert.equal((await getPlan(reference)).plan, null); assert.equal((await row(failed.id)).status, "interrupted");
  const retry = await handleChat(request({ conversationId: conversation, expectedLastId: failed.id, retry: true, message: null }), reference);
  await retry.text(); const completed = (await loadConversation(reference, conversation)).messages.at(-1)!;
  assert.equal(completed.metadata?.status, "complete"); assert.equal(completed.parts.some(part => part.type === "data-failure"), false);
  assert.equal(Object.keys((await getPlan(reference)).plan!.items).length, 3); assert.equal((await db.query("select * from planning_commits")).rows.length, 1);
  assert.equal((await row(failed.id)).status, "published"); assert.equal(requests, 10);
});
