"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { budgetTotals, formatMoney, totalLabel, type Budget, type BudgetEntry } from "@/lib/budget";

const unitPrice = (entry: BudgetEntry) => entry.unitMin === entry.unitMax ? formatMoney(entry.unitMin!) : `${formatMoney(entry.unitMin!)} to ${formatMoney(entry.unitMax!)}`;
const scopeLabel = (budget: Budget) => budget.scope === "party" ? `${budget.travelers} travelers · EUR` : "Per person · EUR";

export function BudgetDetails({ budget, onOpenDocument }: { budget: Budget; onOpenDocument: (id: string) => void }) {
  const total = budgetTotals(budget);
  // Compose total and breakdown.
  return <>
    <section className="bd-total" aria-label="Budget overview">
      <span>{total.unknown ? "Estimated subtotal" : "Estimated total"}</span>
      <strong>{totalLabel(budget)}</strong><p>{scopeLabel(budget)}</p>
      {total.unknown > 0 && <p className="bd-missing">{total.unknown} {total.unknown === 1 ? "cost is" : "costs are"} not estimated{total.priced > 0 ? " and not included above" : ""}.</p>}
      {budget.limit !== null && <p className="bd-limit">Your limit: {formatMoney(budget.limit)}{total.priced > 0 && total.max > budget.limit ? " · Estimate may exceed your limit" : ""}</p>}
    </section>
    <table className="bd-table">
      <caption className="sr-only">Budget breakdown</caption>
      <colgroup><col /><col className="bd-qty-col" /><col className="bd-value-col" /><col className="bd-details-col" /></colgroup>
      <thead><tr><th scope="col">Cost</th><th scope="col" className="bd-quantity">Qty</th><th scope="col" className="bd-value">Amount</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{budget.entries.map(entry => <CostRow key={entry.id} entry={entry} budget={budget} onOpenDocument={onOpenDocument} />)}</tbody>
    </table>
    {(budget.assumptions || !!budget.exclusions.length) && <details className="bd-notes"><summary className="cursor-pointer">Budget details</summary>
      {budget.assumptions && <p>{budget.assumptions}</p>}
      {!!budget.exclusions.length && <><h3>Not included</h3><ul>{budget.exclusions.map((text, index) => <li key={index}>{text}</li>)}</ul></>}
    </details>}
  </>;
}

function CostRow({ entry, budget, onOpenDocument }: { entry: BudgetEntry; budget: Budget; onOpenDocument: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const amount = entry.pricing === "unknown" ? "Not estimated" : totalLabel({ ...budget, entries: [entry] });
  return <>
    <tr className="bd-cost-row" data-expanded={open || undefined}>
      <th scope="row">{entry.label}</th>
      <td className="bd-quantity">{entry.quantity}</td>
      <td className="bd-value"><strong>{amount}</strong>{entry.pricing !== "unknown" && <small>{entry.pricing === "confirmed" ? "Price verified" : "Estimate"}</small>}</td>
      <td className="bd-row-action"><button type="button" className="cursor-pointer bd-detail-toggle" aria-label={`Details for ${entry.label}`} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}><span>Details</span><ChevronDown size={13} aria-hidden="true" /></button></td>
    </tr>
    <tr id={detailsId} className="bd-detail-row" hidden={!open}><td colSpan={4}>{open && <CostEvidence entry={entry} amount={amount} onOpenDocument={onOpenDocument} />}</td></tr>
  </>;
}

export function CostEvidence({ entry, amount, onOpenDocument }: { entry: BudgetEntry; amount: string; onOpenDocument: (id: string) => void }) {
  return <div className="bd-evidence">
    <h3>{entry.pricing === "unknown" ? "Price not estimated" : "How this is calculated"}</h3>
    {entry.pricing !== "unknown" && <p className="bd-calculation">{entry.quantity} × {entry.unitMin !== entry.unitMax ? `(${unitPrice(entry)})` : unitPrice(entry)} = {amount}<small>Price per {entry.unit.replace(/[-_]+/g, " ")}</small></p>}
    {entry.assumptions && <p>{entry.assumptions}</p>}
    {entry.pricing === "confirmed" && <p className="bd-muted">Price verified for the cited conditions.</p>}
    {!!entry.sources.length && <h3>Sources</h3>}
    {entry.sources.map((source, index) => <article key={index} className="bd-source">
      {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title}</a> : <strong>{source.title}</strong>}
      <p>{source.detail}</p><small>Checked <time dateTime={source.checkedAt}>{new Date(source.checkedAt).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" })}</time></small>
      {source.documentId && <button type="button" className="cursor-pointer bd-textButton" onClick={() => onOpenDocument(source.documentId!)}>Open document{source.documentRevision ? ` (source version ${source.documentRevision})` : ""}</button>}
    </article>)}
    {!entry.sources.length && <p className="bd-muted">No price source added yet.</p>}
  </div>;
}
