"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { requestTrip, type Trip } from "@/lib/trips";

export function ProjectName({ trip, onSave }: { trip: Trip; onSave: (trip: Trip) => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="cursor-pointer project-name" aria-label={`Rename project: ${trip.name}`} title="Rename project"><span>{trip.name}</span></DialogTrigger>
    {open && <DialogContent className="project-dialog">
      <DialogTitle>Rename project</DialogTitle>
      <NameForm trip={trip} onSave={onSave} onClose={() => setOpen(false)} />
    </DialogContent>}
  </Dialog>;
}

function NameForm({ trip, onSave, onClose }: { trip: Trip; onSave: (trip: Trip) => void; onClose: () => void }) {
  const [name, setName] = useState(trip.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const valid = !!name.trim() && name.trim().length <= 100;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || lock.current) return;
    if (name.trim() === trip.name) { onClose(); return; }
    lock.current = true; setSaving(true); setError("");
    try {
      const saved = await requestTrip("PATCH", trip.reference, { name: name.trim() });
      onSave(saved); onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not rename the project. Please try again.");
    } finally { lock.current = false; setSaving(false); }
  }
  return <form onSubmit={save} className="project-name-form">
    <label htmlFor="project-name">Project name</label>
    <Input id="project-name" value={name} onChange={event => setName(event.target.value)} onFocus={event => event.target.select()} required maxLength={100} disabled={saving} aria-invalid={!!error} aria-describedby={error ? "project-name-error" : undefined} />
    {error && <p id="project-name-error" className="project-error" role="alert">{error}</p>}
    <div className="project-dialog-actions"><Button type="button" variant="ghost" className="cursor-pointer" onClick={onClose}>Cancel</Button><Button type="submit" className="cursor-pointer project-save" disabled={!valid || saving}>{saving ? "Saving..." : "Save"}</Button></div>
  </form>;
}
