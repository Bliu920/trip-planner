export const guideCatalog = [
  { id: "trip-details", title: "Trip details", when: "Interpret or revise travel requirements, handle missing/conflicting fields, or maintain the Travel brief." },
  { id: "first-plan", title: "First plan", when: "No saved itinerary yet. Required initial workflow, including budget coverage." },
  { id: "plan-quality", title: "What makes a good plan", when: "Create or review a complete itinerary: daily coverage, nearby supporting activities, meals, transport, overnight stays and pacing." },
  { id: "plan-editing", title: "Plan and context editing", when: "Create or revise itinerary items, durable preferences, or supporting documents." },
  { id: "budget-research", title: "Budget research", when: "Build a budget, research costs, or verify prices and sources." },
  { id: "budget-gaps", title: "Resolve missing prices", when: "Budget checks report missing prices. Also supplied automatically with pending checks." },
  { id: "budget-editing", title: "Budget updates", when: "Change costs, reconcile an edited plan, or refresh an existing estimate." },
] as const;
export type GuideId = typeof guideCatalog[number]["id"];
