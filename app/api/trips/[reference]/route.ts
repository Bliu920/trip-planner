import { handleTrip } from "@/services/projects/trips";

type Context = { params: Promise<{ reference: string }> };

export async function GET(request: Request, context: Context) {
  const { reference } = await context.params;
  return handleTrip(request, reference);
}

export async function PATCH(request: Request, context: Context) {
  const { reference } = await context.params;
  return handleTrip(request, reference);
}
