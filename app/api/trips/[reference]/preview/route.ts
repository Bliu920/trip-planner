import { handleProjectCover } from "@/services/project-covers";

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  return handleProjectCover(request, (await context.params).reference);
}
