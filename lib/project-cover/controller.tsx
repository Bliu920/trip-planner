"use client";

import { useEffect, useState } from "react";
import { subscribeTripChanges } from "@/lib/trips/events";
import type { ProjectCoverPhoto } from "./types";
import { CoverImages } from "./view";
import "./cover.css";

export function ProjectCover({ reference }: { reference: string }) {
  const [cover, setCover] = useState<{ reference: string; photos: ProjectCoverPhoto[] } | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    // Load the saved plan cover.
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/trips/${encodeURIComponent(reference)}/preview`, {
          cache: "no-store", signal: request.signal,
        });
        if (!response.ok) throw new Error("Cover unavailable");
        const data: { photos: ProjectCoverPhoto[] } = await response.json();
        if (!request.signal.aborted && !disposed) setCover({ reference, photos: data.photos });
      } catch {
        if (!request.signal.aborted && !disposed) setCover({ reference, photos: [] });
      }
    };
    void refresh();
    // Follow project changes.
    const unsubscribe = subscribeTripChanges(reference, () => { void refresh(); });
    return () => { disposed = true; controller?.abort(); unsubscribe(); };
  }, [reference]);
  return <CoverImages photos={cover?.reference === reference ? cover.photos : []} />;
}
