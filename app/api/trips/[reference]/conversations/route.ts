import { handleConversations } from "@/services/conversations";

type Context = { params: Promise<{ reference: string }> };

export async function GET(request: Request, context: Context) {
  const { reference } = await context.params;
  return handleConversations(request, reference);
}

export async function POST(request: Request, context: Context) {
  const { reference } = await context.params;
  return handleConversations(request, reference);
}
