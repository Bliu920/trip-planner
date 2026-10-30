"use client";

import { useState } from "react";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { typeLabel } from "@/lib/catalog";
import type { ExploreFilters } from "./controls";

export function FilterMenu({
  filters,
  onChange,
  cities,
  types,
}: {
  filters: ExploreFilters;
  onChange: (filters: ExploreFilters) => void;
  cities: string[];
  types: string[];
}) {
  const active = !!(filters.city || filters.type);
  const [submenu, setSubmenu] = useState<"city" | "type" | null>(null);
  // Compose the filter submenus.
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) setSubmenu(null);
      }}
    >
      <DropdownMenuTrigger
        className="cursor-pointer start-trip-action explore-filter-trigger"
        aria-label="Filter places"
        title="Filter places"
        data-filtered={active || undefined}
      >
        <SlidersHorizontal size={19} aria-hidden="true" />
        {active && <span className="sr-only">Filters active</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Filter places">
        {(["city", "type"] as const).map((key) => (
          <DropdownMenuSub
            key={key}
            open={submenu === key}
            onOpenChange={(open) =>
              setSubmenu((current) => (open ? key : current === key ? null : current))
            }
          >
            <DropdownMenuSubTrigger>
              <span>{key === "city" ? "City" : "Place type"}</span>
              <span className="explore-filter-value">
                {filters[key] ? (key === "city" ? filters[key] : typeLabel(filters[key])) : "All"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent aria-label={key === "city" ? "City" : "Place type"}>
              <DropdownMenuItem
                className="ui-dropdown-back"
                closeOnClick={false}
                onClick={() => setSubmenu(null)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                Back to filters
              </DropdownMenuItem>
              <DropdownMenuRadioGroup
                value={filters[key]}
                onValueChange={(value) => onChange({ ...filters, [key]: value })}
              >
                {["", ...(key === "city" ? cities : types)].map((value) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {value
                      ? key === "city"
                        ? value
                        : typeLabel(value)
                      : key === "city"
                        ? "All cities"
                        : "All types"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange({ ...filters, city: "", type: "" })}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
