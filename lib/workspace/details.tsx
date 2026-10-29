"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { DocumentEditor, subscribeDocuments } from "@/lib/documents";
import type { Trip } from "@/lib/trips";

export function Details({ trip }: { trip: Trip }) {
  const [contextId, setContextId] = useState<string | null | undefined>(
    undefined,
  );
  const [contextError, setContextError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetch(`/api/trips/${trip.reference}/workspace`, {
        cache: "no-store",
      })
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          return b;
        })
        .then((b) => {
          if (active) {
            setContextId(b.contextDocumentId);
            setContextError("");
          }
        })
        .catch((e) => {
          if (active) setContextError(e.message);
        });
    };
    load();
    const unsubscribe = subscribeDocuments(trip.reference, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [trip.reference]);
  // Compose trip details.
  return (
    <div className="workspace-details">
      <h2>Trip details</h2>
      <p className="muted">All chats share this trip’s plan, budget and files.</p>
      <h3>Travel brief</h3>
      <p className="muted">
        Keep your preferences, requirements and other useful trip details here.
      </p>
      {contextError && <p role="alert">{contextError}</p>}
      {contextId === undefined ? (
        <p>Loading travel brief...</p>
      ) : (
        <DocumentEditor
          reference={trip.reference}
          id={contextId ?? undefined}
          kind="planning_context"
        />
      )}
      <div className="workspace-reference">
        <label htmlFor="trip-reference">Trip reference</label>
        <Input
          id="trip-reference"
          readOnly
          value={trip.reference}
          onFocus={(event) => event.target.select()}
        />
        <p>
          Anyone with this reference or the trip link can view and edit this
          trip.
        </p>
      </div>
    </div>
  );
}
