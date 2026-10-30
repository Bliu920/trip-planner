import type { ChatSnapshot } from "./types";

export async function requestHistory(
  reference: string,
  conversation?: string,
  create = false,
  signal?: AbortSignal,
): Promise<ChatSnapshot> {
  const query = conversation ? `?conversation=${encodeURIComponent(conversation)}` : "";
  let response;
  try {
    response = await fetch(`/api/trips/${encodeURIComponent(reference)}/conversations${query}`, {
      method: create ? "POST" : "GET",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new Error("Could not load your conversation. Check your connection and try again.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load this conversation.");
  return body;
}

export async function removeChatDocument(reference: string, conversation: string, id: string) {
  const response = await fetch(
    `/api/trips/${encodeURIComponent(reference)}/conversations/${conversation}/documents/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "Could not update the selected documents.");
  }
}
