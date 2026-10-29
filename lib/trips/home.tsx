"use client";

import { createPortal } from "react-dom";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProjectList from "./list";
import "./list.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { forgetTrip, readRecent, rememberTrip, requestTrip, normalizeReference, REFERENCE_PATTERN, STORAGE_KEY, type RecentTrip } from ".";

export default function RecentProjects({ actionTarget }: { actionTarget?: HTMLElement | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"resume" | null>(null);
  const [recent, setRecent] = useState<RecentTrip[]>([]);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"resume" | null>(null);
  const [reference, setReference] = useState("");

  useEffect(() => {
    const refresh = () => {
      try { setRecent(readRecent()); setWarning(""); }
      catch { setWarning("This browser cannot load saved references. You can still resume a trip with its ID."); }
      setReady(true);
    };
    void Promise.resolve().then(refresh);
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  async function openTrip(event: FormEvent) {
    event.preventDefault();
    const id = normalizeReference(reference);
    if (!REFERENCE_PATTERN.test(id)) { setError("Enter the full reference ID copied from your trip."); return; }
    setBusy("resume"); setError("");
    try {
      const trip = await requestTrip("GET", id);
      rememberTrip(trip);
      router.push(`/trips/${trip.reference}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to open this trip."); }
    finally { setBusy(null); }
  }

  function forget(reference: string) {
    try { forgetTrip(reference); setRecent(readRecent()); }
    catch { setWarning("This browser could not update the saved-trip list."); }
  }

  function toggleMode(next: "resume") {
    setMode(current => current === next ? null : next);
    setError("");
  }

  const resume = <Button variant="plain" type="button" className={`cursor-pointer start-trip-action ${mode === "resume" ? "project-list-selected" : ""}`} onClick={() => toggleMode("resume")} disabled={!!busy} aria-label="Resume by ID" title="Resume by ID" aria-expanded={mode === "resume"} aria-controls={mode === "resume" ? "project-form" : undefined}><KeyRound size={19} aria-hidden="true" /></Button>;

  return <section className="start-trip-projects" aria-label="Recent projects">
    {actionTarget ? createPortal(resume, actionTarget) : actionTarget === undefined && <div className="project-list-heading">{resume}</div>}
    {error && <p className="message error" role="alert">{error}</p>}
    {warning && <p className="message" role="status">{warning}</p>}
    {mode === "resume" && <form id="project-form" className="project-list-form" onSubmit={openTrip}>
      <div><label htmlFor="reference">Reference ID</label><Input unstyled id="reference" autoFocus required autoCapitalize="none" spellCheck={false} disabled={!!busy} value={reference} onChange={e => setReference(e.target.value)} placeholder="Paste your reference ID" /></div>
      <Button variant="plain" type="submit" className="cursor-pointer primary" disabled={!!busy || !reference.trim()}>{busy ? "Opening..." : "Open project"}</Button>
      <p>Anyone with this ID can view and edit the project.</p>
    </form>}
    <ProjectList trips={recent} ready={ready} onForget={forget} layout="cards" />
  </section>;
}
