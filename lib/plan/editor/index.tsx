"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { notifyTripChanged, subscribeTripChanges } from "@/lib/trips";
import photos from "@/data/place-photos.json";
import { JourneyProvider } from "@/lib/journeys/view";
import { PlanCanvas } from "../canvas";
import { PlanSession } from "../session";
import { applyEdit, type PlanEdit } from "../commands";
import type { Plan } from "../types";
import type { Day, Photo } from "../presentation/model";
import "./editor.css";

const catalogPhotos: Record<string, Photo> = Object.fromEntries(
  photos.map((photo) => [
    photo.place_id,
    {
      src: `${photo.url}?auto=compress&cs=tinysrgb&w=650`,
      alt: photo.alt,
      credit: photo.photographer || "View photo on Pexels",
      creditUrl: photo.source_url,
      match: photo.match === "place" ? "place" : "illustrative",
    },
  ]),
);
type EditorProps = {
  renderDayContext?: (day: Day) => ReactNode;
  budgetCard?: ReactNode;
  reference: string;
  onOpenChat: () => void;
  onAvailabilityChange?: (exists: boolean | null, error: string) => void;
};
export function PlanEditor(props: EditorProps) {
  // Isolate each project session.
  return <PlanPanel key={props.reference} {...props} />;
}
function PlanPanel({
  reference,
  onOpenChat,
  budgetCard,
  renderDayContext,
  onAvailabilityChange,
}: EditorProps) {
  const { confirm, confirmation } = useConfirmDialog();
  const [session] = useState(() => new PlanSession(reference));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const plan = state.pending?.plan ?? state.data?.plan;
  const locked = state.busy || state.loading || !!state.pending;

  // Subscribe to project changes.
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

  // Report saved availability.
  const available = state.data ? !!state.data.plan : null;
  useEffect(() => {
    onAvailabilityChange?.(available, state.error);
  }, [available, state.error, onAvailabilityChange]);

  // Publish successful edits only.
  async function edit(change: (plan: Plan) => void) {
    const saved = await session.edit(change);
    if (saved) notifyTripChanged(reference);
    return saved;
  }
  async function command(value: PlanEdit) {
    return edit((plan) => applyEdit(plan, value));
  }
  async function reload() {
    if (
      state.pending &&
      !(await confirm(
        "Reload the plan?",
        "Your unsaved edit will be discarded and the current plan loaded.",
        "Discard and reload",
      ))
    )
      return;
    await session.refresh(!!state.pending);
    if (!session.getSnapshot().error) setCanvasVersion((value) => value + 1);
  }
  async function retry() {
    if (await session.retry()) {
      notifyTripChanged(reference);
      setCanvasVersion((value) => value + 1);
    }
  }

  // Compose the editable itinerary.
  return (
    <div className="plan-editor" aria-busy={state.busy || state.loading}>
      {confirmation}
      <span className="sr-only" role="status">
        {state.busy
          ? "Saving..."
          : state.loading
            ? "Updating..."
            : state.pending
              ? "Changes not saved"
              : state.notice}
      </span>
      {state.error && (
        <div className="plan-error" role="alert">
          <p>{state.error}</p>
          {state.pending && (
            <>
              <p>
                {state.failure === "conflict"
                  ? "The plan changed elsewhere. Your proposed edit is still visible. Load the latest plan before editing again."
                  : "Your proposed edit is retained and is not confirmed saved."}
              </p>
              {state.failure === "retryable" && (
                <Button
                  className="cursor-pointer"
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void retry()}
                >
                  Retry same save
                </Button>
              )}
            </>
          )}
          <Button
            className="cursor-pointer"
            variant="ghost"
            disabled={state.busy || state.loading || state.editing}
            onClick={() => void reload()}
          >
            {state.pending ? "Load latest plan" : "Try again"}
          </Button>
        </div>
      )}
      {!state.data && !state.error && (
        <p className="plan-loading" role="status">
          Loading plan...
        </p>
      )}
      {state.data && !plan && (
        <section className="plan-empty">
          <h2>Your plan will appear here</h2>
          <p>Work with the assistant in chat, or start a plan yourself.</p>
          <Button className="cursor-pointer" onClick={onOpenChat}>
            Open chat
          </Button>
          <Button
            className="cursor-pointer"
            variant="outline"
            disabled={locked}
            onClick={() => void edit(() => {})}
          >
            Create an empty plan
          </Button>
        </section>
      )}
      {state.data && plan && (
        <JourneyProvider
          reference={reference}
          revision={state.data.revision}
          pending={!!state.pending}
        >
          <PlanCanvas
            key={canvasVersion}
            plan={plan}
            places={state.data.places}
            photos={catalogPhotos}
            fallbackPhotos={state.data.fallbackPhotos}
            budgetCard={budgetCard}
            renderDayContext={renderDayContext}
            embedded
            locked={locked}
            feedback={
              state.error
                ? `${state.error}${state.pending ? " Close this dialog to use the recovery controls above the plan." : ""}`
                : ""
            }
            onEdit={command}
            onEditingChange={session.setEditing}
          />
        </JourneyProvider>
      )}
    </div>
  );
}
