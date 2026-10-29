export type ContentView = "plan" | "budget" | "documents" | "details";
type Artifact = "plan" | "budget";
type Availability = { exists: boolean | null; error: string };
export type ContentLayout = {
  contentOpen: boolean;
  view: ContentView;
  plan: Availability;
  budget: Availability;
  planOpened: boolean;
  detailsOpened: boolean;
};
export type LayoutAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "select"; view: ContentView }
  | { type: "availability"; artifact: Artifact; exists: boolean | null; error: string };
export const initialLayout: ContentLayout = {
  contentOpen: false,
  view: "documents", plan: { exists: null, error: "" }, budget: { exists: null, error: "" },
  planOpened: false, detailsOpened: false,
};

export function contentLayout(state: ContentLayout, action: LayoutAction): ContentLayout {
  if (action.type === "open") return state.contentOpen ? state : { ...state, contentOpen: true };
  if (action.type === "close") return { ...state, contentOpen: false };
  if (action.type === "select") {
    if ((action.view === "plan" || action.view === "budget") && !state[action.view].exists && !state[action.view].error) return state;
    return { ...state, contentOpen: true, view: action.view, detailsOpened: state.detailsOpened || action.view === "details" };
  }
  const current = state[action.artifact];
  // Preserve saved availability.
  const exists = action.exists ?? current.exists;
  if (exists === current.exists && action.error === current.error) return state;
  const next = { ...state, [action.artifact]: { exists, error: action.error } };
  if (action.artifact === "plan" && exists && !state.planOpened) {
    return { ...next, contentOpen: true, view: "plan", planOpened: true };
  }
  if (state.view === action.artifact && !exists && !action.error) { next.view = "documents"; next.contentOpen = false; }
  return next;
}
