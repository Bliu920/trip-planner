import { handleBudget } from "@/services/budgets";
export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  return handleBudget(request, (await params).reference);
}
export const PUT = GET;
