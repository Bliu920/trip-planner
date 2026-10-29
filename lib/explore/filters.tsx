"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { typeLabel } from "@/lib/catalog";
import type { ExploreFilters } from "./controls";

type Category = "city" | "type";

function Choices({ category, values, value, onChange, onBack }: {
  category: Category; values: string[]; value: string; onChange: (value: string) => void; onBack: () => void;
}) {
  const selected = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const option = selected.current;
    if (!option) return;
    option.focus({ preventScroll: true });
    const list = option.parentElement;
    if (list) list.scrollTop += option.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2 + option.clientHeight / 2;
  }, []);
  const label = category === "city" ? "City" : "Place type";
  return <div onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onBack(); }
  }}>
    <button type="button" className="cursor-pointer explore-filter-back" onClick={onBack} aria-label="Back to filters"><ChevronLeft size={16} aria-hidden="true" />{label}</button>
    <RadioGroup className="explore-filter-options" aria-label={label} value={value} onValueChange={onChange}>
      {["", ...values].map(option => <Radio.Root key={option} value={option} ref={option === value ? selected : undefined} className="cursor-pointer explore-filter-option">
        <span>{option ? category === "type" ? typeLabel(option) : option : category === "city" ? "All cities" : "All types"}</span>
        <Radio.Indicator><Check size={15} aria-hidden="true" /></Radio.Indicator>
      </Radio.Root>)}
    </RadioGroup>
  </div>;
}

export function FilterMenu({ filters, onChange, cities, types }: {
  filters: ExploreFilters; onChange: (filters: ExploreFilters) => void; cities: string[]; types: string[];
}) {
  const [category, setCategory] = useState<Category | null>(null);
  const restoreFocus = useRef<Category | null>(null);
  const active = !!(filters.city || filters.type);
  function back() { restoreFocus.current = category; setCategory(null); }

  // Compose contextual filtering.
  return <Popover.Root onOpenChange={open => { if (!open) { setCategory(null); restoreFocus.current = null; } }}>
    <Popover.Trigger className="cursor-pointer start-trip-action explore-filter-trigger" aria-label="Filter places" title="Filter places" data-filtered={active || undefined}>
      <SlidersHorizontal size={19} aria-hidden="true" />{active && <span className="sr-only">Filters active</span>}
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="explore-control-positioner">
      <Popover.Popup className="explore-filter-popup" aria-label="Filter places">
        {category ? <Choices key={category} category={category} values={category === "city" ? cities : types} value={filters[category]}
          onChange={value => onChange({ ...filters, [category]: value })} onBack={back} /> : <>
          {(["city", "type"] as const).map(key => <button key={key} type="button" className="cursor-pointer explore-filter-row" onClick={() => setCategory(key)}
            ref={node => { if (node && restoreFocus.current === key) { node.focus({ preventScroll: true }); restoreFocus.current = null; } }}>
            <span>{key === "city" ? "City" : "Place type"}</span>
            <span className="explore-filter-value">{filters[key] ? key === "city" ? filters[key] : typeLabel(filters[key]) : "All"}</span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>)}
          {active && <div className="explore-filter-reset"><button type="button" className="cursor-pointer" onClick={() => { restoreFocus.current = "city"; onChange({ ...filters, city: "", type: "" }); }}>Clear filters</button></div>}
        </>}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
