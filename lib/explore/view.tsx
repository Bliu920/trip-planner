"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExploreControls, type ExploreFilters } from "./controls";
import { Button } from "@/components/ui/button";
import { filterPlaces, type Place } from "@/lib/catalog";
import { PlaceToggle } from "@/lib/place-references";
import { PlaceCard } from "./place";
import { AboutLink } from "@/lib/photo-credits";
import "./explore.css";

export function Explore({
  places,
  embedded = false,
  actionTarget,
}: {
  places: readonly Place[];
  embedded?: boolean;
  actionTarget?: HTMLElement | null;
}) {
  const [filters, setFilters] = useState<ExploreFilters>({ query: "", city: "", type: "" });
  const cities = useMemo(() => [...new Set(places.map((place) => place.city))].sort(), [places]);
  const types = useMemo(() => [...new Set(places.map((place) => place.type))].sort(), [places]);
  const filtered = useMemo(
    () => filterPlaces(places, filters.query, filters.city, filters.type),
    [places, filters],
  );
  function clear() {
    setFilters({ query: "", city: "", type: "" });
  }
  const Container = embedded ? "div" : "main";

  // Compose the catalog view.
  return (
    <Container className={`explore${embedded ? " explore-embedded" : ""}`}>
      {!embedded && (
        <header className="explore-header">
          <Link href="/projects/new" className="explore-brand">
            Trip planner
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/projects/new">Projects</Link>
          </nav>
        </header>
      )}
      <div className={embedded ? "sr-only" : "explore-heading"}>
        {!embedded && <h1>Explore</h1>}
        <span role="status">
          {filtered.length} {filtered.length === 1 ? "place" : "places"}
        </span>
      </div>
      {embedded ? (
        actionTarget &&
        createPortal(
          <ExploreControls
            filters={filters}
            onChange={setFilters}
            cities={cities}
            types={types}
            compact
          />,
          actionTarget,
        )
      ) : (
        <ExploreControls filters={filters} onChange={setFilters} cities={cities} types={types} />
      )}
      <section className="explore-grid" aria-label="Places">
        {filtered.map((place) => (
          <PlaceCard
            key={place.id}
            place={place}
            action={<PlaceToggle place={place} />}
            detailAction={<PlaceToggle place={place} detailed />}
          />
        ))}
        {!filtered.length && (
          <div className="explore-empty">
            <p>No matching places.</p>
            <Button type="button" variant="plain" className="cursor-pointer" onClick={clear}>
              Clear filters
            </Button>
          </div>
        )}
      </section>
      {!embedded && <AboutLink />}
    </Container>
  );
}
