import "server-only";
import { randomUUID } from "node:crypto";
import { generateProjectTitle } from "../project-titles";
import { queryTrip } from "./database";
import { readInput, TripError, validateReference } from "./validation";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export { TripError } from "./validation";

export async function getTrip(reference: string) {
  return queryTrip("GET", validateReference(reference));
}

export async function handleTrip(request: Request, reference?: string) {
  try {
    // Validate access reference.
    const id = reference === undefined ? randomUUID() : validateReference(reference);
    if (request.method === "GET") return Response.json(await queryTrip("GET", id), { headers });

    // Validate project input.
    const input = await readInput(request);
    const creating = reference === undefined;
    let details: { name: string; notes?: string };
    if ("prompt" in input) {
      if (!creating) throw new TripError("Use the project name to rename this trip.", 400);
      // Name the new project.
      let name = "Italy trip";
      try { name = await generateProjectTitle(input.prompt, request.signal); }
      catch {
        if (request.signal.aborted) throw new TripError("Project creation was cancelled.", 408);
        console.warn("Project title generation unavailable; using the default title.");
      }
      details = { name, notes: input.prompt };
    } else {
      details = input;
    }
    // Persist the final title.
    const trip = await queryTrip(creating ? "POST" : "PATCH", id, details);
    return Response.json(trip, { status: creating ? 201 : 200, headers });
  } catch (error) {
    const known = error instanceof TripError;
    return Response.json({ error: known ? error.message : "Unable to load or save this trip. Try again." }, {
      status: known ? error.status : 500, headers,
    });
  }
}
