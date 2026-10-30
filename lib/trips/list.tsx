"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ProjectCover } from "@/lib/project-cover";
import Link from "next/link";
import type { RecentTrip } from "./types";

export default function ProjectList({
  trips,
  ready,
  onForget,
  draft,
  layout = "rows",
}: {
  trips: RecentTrip[];
  draft?: ReactNode;
  ready: boolean;
  onForget: (reference: string) => void;
  layout?: "rows" | "cards";
}) {
  const [requestedPage, setPage] = useState(0);
  const pageSize = layout === "cards" ? 6 : 4;
  const draftCount = draft ? 1 : 0;
  const totalPages = Math.max(1, Math.ceil((trips.length + draftCount) / pageSize));
  const page = Math.min(requestedPage, totalPages - 1);
  const offset = page * pageSize;
  const tripOffset = Math.max(0, offset - draftCount);
  const visibleTrips = trips.slice(tripOffset, offset + pageSize - draftCount);

  return (
    <section
      aria-label="Projects on this device"
      className={`project-list-list${layout === "cards" ? " project-list-cards" : ""}`}
    >
      <div className="project-list-viewport">
        {!ready ? (
          <p className="project-list-empty" role="status">
            Loading projects...
          </p>
        ) : trips.length === 0 && !draft ? (
          <p className="project-list-empty">No projects yet.</p>
        ) : (
          <ol className="project-list-rows">
            {draft && page === 0 && (
              <li className="project-list-row project-list-draft-row">{draft}</li>
            )}
            {visibleTrips.map((trip, index) => (
              <li className="project-list-row" key={trip.reference}>
                <Link
                  className="project-list-project"
                  href={`/trips/${trip.reference}`}
                  aria-label={`Open ${trip.name}`}
                >
                  {layout === "cards" ? (
                    <ProjectCover reference={trip.reference} />
                  ) : (
                    <span className="project-list-number" aria-hidden="true">
                      {String(tripOffset + index + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="project-list-title">{trip.name}</span>
                  <time className="project-list-date" dateTime={trip.lastOpened}>
                    {new Date(trip.lastOpened).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
                <Button
                  variant="plain"
                  type="button"
                  className={`cursor-pointer project-list-remove`}
                  onClick={() => onForget(trip.reference)}
                  aria-label={`Remove ${trip.name} from this device`}
                  title="Remove from this device"
                >
                  <X size={17} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>
      {ready && totalPages > 1 && (
        <nav className="project-list-pagination" aria-label="Project pages">
          <Button
            variant="plain"
            type="button"
            className="cursor-pointer"
            aria-label="Previous page"
            title="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="plain"
            type="button"
            className="cursor-pointer"
            aria-label="Next page"
            title="Next page"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  );
}
