import "server-only";
import { activitySchema, type ActivityEntry } from "@/lib/activity/model";
import { chatRpc, ConversationError } from "@/services/conversations/database";

export function activityStore(reference: string, conversation: string, message: string, generation: string) {
  return async (entry: ActivityEntry) => {
    const saved = await chatRpc<boolean>("chat_record_activity", {
      p_trip: reference, p_conversation: conversation, p_message: message, p_generation: generation,
      p_entry: activitySchema.parse(entry),
    });
    if (!saved) throw new ConversationError("Could not save planning progress. Reload the conversation to check it.", 409);
  };
}
