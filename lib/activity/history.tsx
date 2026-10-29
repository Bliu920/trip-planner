"use client";

import { useState } from "react";
import { Check, ChevronRight, Circle, CircleAlert, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentDetail } from "@/lib/documents";
import type { ActivityEntry } from "./model";
import "./activity.css";

const labels = { running: "In progress", complete: "Completed", prepared: "Prepared", failed: "Could not finish", unconfirmed: "Not confirmed", interrupted: "Interrupted" };

export function ActivityHistory({ entries, reference, active }: { entries: ActivityEntry[]; reference: string; active: boolean }) {
  const [document, setDocument] = useState<string | null>(null);
  if (!entries.length) return null;
  return <div className="activity-history" aria-label="Planning activity">
    <ol>{entries.map((entry, index) => {
      const status = entry.status === "running" && !active ? "interrupted" : entry.status;
      const Icon = status === "running" ? Circle : status === "complete" ? Check : status === "prepared" ? FileText : CircleAlert;
      return <li key={entry.id}>
        {index > 0 && entries[index - 1].attempt !== entry.attempt && <p className="activity-attempt">Another attempt</p>}
        <details className="activity-step">
          <summary className="cursor-pointer"><Icon size={14} aria-hidden="true" /><span>{entry.title}</span><small>{labels[status]}</small><ChevronRight size={12} className="activity-chevron" aria-hidden="true" /></summary>
          <div className="activity-detail">
            {entry.detail && <p>{entry.detail}</p>}
            {!!entry.sources.length && <ul aria-label="Sources">{entry.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title || new URL(source.url).hostname}</a></li>)}</ul>}
          </div>
        </details>
        {!!entry.documents.length && <div className="activity-files">{entry.documents.map(file => <Button key={file.id} variant="ghost" size="sm" className="cursor-pointer" onClick={() => setDocument(file.id)}><FileText size={14} />{file.name}<span className="sr-only">, open saved file</span></Button>)}</div>}
      </li>;
    })}</ol>
    {document && <DocumentDetail reference={reference} id={document} onClose={() => setDocument(null)} />}
  </div>;
}
