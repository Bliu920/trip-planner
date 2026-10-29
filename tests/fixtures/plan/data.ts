import photos from "@/data/place-photos.json";
import type { Day, PlanPresentationData } from "@/lib/plan/presentation";

function photoFor(id: string) {
  const photo = photos.find(entry => entry.place_id === id);
  return photo ? { src: `${photo.url}?auto=compress&cs=tinysrgb&w=650`, alt: photo.alt, credit: photo.photographer || "View photo on Pexels", creditUrl: photo.source_url } : null;
}

// Sample allowances for the whole party.
const trip = {
  destination: "Florence",
  adults: 2,
  nights: 2,
  costs: [
    { label: "Accommodation", detail: "1 shared room, 2 nights", min: 360, max: 480 },
    { label: "Food & drinks", detail: "2 adults, 3 days", min: 300, max: 380 },
    { label: "Tickets", detail: "Activities for 2", min: 120, max: 160 },
    { label: "Local transport", detail: "Bus / taxi allowance", min: 60, max: 100 },
  ],
};
// Sample schedule, not confirmed availability.
const days: Day[] = [
  {
    id: "day-1", date: null,
    title: "Duomo & Ponte Vecchio",
    photo: photoFor("place_093"),
    walkingLabel: "3 km on foot",
    stayLabel: "Stay in Florence",
    stops: [
      { id: "market", time: "11:00", title: "Mercato Centrale", kind: "food", category: "Market lunch", duration: "1.5 hr", note: "Mercato Centrale Firenze, from the Italy catalog. Arrival time is not confirmed; move lunch if needed. Food costs are sample allowances." },
      { id: "duomo", time: "13:00", title: "Piazza del Duomo", kind: "sight", category: "Exterior visit", duration: "45 min", note: "Exterior only. Cathedral entry and the dome climb are not included." },
      { id: "check-in", time: "14:00", title: "Check-in / free time", kind: "stay", category: "Unscheduled", duration: "2.5 hr", note: "Hotel not selected. Actual check-in time needs confirmation." },
      { id: "ponte", time: "17:00", title: "Ponte Vecchio", kind: "walk", category: "Riverside walk", duration: "1 hr", note: "Suggested late-afternoon walk. Sunset time depends on your dates. Dinner afterward is unplanned." },
    ],
  },
  {
    id: "day-2", date: null,
    title: "Uffizi & Oltrarno",
    photo: photoFor("place_026"),
    walkingLabel: "5 km on foot",
    stayLabel: "Stay in Florence",
    stops: [
      { id: "uffizi", time: "09:00", title: "Uffizi Gallery", kind: "sight", category: "Art museum", duration: "2.5 hr", note: "Suggested entry time, not a reservation. Verify opening days and timed-entry availability.", bookingLabel: "Availability needs checking. Nothing booked." },
      { id: "buca", time: "12:30", title: "Buca dell'Orafo", kind: "food", category: "Lunch", duration: "1.5 hr", note: "Catalog restaurant. Confirm opening hours, menu prices and table availability.", bookingLabel: "Availability needs checking. Nothing booked." },
      { id: "oltrarno", time: "14:30", title: "Oltrarno", kind: "walk", category: "Neighborhood walk", duration: "2 hr", note: "Flexible time in the Oltrarno neighborhood. No specific shops or bookings scheduled." },
      { id: "viewpoint", time: "17:00", title: "Piazzale Michelangelo", kind: "viewpoint", category: "Viewpoint · uphill", duration: "1 hr", note: "Optional uphill walk. Skip for a lighter day, or take a taxi. Dinner afterward is unplanned.", optional: true, canToggle: true },
    ],
  },
  {
    id: "day-3", date: null,
    title: "Boboli & departure",
    photo: photoFor("place_034"),
    walkingLabel: "3.5 km on foot",
    stayLabel: "No overnight stay",
    stops: [
      { id: "boboli", time: "09:30", title: "Boboli Gardens", kind: "garden", category: "Gardens", duration: "2 hr", note: "Check seasonal hours and tickets. Sloped and uneven paths.", bookingLabel: "Availability needs checking. Nothing booked." },
      { id: "lunch", time: "12:00", title: "Lunch in Oltrarno", kind: "food", category: "Restaurant undecided", duration: "1.5 hr", note: "Open meal slot. Restaurant has not been selected." },
      { id: "depart", time: "14:00", title: "Collect bags / depart", kind: "departure", category: "Transport undecided", duration: "Time flexible", note: "Placeholder departure buffer. Adjust once onward travel is known." },
    ],
  },
];

// Fixture edits stay outside the shared presentation.
export function previewPlan(skipViewpoint: boolean): PlanPresentationData {
  return {
    title: trip.destination,
    meta: [`${days.length} days`, `${trip.nights} nights`, `${trip.adults} adults`],
    dateLabel: "Dates not set",
    budget: {
      currency: "EUR", scope: "2 adults · 3 days · 2 nights", costs: trip.costs,
      excluded: "Travel to and from Florence, shopping and insurance.",
      note: "€420 to €560 per person. Sample allowances, not confirmed prices.",
    },
    days: days.map(day => day.id !== "day-2" ? day : {
      ...day, walkingLabel: skipViewpoint ? "3 km on foot" : day.walkingLabel,
      stops: day.stops.map(stop => stop.id === "viewpoint" ? { ...stop, omitted: skipViewpoint } : stop),
    }),
    otherItems: [], notes: [],
    footnote: "Sample plan. Times and costs are illustrative. Select a stop for details.",
  };
}
