import { test } from "node:test";
import assert from "node:assert/strict";
import { contentLayout, initialLayout } from "../lib/workspace/layout";

test("Chat starts alone; Library requires an explicit action", () => {
  assert.equal(initialLayout.contentOpen, false);
  assert.equal(contentLayout(initialLayout, { type: "select", view: "documents" }).contentOpen, true);
  assert.equal(initialLayout.view,"documents");
  assert.equal(contentLayout(initialLayout,{type:"select",view:"plan"}),initialLayout);
});
test("Budget arriving first does not change view or open Plan", () => {
  const state=contentLayout(initialLayout,{type:"availability",artifact:"budget",exists:true,error:""});
  assert.equal(state.view,"documents");
  assert.equal(state.planOpened,false);
  assert.equal(state.contentOpen,false);
  assert.equal(contentLayout(state,{type:"select",view:"budget"}).view,"budget");
});
test("First saved Plan opens once, including an existing saved project", () => {
  const first=contentLayout(initialLayout,{type:"availability",artifact:"plan",exists:true,error:""});
  assert.equal(first.view,"plan");
  assert.equal(first.planOpened,true);
  assert.equal(first.contentOpen,true);
  const library=contentLayout(first,{type:"select",view:"documents"});
  assert.equal(contentLayout(library,{type:"availability",artifact:"plan",exists:true,error:""}),library);
  const failed=contentLayout(library,{type:"availability",artifact:"plan",exists:null,error:"Offline"});
  assert.equal(failed.plan.exists,true);
  assert.equal(failed.view,"documents");
  assert.equal(contentLayout(failed,{type:"availability",artifact:"plan",exists:true,error:""}).view,"documents");
});
test("Closing content keeps chat alone through refreshes", () => {
  const ready=contentLayout(initialLayout,{type:"availability",artifact:"plan",exists:true,error:""});
  const closed=contentLayout(ready,{type:"close"});
  assert.equal(closed.contentOpen,false);
  assert.equal(contentLayout(closed,{type:"availability",artifact:"plan",exists:true,error:""}).contentOpen,false);
  assert.equal(contentLayout(closed,{type:"select",view:"plan"}).contentOpen,true);
});
test("Header opens the last selected view without changing availability", () => {
  const ready = contentLayout(initialLayout, { type: "availability", artifact: "plan", exists: true, error: "" });
  const budget = contentLayout(ready, { type: "availability", artifact: "budget", exists: true, error: "" });
  const selected = contentLayout(budget, { type: "select", view: "budget" });
  const closed = contentLayout(selected, { type: "close" });
  const reopened = contentLayout(closed, { type: "open" });
  assert.equal(reopened.contentOpen, true);
  assert.equal(reopened.view, "budget");
  assert.deepEqual(reopened.plan, ready.plan);
  assert.equal(contentLayout(initialLayout, { type: "open" }).view, "documents");
});
test("Read failures are reachable without inventing an artifact; recovery opens first Plan", () => {
  const failed=contentLayout(initialLayout,{type:"availability",artifact:"plan",exists:null,error:"Offline"});
  const selected=contentLayout(failed,{type:"select",view:"plan"});
  assert.equal(selected.view,"plan");
  assert.equal(selected.planOpened,false);
  assert.equal(contentLayout(selected,{type:"availability",artifact:"plan",exists:false,error:""}).view,"documents");
  assert.equal(contentLayout(failed,{type:"availability",artifact:"plan",exists:true,error:""}).view,"plan");
});
test("Removing an artifact falls back to Library without replaying first-plan selection", () => {
  const ready=contentLayout(initialLayout,{type:"availability",artifact:"plan",exists:true,error:""});
  const removed=contentLayout(ready,{type:"availability",artifact:"plan",exists:false,error:""});
  assert.equal(removed.view,"documents");
  assert.equal(contentLayout(removed,{type:"availability",artifact:"plan",exists:true,error:""}).view,"documents");
});
