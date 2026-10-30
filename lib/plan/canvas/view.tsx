"use client";

import { SelectField } from "@/components/ui/select";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveLocation, type Plan, type Place } from "@/lib/plan";
import { PlanPresentation, type Day } from "@/lib/plan/presentation";
import { presentPlan, type Photo } from "@/lib/plan/presentation/model";
import "@/lib/plan/presentation/presentation.css";
import { isProtected, type PlanEdit } from "../commands";
import { AddStop, Dialog, ItemFields } from "./controls";
import "./styles.css";

type Selection = { kind: "day" | "item" | "add" | "remove"; id: string } | { kind: "date" } | null;

export function PlanCanvas({
  plan,
  places,
  locked,
  onEdit,
  photos = {},
  fallbackPhotos = [],
  budgetCard,
  renderDayContext,
  embedded = false,
  onEditingChange,
  initialEditor = "",
  feedback = "",
}: {
  plan: Plan;
  places: Place[];
  locked: boolean;
  onEdit: (edit: PlanEdit) => Promise<boolean>;
  photos?: Readonly<Record<string, Photo>>;
  fallbackPhotos?: readonly Photo[];
  budgetCard?: ReactNode;
  renderDayContext?: (day: Day) => ReactNode;
  embedded?: boolean;
  onEditingChange?: (editing: boolean) => void;
  feedback?: string;
  initialEditor?: "day" | "item" | "add" | "";
}) {
  const [selection, setSelection] = useState<Selection>(() =>
    initialEditor
      ? {
          kind: initialEditor,
          id: initialEditor === "item" ? plan.days[0].itemIds[0] : plan.days[0].id,
        }
      : null,
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Project canonical Plan data.
  const data = presentPlan(plan, places, photos, fallbackPhotos);

  const editing = selection !== null;
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

  // Own edit selection only.
  function select(next: Selection) {
    returnFocus.current = document.activeElement as HTMLElement;
    onEditingChange?.(!!next);
    setSelection(next);
  }
  function close() {
    setSelection(null);
    onEditingChange?.(false);
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      else root.current?.focus({ preventScroll: true });
    });
  }
  async function save(edit: PlanEdit) {
    return onEdit(edit);
  }

  function itemEditor(id: string) {
    const item = plan.items[id];
    if (!item) return null;
    const day = plan.days.find((day) => day.itemIds.includes(id));
    const index = day?.itemIds.indexOf(id) ?? -1;
    return (
      <div className="pv2-itemEditor">
        <ItemFields
          key={JSON.stringify(item)}
          item={item}
          plan={plan}
          places={places}
          locked={locked}
          save={save}
          close={close}
          actions={
            isProtected(item) ? null : (
              <>
                {item.kind !== "stay" && (
                  <>
                    <label className="pv2-placement">
                      Move to
                      <SelectField
                        aria-label={`Move ${item.title} to day`}
                        value={day?.id ?? ""}
                        disabled={locked}
                        onValueChange={async (value) => {
                          if (await save({ type: "move", id, dayId: value })) close();
                        }}
                        options={[
                          { value: "", label: "Unscheduled" },
                          ...plan.days.map((day, index) => ({
                            value: day.id,
                            label: `Day ${index + 1}`,
                          })),
                        ]}
                      />
                    </label>
                    {day && (
                      <div className="pv2-reorder">
                        <button
                          className="cursor-pointer pv2-text-action"
                          type="button"
                          aria-label={`Move ${item.title} up`}
                          disabled={index <= 0}
                          onClick={async () => {
                            if (await save({ type: "reorder", id, offset: -1 })) close();
                          }}
                        >
                          Move earlier
                        </button>
                        <button
                          className="cursor-pointer pv2-text-action"
                          type="button"
                          aria-label={`Move ${item.title} down`}
                          disabled={index === day.itemIds.length - 1}
                          onClick={async () => {
                            if (await save({ type: "reorder", id, offset: 1 })) close();
                          }}
                        >
                          Move later
                        </button>
                      </div>
                    )}
                  </>
                )}
                <button
                  className="cursor-pointer pv2-text-action pv2-remove-action"
                  type="button"
                  aria-label={`Remove ${item.title}`}
                  onClick={() => select({ kind: "remove", id })}
                >
                  Remove activity
                </button>
              </>
            )
          }
        />
      </div>
    );
  }

  function locationLabel(location: import("../types").Location | null) {
    const resolved = resolveLocation(plan, location);
    return resolved?.type === "catalog"
      ? (places.find((place) => place.id === resolved.placeId)?.name ?? "Unknown place")
      : (resolved?.label ?? "Unknown location");
  }
  function dayEditor(day: Day | undefined, number: number) {
    if (!day || selection?.kind !== "day" || selection.id !== day.id) return null;
    return (
      <form
        className="pv2-title-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const title = String(new FormData(event.currentTarget).get("title"));
          if (await save({ type: "day", id: day.id, title })) close();
        }}
      >
        {plan.days.find((value) => value.id === day.id)?.startLocation && (
          <p>
            Start: {locationLabel(plan.days.find((value) => value.id === day.id)!.startLocation)}
          </p>
        )}
        {plan.days.find((value) => value.id === day.id)?.endLocation && (
          <p>
            Finish: {locationLabel(plan.days.find((value) => value.id === day.id)!.endLocation)}
          </p>
        )}
        <label>
          Day {number} title
          <input
            autoFocus
            aria-label={`Day ${number} title`}
            name="title"
            defaultValue={day.title}
            required
            maxLength={160}
            disabled={locked}
          />
        </label>
        <div className="pv2-actions">
          <button className="cursor-pointer pv2-primary" disabled={locked}>
            Save day
          </button>
          <button
            className="cursor-pointer pv2-button"
            type="button"
            disabled={locked}
            onClick={close}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Delegate Plan browsing.
  return (
    <div className="pv2" ref={root} tabIndex={-1} aria-label="Editable trip plan">
      <PlanPresentation
        data={data}
        embedded={embedded}
        actionsDisabled={locked}
        budgetCard={budgetCard}
        renderDayContext={renderDayContext}
        onEditStop={(id) => select({ kind: "item", id })}
        onEditDay={(id) => select({ kind: "day", id })}
        onEditDate={() => select({ kind: "date" })}
        onAdd={(id) => select({ kind: "add", id })}
      />
      {selection?.kind === "item" && (
        <Dialog
          title={plan.items[selection.id]?.title ?? "Activity"}
          close={close}
          feedback={feedback}
        >
          {itemEditor(selection.id)}
        </Dialog>
      )}
      {selection?.kind === "day" && (
        <Dialog
          title={`Day ${plan.days.findIndex((day) => day.id === selection.id) + 1}`}
          close={close}
          feedback={feedback}
        >
          {dayEditor(
            data.days.find((day) => day.id === selection.id),
            plan.days.findIndex((day) => day.id === selection.id) + 1,
          )}
        </Dialog>
      )}
      {selection?.kind === "add" && (
        <AddStop
          dayId={selection.id}
          places={places}
          locked={locked}
          save={save}
          close={close}
          feedback={feedback}
        />
      )}
      {selection?.kind === "date" && (
        <Dialog title="When are you going?" close={close} feedback={feedback}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const date = String(new FormData(event.currentTarget).get("date"));
              if (await save({ type: "date", date })) close();
            }}
          >
            <p>
              The following two days follow your start date. Leave it blank if you are still
              deciding.
            </p>
            <label>
              First day
              <input
                type="date"
                name="date"
                defaultValue={plan.startDate?.value ?? ""}
                disabled={locked}
              />
            </label>
            <div className="pv2-actions">
              <button className="cursor-pointer pv2-primary" disabled={locked}>
                Save dates
              </button>
              <button className="cursor-pointer pv2-button" type="button" onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {selection?.kind === "remove" && (
        <Dialog title="Remove this activity?" close={close} feedback={feedback}>
          <p>
            <strong>{plan.items[selection.id]?.title}</strong> will be removed from this plan. To
            keep it for later, choose Unscheduled under More actions instead.
          </p>
          <div className="pv2-actions">
            <button
              className="cursor-pointer pv2-danger"
              disabled={locked}
              onClick={async () => {
                if (await save({ type: "remove", id: selection.id })) close();
              }}
            >
              Remove activity
            </button>
            <button className="cursor-pointer pv2-button" onClick={close}>
              Keep activity
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
