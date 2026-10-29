import "server-only";
import { REFERENCE_PATTERN } from "@/lib/trips/types";
import { getPlan, PlanError } from "@/services/plans";
import { loadCatalog } from "@/services/catalog";
import { selectCoverPhotos } from "./selection";

export async function handleProjectCover(request: Request, reference: string) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    // Validate capability access.
    if (!REFERENCE_PATTERN.test(reference)) throw new PlanError("Invalid trip reference.", 400);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
      throw new PlanError("Open the project from your workspace.", 403);
    // Derive the current cover.
    const { plan } = await getPlan(reference);
    const photos = plan ? selectCoverPhotos(plan, await loadCatalog()) : [];
    return Response.json({ photos }, { headers });
  } catch (error) {
    return Response.json({ error: "Could not load the project cover." }, {
      status: error instanceof PlanError ? error.status : 503, headers,
    });
  }
}
