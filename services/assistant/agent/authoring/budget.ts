import { applyBudgetOperations, type Budget, type BudgetEntry, type BudgetOperation } from "@/lib/budget";
import type { AgentEnvironment } from "../contracts";
import { authoringError, evidence } from "./index";
import { budgetAuthoringInput, type BudgetCommand } from "./inputs";

/** Normalize units explicitly; money remains owned by Budget entries. */
export function authorBudget(budget: Budget, commands: BudgetCommand[], env: AgentEnvironment): BudgetOperation[] {
  budgetAuthoringInput.parse({ operations: commands });
  let current = structuredClone(budget);
  const known = new Set(budget.entries.map(entry => entry.id));
  const operations: BudgetOperation[] = [];
  for (const command of commands) {
    try {
    if (command.type === "removeCost" && !current.entries.some(entry => entry.id === command.id) && (known.has(command.id) || env.artifacts?.wasKnown?.("budget", command.id))) continue;
    const next: BudgetOperation[] = [];
    if (command.type === "review") next.push({ type: "recordReview" });
    else if (command.type === "removeCost") next.push({ type: "removeEntry", id: command.id });
    else if (command.type === "updateSettings") {
      if (command.scope !== undefined || command.travelers !== undefined) next.push({ type: "setScope", scope: command.scope ?? current.scope, travelers: command.travelers !== undefined ? command.travelers : current.travelers });
      if (command.limit !== undefined) next.push({ type: "setLimit", value: command.limit });
      if (command.assumptions !== undefined) next.push({ type: "setAssumptions", value: command.assumptions });
      if (command.exclusions !== undefined) next.push({ type: "setExclusions", value: command.exclusions });
    } else {
      const old = command.type === "updateCost" ? current.entries.find(entry => entry.id === command.id) : undefined;
      if (command.type === "updateCost" && !old) throw new Error("Read an existing cost before updating it.");
      const input = command.type === "updateCost" ? command.changes : command;
      const entry: BudgetEntry = old ? structuredClone(old) : { id: command.id, label: "", category: "other", planItemIds: [], unit: "", quantity: 1, unitMin: null, unitMax: null, pricing: "estimated", assumptions: "", sources: [] };
      for (const field of ["label", "category", "planItemIds", "unit", "quantity", "pricing", "assumptions"] as const) if (input[field] !== undefined) Object.assign(entry, { [field]: input[field] });
      if (input.sources) entry.sources = input.sources.map(source => ({ ...evidence(env, source.sourceId), title: source.title ?? evidence(env, source.sourceId).title, detail: source.detail }));
      if (input.min !== undefined || input.max !== undefined) {
        const sourceScope = input.priceScope ?? (current.scope === "party" ? "whole_party" : "per_person");
        const targetScope = current.scope === "party" ? "whole_party" : "per_person";
        const convert = sourceScope !== targetScope;
        const count = input.coveredTravelers ?? current.travelers;
        if (convert && !count) throw new Error("State coveredTravelers before converting a shared price.");
        if (convert && current.travelers && count !== current.travelers) throw new Error("Shared cost coverage must match the budget travelers. Explain a different sharing arrangement explicitly.");
        if (convert && (input.min === undefined || input.max === undefined)) throw new Error("Supply both min and max when changing the price scope.");
        for (const [key, value] of [["unitMin", input.min], ["unitMax", input.max]] as const) if (value !== undefined) {
          const cents = value === null ? null : Math.round(value * 100);
          entry[key] = cents === null ? null : !convert ? cents / 100 : sourceScope === "whole_party" ? (key === "unitMin" ? Math.floor(cents / count!) : Math.ceil(cents / count!)) / 100 : cents * count! / 100;
        }
        if (convert) entry.assumptions += ` Shared amount converted for ${count} travelers; quantity applies to ${entry.unit}.`;
        if (entry.pricing === "confirmed" && entry.unitMin !== entry.unitMax) entry.pricing = "estimated";
      }
      const { id: entryId, ...fields } = entry;
      next.push(old ? { type: "updateEntry", id: entryId, fields } : { type: "addEntry", entry });
    }
    if (!next.length) throw new Error("Supply an actual budget change.");
    current = applyBudgetOperations(current, next).budget;
    current.entries.forEach(entry => known.add(entry.id));
    operations.push(...next);
    } catch (error) { throw authoringError(error, commands.indexOf(command), command); }
  }
  return operations;
}
