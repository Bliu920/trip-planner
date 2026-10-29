import { handleTrip } from "@/services/trips";

export async function POST(request: Request) {
  return handleTrip(request);
}
