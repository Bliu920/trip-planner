"use client";

import { Check, Circle, LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";

export type ActivityStep = { title: string; detail: string; status: "complete" | "running" | "pending" | "error" };

// Adapted from shadcn AI Elements Tool, Task, and Plan patterns.
export function Activity({ steps }: { steps: ActivityStep[] }) {
  return <Trace aria-label="Agent activity">{steps.map(step => <TraceCollapsible key={step.title}><TraceCollapsibleTrigger><TraceLine status={step.status === "complete" ? undefined : step.status}><TraceIcon>{step.status === "running" ? <LoaderCircle className="motion-safe:animate-spin" /> : step.status === "complete" ? <Check /> : step.status === "error" ? <AlertCircle /> : <Circle />}</TraceIcon><TraceTitle>{step.title}</TraceTitle><span className="sr-only">{step.status}</span></TraceLine></TraceCollapsibleTrigger><TraceCollapsibleContent>{step.detail}</TraceCollapsibleContent></TraceCollapsible>)}</Trace>;
}

export function Notice({ title, children, error = false, action, onAction }: { title: string; children: React.ReactNode; error?: boolean; action?: string; onAction?: () => void }) {
  return <div className={`agent-notice ${error ? "agent-notice-error" : ""}`} role={error ? "alert" : "status"}><strong>{title}</strong><div>{children}</div>{action && onAction && <Button variant="outline" size="sm" onClick={onAction}>{action}</Button>}</div>;
}

// Pending approval remains outside the activity trace.
export function Confirmation({ decision, onDecide }: { decision: "approved" | "declined" | null; onDecide: (approved: boolean) => void }) {
  return <section className="agent-result" aria-label="Review itinerary change"><h3>Replace your day 2 plan?</h3><p>Swap a busy afternoon for one visit and a longer lunch. Days 1 and 3 stay the same.</p>{decision ? <p role="status">{decision === "approved" ? "Change applied to this preview." : "Original day 2 kept."}</p> : <div className="agent-actions"><Button variant="outline" onClick={() => onDecide(false)}>Keep original</Button><Button onClick={() => onDecide(true)}>Apply change</Button></div>}</section>;
}
