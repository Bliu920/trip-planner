"use client";

import { Tabs } from "@base-ui/react/tabs";
import { BudgetVisual, DayVisual, DiscoveryVisual, LibraryVisual } from "./visuals";
import "./previews.css";

export function DiscoveryPreview() {
  return <DiscoveryVisual />;
}

export function LibraryPreview() {
  return <LibraryVisual />;
}

export function TripPreview() {
  // Switch presentation views.
  return (
    <Tabs.Root defaultValue="day" className="preview-switcher">
      <Tabs.List aria-label="View itinerary examples" className="preview-tabs">
        <Tabs.Tab value="day" className="cursor-pointer">
          A day in your trip
        </Tabs.Tab>
        <Tabs.Tab value="budget" className="cursor-pointer">
          Your budget
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="day">
        <DayVisual />
      </Tabs.Panel>
      <Tabs.Panel value="budget">
        <BudgetVisual />
      </Tabs.Panel>
      <p className="preview-caption">Example itinerary and costs. Nothing is booked.</p>
    </Tabs.Root>
  );
}
