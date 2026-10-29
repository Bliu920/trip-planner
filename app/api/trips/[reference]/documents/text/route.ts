import { handleDocumentText } from "@/services/documents";
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  return handleDocumentText(request, (await context.params).reference);
}
