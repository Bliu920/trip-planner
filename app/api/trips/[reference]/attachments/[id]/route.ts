import { handleAttachments } from "@/services/attachments";

async function handle(request: Request, context: { params: Promise<{ reference: string; id: string }> }) {
  const { reference, id } = await context.params;
  return handleAttachments(request, reference, id);
}
export { handle as GET, handle as PATCH };
