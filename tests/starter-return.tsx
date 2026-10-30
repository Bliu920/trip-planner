"use client";

import { Activity, useEffect, useRef, useState } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import StartTrip from "@/lib/start-trip";
import { STORAGE_KEY } from "@/lib/trips";

// Isolate real starter requests.
export default function StarterReturnFixture() {
  const [ready, setReady] = useState(false);
  const [away, setAway] = useState(false);
  const [calls, setCalls] = useState<string[]>([]);
  const fail = useRef(false);
  useEffect(() => {
    const originalFetch = window.fetch;
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    let recent = "[]";
    let sequence = 0;
    Storage.prototype.getItem = function(key) { return key === STORAGE_KEY ? recent : originalGet.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key === STORAGE_KEY) recent = value; else originalSet.call(this, key, value); };
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url === "/api/places") return Response.json([]);
      if (url.startsWith("/api/trips")) {
        const method = init?.method ?? "GET";
        setCalls(current => [...current, `${method} ${url}`]);
        if (method === "POST" || method === "PATCH") {
          if (fail.current) { fail.current = false; return Response.json({ error: "Test save failed. Try again." }, { status: 503 }); }
          sequence += 1;
          return Response.json({ reference: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`, name: "Isolated fixture trip", notes: "Test", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
        return Response.json({ photos: [] });
      }
      // Never send fixture writes.
      if (init?.method && init.method !== "GET") throw new Error("Unexpected fixture write");
      return originalFetch(input, init);
    };
    return () => { window.fetch = originalFetch; Storage.prototype.getItem = originalGet; Storage.prototype.setItem = originalSet; };
  }, []);
  const router: AppRouterInstance = {
    back: () => setAway(false), forward: () => setAway(true), refresh: () => {},
    push: () => setAway(true), replace: () => setAway(true), prefetch: () => {}, bfcacheId: "retained-test-page",
  };
  return <AppRouterContext.Provider value={router}>
    <aside aria-label="Fixture controls">
      {!ready && <button className="cursor-pointer" onClick={() => setReady(true)}>Mount starter</button>}
      <button className="cursor-pointer" onClick={() => setAway(current => !current)}>{away ? "Return to starter" : "Leave draft"}</button>
      <button className="cursor-pointer" onClick={() => { fail.current = true; }}>Fail next save</button>
      <output aria-label="Fixture requests">{calls.join("\n")}</output>
    </aside>
    {ready && <Activity mode={away ? "hidden" : "visible"}><StartTrip /></Activity>}
    {away && <p>Simulated project. No database or model requests.</p>}
  </AppRouterContext.Provider>;
}
