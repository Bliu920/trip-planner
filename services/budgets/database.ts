import "server-only";
export class BudgetError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export async function budgetRpc<T>(
  operation: "budget_get" | "budget_save",
  parameters: Record<string, unknown>,
): Promise<T> {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new BudgetError("The budget is temporarily unavailable. Please try again later.");
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(new URL(`/rest/v1/rpc/${operation}`, base), {
      method: "POST",
      headers,
      body: JSON.stringify(parameters),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new BudgetError(
      operation === "budget_save" ? "Could not confirm whether the budget was saved. Reload to check before retrying." : "Could not load your budget. Please try again.",
    );
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (detail.message === "PLAN_CONFLICT")
      throw new BudgetError(
        "The project changed while you were editing. Reload before saving again.",
        409,
      );
    if (detail.message === "PLAN_NOT_FOUND")
      throw new BudgetError("This trip could not be found.", 404);
    if (detail.message === "PLAN_SOURCE")
      throw new BudgetError(
        "The budget cites an unavailable or invalid source.",
        400,
      );
    if (detail.message === "PLAN_INVALID")
      throw new BudgetError("The budget is invalid.", 400);
    if (["PGRST202", "42P01", "42703"].includes(detail.code))
      throw new BudgetError("The budget is temporarily unavailable. Please try again later.");
    throw new BudgetError("Could not read or save the budget.");
  }
  return response.json();
}
