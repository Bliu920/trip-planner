"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { typeLabel } from "@/lib/catalog";
import { FilterMenu } from "./filters";

export type ExploreFilters = { query: string; city: string; type: string };

function InlineSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const focusInput = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    node?.focus();
  }, []);
  function close() {
    setExpanded(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="explore-inline-search"
      data-expanded={expanded || undefined}
      role="search"
      aria-label="Find places"
      onBlur={(event) => {
        if (!query && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {expanded && (
        <>
          <Input
            unstyled
            ref={focusInput}
            id={id}
            aria-label="Search places"
            placeholder="Search places"
            value={query}
            onChange={(event) => onChange(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="cursor-pointer explore-clear"
              aria-label="Clear search"
              onClick={() => {
                onChange("");
                input.current?.focus();
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </>
      )}
      <button
        ref={trigger}
        type="button"
        className="cursor-pointer start-trip-action"
        aria-label={expanded ? "Close search" : "Search places"}
        title={expanded ? "Close search" : "Search places"}
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        data-filtered={(!expanded && !!query) || undefined}
        onClick={() => (expanded ? close() : setExpanded(true))}
      >
        <Search size={19} aria-hidden="true" />
        {query && <span className="sr-only">Search active</span>}
      </button>
    </div>
  );
}

export function ExploreControls({
  filters,
  onChange,
  cities,
  types,
  compact = false,
}: {
  filters: ExploreFilters;
  onChange: (filters: ExploreFilters) => void;
  cities: string[];
  types: string[];
  compact?: boolean;
}) {
  const search = (
    <div className="explore-search">
      <Search size={17} aria-hidden="true" />
      <Input
        unstyled
        aria-label="Search places"
        placeholder="Search places"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
      />
      {filters.query && (
        <button
          type="button"
          className="cursor-pointer explore-clear"
          aria-label="Clear search"
          onClick={() => onChange({ ...filters, query: "" })}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
  const city = (
    <SelectField
      aria-label="City"
      value={filters.city}
      onValueChange={(value) => onChange({ ...filters, city: value })}
      options={[
        { value: "", label: "All cities" },
        ...cities.map((value) => ({ value, label: value })),
      ]}
    />
  );
  const type = (
    <SelectField
      aria-label="Place type"
      value={filters.type}
      onValueChange={(value) => onChange({ ...filters, type: value })}
      options={[
        { value: "", label: "All types" },
        ...types.map((value) => ({ value, label: typeLabel(value) })),
      ]}
    />
  );

  if (!compact)
    return (
      <div className="explore-filters" role="search" aria-label="Find places">
        {search}
        {city}
        {type}
      </div>
    );

  // Reveal contextual controls.
  return (
    <>
      <InlineSearch query={filters.query} onChange={(query) => onChange({ ...filters, query })} />
      <FilterMenu filters={filters} onChange={onChange} cities={cities} types={types} />
    </>
  );
}
