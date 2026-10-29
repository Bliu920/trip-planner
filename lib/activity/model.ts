import { z } from "zod";

export const activitySchema = z.object({
  id: z.string().min(1).max(240),
  attempt: z.uuid(),
  title: z.string().min(1).max(160),
  status: z.enum(["running", "complete", "prepared", "failed", "unconfirmed", "interrupted"]),
  detail: z.string().max(1200),
  sources: z.array(z.object({ url: z.url().max(2000).refine(url => /^https?:\/\//i.test(url)), title: z.string().max(160) })).max(12),
  documents: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(120) })).max(30),
});
export type ActivityEntry = z.infer<typeof activitySchema>;

export function activityEntries(parts: readonly { type: string; data?: unknown }[]): ActivityEntry[] {
  return parts.flatMap(part => {
    if (part.type !== "data-activity") return [];
    const parsed = activitySchema.safeParse(part.data);
    return parsed.success ? [parsed.data] : [];
  });
}
