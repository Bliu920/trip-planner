"use client";

import { useConfirmDialog } from "@/components/ui/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { rememberTrip, requestTrip, REFERENCE_PATTERN, normalizeReference, type Trip } from ".";

export default function TripEditor({ reference }: { reference: string }) {
  const router = useRouter();
  const { confirm, confirmation } = useConfirmDialog();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dirty = !!trip && (trip.name !== name || trip.notes !== notes);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      const id = normalizeReference(reference);
      if (!REFERENCE_PATTERN.test(id)) { setError("This trip reference is invalid. Return to your trips and enter the full ID."); return; }
      try {
        const loaded = await requestTrip("GET", id, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setTrip(loaded); setName(loaded.name); setNotes(loaded.notes);
        setStorageWarning(!rememberTrip(loaded));
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load this trip."); }
    }
    void load();
    return () => controller.abort();
  }, [reference, attempt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!trip) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await requestTrip("PATCH", trip.reference, { name, notes });
      setTrip(saved); setName(saved.name); setNotes(saved.notes);
      setStorageWarning(!rememberTrip(saved)); setNotice("Changes saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save changes."); }
    finally { setSaving(false); }
  }

  async function copy(link: boolean) {
    if (!trip) return;
    try {
      await navigator.clipboard.writeText(link ? `${window.location.origin}/trips/${trip.reference}` : trip.reference);
      setNotice(link ? "Resume link copied." : "Reference ID copied.");
    } catch { setNotice("Could not copy automatically. Select and copy the reference ID below."); }
  }

  return <main className="shell">
    {confirmation}
    <header className="masthead"><Link className="brand" href="/projects" onClick={async e => { if (!dirty) return; e.preventDefault(); if (await confirm("Leave without saving?", "Your unsaved trip changes will be discarded.", "Discard and leave")) router.push("/projects"); }}>Back to projects</Link></header>
    {error && <div className="message error" role="alert">{error}{!trip && <Button variant="plain" className="cursor-pointer text-button" onClick={() => setAttempt(a => a + 1)}>Try again</Button>}</div>}
    {!trip ? !error && <p className="empty" role="status">Opening your trip...</p> : <>
      <section className="intro compact"><h1>{trip.name}</h1></section>
      <div className="home-grid">
        <form className="editor" onSubmit={save}><h2>Trip details</h2><label htmlFor="edit-name">Trip name</label><Input unstyled id="edit-name" required maxLength={100} value={name} disabled={saving} onChange={e => { setName(e.target.value); setNotice(""); }} /><label htmlFor="notes">Notes for your trip</label><Textarea unstyled id="notes" maxLength={5000} rows={9} value={notes} disabled={saving} onChange={e => { setNotes(e.target.value); setNotice(""); }} placeholder="Cities you love, places to explore, and anything you want to remember." /><div className="save-row"><Button variant="plain" type="submit" className="cursor-pointer primary" disabled={saving || !dirty || !name.trim()}>{saving ? "Saving..." : "Save changes"}</Button><span className="muted">{dirty ? "Unsaved changes" : "Saved online"}</span></div></form>
        <aside className="actions-panel"><h2>Resume this trip</h2><p className="muted">Save this link to return from any device, or share it with a travel companion.</p><Button variant="plain" className="cursor-pointer primary" onClick={() => copy(true)}>Copy resume link</Button><label htmlFor="saved-reference">Trip reference ID</label><Input unstyled id="saved-reference" className="reference-input" readOnly value={trip.reference} onFocus={e => e.target.select()} /><Button variant="plain" className="cursor-pointer secondary" onClick={() => copy(false)}>Copy reference ID</Button><p className="access-note">Anyone with this reference can view and edit the trip. There is no account or email recovery.</p>{storageWarning && <p className="message" role="status">Your trip is saved online, but this browser cannot remember it. Copy your resume link before leaving.</p>}</aside>
      </div>
    </>}
    <p className="message status" role="status" aria-live="polite">{notice}</p>

  </main>;
}
