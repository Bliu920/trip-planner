import type { Budget } from "@/lib/budget";
import type { Place, PlacePhoto } from "@/lib/catalog";
import { demoBudget, demoDays } from "@/lib/product-demo";
import { dayLocations } from "@/lib/plan/day-view/locations";
import places from "@/data/italy.json";
import photos from "@/data/place-photos.json";

export const discoveryPlaces: Place[] = ["place_001", "place_002", "place_003", "place_004"].map(
  (id) => ({
    ...places.find((place) => place.id === id)!,
    photo: photos.find((photo) => photo.place_id === id) as PlacePhoto,
  }),
);
export const previewDay = {
  ...demoDays[1],
  stops: demoDays[1].stops.map((stop) => {
    const place = places.find((place) => place.id === stop.placeId);
    return {
      ...stop,
      coordinates: place ? ([place.latitude, place.longitude] as [number, number]) : null,
      locationLabel: place?.city ?? stop.locationLabel,
      description:
        stop.id === "sample-uffizi"
          ? "A morning for Renaissance art, followed by a long lunch and an easy walk through Oltrarno."
          : stop.description,
    };
  }),
};
export const dayMapPlaces = dayLocations(previewDay).places;

export const sampleBudget: Budget = {
  currency: "EUR",
  scope: "party",
  travelers: 2,
  limit: null,
  assumptions: demoBudget.note,
  exclusions: [demoBudget.excluded],
  entries: demoBudget.costs.map((cost, index) => ({
    id: "sample-cost-" + index,
    label: cost.label,
    category: "other",
    planItemIds: [],
    pricing: "estimated",
    unit: "trip",
    quantity: 1,
    unitMin: cost.min,
    unitMax: cost.max,
    assumptions: cost.detail ?? "Sample allowance",
    sources: [],
  })),
};
