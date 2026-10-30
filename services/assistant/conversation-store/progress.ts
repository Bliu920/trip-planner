import "server-only";
import { activitySchema, type ActivityEntry } from "@/lib/activity/model";
import { chatRpc, ConversationError, retryableChatWrite } from "@/services/assistant/conversation-store/database";

export function progressStore(reference: string, conversation: string, message: string, generation: string) {
  return async (entry: ActivityEntry) => {
    const parameters = {
      p_trip: reference, p_conversation: conversation, p_message: message, p_generation: generation,
      p_entry: activitySchema.parse(entry),
    };
    let saved: boolean;
    try { saved = await chatRpc<boolean>("chat_record_activity", parameters); }
    catch (error) {
      if (!retryableChatWrite(error)) throw error;
      saved = await chatRpc<boolean>("chat_record_activity", parameters);
    }
    if (!saved) throw new ConversationError("Could not save planning progress. Reload the conversation to check it.", 409, { code: "CHAT_ACTIVITY_REPLACED", operation: "chat_record_activity" });
  };
}
