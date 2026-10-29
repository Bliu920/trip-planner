import "server-only";
import { getPlaces } from "@/services/catalog";

// Reuse the source owner.
export const places = getPlaces();
