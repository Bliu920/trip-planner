import { handleTrip } from "@/services/projects/trips";

export async function POST(request: Request) {
  return handleTrip(request);
}
