import { handleDocuments } from "@/services/documents";

export async function GET(request: Request, context: { params: Promise<{ reference: string; id: string }> }) {
  const { reference, id } = await context.params;
  return handleDocuments(request, reference, id, "content");
}
