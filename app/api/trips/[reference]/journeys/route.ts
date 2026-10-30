import { handleJourneys } from "@/services/places/feasibility";
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  return handleJourneys(request, (await context.params).reference);
}
