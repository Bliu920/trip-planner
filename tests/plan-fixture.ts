import type { Plan, Basis } from "../lib/plan/types";
import catalog from "../data/italy.json";
export const assumption: Basis = {
  kind: "assumption",
  sources: [],
  explanation: "Suggested pace, subject to confirmation.",
};
export function examplePlan(): Plan {
  const place = catalog[0];
  return {
    startDate: null,
    days: [
      {
        id: "day-1",
        title: place.city,
        itemIds: ["visit-1"],
        startLocation: null,
        endLocation: null,
      },
      {
        id: "day-2",
        title: "Explore",
        itemIds: [],
        startLocation: null,
        endLocation: null,
      },
      {
        id: "day-3",
        title: "Explore",
        itemIds: [],
        startLocation: null,
        endLocation: null,
      },
    ],
    items: {
      "visit-1": {
        id: "visit-1",
        kind: "visit",
        title: place.name,
        reason: "Matches an interest in local sights.",
        optional: false,
        keep: null,
        reservation: null,
        location: { type: "catalog", placeId: place.id },
        timing: {
          period: "morning",
          start: null,
          end: null,
          duration: { minMinutes: 60, maxMinutes: 90, basis: assumption },
        },
      },
    },
    notes: [],
  };
}
let fixtureCall = 0;
/** Transport only: no argument filling, renaming or compatibility conversion. */
export function functionStream(name: string, input: unknown) {
  const item = {
    type: "function_call",
    id: `fc_${name}_${++fixtureCall}`,
    call_id: `call_${name}_${fixtureCall}`,
    name,
    arguments: JSON.stringify(input),
    status: "completed",
  };
  const events = [
    {
      type: "response.created",
      response: {
        id: `resp_${name}`,
        created_at: 1792713600,
        model: "gpt-6.1-terra",
      },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...item, arguments: "", status: "in_progress" },
    },
    {
      type: "response.function_call_arguments.delta",
      item_id: item.id,
      output_index: 0,
      delta: item.arguments,
    },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      },
    },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

export function unknownBudget(): import("../lib/budget").Budget {
  return { currency: "EUR", scope: "per_person", travelers: null, limit: null, assumptions: "Party size and dates unknown.", exclusions: ["International travel"], entries: [
    { id: "stay", category: "stay", label: "Lodging", planItemIds: [], pricing: "unknown", unit: "room-night", quantity: 2, unitMin: null, unitMax: null, assumptions: "Search unavailable; room sharing not confirmed.", sources: [] }
  ] };
}

export function fixturePricedBudget(): import("../lib/budget").Budget {
  const budget = unknownBudget();
  Object.assign(budget.entries[0], {
    pricing: "estimated", unitMin: 40, unitMax: 60, assumptions: "Synthetic fixture rate, not a real quote.",
    sources: [{ title: "Fixture rates", url: "https://example.com/test-rate", documentId: null, documentRevision: null,
      checkedAt: "2026-10-27T00:00:00.000Z", detail: "Synthetic 40 to 60 EUR fixture for persistence tests." }],
  });
  return budget;
}

export function researchResponse(text = "A comparable room costs EUR 80 per person-night. Dates differ; use as an estimate.") {
  const url = "https://example.com/test-rate";
  return Response.json({
    id: "resp_research", object: "response", created_at: 1792713600, status: "completed",
    model: "gpt-6.1-terra", error: null, incomplete_details: null,
    output: [
      { type: "web_search_call", id: "ws_research", status: "completed", action: { type: "search", query: "Rome room rates", sources: [{ type: "url", url }] } },
      { id: "msg_research", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text,
        annotations: [{ type: "url_citation", url, title: "Comparable rate", start_index: 0, end_index: text.length }] }] },
    ],
    usage: { input_tokens: 10, output_tokens: 30, total_tokens: 40, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  });
}
