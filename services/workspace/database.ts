import "server-only";
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code = "WORKSPACE_ERROR",
    public data: unknown = null,
  ) {
    super(message);
  }
}
export async function workspaceRpc<T>(
  operation:
    | "planning_begin"
    | "planning_snapshot"
    | "planning_commit"
    | "planning_commit_budget"
    | "planning_save_brief"
    | "planning_sources"
    | "planning_message"
    | "planning_withdraw"
    | "planning_record_action"
    | "planning_run_result",
  parameters: Record<string, unknown>,
): Promise<T> {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key)
    throw new WorkspaceError("Your trip is temporarily unavailable. Please try again later.");
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(new URL(`/rest/v1/rpc/${operation}`, base), {
    method: "POST",
    headers,
    body: JSON.stringify(parameters),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const errors: Record<string, [string, number]> = {
      PLAN_CONFLICT: [
        "The project changed. Reload the workspace and reconsider your edit before saving.",
        409,
      ],
      PLAN_SOURCE: [
        "A cited source is unavailable or belongs to another project.",
        400,
      ],
      PLAN_ATTEMPT: [
        "The assistant stopped before finishing. Try again from the chat.",
        409,
      ],
      PLAN_NOT_FOUND: ["This project could not be found.", 404],
      DOCUMENT_CONFLICT: ["A document changed. Reload before saving.", 409],
      PLAN_INVALID: ["The proposed change is invalid.", 400],
    };
    const [message, status] = errors[detail.message] ?? [
      "Could not load or save your trip. Please try again later.",
      503,
    ];
    throw new WorkspaceError(message, status, typeof detail.message === "string" && detail.message in errors ? detail.message : "WORKSPACE_UNAVAILABLE");
  }
  return response.json();
}
