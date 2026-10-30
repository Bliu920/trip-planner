"use client";
import { BudgetCard, DayBudgetCard } from "@/lib/budget/ui";
import { PlanEditor } from "@/lib/plan/editor";

export function Plan({
  reference,
  onOpenChat,
  onOpenBudget,
  budgetAvailable,
  onAvailabilityChange,
}: {
  reference: string;
  onOpenBudget: () => void;
  onOpenChat: () => void;
  budgetAvailable: boolean;
  onAvailabilityChange: (exists: boolean | null, error: string) => void;
}) {
  // Compose the Plan module.
  return (
    <PlanEditor
      renderDayContext={(day) => (
        <DayBudgetCard
          dayId={day.id}
          itemIds={day.stops.map((stop) => stop.id)}
          onOpen={onOpenBudget}
        />
      )}
      budgetCard={budgetAvailable ? <BudgetCard onOpen={onOpenBudget} /> : undefined}
      reference={reference}
      onOpenChat={onOpenChat}
      onAvailabilityChange={onAvailabilityChange}
    />
  );
}
