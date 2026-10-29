import { handleAttachments } from "@/services/attachments";

async function handle(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  return handleAttachments(request, reference);
}
export { handle as GET, handle as POST };
