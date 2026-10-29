import { handleDocuments } from "@/services/documents";

async function handle(request: Request, context: { params: Promise<{ reference: string; id: string }> }) {
  const { reference, id } = await context.params;
  return handleDocuments(request, reference, id);
}
export { handle as GET, handle as PATCH, handle as DELETE };
