import "server-only";

export class ConversationError extends Error {
  constructor(message: string, public status = 503, public diagnostic: { code: string; operation?: string; httpStatus?: number; databaseCode?: string } = { code: "CHAT_UNAVAILABLE" }) { super(message); this.name = "ConversationError"; }
}

const errors: Record<string, [string, number]> = {
  CHAT_NOT_FOUND: ["This conversation could not be found in this trip.", 404],
  CHAT_BUSY: ["A reply is already in progress. Reload the conversation shortly.", 409],
  CHAT_CONFLICT: ["This conversation has changed. Reload it before sending again.", 409],
  CHAT_FULL: ["This conversation is full. Start a new chat to continue.", 400],
  ATTACHMENT_INVALID: ["A document is unavailable or belongs to another trip. Reload the conversation.", 400],
  ATTACHMENT_CHAT_FULL: ["This chat uses six documents. Stop using a document here before adding another.", 400],
  PLACE_REFERENCE_INVALID: ["A selected place is unavailable. Choose places from Explore.", 400],
  CHAT_INVALID: ["The chat message is invalid.", 400],
};

export async function chatRpc<T>(operation: string, parameters: Record<string, unknown>): Promise<T> {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new ConversationError("Chat is temporarily unavailable. Please try again later.");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  const deadline = AbortSignal.timeout(10000);
  try {
    response = await fetch(new URL(`/rest/v1/rpc/${operation}`, baseUrl), {
      method: "POST", headers, cache: "no-store", signal: deadline, body: JSON.stringify(parameters),
    });
  } catch { throw new ConversationError("Could not load or save this chat. Reload the conversation before trying again.", 503, { code: deadline.aborted ? "CHAT_TIMEOUT" : "CHAT_NETWORK_ERROR", operation }); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const known = typeof body.message === "string" ? errors[body.message] : undefined;
    const diagnostic = { code: known ? body.message as string : `CHAT_HTTP_${response.status}`, operation, httpStatus: response.status, ...(typeof body.code === "string" && /^[A-Z0-9_]{1,32}$/.test(body.code) ? { databaseCode: body.code as string } : {}) };
    if (known) throw new ConversationError(known[0], known[1], diagnostic);
    if (["PGRST202", "42P01"].includes(body.code)) throw new ConversationError("Chat is temporarily unavailable. Please try again later.", 503, { ...diagnostic, code: "CHAT_MIGRATION_REQUIRED" });
    throw new ConversationError("Could not save or load this conversation. Reload it before trying again.", 503, diagnostic);
  }
  return response.json().catch(() => { throw new ConversationError("The chat service returned an unreadable response. Reload to check its state.", 503, { code: "CHAT_INVALID_RESPONSE", operation, httpStatus: response.status }); });
}

export function retryableChatWrite(error: unknown) {
  return error instanceof ConversationError && error.status >= 500 && (!error.diagnostic.httpStatus || error.diagnostic.httpStatus >= 500 || error.diagnostic.code === "CHAT_INVALID_RESPONSE");
}
