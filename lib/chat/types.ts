import type { PlaceReference } from "@/lib/place-references/model";
import type { UIMessage } from "ai";
import type { Attachment } from "@/lib/attachments/types";

export type MessageStatus = "streaming" | "complete" | "interrupted" | "failed";
export type ChatMessage = UIMessage<
  { status: MessageStatus; createdAt: string },
  {
    activity: import("@/lib/activity/model").ActivityEntry;
    failure: import("./failure").ReplyFailure;
    place: PlaceReference;
    attachment: Attachment;
    commit: { summary: string; revision: number };
    action: import("@/lib/actions").ActionState;
  }
>;
export type ConversationSummary = { id: string; createdAt: string };
export type ChatSnapshot = {
  conversationId: string;
  conversations: ConversationSummary[];
  messages: ChatMessage[];
  documents: Attachment[];
};
export type ChatTurn = {
  conversationId: string;
  expectedLastId: string | null;
  retry: boolean;
  message: { id: string; text: string; attachmentIds?: string[]; placeIds?: string[] } | null;
};

export type StoredMessage = {
  id?: string;
  conversationId?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  placeIds?: string[];
};
