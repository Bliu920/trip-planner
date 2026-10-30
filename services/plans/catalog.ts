import "server-only";
import { getPlaces } from "@/services/places/catalog";

// Reuse the source owner.
export const places = getPlaces();
