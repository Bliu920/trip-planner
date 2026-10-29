import { handleDocuments } from "@/services/documents";

async function handle(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  return handleDocuments(request, reference);
}
export { handle as GET, handle as POST };
