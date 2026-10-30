import "server-only";
import { REFERENCE_PATTERN } from "@/lib/trips/types";
import { getPlan, places } from "@/services/plans";
import { checkJourneys } from "./index";
export async function handleJourneys(request: Request, reference: string) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    if (!REFERENCE_PATTERN.test(reference)) return Response.json({ error: "This trip could not be found." }, { status: 404, headers });
    const snapshot = await getPlan(reference), query = new URL(request.url).searchParams;
    if (query.has("revision") && query.get("revision") !== String(snapshot.revision)) return Response.json({ error: "Refresh the plan to check its current journeys." }, { status: 409, headers });
    const dayId = query.get("day");
    if (!snapshot.plan || !dayId || !snapshot.plan.days.some(day => day.id === dayId))
      return Response.json({ revision: snapshot.revision, report: null }, { headers });
    const report = await checkJourneys(reference, snapshot.plan, places, request.signal, false, [dayId]);
    return Response.json({ revision: snapshot.revision, report }, { headers });
  } catch {
    return Response.json({ error: "Journey checks are temporarily unavailable. Travel times remain unverified." }, { status: 503, headers });
  }
}
