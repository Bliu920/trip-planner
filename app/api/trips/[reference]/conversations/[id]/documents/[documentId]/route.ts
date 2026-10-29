import { handleConversationDocument } from "@/services/conversations";

export async function DELETE(request: Request, context: { params: Promise<{ reference: string; id: string; documentId: string }> }) {
  const { reference, id, documentId } = await context.params;
  return handleConversationDocument(request, reference, id, documentId);
}
