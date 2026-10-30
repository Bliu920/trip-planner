import photos from "@/data/place-photos.json";
import type { ActivityKind, Budget, Day, Photo, Stop } from "@/lib/plan/presentation/model";

export type DemoStop = Stop & { placeId?: string; point: [number, number] | null };
export type DemoDay = Omit<Day, "stops"> & { stops: DemoStop[] };

function cover(placeId: string): Photo {
  const photo = photos.find((item) => item.place_id === placeId)!;
  return {
    src: photo.url,
    alt: photo.alt,
    credit: photo.photographer,
    creditUrl: photo.source_url,
    match: photo.match === "place" ? "place" : "illustrative",
  };
}

function stop(
  id: string,
  title: string,
  kind: ActivityKind,
  time: string,
  duration: string,
  note: string,
  point: [number, number] | null,
  placeId?: string,
): DemoStop {
  return {
    id,
    title,
    kind,
    time,
    duration,
    note,
    category: "Illustrative activity",
    point,
    placeId,
    locationLabel: point ? "Florence (sample)" : null,
    locationState: "not_applicable",
    description: note,
    bookingLabel:
      kind === "sight" || kind === "food" ? "Sample arrangement. Nothing is booked." : undefined,
  };
}

// Fixed, illustrative arrangements.
export const demoDays: DemoDay[] = [
  {
    id: "sample-day-1",
    title: "Markets & the Arno",
    date: null,
    walkingLabel: null,
    stayLabel: "Base in Florence",
    photo: cover("place_030"),
    stops: [
      stop(
        "sample-market",
        "Mercato Centrale Firenze",
        "food",
        "10:00",
        "1 hr",
        "Begin with a relaxed market visit. This is a sample sequence, not checked opening hours.",
        [24, 26],
        "place_030",
      ),
      stop(
        "sample-duomo",
        "Piazza del Duomo",
        "sight",
        "12:00",
        "45 min",
        "Leave time to enjoy the square. Entry, tickets and opening times are not part of this sample.",
        [49, 37],
        "place_093",
      ),
      stop(
        "sample-rest",
        "Settle in & slow down",
        "stay",
        "14:00",
        "2 hr",
        "An open afternoon break. No hotel or check-in arrangement is implied.",
        null,
      ),
      stop(
        "sample-ponte",
        "Ponte Vecchio",
        "walk",
        "17:00",
        "1 hr",
        "A suggested riverside walk to end the first day. Times are illustrative.",
        [70, 69],
        "place_084",
      ),
    ],
  },
  {
    id: "sample-day-2",
    title: "Art & Oltrarno",
    date: null,
    walkingLabel: null,
    stayLabel: "Base in Florence",
    photo: cover("place_026"),
    stops: [
      stop(
        "sample-uffizi",
        "Uffizi Gallery",
        "sight",
        "09:00",
        "2 hr 30 min",
        "Make room for a morning of art. The sample does not represent ticket availability or a reservation.",
        [30, 32],
        "place_026",
      ),
      stop(
        "sample-lunch",
        "Buca dell'Orafo",
        "food",
        "12:30",
        "1 hr 30 min",
        "A long lunch between the museum and the afternoon walk. Menu prices and tables are unverified.",
        [50, 49],
        "place_033",
      ),
      stop(
        "sample-oltrarno",
        "Oltrarno",
        "walk",
        "14:30",
        "1 hr 30 min",
        "Leave the afternoon flexible for the neighbourhood. The map is an illustration, not directions.",
        [67, 70],
        "place_028",
      ),
      stop(
        "sample-free",
        "Time to wander",
        "stay",
        "16:30",
        "Time flexible",
        "An unhurried finish, with no extra booking or fixed commitment.",
        null,
      ),
    ],
  },
  {
    id: "sample-day-3",
    title: "Gardens & a gentle finish",
    date: null,
    walkingLabel: null,
    stayLabel: null,
    photo: cover("place_034"),
    stops: [
      stop(
        "sample-boboli",
        "Boboli Gardens",
        "garden",
        "09:30",
        "2 hr",
        "A sample morning outdoors. Seasonal hours, access and tickets still need checking for an actual trip.",
        [27, 35],
        "place_034",
      ),
      stop(
        "sample-mario",
        "Buca Mario",
        "food",
        "12:00",
        "1 hr 30 min",
        "A final lunch suggestion. No table or quoted meal price is included in this demonstration.",
        [58, 53],
        "place_029",
      ),
      stop(
        "sample-bags",
        "Collect bags & depart",
        "departure",
        "14:00",
        "Time flexible",
        "A placeholder departure window. Actual onward travel would determine this timing.",
        null,
      ),
    ],
  },
];

export const demoBudget: Budget = {
  currency: "EUR",
  scope: "Sample for two adults",
  costs: [
    { label: "Accommodation", detail: "2 illustrative room nights", min: 300, max: 380 },
    { label: "Food & drinks", detail: "Sample allowance for two", min: 180, max: 240 },
    { label: "Tickets", detail: "Illustrative activity costs", min: 110, max: 150 },
    { label: "Local travel", detail: "Sample allowance", min: 30, max: 50 },
  ],
  excluded: "Travel to and from Italy. No tickets, transport or rooms are booked.",
  note: "Placeholder figures for this interactive demonstration. These are not researched prices or a travel quote.",
};
