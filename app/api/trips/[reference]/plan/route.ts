import { handlePlan } from "@/services/plans";
async function handle(request: Request, context: { params: Promise<{ reference: string }> }) {
  return handlePlan(request, (await context.params).reference);
}
export { handle as GET, handle as PUT };
