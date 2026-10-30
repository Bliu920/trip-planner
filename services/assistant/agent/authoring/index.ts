import { itemTiming, type Basis, type SourceRef, type PlanItem, type Location } from "@/lib/plan";
import type { BudgetEntry } from "@/lib/budget";
import type { AgentEnvironment } from "../contracts";
import { agentErrorDetail } from "../diagnostics";
import { ZodError } from "zod";
export { planAuthoringInput, budgetAuthoringInput } from "./inputs";
export { authorPlan } from "./plan";
export { authorBudget } from "./budget";
export type { PlanCommand, BudgetCommand } from "./inputs";

export type Evidence = Pick<BudgetEntry["sources"][number], "url" | "documentId" | "documentRevision" | "checkedAt" | "title">;
export function proposed(explanation = "Suggested arrangement, subject to confirmation."): Basis { return { kind: "assumption", sources: [], explanation }; }
export function userBasis(environment: AgentEnvironment, messageId?: string): Basis {
  const source: SourceRef = messageId && environment.source.type === "message" ? { ...environment.source, messageId } : environment.source;
  return { kind: "user", sources: [source], explanation: "Explicit user-provided arrangement." };
}
/** A source reference alone does not establish who supplied a location. */
export async function userLocationBasis(environment: AgentEnvironment, label: string, messageId?: string): Promise<Basis> {
  const id = messageId ?? (environment.source.type === "message" ? environment.source.messageId : undefined);
  const fail = () => Object.assign(new Error("userLocation must match location text in a real user message. Use the exact user wording and its userLocationMessageId, or use area for a proposed neighborhood with free_time/rest/logistics. Use placeId for an attraction or venue/hotel for researched properties."), { code: "USER_LOCATION_SOURCE_REQUIRED" });
  if (!id) throw fail();
  const message = await environment.readMessage(id) as { id?: string; conversationId?: string; role?: string; parts?: { type?: string; text?: string }[] } | null;
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const text = message?.parts?.filter(part => part.type === "text").map(part => part.text ?? "").join("\n") ?? "";
  if (message?.id !== id || message.role !== "user" || !message.conversationId || !normalize(text).includes(normalize(label))) throw fail();
  return { kind: "user", sources: [{ type: "message", messageId: id, conversationId: message.conversationId }], explanation: "Location named in the user's message; this does not establish a booking or a requirement to visit." };
}
export function evidence(environment: AgentEnvironment, id: string): Evidence {
  const found = environment.evidence?.(id);
  if (!found) throw Object.assign(new Error("Use a sourceId from the returned availableSources matching the evidence you actually read."), { status: 400, code: "SOURCE_NOT_FOUND", data: { availableSources: environment.evidenceSources?.().slice(0, 64).map(({ sourceId, url, title }) => ({ sourceId, url, title })) ?? [] } });
  return found;
}
/** Preserve classified constraints without logging raw arguments or error prose. */
export function authoringError(error: unknown, commandIndex: number, command: { type: string; id?: string }) {
  const message = error instanceof Error ? error.message : "Invalid change";
  const reasons: [RegExp, string][] = [
    [/already exists/, "ARRANGEMENT_EXISTS"], [/not found|existing day|existing cost/, "ARRANGEMENT_MISSING"],
    [/startTime|duration or endTime|duration belongs/, "TIME_WINDOW_REQUIRED"], [/one duration|not both/, "DURATION_CONFLICT"],
    [/Duration maximum/, "DURATION_RANGE"], [/one location|researched hotel, a user property/, "LOCATION_AMBIGUOUS"],
    [/afterItemId|Insertion index/, "PLACEMENT_INVALID"], [/permutation/, "ORDER_IDS_INVALID"],
    [/hotel or provisional area/, "STAY_LOCATION_REQUIRED"], [/Included breakfast/, "STAY_REFERENCE_REQUIRED"],
    [/matching stay|not travel|not lodging/, "ITEM_KIND_INVALID"], [/supplied place ID/, "PLACE_UNKNOWN"],
    [/actual time before/, "COMMITMENT_TIME_REQUIRED"], [/retrieved web source/, "WEB_SOURCE_REQUIRED"],
    [/coveredTravelers/, "COST_SCOPE_REQUIRED"], [/coverage must match/, "COST_COVERAGE_INVALID"],
    [/both min and max/, "COST_PRICE_PAIR_REQUIRED"], [/actual budget change/, "EMPTY_CHANGE"],
  ];
  const code = (error as { code?: string })?.code ?? (error instanceof ZodError ? "ITEM_SHAPE_INVALID" : reasons.find(([pattern]) => pattern.test(message))?.[1] ?? "AUTHORING_INVALID");
  const diagnostic = agentErrorDetail(error);
  return Object.assign(new Error(`Command ${commandIndex + 1} (${command.type}, ${command.id ?? "settings"}): ${message}`), { status: 400, code,
    data: { ...(code === "SOURCE_NOT_FOUND" ? (error as { data?: object }).data : {}), commandIndex, commandType: command.type, targetId: command.id ?? "settings", reasonCode: code, errorType: diagnostic.errorType,
      findings: diagnostic.issues?.map(issue => ({ code: issue.code, path: issue.path.split("."), instruction: issue.instruction })) } });
}
/** Editable projection, computed from the one accepted domain representation. */
export function authoringItem(item: PlanItem, environment: AgentEnvironment) {
  const sources = environment.evidenceSources?.() ?? [];
  const locate = (value: Location | null): object | null => {
    if (!value) return null;
    if (value.type === "catalog") return { placeId: value.placeId };
    if (value.type === "item") return { locationItemId: value.itemId };
    if (value.type === "restaurant" || value.type === "hotel") {
      const web = value.basis.sources.find(source => source.type === "web");
      return { venue: { name: value.label, address: value.address, city: value.city, ...(value.geoEvidenceId ? { geoEvidenceId: value.geoEvidenceId } : {}), sourceId: web?.type === "web" ? sources.find(source => source.url === web.url && source.checkedAt === web.accessedAt)?.sourceId : undefined }, positionVerified: !!value.geoEvidenceId };
    }
    if (value.type === "specified") {
      const source = value.basis.sources.find(source => source.type === "message");
      if (value.basis.kind === "user") return { userLocation: value.label, userLocationMessageId: source?.type === "message" ? source.messageId : undefined };
      if (value.basis.kind === "assumption") return { area: value.label };
      return { label: value.label, origin: value.basis.kind, sources: value.basis.sources };
    }
    if (value.type === "area") return { area: value.label };
    return value;
  };
  const time = itemTiming(item);
  const basic = { id: item.id, kind: item.kind, title: item.title, reason: item.reason, optional: item.optional,
    commitment: { kept: !!item.keep, reservation: item.reservation?.state ?? null, fixedStart: time?.start?.binding === "fixed", fixedEnd: time?.end?.binding === "fixed" } };
  if (item.kind === "stay") return { ...basic, location: locate(item.location), ...(item.coverage?.type === "nights" ? { afterDayIds: item.coverage.afterDayIds } : { dates: item.coverage?.type === "dates" ? { checkIn: item.coverage.checkIn?.value, checkOut: item.coverage.checkOut?.value } : null }) };
  return { ...basic, ...(item.kind === "travel" ? { from: locate(item.from), to: locate(item.to), mode: item.mode, timingMode: item.timing.type } : { location: locate(item.location) }),
    startTime: time?.start?.time ?? (item.kind === "travel" && item.timing.type !== "interval" ? item.timing.at.time : null), endTime: time?.end?.time ?? null,
    startDate: time?.start?.date ?? null, endDate: time?.end?.date ?? null, durationRange: time?.duration ? { min: time.duration.minMinutes, max: time.duration.maxMinutes } : null };
}

/** Keep internal concurrency handles outside the model interface. */
export function modelData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => modelData(item));
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "editToken").map(([key, item]) => [key, modelData(item)]));
}
