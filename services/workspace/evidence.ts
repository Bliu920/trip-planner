import type { Budget } from "@/lib/budget";
import { sourcesIn, type Plan } from "@/lib/plan";
import type { Evidence } from "@/services/assistant/agent/authoring";

/** Request-owned handles expand into existing, durable source representations. */
export class EvidenceIndex {
  private records = new Map<string, Evidence>();
  private identities = new Map<string, string>();
  private next = 1;
  add(value: Evidence) {
    const key = JSON.stringify([value.url, value.documentId, value.documentRevision, value.checkedAt]);
    const id = this.identities.get(key) ?? `s${this.next++}`;
    this.identities.set(key, id);
    const record: Evidence = { url: value.url, documentId: value.documentId, documentRevision: value.documentRevision, checkedAt: value.checkedAt, title: value.title };
    this.records.set(id, record);
    return { sourceId: id, ...record };
  }
  web(urls: string[], checkedAt?: string) {
    return urls.map(url => {
      const previous = !checkedAt && [...this.records.entries()].reverse().find(([, record]) => record.url === url);
      return previous ? { sourceId: previous[0], ...previous[1] } : this.add({ url, documentId: null, documentRevision: null, checkedAt: checkedAt ?? new Date().toISOString(), title: url });
    });
  }
  saved(plan: Plan | null, budget: Budget | null) {
    for (const source of plan ? sourcesIn(plan) : []) if (source.type === "web") this.add({ url: source.url, documentId: null, documentRevision: null, checkedAt: source.accessedAt, title: source.url });
    for (const entry of budget?.entries ?? []) for (const source of entry.sources) this.add(source);
  }
  document(id: string, revision: number, title: string, checkedAt = new Date().toISOString()) {
    const previous = [...this.records.entries()].find(([, record]) => record.documentId === id && record.documentRevision === revision);
    return previous ? { sourceId: previous[0], ...previous[1] } : this.add({ url: null, documentId: id, documentRevision: revision, title, checkedAt });
  }
  get(id: string) { return this.records.get(id); }
  list() { return [...this.records].map(([sourceId, value]) => ({ sourceId, ...value })); }
  restore(records: { sourceId: string; url: string | null; documentId: string | null; documentRevision: number | null; checkedAt: string; title: string }[]) {
    this.records.clear(); this.identities.clear(); this.next = 1;
    for (const { sourceId, ...record } of records) {
      if (!/^s[1-9]\d*$/.test(sourceId) || this.records.has(sourceId)) throw new Error("Invalid source index snapshot.");
      this.records.set(sourceId, record);
      this.identities.set(JSON.stringify([record.url, record.documentId, record.documentRevision, record.checkedAt]), sourceId);
      this.next = Math.max(this.next, Number(sourceId.slice(1)) + 1);
    }
  }
}

/** Keep active evidence and recent discoveries in routine context. */
export function visibleSources(records: ReturnType<EvidenceIndex["list"]>, plan: Plan | null, budget: Budget | null) {
  const used = new Set<string>();
  for (const source of plan ? sourcesIn(plan) : []) if (source.type === "web") used.add(JSON.stringify([source.url, source.accessedAt]));
  for (const entry of budget?.entries ?? []) for (const source of entry.sources) if (source.url) used.add(JSON.stringify([source.url, source.checkedAt]));
  const recent = new Set(records.slice(-16).map(source => source.sourceId));
  const sources = records.filter(source => source.documentId || recent.has(source.sourceId) || used.has(JSON.stringify([source.url, source.checkedAt])));
  return { sources: sources.map(source => ({ ...source, title: source.title === source.url ? undefined : source.title })), sourceCount: records.length, sourcesTruncated: sources.length < records.length };
}
