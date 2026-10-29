import "server-only";
import { ZodError } from "zod";
import { REFERENCE_PATTERN } from "@/lib/trips/types";
import { budgetSchema, inspectBudget, type BudgetView } from "@/lib/budget";
import { budgetRpc, BudgetError } from "./database";
export { BudgetError } from "./database";
export { BudgetReview, budgetGapSchema } from "./review";
export type { BudgetGap } from "./review";
export function getBudget(reference: string) {
  return budgetRpc<BudgetView>("budget_get", { p_trip: reference });
}
export async function saveBudget(
  reference: string,
  expectedRevision: number,
  value: unknown,
  requestId: string,
  reviewed: boolean,
) {
  // Validate before publication.
  const current = await getBudget(reference);
  const budget = current.revision === expectedRevision ? inspectBudget(value, current.plan) : budgetSchema.parse(value);
  return budgetRpc<{ savedRevision: number; snapshot: BudgetView }>(
    "budget_save",
    {
      p_trip: reference,
      p_expected: expectedRevision,
      p_budget: budget,
      p_reviewed: reviewed,
      p_request: requestId,
    },
  );
}
export async function handleBudget(request: Request, reference: string) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    // Validate scoped requests.
    if (!REFERENCE_PATTERN.test(reference))
      throw new BudgetError("Invalid trip reference.", 400);
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new BudgetError("Open the budget from your workspace.", 403);
    if (request.method === "GET")
      return Response.json(
        await getBudget(reference),
        { headers },
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new BudgetError("The budget could not be read. Reload and try again.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new BudgetError("Budget data is required.", 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new BudgetError("The budget is too large.", 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new BudgetError("The budget could not be read. Reload and try again.", 400);
    }
    if (
      !body ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      typeof body.reviewed !== "boolean" ||
      typeof body.requestId !== "string" ||
      !REFERENCE_PATTERN.test(body.requestId)
    )
      throw new BudgetError("Reload the budget before editing.", 400);
    return Response.json(
      await saveBudget(reference, body.revision, body.budget, body.requestId, body.reviewed),
      { headers },
    );
  } catch (error) {
    const invalid = error instanceof ZodError || (error instanceof Error &&
      (error.message.startsWith("A linked activity") || error.message.startsWith("Source checks")));
    const message = error instanceof ZodError
      ? error.issues.slice(0, 3).map(issue => issue.code === "custom" ? issue.message : "Check the budget amounts, required fields and source links before saving.").join(" ")
      : (error instanceof BudgetError || invalid) && error instanceof Error
        ? error.message : "Could not load or save the budget.";
    return Response.json({ error: message }, {
      status: error instanceof BudgetError ? error.status : invalid ? 400 : 503,
      headers,
    });
  }
}
