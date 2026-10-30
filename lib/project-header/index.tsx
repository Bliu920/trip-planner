"use client";

import Link from "next/link";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Trip } from "@/lib/trips";
import { ProjectName } from "./name";
import { CopyId } from "./copy";
import "./header.css";

export function ProjectHeader({
  trip,
  onSave,
  contentVisible,
  onToggleContent,
}: {
  trip: Trip | null;
  onSave: (trip: Trip) => void;
  contentVisible: boolean;
  onToggleContent: () => void;
}) {
  const ContentIcon = contentVisible ? PanelLeftClose : PanelLeftOpen;
  // Compose project controls.
  return (
    <header className="project-header">
      <Link href="/projects" className="project-back" aria-label="Back to projects">
        <ArrowLeft size={17} />
        <span>Projects</span>
      </Link>
      <span className="project-divider" aria-hidden="true">
        /
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="cursor-pointer project-content-toggle"
        disabled={!trip}
        aria-label={contentVisible ? "Close trip content" : "Open trip content"}
        title={contentVisible ? "Close trip content" : "Open trip content"}
        aria-expanded={contentVisible}
        aria-controls="trip-content"
        onClick={onToggleContent}
      >
        <ContentIcon className="size-[18px]" strokeWidth={2} aria-hidden="true" />
      </Button>
      <h1>{trip ? <ProjectName trip={trip} onSave={onSave} /> : "Trip workspace"}</h1>
      {trip && <CopyId reference={trip.reference} />}
    </header>
  );
}
