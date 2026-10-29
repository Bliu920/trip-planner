"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeReference, REFERENCE_PATTERN, rememberTrip, requestTrip, type Trip } from "@/lib/trips";
import { TripChat } from "./chat";
import type { DocumentSelection } from "@/lib/attachments";
import { Plan } from "./plan";
import { BudgetProvider, BudgetPanel } from "@/lib/budget/ui";
import { DocumentDetail } from "@/lib/documents";
import { Details } from "./details";
import { ProjectHeader } from "@/lib/project-header";
import { contentLayout, initialLayout } from "./layout";
import "./workspace.css";

const DocumentLibrary = dynamic(() => import("@/lib/documents").then(module => module.DocumentLibrary), { loading: () => <p className="workspace-loading" role="status">Opening library...</p> });
const mobileQuery = "(max-width: 760px)";
function subscribeViewport(change: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const mobileViewport = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;

type WorkspaceProps = { reference: string; startConversation?: boolean; starterFileIds?: string; starterPlaceIds?: string };
export default function Workspace(props: WorkspaceProps) {
  // Reset state across projects.
  return <WorkspaceSession key={normalizeReference(props.reference)} {...props} />;
}

function WorkspaceSession({ reference, startConversation = false, starterFileIds = "", starterPlaceIds = "" }: { reference: string; startConversation?: boolean; starterFileIds?: string; starterPlaceIds?: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const [layout, dispatch] = useReducer(contentLayout, initialLayout);
  const { view, detailsOpened } = layout;
  const planAvailability = useCallback((exists: boolean | null, error: string) => dispatch({ type: "availability", artifact: "plan", exists, error }), []);
  const budgetAvailability = useCallback((exists: boolean | null, error: string) => dispatch({ type: "availability", artifact: "budget", exists, error }), []);
  const [budgetDocument, setBudgetDocument] = useState<string | null>(null);
  const panels = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState<"chat" | "content">("chat");
  const isMobile = useSyncExternalStore(subscribeViewport, mobileViewport, serverViewport);
  const contentVisible = layout.contentOpen && (!isMobile || mobile === "content");
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ conversationId: string; messageId: string; requestId: string } | null>(null);
  // Scope the full-height canvas.
  useEffect(() => {
    document.documentElement.dataset.tripWorkspace = "true";
    return () => { delete document.documentElement.dataset.tripWorkspace; };
  }, []);

  // Load the project.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      const id = normalizeReference(reference);
      if (!REFERENCE_PATTERN.test(id)) { setError("This trip reference is invalid. Return to projects and enter the full ID."); return; }
      try {
        const loaded = await requestTrip("GET", id, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setTrip(loaded);
        setStorageWarning(!rememberTrip(loaded));
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not open this trip.");
      }
    }
    void load();
    return () => controller.abort();
  }, [reference, attempt]);

  function updateTrip(saved: Trip) {
    setTrip(saved);
    setStorageWarning(!rememberTrip(saved));
  }

  function openChat() {
    setMobile("chat");
    requestAnimationFrame(() => panels.current?.querySelector<HTMLTextAreaElement>(".workspace-input textarea")?.focus());
  }

  function toggleContent() {
    if (contentVisible) { dispatch({ type: "close" }); setMobile("chat"); }
    else { dispatch({ type: "open" }); setMobile("content"); }
  }

  // Compose workspace panels.
  return <main className="workspace agent-ui" data-mobile-panel={mobile} data-content-open={layout.contentOpen}>
    <ProjectHeader trip={trip} onSave={updateTrip} contentVisible={contentVisible} onToggleContent={toggleContent} />
    <span className="sr-only" role="status">{layout.planOpened ? "Your plan is ready." : ""}</span>
    {storageWarning && <p className="workspace-notice" role="status">This browser cannot remember the trip. Copy its ID before leaving.</p>}
    {!trip ? <div className="workspace-loading">{error ? <><p role="alert">{error}</p><Button variant="outline" className="cursor-pointer" onClick={() => setAttempt(value => value + 1)}>Try again</Button></> : <p role="status">Opening your trip...</p>}</div> : <BudgetProvider reference={trip.reference}>
      <div className="workspace-panels" ref={panels}>
        <section id="trip-content" className="workspace-content" aria-label="Trip content" hidden={!layout.contentOpen}>
          <nav className="workspace-content-nav" aria-label="Trip views">
            {(layout.plan.exists || layout.plan.error) && <Button variant="plain" className="cursor-pointer" aria-pressed={view === "plan"} onClick={() => dispatch({ type: "select", view: "plan" })}>Plan{layout.plan.error && <CircleAlert size={14} aria-label="Needs attention" />}</Button>}
            {(layout.budget.exists || layout.budget.error) && <Button variant="plain" className="cursor-pointer" aria-pressed={view === "budget"} onClick={() => dispatch({ type: "select", view: "budget" })}>Budget{layout.budget.error && <CircleAlert size={14} aria-label="Needs attention" />}</Button>}
            <Button variant="plain" className="cursor-pointer" aria-pressed={view === "documents"} onClick={() => dispatch({ type: "select", view: "documents" })}>Library</Button>
            <Button variant="plain" className="cursor-pointer workspace-details-button" aria-label="Trip details" title="Trip details" aria-pressed={view === "details"} onClick={() => dispatch({ type: "select", view: "details" })}><Settings2 size={17} /></Button>
          </nav>
          <div className="workspace-view" hidden={view !== "plan"}><Plan onOpenBudget={() => dispatch({ type: "select", view: "budget" })} budgetAvailable={!!layout.budget.exists} reference={trip.reference} onOpenChat={openChat} onAvailabilityChange={planAvailability} /></div>
          <div className="workspace-view" hidden={view !== "budget"}><BudgetPanel onOpenChat={openChat} onOpenDocument={setBudgetDocument} onAvailabilityChange={budgetAvailability} /></div>
          {budgetDocument && <DocumentDetail reference={trip.reference} id={budgetDocument} onClose={() => setBudgetDocument(null)} />}
          {detailsOpened && <div className="workspace-view" hidden={view !== "details"}><Details trip={trip} /></div>}
          <div className="workspace-view" hidden={view !== "documents"}><DocumentLibrary reference={trip.reference}
            onUse={document => { setSelection({ document, requestId: crypto.randomUUID() }); setMobile("chat"); }}
            onOpenMessage={(conversationId, messageId) => { setMessageTarget({ conversationId, messageId, requestId: crypto.randomUUID() }); setMobile("chat"); }}
          /></div>
        </section>
        <TripChat reference={trip.reference} initialPrompt={startConversation ? trip.notes : undefined} starterFileIds={starterFileIds} starterPlaceIds={starterPlaceIds} selection={selection} onSelectionHandled={() => setSelection(null)} messageTarget={messageTarget} />
      </div>
    </BudgetProvider>}
  </main>;
}
