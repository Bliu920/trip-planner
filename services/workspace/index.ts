import { checkOrigin } from "@/services/assistant/request";
import "server-only";
import {
  checkReference,
  ConversationError,
} from "@/services/assistant/conversation-store";
import { workspaceRpc, WorkspaceError } from "./database";
import type { WorkspaceSnapshot } from "./session";
export { openSession } from "./session";
export { WorkspaceError } from "./database";
export async function handleWorkspace(request: Request, reference: string) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    checkOrigin(request);
    return Response.json(
      await workspaceRpc<WorkspaceSnapshot>("planning_snapshot", {
        p_trip: checkReference(reference),
      }),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read workspace.",
      },
      {
        status:
          error instanceof WorkspaceError || error instanceof ConversationError
            ? error.status
            : 503,
        headers,
      },
    );
  }
}
