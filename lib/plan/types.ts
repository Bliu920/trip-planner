// Public Plan contract. Maintained in docs/modules/plan.md.
export type SourceRef =
  | { type: "message"; conversationId: string; messageId: string }
  | { type: "legacy_notes" }
  | { type: "direct_edit" }
  | { type: "attachment"; attachmentId: string; locator: string | null }
  | {
      type: "document";
      documentId: string;
      revision: number;
      section: string | null;
    }
  | { type: "catalog"; placeId: string; field: string | null }
  | { type: "geo"; evidenceId: string }
  | { type: "web"; url: string; accessedAt: string };

export type Basis = {
  kind: "user" | "catalog" | "research" | "assumption";
  sources: SourceRef[];
  explanation: string | null;
};

export type DateChoice = {
  value: string;
  basis: Basis;
};

export type Plan = {
  startDate: DateChoice | null;
  days: [PlanDay, PlanDay, PlanDay];
  items: Record<string, PlanItem>;
  notes: PlanNote[];
};

export type PlanDay = {
  id: string;
  title: string;
  itemIds: string[];
  startLocation: Location | null;
  endLocation: Location | null;
};

export type PlanNote = {
  id: string;
  kind: "assumption" | "uncertainty" | "conflict" | "action";
  text: string;
  relatedItemIds: string[];
  sources: SourceRef[];
};

export type ResearchedLocation = {
  label: string; address: string; city: string;
  latitude: number | null; longitude: number | null;
  geoEvidenceId?: string | null;
  basis: Basis;
};

export type Location =
  | { type: "catalog"; placeId: string }
  | { type: "item"; itemId: string }
  | { type: "travel_endpoint"; itemId: string; endpoint: "from" | "to" }
  | ({ type: "restaurant" } & ResearchedLocation)
  | ({ type: "hotel" } & ResearchedLocation)
  | {
      type: "specified";
      label: string;
      latitude: number | null;
      longitude: number | null;
      basis: Basis;
    }
  | { type: "area"; label: string; basis: Basis };

export type Reservation = {
  state: "booked" | "cancelled" | "not_booked";
  basis: Basis;
};

export type Keep = { basis: Basis };

export type ItemBase = {
  id: string;
  title: string;
  reason: string | null;
  optional: boolean;
  keep: Keep | null;
  reservation: Reservation | null;
};

export type ActivityItem = ItemBase & {
  kind: "visit" | "meal" | "rest" | "free_time" | "logistics";
  location: Location | null;
  timing: ActivityTiming;
};

export type TravelItem = ItemBase & {
  kind: "travel";
  from: Location | null;
  to: Location | null;
  mode: "walk" | "transit" | "train" | "car" | "flight" | "other" | null;
  timing: TravelTiming;
};

export type StayItem = ItemBase & {
  kind: "stay";
  location: Location;
  coverage: StayCoverage | null;
};

export type PlanItem = ActivityItem | TravelItem | StayItem;

export type TimePoint = {
  date: string | null;
  time: string | null;
  binding: "suggested" | "fixed";
  basis: Basis;
};

export type Duration = {
  minMinutes: number;
  maxMinutes: number;
  basis: Basis;
};

export type ActivityTiming = {
  period: "morning" | "afternoon" | "evening" | null;
  start: TimePoint | null;
  end: TimePoint | null;
  duration: Duration | null;
};

export type TravelTiming =
  | { type: "interval"; schedule: ActivityTiming }
  | { type: "arrival"; at: TimePoint }
  | { type: "departure"; at: TimePoint };

export type StayCoverage =
  | { type: "nights"; afterDayIds: string[]; basis: Basis }
  | {
      type: "dates";
      checkIn: DateChoice | null;
      checkOut: DateChoice | null;
    };

export type PlanSnapshot = { revision: number; plan: Plan | null };
export type PlanFinding = {
  code: string;
  severity: "error" | "warning";
  itemIds: string[];
  message: string;
};
