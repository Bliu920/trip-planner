"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { emptyBudget, formatMoney, type Budget, type BudgetEntry, type BudgetView } from "@/lib/budget";

export const categories = { stay: "Stay", transport: "Transport", food: "Food", activities: "Activities", other: "Other costs" };
const amount = (entry: BudgetEntry) => entry.pricing === "unknown" ? "Not estimated" : entry.unitMin === entry.unitMax ? formatMoney(entry.unitMin! * entry.quantity) : `${formatMoney(entry.unitMin! * entry.quantity)} to ${formatMoney(entry.unitMax! * entry.quantity)}`;

function newEntry(): BudgetEntry {
  return { id: crypto.randomUUID(), label: "", category: "other", planItemIds: [], pricing: "unknown", unit: "item", quantity: 1, unitMin: null, unitMax: null, assumptions: "Price not researched yet.", sources: [] };
}

export function BudgetForm({ snapshot, locked, onSave, onClose }: { snapshot: BudgetView; locked: boolean; onSave: (budget: Budget, revision: number, reviewed: boolean) => Promise<boolean>; onClose: () => void }) {
  const [budget, setBudget] = useState(() => structuredClone(snapshot.budget ?? emptyBudget()));
  const [revision] = useState(snapshot.revision);
  const [reviewed, setReviewed] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const set = (patch: Partial<Budget>) => setBudget(current => ({ ...current, ...patch }));
  const update = (id: string, patch: Partial<BudgetEntry>) => setBudget(current => ({ ...current, entries: current.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry) }));
  return <form className="bd-form" onSubmit={async event => { event.preventDefault(); if (await onSave(budget, revision, reviewed)) onClose(); }}>
    <fieldset disabled={locked}><legend>Budget settings</legend><div className="bd-fields">
      <label>Estimate covers<select value={budget.scope} onChange={event => set({ scope: event.target.value as Budget["scope"] })}><option value="per_person">Per person</option><option value="party">Whole party</option></select></label>
      <label>Travelers<input type="number" min="1" max="100" required={budget.scope === "party"} value={budget.travelers ?? ""} onChange={event => set({ travelers: event.target.value ? Number(event.target.value) : null })} /></label>
      <label>Your spending limit (€)<input type="number" min="0" step="0.01" placeholder="Not specified" value={budget.limit ?? ""} onChange={event => set({ limit: event.target.value ? Number(event.target.value) : null })} /></label>
    </div><p className="bd-muted">When changing who this budget covers, adjust quantities and shared costs below. Amounts are in EUR.</p>
      <label>Estimate assumptions<textarea value={budget.assumptions} maxLength={6000} onChange={event => set({ assumptions: event.target.value })} placeholder="Dates, room sharing, taxes or other conditions" /></label>
      <label>Not included (one per line)<textarea value={budget.exclusions.join("\n")} onChange={event => set({ exclusions: event.target.value.split("\n") })} /></label>
      <div className="bd-formCosts">{budget.entries.map((entry, index) => <details key={entry.id} open={expanded.includes(entry.id)}>
        <summary className="cursor-pointer" onClick={event => { event.preventDefault(); setExpanded(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id]); }}>{entry.label || `New cost ${index + 1}`}<span>{amount(entry)}</span></summary>
        <label>Cost name<input required maxLength={2000} value={entry.label} onChange={event => update(entry.id, { label: event.target.value })} /></label>
        <div className="bd-fields"><label>Category<select value={entry.category} onChange={event => update(entry.id, { category: event.target.value as BudgetEntry["category"] })}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Price status<select value={entry.pricing} onChange={event => update(entry.id, { pricing: event.target.value as BudgetEntry["pricing"], ...(event.target.value === "unknown" ? { unitMin: null, unitMax: null } : {}) })}><option value="unknown">Not estimated</option><option value="estimated">Estimate</option><option value="confirmed">Verified price</option></select></label></div>
        <div className="bd-fields"><label>Unit<input required value={entry.unit} onChange={event => update(entry.id, { unit: event.target.value })} placeholder="room-night, adult ticket..." /></label><label>Quantity<input type="number" required min="1" max="10000" value={entry.quantity} onChange={event => update(entry.id, { quantity: Number(event.target.value) })} /></label>
          {entry.pricing !== "unknown" && <><label>Unit price, minimum (€)<input type="number" required min="0" step="0.01" value={entry.unitMin ?? ""} onChange={event => update(entry.id, { unitMin: event.target.value ? Number(event.target.value) : null, ...(entry.pricing === "confirmed" ? { unitMax: event.target.value ? Number(event.target.value) : null } : {}) })} /></label><label>Unit price, maximum (€)<input type="number" required min="0" step="0.01" value={entry.unitMax ?? ""} onChange={event => update(entry.id, { unitMax: event.target.value ? Number(event.target.value) : null })} /></label></>}</div>
        <label>{entry.pricing === "unknown" ? "Why is the price missing?" : "Price assumptions and conditions"}<textarea required={entry.pricing !== "confirmed"} maxLength={4000} value={entry.assumptions} onChange={event => update(entry.id, { assumptions: event.target.value })} /></label>
        {(!!Object.keys(snapshot.plan?.items ?? {}).length || !!entry.planItemIds.length) && <details className="bd-links"><summary className="cursor-pointer">Related plan items ({entry.planItemIds.length})</summary>{Object.values(snapshot.plan?.items ?? {}).map(item => <label className="bd-check" key={item.id}><input type="checkbox" checked={entry.planItemIds.includes(item.id)} onChange={event => update(entry.id, { planItemIds: event.target.checked ? [...entry.planItemIds, item.id] : entry.planItemIds.filter(id => id !== item.id) })} />{item.title}</label>)}{entry.planItemIds.filter(id => !snapshot.plan?.items[id]).map(id => <p key={id}>Activity removed from the plan. <button type="button" className="cursor-pointer bd-textButton" onClick={() => update(entry.id, { planItemIds: entry.planItemIds.filter(value => value !== id) })}>Unlink</button></p>)}</details>}
        <div className="bd-sourceForm">{entry.sources.map((source, sourceIndex) => {
          const changeSource = (patch: Partial<typeof source>) => update(entry.id, { sources: entry.sources.map((s, i) => i === sourceIndex ? { ...s, ...patch } : s) });
          return <section key={sourceIndex}><h4>Source {sourceIndex + 1}</h4><label>Source title<input required value={source.title} onChange={event => changeSource({ title: event.target.value })} /></label><label>Source URL<input type="url" required={!source.documentId} value={source.url ?? ""} placeholder="https://" onChange={event => changeSource({ url: event.target.value || null })} /></label><label>Price details from this source<textarea required value={source.detail} onChange={event => changeSource({ detail: event.target.value })} /></label><label>Date checked<input type="date" required value={source.checkedAt.slice(0, 10)} onChange={event => { if (event.target.value) changeSource({ checkedAt: `${event.target.value}T00:00:00.000Z` }); }} /></label>{source.documentId && <p className="bd-muted">Linked document kept.</p>}<button type="button" className="cursor-pointer bd-textButton" onClick={() => update(entry.id, { sources: entry.sources.filter((_, i) => i !== sourceIndex) })}>Remove source</button></section>;
        })}<button type="button" className="cursor-pointer bd-textButton" onClick={() => update(entry.id, { sources: [...entry.sources, { title: "", url: null, documentId: null, documentRevision: null, checkedAt: new Date().toISOString(), detail: "" }] })}><Plus size={14} />Add source</button></div>
        <button type="button" className="cursor-pointer bd-textButton" onClick={() => set({ entries: budget.entries.filter(item => item.id !== entry.id) })}><Trash2 size={14} />Remove cost</button>
      </details>)}</div>
      <button type="button" className="cursor-pointer bd-button" onClick={() => { const entry = newEntry(); set({ entries: [...budget.entries, entry] }); setExpanded(current => [...current, entry.id]); }}><Plus size={14} />Add cost</button>
      <label className="bd-check bd-reviewed"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked the whole budget against the current plan.</label>
      <div className="bd-actions"><button type="submit" className="cursor-pointer bd-button bd-primary" >Save budget</button><button type="button" className="cursor-pointer bd-button" onClick={onClose}>Cancel</button></div>
    </fieldset>
  </form>;
}
