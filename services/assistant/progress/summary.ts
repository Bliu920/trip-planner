import { actionResultSchema } from "@/lib/actions";
import type { ActivityEntry } from "@/lib/activity/model";

const titles: Record<string, string> = {
  addDayActivities: "Add daily activities", addStay: "Add overnight lodging", addBudgetCosts: "Add trip costs",
  resolvePlace: "Check a place address", getJourneys: "Check travel between places",
  readEnvironment: "Review your trip", readPlan: "Read your itinerary", readBudget: "Read your budget", listDocuments: "Find your documents",
  createPlan: "Prepare your itinerary", editPlan: "Update your itinerary", createBudget: "Prepare your budget", editBudget: "Update your budget",
  createDocument: "Prepare a file", editDocument: "Update your document", inspectChanges: "Review your changes", researchWeb: "Research your trip",
  describeCatalog: "Explore places", searchPlaces: "Find places for your trip", readPlaces: "Check place details",
  readGuide: "Review planning guidance", readDocument: "Read your document", readMessage: "Review your earlier message",
  saveBrief: "Save your travel brief", stageDocument: "Prepare a file", proposePlan: "Prepare your itinerary",
  proposeBudget: "Prepare your budget", resolveBudgetGaps: "Review missing prices", commit: "Save your trip changes",
  verifySave: "Check saved changes", reloadWorkspace: "Reload your trip", web_search: "Research your trip",
};
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const clean = (value: unknown, max = 160) => typeof value === "string" ? value.replace(/[\u2013\u2014]/g, ", ").replace(/[\x00-\x1f]/g, " ").slice(0, max) : "";

export function source(url: unknown, title?: unknown): ActivityEntry["sources"] {
  if (typeof url !== "string" || url.length > 2000) return [];
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return [];
    return [{ url: parsed.href, title: clean(title) || parsed.hostname }];
  } catch { return []; }
}

export function documents(value: unknown): ActivityEntry["documents"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const file = record(item);
    return typeof file.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.id) && typeof file.name === "string" && file.name.trim()
      ? [{ id: file.id, name: clean(file.name, 120) }] : [];
  }).slice(0, 30);
}

export function started(tool: string, input: unknown): Pick<ActivityEntry, "title" | "detail"> {
  const args = record(input);
  const name = clean(args.name, 120);
  return { title: ["stageDocument", "createDocument"].includes(tool) && name ? `Prepare ${name}` : titles[tool] ?? "Work on your trip",
    detail: tool === "web_search" ? clean(args.query, 1200) : "" };
}

export function completed(tool: string, output: unknown): Pick<ActivityEntry, "status" | "detail" | "documents" | "sources"> {
  const base = { documents: [], sources: [] };
  if (tool === "web_search") {
    const result = record(output);
    const action = record(result.action);
    const sources = [...source(action.url), ...(Array.isArray(result.sources) ? result.sources.flatMap(item => source(record(item).url, record(item).title)) : [])];
    const queries = Array.isArray(action.queries) ? action.queries.map(query => clean(query, 200)).filter(Boolean).join("; ") : clean(action.query, 500);
    return { ...base, status: "complete", detail: queries ? `Searched: ${queries}. Review the sources for details.` : "Search completed. Review the available sources for details.", sources: [...new Map(sources.map(item => [item.url, item])).values()].slice(0, 12) };
  }
  const parsed = actionResultSchema.safeParse(output);
  if (!parsed.success) return { ...base, status: "unconfirmed", detail: "The result could not be confirmed." };
  const result = parsed.data;
  const data = record(result.data);
  if (result.outcome !== "succeeded") return { ...base, status: result.outcome === "unknown" ? "unconfirmed" : "failed",
    detail: result.effect === "staged" ? "Some changes are prepared, but checks still need attention. They have not been saved." : result.outcome === "unknown" ? "The result is not confirmed. Check your trip before trying again." : "This step could not finish. The assistant may try another approach." };
  if (tool === "saveBrief" && result.effect === "persisted") return { ...base, status: "complete", detail: "Your travel brief was saved.", documents: documents([data.document]) };
  if (tool === "commit" && result.effect === "persisted") return { ...base, status: "complete", detail: "Your trip changes were saved.", documents: documents(record(data.snapshot).documents) };
  if (tool === "verifySave" || tool === "inspectChanges" && data.saved === true) return { ...base, status: data.saved === true ? "complete" : "unconfirmed", detail: data.saved === true ? "Your trip changes were saved." : "Saving has not been confirmed.", documents: data.saved === true ? documents(record(data.snapshot).documents) : [] };
  if (result.effect === "staged") return { ...base, status: "prepared", detail: "Prepared for saving. Check the later save result to see whether these changes were saved." };
  if (tool === "searchPlaces") {
    const names = Array.isArray(data.places) ? data.places.slice(0, 8).map(place => clean(record(place).name)).filter(Boolean) : [];
    return { ...base, status: "complete", detail: `${typeof data.total === "number" ? `${data.total} matching places found.` : "Place search completed."}${names.length ? ` ${names.join(", ")}.` : ""}` };
  }
  if (tool === "readPlaces") return { ...base, status: "complete", detail: Array.isArray(result.data) ? `Checked ${result.data.length} places. Missing details remain unconfirmed.` : "Place details checked. Missing details remain unconfirmed." };
  if (tool === "readDocument" && data.providedInCurrentRequest === true) return { ...base, status: "complete", detail: "Your selected file is available for this reply.", documents: documents([data]) };
  if (tool === "readDocument") return { ...base, status: "complete", detail: clean(data.name) ? `Read ${clean(data.name)}.` : "Your document was read.", documents: documents([data]) };
  return { ...base, status: "complete", detail: tool === "reloadWorkspace" ? "Your latest saved trip is available. Unsaved proposals were discarded." : "Review completed." };
}
