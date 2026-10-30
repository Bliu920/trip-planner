export type Trip = {
  reference: string;
  name: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type RecentTrip = Pick<Trip, "reference" | "name"> & { lastOpened: string };

export const REFERENCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeReference(value: string): string {
  return value.trim().toLowerCase();
}
