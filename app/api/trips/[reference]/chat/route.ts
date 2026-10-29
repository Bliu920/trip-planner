import { after } from "next/server";
import { handleChat } from "@/services/chat";

export const maxDuration = 600;

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  return handleChat(request, reference, work => after(() => work));
}
