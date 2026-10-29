import "server-only";

export class ConversationError extends Error {
  constructor(message: string, public status = 503) { super(message); }
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
  try {
    response = await fetch(new URL(`/rest/v1/rpc/${operation}`, baseUrl), {
      method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(10000), body: JSON.stringify(parameters),
    });
  } catch { throw new ConversationError("Could not load or save this chat. Reload the conversation before trying again."); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const known = typeof body.message === "string" ? errors[body.message] : undefined;
    if (known) throw new ConversationError(...known);
    if (["PGRST202", "42P01"].includes(body.code)) throw new ConversationError("Chat is temporarily unavailable. Please try again later.");
    throw new ConversationError("Could not save or load this conversation. Reload it before trying again.");
  }
  return response.json();
}
