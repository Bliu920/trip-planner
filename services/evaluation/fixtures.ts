import catalog from "@/data/italy.json";
import { catalogItem } from "@/lib/plan/commands";
import type { Basis, Plan, PlanItem } from "@/lib/plan/types";
import type { Budget } from "@/lib/budget";

const assumption: Basis = { kind: "assumption", sources: [], explanation: "Synthetic evaluation fixture; availability is unverified." };
const user: Basis = { kind: "user", sources: [{ type: "direct_edit" }], explanation: "Synthetic user-entered fixture." };

/** A concrete synthetic trip; durations and cost sources are not real travel research. */
export function romeFixture(booked = false): { plan: Plan; budget: Budget; brief: string } {
  const day = (n: number): Plan["days"][number] => ({ id: `day-${n}`, title: `Rome day ${n}`, itemIds: [], startLocation: null, endLocation: null });
  const days: Plan["days"] = [day(1), day(2), day(3)];
  const plan: Plan = { startDate: { value: "2026-11-04", basis: user }, days, items: {}, notes: [] };
  const add = (day: number, item: PlanItem) => { plan.items[item.id] = item; plan.days[day - 1].itemIds.push(item.id); };
  const visit = (day: number, id: string, placeId: string) => {
    const place = catalog.find(p => p.id === placeId);
    if (!place) throw new Error(`Missing catalog fixture ${placeId}`);
    const item = catalogItem(place, id); item.optional = true;
    add(day, item); return item;
  };
  const meal = (day: number, period: "morning" | "afternoon" | "evening", label: string) => {
    const placeId = { morning: "place_020", afternoon: "place_022", evening: "place_003" }[period];
    const place = catalog.find(p => p.id === placeId)!;
    add(day, { id: `meal-${day}-${period}`, kind: "meal", title: `${label} at ${place.name}`, location: { type: "catalog", placeId },
      reason: "Synthetic meal selection; service and availability are unverified.", optional: false, keep: null, reservation: null,
      timing: { period, start: null, end: null, duration: { minMinutes: 45, maxMinutes: 75, basis: assumption } } });
  };
  meal(1,"morning","Breakfast"); visit(1,"colosseum","place_001"); meal(1,"afternoon","Lunch"); visit(1,"navona","place_008"); meal(1,"evening","Dinner");
  meal(2,"morning","Breakfast"); const gallery = visit(2,"gallery","place_007"); meal(2,"afternoon","Lunch"); visit(2,"pantheon","place_005"); visit(2,"trevi","place_018"); meal(2,"evening","Dinner");
  meal(3,"morning","Breakfast"); visit(3,"market","place_006"); meal(3,"afternoon","Lunch"); visit(3,"trastevere","place_002"); meal(3,"evening","Dinner");
  if (booked) {
    gallery.optional = false; gallery.reservation = { state: "booked", basis: user };
    gallery.timing.start = { date: "2026-11-05", time: "14:00", binding: "fixed", basis: user };
  }
  plan.items.stay = { id: "stay", kind: "stay", title: "Proposed central Rome base", location: { type: "area", label: "Central Rome", basis: assumption }, reason: null, optional: false, keep: null, reservation: null, coverage: { type: "nights", afterDayIds: ["day-1", "day-2"], basis: assumption } };
  const evidence = (label: string) => [{ title: "Synthetic evaluation evidence", url: "https://example.com/synthetic-prices", documentId: null, documentRevision: null, checkedAt: "2026-10-27T00:00:00.000Z", detail: `${label}: synthetic fixture range, not a real price.` }];
  const budget: Budget = { currency: "EUR", scope: "party", travelers: 2, limit: 800, assumptions: "Synthetic two-person fixture; shared room assumption.", exclusions: ["Flights to and from Italy"], entries: [
    { id: "stay-cost", label: "Stay", category: "stay", planItemIds: ["stay"], pricing: "estimated", unit: "room-night", quantity: 2, unitMin: 100, unitMax: 140, assumptions: "Synthetic shared room estimate.", sources: evidence("100 to 140 EUR per room-night") },
    { id: "food-cost", label: "Meals", category: "food", planItemIds: [], pricing: "estimated", unit: "party-day", quantity: 3, unitMin: 60, unitMax: 80, assumptions: "Synthetic meal allowance.", sources: evidence("60 to 80 EUR per party-day") },
    { id: "local-cost", label: "Local travel", category: "transport", planItemIds: [], pricing: "estimated", unit: "party-day", quantity: 3, unitMin: 20, unitMax: 30, assumptions: "Synthetic local travel allowance.", sources: evidence("20 to 30 EUR per party-day") },
    { id: "visit-cost", label: "Activities", category: "activities", planItemIds: ["colosseum", "gallery", "pantheon"], pricing: "estimated", unit: "adult", quantity: 2, unitMin: 30, unitMax: 45, assumptions: "Synthetic activity allowance.", sources: evidence("30 to 45 EUR per adult") },
  ] };
  const brief = "# Preferences\nRome, history and food; relaxed pace.\n\n# Budget\nParty budget recorded in Budget; excludes flights.\n\n# Dates and arrival/departure\nNovember 4 to 6, 2026.\n\n# Group and activity needs\nTwo adults.\n\n# Existing arrangements and other constraints\n" + (booked ? "Borghese Gallery booked November 5 at 14:00, user-entered.\n" : "No bookings.\n") + "\n# Questions to confirm\nArrival and departure times.\n";
  return { plan, budget, brief };
}
