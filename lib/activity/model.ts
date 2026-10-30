import { z } from "zod";

export const activitySchema = z.object({
  id: z.string().min(1).max(240),
  attempt: z.uuid(),
  title: z.string().min(1).max(160),
  status: z.enum(["running", "complete", "prepared", "failed", "unconfirmed", "interrupted"]),
  detail: z.string().max(1200),
  sources: z
    .array(
      z.object({
        url: z
          .url()
          .max(2000)
          .refine((url) => /^https?:\/\//i.test(url)),
        title: z.string().max(160),
      }),
    )
    .max(12),
  documents: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(120) })).max(30),
  kind: z.literal("run").optional(),
  startedAt: z.iso.datetime().optional(),
  elapsedMs: z.number().int().min(0).max(86400000).optional(),
});
export type ActivityEntry = z.infer<typeof activitySchema>;
export type ActivityGroup = ActivityEntry & { entries: ActivityEntry[]; count: number };

const statusPriority: Record<ActivityEntry["status"], number> = {
  complete: 0,
  prepared: 1,
  interrupted: 2,
  unconfirmed: 3,
  failed: 4,
  running: 5,
};

/** Presentation only. Original calls and evidence remain intact. */
export function groupActivity(entries: readonly ActivityEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && last.attempt === entry.attempt && last.entries[0].title === entry.title) {
      last.entries.push(entry);
      last.count++;
      last.title = `${entry.title} (${last.count})`;
      if (statusPriority[entry.status] > statusPriority[last.status]) last.status = entry.status;
    } else groups.push({ ...entry, entries: [entry], count: 1 });
  }
  return groups;
}

export function activityEntries(
  parts: readonly { type: string; data?: unknown }[],
): ActivityEntry[] {
  return parts.flatMap((part) => {
    if (part.type !== "data-activity") return [];
    const parsed = activitySchema.safeParse(part.data);
    return parsed.success && parsed.data.kind !== "run" ? [parsed.data] : [];
  });
}

export function activityRun(
  parts: readonly { type: string; data?: unknown }[],
): ActivityEntry | undefined {
  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index].type !== "data-activity") continue;
    const parsed = activitySchema.safeParse(parts[index].data);
    if (parsed.success && parsed.data.kind === "run") return parsed.data;
  }
}
