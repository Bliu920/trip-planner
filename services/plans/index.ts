import "server-only";
import { REFERENCE_PATTERN } from "@/lib/trips/types";
import { inspectPlan, type PlanSnapshot } from "@/lib/plan";
import { loadDayCoverPhotos } from "@/services/catalog";
import { places } from "./catalog";
import { planRpc, PlanError } from "./database";
export { PlanError } from "./database";
export { places } from "./catalog";
export function getPlan(reference: string) {
  return planRpc<PlanSnapshot>("plan_get", { p_trip: reference });
}
export async function savePlan(
  reference: string,
  expectedRevision: number,
  value: unknown,
  requestId: string,
) {
  const current = await getPlan(reference);
  const checked = inspectPlan(
    value,
    places,
    current.revision === expectedRevision ? current.plan : null,
  );
  if (!checked.plan || checked.findings.some((f) => f.severity === "error"))
    throw new PlanError(
      checked.findings
        .filter((f) => f.severity === "error")
        .map((f) => f.code === "shape" ? "Some plan details are incomplete or invalid. Review the plan before saving." : f.message)
        .slice(0, 5)
        .join(" "),
      400,
    );
  return planRpc<{ savedRevision: number; snapshot: PlanSnapshot }>(
    "plan_save",
    {
      p_trip: reference,
      p_expected: expectedRevision,
      p_plan: checked.plan,
      p_request: requestId,
    },
  );
}
export async function handlePlan(request: Request, reference: string) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    if (!REFERENCE_PATTERN.test(reference))
      throw new PlanError("Invalid trip reference.", 400);
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PlanError("Open the plan from your workspace.", 403);
    if (request.method === "GET") {
      const [snapshot, fallbackPhotos] = await Promise.all([getPlan(reference), loadDayCoverPhotos()]);
      return Response.json({ ...snapshot, places, fallbackPhotos }, { headers });
    }
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new PlanError("The plan could not be read. Reload and try again.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new PlanError("Plan data is required.", 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 524288) {
        await reader.cancel();
        throw new PlanError("The plan is too large.", 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new PlanError("The plan could not be read. Reload and try again.", 400);
    }
    if (
      !body ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      typeof body.requestId !== "string" ||
      !REFERENCE_PATTERN.test(body.requestId)
    )
      throw new PlanError("Reload the plan before editing.", 400);
    return Response.json(
      await savePlan(reference, body.revision, body.plan, body.requestId),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof PlanError
            ? error.message
            : "Could not load or save the plan.",
      },
      { status: error instanceof PlanError ? error.status : 503, headers },
    );
  }
}
