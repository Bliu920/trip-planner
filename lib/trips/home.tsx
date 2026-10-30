"use client";

import { createPortal } from "react-dom";
import { RecoveryInput } from "./recovery";
import ProjectList from "./list";
import "./list.css";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  forgetTrip,
  readRecent,
  rememberTrip,
  requestTrip,
  normalizeReference,
  REFERENCE_PATTERN,
  STORAGE_KEY,
  type RecentTrip,
} from ".";

export default function RecentProjects({ actionTarget }: { actionTarget?: HTMLElement | null }) {
  const router = useRouter();
  const errorId = useId();
  const [recent, setRecent] = useState<RecentTrip[]>([]);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"resume" | null>(null);
  const [reference, setReference] = useState("");

  useEffect(() => {
    const refresh = () => {
      try {
        setRecent(readRecent());
        setWarning("");
      } catch {
        setWarning(
          "This browser cannot load your recent projects. You can still open a project with its recovery key.",
        );
      }
      setReady(true);
    };
    void Promise.resolve().then(refresh);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  async function openTrip(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const id = normalizeReference(reference);
    if (!REFERENCE_PATTERN.test(id)) {
      setError("Paste the complete recovery key copied from your project.");
      return;
    }
    setBusy("resume");
    setError("");
    try {
      const trip = await requestTrip("GET", id);
      rememberTrip(trip);
      router.push(`/trips/${trip.reference}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to open this trip.");
    } finally {
      setBusy(null);
    }
  }

  function forget(reference: string) {
    try {
      forgetTrip(reference);
      setRecent(readRecent());
    } catch {
      setWarning("This browser could not update the saved-trip list.");
    }
  }

  const resume = (
    <RecoveryInput
      value={reference}
      onChange={(value) => {
        setReference(value);
        setError("");
      }}
      onSubmit={openTrip}
      busy={!!busy}
      error={error}
      errorId={errorId}
      onDismiss={() => setError("")}
    />
  );

  return (
    <section className="start-trip-projects" aria-label="Recent projects">
      {actionTarget
        ? createPortal(resume, actionTarget)
        : actionTarget === undefined && <div className="project-list-heading">{resume}</div>}
      {error && (
        <p id={errorId} className="message error" role="alert">
          {error}
        </p>
      )}
      {warning && (
        <p className="message" role="status">
          {warning}
        </p>
      )}
      <ProjectList trips={recent} ready={ready} onForget={forget} layout="cards" />
    </section>
  );
}
