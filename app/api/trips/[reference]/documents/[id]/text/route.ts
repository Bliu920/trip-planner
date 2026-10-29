import { handleDocumentText } from "@/services/documents";
async function handle(request: Request, context: { params: Promise<{ reference: string; id: string }> }) {
  const { reference, id } = await context.params;
  return handleDocumentText(request, reference, id);
}
export { handle as GET, handle as PUT };
