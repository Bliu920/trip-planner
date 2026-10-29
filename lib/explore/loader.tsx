"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Place } from "@/lib/catalog";
import { Explore } from "./view";

export function ExploreLoader({ actionTarget }: { actionTarget?: HTMLElement | null }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Load on first visit.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/places", { signal: controller.signal });
        if (!response.ok) throw new Error("Catalog unavailable");
        const data: Place[] = await response.json();
        if (!controller.signal.aborted) setPlaces(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  // Isolate catalog failures.
  if (places) return <Explore places={places} embedded actionTarget={actionTarget} />;
  return <div className="explore-load-state">
    {error ? <><p role="alert">Could not load places.</p><Button variant="plain" type="button" className="cursor-pointer" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Try again</Button></> : <p role="status">Loading places...</p>}
  </div>;
}
