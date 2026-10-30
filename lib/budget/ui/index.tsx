"use client";

import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import { budgetTotals, totalLabel } from "@/lib/budget";
import { notifyTripChanged, subscribeTripChanges } from "@/lib/trips";
import { BudgetSession } from "./session";
import { BudgetForm } from "./components";
import { BudgetDetails } from "./table";
import "./budget.css";
import { DayBudgetSummary } from "./day";

const Context = createContext<{ session: BudgetSession; reference: string } | null>(null);
export function BudgetProvider({
  reference,
  children,
}: {
  reference: string;
  children: ReactNode;
}) {
  return (
    <BudgetScope key={reference} reference={reference}>
      {children}
    </BudgetScope>
  );
}
function BudgetScope({ reference, children }: { reference: string; children: ReactNode }) {
  const [session] = useState(() => new BudgetSession(reference));
  // Synchronize shared budget state.
  useEffect(() => {
    void session.refresh();
    const unsubscribe = subscribeTripChanges(reference, () => {
      void session.refresh();
    });
    return () => {
      unsubscribe();
      session.stop();
    };
  }, [reference, session]);
  return <Context.Provider value={{ session, reference }}>{children}</Context.Provider>;
}
function useBudget() {
  const context = useContext(Context);
  if (!context) throw new Error("Use BudgetProvider for budget surfaces.");
  const state = useSyncExternalStore(
    context.session.subscribe,
    context.session.getSnapshot,
    context.session.getSnapshot,
  );
  return { ...context, state };
}
export function BudgetCard({ onOpen }: { onOpen: () => void }) {
  const { state } = useBudget();
  const budget = state.data?.budget;
  const total = budget && budgetTotals(budget);
  return (
    <button
      type="button"
      className="bd-card cursor-pointer"
      onClick={onOpen}
      aria-label="Open trip budget"
    >
      <span>
        Trip budget{" "}
        <small>{budget ? (budget.scope === "party" ? "Whole party" : "Per person") : ""}</small>
      </span>
      <span className="bd-cardAmount">
        <strong>
          {budget
            ? totalLabel(budget)
            : state.loading
              ? "Loading..."
              : state.error
                ? "Unavailable"
                : "Not estimated yet"}
        </strong>
        <ArrowUpRight size={16} />
      </span>
      {state.data?.needsReview ? (
        <small>Plan changed · Review costs</small>
      ) : total && total.unknown > 0 ? (
        <small>
          {total.unknown} {total.unknown === 1 ? "cost" : "costs"} not yet included
        </small>
      ) : null}
    </button>
  );
}
export function BudgetPanel({
  onOpenChat,
  onOpenDocument,
  onAvailabilityChange,
}: {
  onOpenChat: () => void;
  onOpenDocument: (id: string) => void;
  onAvailabilityChange?: (exists: boolean | null, error: string) => void;
}) {
  const { session, state, reference } = useBudget();
  const { confirm, confirmation } = useConfirmDialog();
  const [editing, setEditing] = useState(false);
  const budget = state.data?.budget;
  const locked = state.loading || state.busy || !!state.pending;
  // Report saved availability.
  const available = state.data ? !!state.data.budget : null;
  useEffect(() => {
    onAvailabilityChange?.(available, state.error);
  }, [available, state.error, onAvailabilityChange]);
  async function reload() {
    if (
      (editing || state.pending) &&
      !(await confirm(
        "Reload the budget?",
        "Your unsaved budget edits will be discarded and the latest version loaded.",
        "Discard and reload",
      ))
    )
      return;
    setEditing(false);
    await session.refresh(true);
  }
  // Compose independently usable views.
  return (
    <div className="bd-panel" aria-busy={state.busy || state.loading}>
      {confirmation}
      <header className="bd-header">
        <h2>Budget</h2>
        <div className="bd-actions">
          {!editing && (
            <button
              type="button"
              className="cursor-pointer bd-button"
              disabled={locked || !state.data}
              onClick={() => setEditing(true)}
            >
              Edit budget
            </button>
          )}
          {(state.error || state.pending) && (
            <button
              type="button"
              className="cursor-pointer bd-textButton"
              disabled={state.loading || state.busy}
              onClick={() => void reload()}
            >
              Reload
            </button>
          )}
        </div>
      </header>
      <span className="bd-saveStatus" role="status">
        {state.busy ? "Saving..." : state.loading ? "Loading budget..." : state.notice}
      </span>
      {state.error && (
        <div className="bd-error" role="alert">
          <p>{state.error}</p>
          {state.pending && (
            <>
              <p>Your edit is retained. Retry the same save, or reload to discard it.</p>
              <button
                type="button"
                className="cursor-pointer bd-button"
                disabled={state.busy}
                onClick={async () => {
                  if (await session.retry()) {
                    setEditing(false);
                    notifyTripChanged(reference);
                  }
                }}
              >
                Retry save
              </button>
            </>
          )}
        </div>
      )}
      {state.data?.needsReview && !editing && (
        <p className="bd-warning">
          The plan has changed since this budget was checked. These costs may need updating.
        </p>
      )}
      {editing && state.data ? (
        <BudgetForm
          snapshot={state.data}
          locked={locked}
          onClose={() => setEditing(false)}
          onSave={async (next, revision, reviewed) => {
            const saved = await session.edit(
              { ...next, exclusions: next.exclusions.filter((line) => line.trim()) },
              revision,
              reviewed,
            );
            if (saved) notifyTripChanged(reference);
            return saved;
          }}
        />
      ) : budget && budget.entries.length ? (
        <BudgetDetails budget={budget} onOpenDocument={onOpenDocument} />
      ) : state.data ? (
        <section className="bd-empty">
          <h3>No costs recorded yet</h3>
          <p>
            Ask the assistant to research prices for this plan, or add costs yourself. Missing
            prices stay unknown.
          </p>
          <div className="bd-actions">
            <button
              type="button"
              className="cursor-pointer bd-button bd-primary"
              onClick={onOpenChat}
            >
              Open chat
            </button>
            <button
              type="button"
              className="cursor-pointer bd-button"
              disabled={locked}
              onClick={() => setEditing(true)}
            >
              Add costs
            </button>
          </div>
          {budget?.limit !== null && budget?.limit !== undefined && (
            <p>Your spending limit is saved. Cost estimates are still needed.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Shared provider, no second budget request or store. */
export function DayBudgetCard({
  dayId,
  itemIds,
  onOpen,
}: {
  dayId: string;
  itemIds: readonly string[];
  onOpen: () => void;
}) {
  const { state } = useBudget();
  return (
    <DayBudgetSummary
      snapshot={state.data}
      dayId={dayId}
      itemIds={itemIds}
      loading={state.loading}
      error={state.error}
      onOpen={onOpen}
    />
  );
}
