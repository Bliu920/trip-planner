import { isDeepStrictEqual } from "node:util";
import catalog from "@/data/italy.json";
import type { Assertion, Check, EvalCase, Observation } from "./contracts";

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => x && typeof x === "object" && !Array.isArray(x) ? x as Obj : {};
const plan = (o: Observation) => obj(obj(o.after.plan).plan);
const budget = (o: Observation) => obj(obj(o.after.budget).budget);
function eventNames(o: Observation) {
  const calls = new Map<string, string>();
  for (const event of o.trace) if (event.toolCallId && event.toolName) calls.set(event.toolCallId, event.toolName);
  return [...calls.values()];
}
function check(a: Assertion, o: Observation): [boolean | null, string] {
  const p = plan(o), b = budget(o), items = obj(p.items), calls = eventNames(o);
  switch (a.type) {
    case "saved_plan": return [Object.keys(p).length > 0, "Persisted Plan exists"];
    case "no_saved_plan": return [Object.keys(p).length === 0, "No Plan was persisted"];
    case "no_saved_budget": return [Object.keys(b).length === 0, "No Budget was persisted"];
    case "no_final_receipt": return [!o.parts.some(part => obj(part).type === "data-commit" || obj(obj(part).data).state === "saved"), "No final-save receipt exists"];
    case "zero_results_observed": return [o.trace.some(event => event.type === "tool-output-available" && obj(obj(event.output).data).total === 0), "A zero-result catalog search was observed"];
    case "duplicate_delivery_observed": {
      const ids = o.trace.filter(event => event.type === "tool-input-available" && event.toolName === "editPlan").map(event => event.toolCallId);
      return [new Set(ids).size < ids.length, "The same edit call was delivered twice"];
    }
    case "rejection_observed": return [o.trace.some(event => event.type === "tool-output-available" && ["blocked", "failed"].includes(String(obj(event.output).outcome))), "A rejected edit was observed"];
    case "late_brief_staged": {
      const names = new Map<string, string>(); let edit = -1, brief = -1;
      o.trace.forEach((event, index) => {
        if (event.toolCallId && event.toolName) names.set(event.toolCallId, event.toolName);
        if (event.type === "tool-output-available" && event.toolCallId && names.get(event.toolCallId) === "editPlan" && obj(event.output).effect === "staged") edit = index;
        if (event.type === "tool-output-available" && event.toolCallId && names.get(event.toolCallId) === "saveBrief" && obj(event.output).effect === "staged") brief = index;
      });
      return [edit >= 0 && brief > edit, "A staged Plan edit was followed by a staged brief update"];
    }
    case "fault_triggered": return [o.faultTriggered, "The configured fault was actually injected"];
    case "saved_budget": return [Object.keys(b).length > 0 && Array.isArray(b.entries) && b.entries.length > 0, "Persisted nonempty Budget exists"];
    case "saved_brief": return [o.after.documents.some(d => d.kind === "planning_context" && d.content !== null), "Saved Travel brief is readable"];
    case "final_receipt": return [o.parts.some(part => obj(part).type === "data-commit" || obj(obj(part).data).state === "saved"), "Persisted final-save evidence exists"];
    case "unchanged_artifacts": return [isDeepStrictEqual(o.before, o.after), "Persisted artifacts are unchanged"];
    case "three_days": return [Array.isArray(p.days) && p.days.length === 3, "Plan has exactly three days"];
    case "pending_input": return [o.after.pendingInputs.some(input => obj(input).id === a.id), `Pending input ${a.id} remains unhandled`];
    case "document_content": return [o.after.documents.some(doc => doc.name === a.name && doc.content === a.content), `Document ${a.name} has the exact expected content`];
    case "plan_budget_unchanged": return [isDeepStrictEqual(obj(o.before.plan).plan, obj(o.after.plan).plan) && isDeepStrictEqual(obj(o.before.budget).budget, obj(o.after.budget).budget), "Plan and Budget content are unchanged"];
    case "plan_unchanged": return [isDeepStrictEqual(obj(o.before.plan).plan, obj(o.after.plan).plan), "Plan content is unchanged"];
    case "preserve_day": {
      const previous = obj(obj(o.before.plan).plan), prior = (Array.isArray(previous.days) ? previous.days : []).find(day => obj(day).id === a.id);
      const current = (Array.isArray(p.days) ? p.days : []).find(day => obj(day).id === a.id);
      const ids = Array.isArray(obj(prior).itemIds) ? obj(prior).itemIds as string[] : [];
      return [!!prior && isDeepStrictEqual(prior, current) && ids.every(id => isDeepStrictEqual(obj(previous.items)[id], items[id])), `Day ${a.id} and its scheduled items are preserved`];
    }
    case "document_count": return [o.after.documents.filter(doc => doc.name === a.name).length === a.count, `Document ${a.name} count=${a.count}`];
    case "document_updated": {
      const previous = o.before.documents.find(doc => doc.name === a.name), current = o.after.documents.find(doc => doc.name === a.name);
      return [!!previous && !!current && previous.id === current.id && current.content !== previous.content && typeof current.contentRevision === "number" && typeof previous.contentRevision === "number" && current.contentRevision > previous.contentRevision,
        `Document ${a.name} is updated in place with a newer content version`];
    }
    case "budget_category_total": {
      const entries = (Array.isArray(b.entries) ? b.entries : []).map(obj).filter(entry => entry.category === a.category);
      return [entries.length > 0 && entries.every(entry => entry.pricing === a.pricing && typeof entry.unitMin === "number" && typeof entry.unitMax === "number" && typeof entry.quantity === "number") &&
        entries.reduce((sum, entry) => sum + Number(entry.unitMin) * Number(entry.quantity), 0) === a.min && entries.reduce((sum, entry) => sum + Number(entry.unitMax) * Number(entry.quantity), 0) === a.max,
      `${a.category} totals ${a.min} to ${a.max} with ${a.pricing} pricing`];
    }
    case "budget_unchanged_stale": return [isDeepStrictEqual(obj(o.before.budget).budget, obj(o.after.budget).budget) && obj(o.after.budget).needsReview === true, "Saved budget is preserved and marked for review"];
    case "unknown_category": return [Array.isArray(b.entries) && b.entries.some(entry => obj(entry).category === a.category && obj(entry).pricing === "unknown" && obj(entry).unitMin === null && obj(entry).unitMax === null), `An unknown ${a.category} cost remains visible`];
    case "budget_source_contains": return [Array.isArray(b.entries) && b.entries.some(entry => obj(entry).category === a.category && JSON.stringify(obj(entry).sources).includes(a.text)), `${a.category} retains the observed evidence`];
    case "budget_limit": return [b.limit === a.limit && Object.keys(b).length > 0, `Budget limit=${a.limit}`];
    case "budget_scope": return [b.scope === a.scope && b.travelers === a.travelers && b.limit === a.limit, `Budget scope=${a.scope}, travelers=${a.travelers}, limit=${a.limit}`];
    case "item_on_day": return [Array.isArray(p.days) && p.days.some(day => obj(day).id === a.dayId && Array.isArray(obj(day).itemIds) && (obj(day).itemIds as unknown[]).filter(id => id === a.id).length === 1), `Item ${a.id} appears on ${a.dayId}`];
    case "preserve_note": return [Array.isArray(p.notes) && p.notes.some(note => obj(note).id === a.id), `Concurrent note ${a.id} remains`];
    case "preserve_item": return [!!items[a.id], `Existing item ${a.id} remains`];
    case "preserve_booking": {
      const prior = obj(obj(obj(o.before.plan).plan).items)[a.id], current = items[a.id];
      if (!prior || !current) return [false, `Protected item ${a.id} is missing`];
      const oldItem = obj(prior), newItem = obj(current);
      return [isDeepStrictEqual(oldItem.reservation, newItem.reservation) && isDeepStrictEqual(obj(oldItem.timing).start, obj(newItem.timing).start), `Reservation and fixed start preserved for ${a.id}`];
    }
    case "unscheduled": {
      const days = Array.isArray(p.days) ? p.days : [];
      return [!!items[a.id] && !days.some(day => Array.isArray(obj(day).itemIds) && (obj(day).itemIds as unknown[]).includes(a.id)), `Item ${a.id} remains but is unscheduled`];
    }
    case "valid_catalog_references": {
      const ids = new Set(catalog.map(place => place.id));
      const locations = Object.values(items).map(item => obj(obj(item).location)).filter(loc => loc.type === "catalog");
      return [locations.every(loc => typeof loc.placeId === "string" && ids.has(loc.placeId)), "All catalog item locations reference supplied places"];
    }
    case "item_once": {
      const days = Array.isArray(p.days) ? p.days : [];
      const count = days.flatMap(day => Array.isArray(obj(day).itemIds) ? obj(day).itemIds as unknown[] : []).filter(id => id === a.id).length;
      return [!!items[a.id] && count === 1, `Item ${a.id} appears in exactly one day`];
    }
    case "tool_min_calls": {
      const count = o.trace.filter(event => event.type === "tool-input-available" && event.toolName === a.name).length;
      return [count >= a.count, `${a.name} called at least ${a.count} times`];
    }
    case "successful_tool": {
      const callsById = new Map<string, string>();
      for (const event of o.trace) if (event.toolCallId && event.toolName) callsById.set(event.toolCallId, event.toolName);
      const success = o.trace.some(event => event.type === "tool-output-available" && event.toolCallId && a.names.includes(callsById.get(event.toolCallId) ?? "") && obj(event.output).outcome === "succeeded");
      return [success, `Successful result from: ${a.names.join(", ")}`];
    }
    case "brief_before_plan": {
      const names = new Map<string, string>();
      let checkpoint = -1, creation = -1;
      o.trace.forEach((event, index) => {
        if (event.toolCallId && event.toolName) names.set(event.toolCallId, event.toolName);
        if (event.type === "tool-output-available" && event.toolCallId && names.get(event.toolCallId) === "saveBrief" && obj(event.output).effect === "persisted" && obj(event.output).outcome === "succeeded" && checkpoint < 0) checkpoint = index;
        if (event.type === "tool-input-available" && event.toolName === "createPlan" && creation < 0) creation = index;
      });
      return [checkpoint >= 0 && creation > checkpoint, "A successful brief checkpoint preceded Plan creation"];
    }
    case "required_tool": return [a.names.some(name => calls.includes(name)), `At least one expected tool called: ${a.names.join(", ")}`];
    case "no_mutations": return [!calls.some(name => ["saveBrief", "createPlan", "editPlan", "createBudget", "editBudget", "createDocument", "editDocument", "resolveBudgetGaps", "commit"].includes(name)), "No mutation tool was called"];
  }
}
export function executionIssue(c: EvalCase, o: Observation): string | null {
  if (o.turns) for (const turn of o.turns) {
    const issue = executionIssue(c, turn.observation);
    if (issue) return issue;
  }
  if (o.responseStatus !== 200 || o.storageError) return "execution_or_storage_error";
  if (c.fault !== "none" && !o.faultTriggered) return "fault_not_triggered";
  if ((c.research === "fixture_prices" || c.research === "fixture_links") && o.trace.some(event => event.toolName === "web_search")) return "uncontrolled_hosted_search";
  const codes = o.parts.filter(part => obj(part).type === "data-failure").map(part => String(obj(obj(part).data).code ?? ""));
  const code = codes.find(value => ["provider_error", "provider_limit", "timeout", "storage_error", "cancelled"].includes(value));
  if (code && !(c.fault === "provider_after_brief" && o.faultTriggered && code === "provider_limit")) return code;
  return null;
}
export function gradeChecks(c: EvalCase, o: Observation): Check[] {
  if (c.followUps?.length) {
    return [c, ...c.followUps].flatMap((step, index) => {
      const turn = o.turns?.[index]?.observation;
      if (!turn) return [{ id: `turn${index + 1}/executed`, outcome: "not_evaluable" as const, detail: "This turn was not executed after an earlier interruption" }];
      return gradeChecks({ ...c, assertions: step.assertions, followUps: undefined }, turn).map(result => ({ ...result, id: `turn${index + 1}/${result.id}` }));
    });
  }
  const checks: Check[] = c.assertions.map((a, index) => {
    if (executionIssue(c, o)) return { id: `${a.type}:${index}`, outcome: "not_evaluable", detail: "Execution or artifact collection failed" };
    const [ok, detail] = check(a, o);
    return { id: `${a.type}:${index}`, outcome: ok === null ? "not_evaluable" : ok ? "pass" : "fail", detail };
  });
  checks.push({ id: "single_final_publication", outcome: o.commitCount <= 1 ? "pass" : "fail", detail: `Final publications: ${o.commitCount}` });
  return checks;
}
