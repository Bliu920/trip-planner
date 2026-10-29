import { ArrowUpRight, ChevronDown } from "lucide-react";
import { dayBudget, totalLabel, formatMoney, type BudgetEntry, type BudgetSnapshot } from "@/lib/budget";

export function DayBudgetSummary({ snapshot, itemIds, loading, error, onOpen }: {
  snapshot: BudgetSnapshot | null; itemIds: readonly string[]; loading: boolean; error: string; onOpen: () => void;
}) {
  const budget = snapshot?.budget;
  const result = budget ? dayBudget(budget, itemIds) : null;
  const incomplete = !!result && (result.totals.unknown > 0 || result.unlinked.length > 0 || result.shared.length > 0);
  const scope = budget?.scope === "party" ? `${budget.travelers} travelers` : budget ? "Per person" : "";
  const amount = (entry: BudgetEntry) => entry.pricing === "unknown" ? "Not priced" : entry.unitMin === entry.unitMax
    ? formatMoney(entry.unitMin! * entry.quantity) : `${formatMoney(entry.unitMin! * entry.quantity)} to ${formatMoney(entry.unitMax! * entry.quantity)}`;
  return <section className="bd-day" aria-label="Day spending">
    <details>
      <summary className="cursor-pointer"><span><span className="bd-day-label">Day spending</span><strong>{error ? "Unavailable" : loading && !budget ? "Loading..." : result ? totalLabel(result.budget) : "Not estimated yet"}</strong><small>{[snapshot?.needsReview ? "Needs review" : incomplete ? "Partial estimate" : result?.totals.priced ? "Recorded prices" : "", scope].filter(Boolean).join(" · ")}</small></span><ChevronDown size={16} /></summary>
      {result && <>
        {!!result.budget.entries.length && <ul>{result.budget.entries.map(entry => <li key={entry.id}><div><span>{entry.label}</span><strong>{amount(entry)}</strong></div><small>{entry.pricing === "confirmed" ? "Confirmed price" : entry.pricing === "estimated" ? "Estimate" : "Price unknown"}</small>{entry.assumptions && <p>{entry.assumptions}</p>}{entry.sources.filter(source => source.url).map((source, index) => <a key={index} href={source.url!} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={12}/></a>)}</li>)}</ul>}
        {!!result.shared.length && <div className="bd-day-shared"><h3>Shared with other days</h3><p>Excluded from this subtotal.</p>{result.shared.map(entry => <p key={entry.id}>{entry.label}: {amount(entry)}</p>)}</div>}
        <p>Only costs linked to these activities are included. Stays and other trip costs may be separate.</p>
      </>}
    {snapshot?.needsReview && <p className="bd-day-warning">The plan changed since these prices were checked.</p>}
    {!!result?.totals.unknown && <p>{result.totals.unknown} linked {result.totals.unknown === 1 ? "cost is" : "costs are"} still unpriced.</p>}
    {!!result?.unlinked.length && <p>{result.unlinked.length} {result.unlinked.length === 1 ? "activity has" : "activities have"} no linked cost. They may be free or not yet priced.</p>}
    <button type="button" className="bd-day-open cursor-pointer" onClick={onOpen}>{error ? "Check budget" : "Full budget & sources"}<ArrowUpRight size={13}/></button>
    </details>
  </section>;
}
