import type { PlanFinding, Location } from "@/lib/plan/types";
export type Coordinate = [longitude: number, latitude: number];
export type PositionQuery = { name: string; address: string; city: string };
export type Position = {
  query: PositionQuery; status: "matched" | "ambiguous" | "not_found";
  coordinates: Coordinate | null;
  candidates: { name: string; address: string; city: string; layer: string; score: number | null; coordinates: Coordinate }[];
};
export type Route = {
  from: Coordinate; to: Coordinate; mode: "walk" | "car";
  distanceMeters: number; durationSeconds: number; geometry: Coordinate[];
  snapMeters: number;
};
export type GeoEvidence<T = Position | Route> = {
  id: string; kind: "position" | "route"; payload: T; checkedAt: string; expiresAt: string;
};
export type JourneyStop = { id: string; location: Location | null; start: number | null; end: number | null; dated?: boolean };
export type JourneyLeg = {
  id: string; dayId: string; from: JourneyStop; to: JourneyStop;
  mode: "walk" | "car" | "unsupported";
  travelItemIds: string[]; availableMinutes: number | null; allocatedMinutes: number | null;
};
export type CheckedLeg = {
  id: string; dayId: string; fromItemId: string; toItemId: string;
  fromLabel?: string; toLabel?: string;
  mode: JourneyLeg["mode"]; status: "checked" | "unverified" | "conflict";
  distanceMeters: number | null; durationSeconds: number | null; reservedMinutes: number | null;
  availableMinutes: number | null; evidenceId: string | null; checkedAt: string | null;
  reason: string | null; fromCoordinates?: Coordinate; toCoordinates?: Coordinate; geometry?: Coordinate[];
};
export type JourneyReport = {
  fingerprint: string; status: "checked" | "unverified" | "conflict";
  legs: CheckedLeg[]; findings: PlanFinding[];
  walkingMeters: number; movingMinutes: number;
};
