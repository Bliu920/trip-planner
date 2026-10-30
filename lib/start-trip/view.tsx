"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { uploadFiles, type DraftFile } from "@/lib/attachments";
import { ExploreLoader } from "@/lib/explore";
import { rememberTrip, requestTrip, type Trip } from "@/lib/trips";
import RecentProjects from "@/lib/trips/home";
import { PlaceSelection } from "@/lib/place-references";
import { StarterPrompt } from "./prompt";
import "./start.css";
import "./inline.css";

export default function StartTrip() {
  const router = useRouter();
  const created = useRef<Trip | null>(null);
  const [uploading, setUploading] = useState("");
  const submitting = useRef(false);
  const completed = useRef(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string | number | null>("explore");
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);

  // Retire completed drafts.
  useLayoutEffect(
    () => () => {
      if (!completed.current) return;
      completed.current = false;
      created.current = null;
      submitting.current = false;
      setBusy(false);
      setUploading("");
      setError("");
      setActiveTab("explore");
      setDraftVersion((version) => version + 1);
    },
    [],
  );

  // Save the starting brief.
  async function start(prompt: string, files: DraftFile[], placeIds: string[]) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const trip = created.current
        ? await requestTrip("PATCH", created.current.reference, {
            name: created.current.name,
            notes: prompt,
          })
        : await requestTrip("POST", undefined, { prompt });
      created.current = trip;
      rememberTrip(trip);
      const attachments = await uploadFiles(trip.reference, files, "starter", setUploading);
      // Continue in the workspace.
      completed.current = true;
      router.push(
        `/trips/${trip.reference}?start=1${attachments.length ? `&files=${attachments.map((file) => file.id).join(",")}` : ""}${placeIds.length ? `&places=${encodeURIComponent(placeIds.join(","))}` : ""}`,
      );
    } catch (error) {
      completed.current = false;
      setError(
        error instanceof Error ? error.message : "Could not start your trip. Please try again.",
      );
      submitting.current = false;
      setBusy(false);
      setUploading("");
    }
  }

  // Compose the start page.
  return (
    <PlaceSelection key={draftVersion} disabled={busy}>
      <main className="start-trip" data-starting={busy || undefined}>
        <header className="start-trip-header">
          <Link href="/projects" className="start-trip-brand">
            Trip planner
          </Link>
          <nav className="start-trip-page-nav" aria-label="Site navigation">
            <Link href="/about">About</Link>
            <Link href="/credits">Credits</Link>
          </nav>
        </header>
        <section className="start-trip-content" aria-labelledby="start-trip-title">
          <div className="start-trip-intro">
            <h1 id="start-trip-title">Plan your Italy trip</h1>
          </div>
          <StarterPrompt busy={busy} error={error} onStart={start} />
          {uploading && (
            <p className="attachment-progress" role="status">
              Uploading {uploading}...
            </p>
          )}
        </section>
        <Tabs.Root
          className="start-trip-tabs"
          inert={busy}
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <div className="start-trip-navigation">
            <Tabs.List className="start-trip-tab-list" aria-label="Browse">
              <Tabs.Tab value="explore" className="cursor-pointer start-trip-tab">
                Explore
              </Tabs.Tab>
              <Tabs.Tab value="projects" className="cursor-pointer start-trip-tab">
                Projects
              </Tabs.Tab>
            </Tabs.List>
            <div className="start-trip-actions" ref={setActionTarget} aria-label="View actions" />
          </div>
          <Tabs.Panel value="explore" keepMounted className="start-trip-panel">
            <ExploreLoader actionTarget={activeTab === "explore" ? actionTarget : null} />
          </Tabs.Panel>
          <Tabs.Panel
            value="projects"
            keepMounted
            className="start-trip-panel start-trip-project-panel"
          >
            <RecentProjects actionTarget={activeTab === "projects" ? actionTarget : null} />
          </Tabs.Panel>
        </Tabs.Root>
      </main>
    </PlaceSelection>
  );
}
