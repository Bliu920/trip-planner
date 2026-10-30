"use client";

import { useState } from "react";
import { Check, ChevronRight, Circle, CircleAlert, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentDetail, useDocumentNavigation } from "@/lib/documents";
import { groupActivity, type ActivityEntry } from "./model";
import "./activity.css";

const labels = {
  running: "In progress",
  complete: "Completed",
  prepared: "Prepared",
  failed: "Could not finish",
  unconfirmed: "Not confirmed",
  interrupted: "Interrupted",
};

export function ActivityHistory({
  entries,
  reference,
  active,
}: {
  entries: ActivityEntry[];
  reference: string;
  active: boolean;
}) {
  const navigate = useDocumentNavigation();
  const [document, setDocument] = useState<string | null>(null);
  if (!entries.length) return null;
  const groups = groupActivity(entries);
  return (
    <div className="activity-history" aria-label="Planning activity">
      <ol>
        {groups.map((entry, index) => {
          const status = entry.status === "running" && !active ? "interrupted" : entry.status;
          const Icon =
            status === "running"
              ? Circle
              : status === "complete"
                ? Check
                : status === "prepared"
                  ? FileText
                  : CircleAlert;
          const documents = [
            ...new Map(
              entry.entries.flatMap((call) => call.documents).map((file) => [file.id, file]),
            ).values(),
          ];
          return (
            <li key={entry.id}>
              {index > 0 && groups[index - 1].attempt !== entry.attempt && (
                <p className="activity-attempt">Another attempt</p>
              )}
              <details className="activity-step">
                <summary className="cursor-pointer">
                  <Icon size={14} aria-hidden="true" />
                  <span>{entry.title}</span>
                  <small>{labels[status]}</small>
                  <ChevronRight size={12} className="activity-chevron" aria-hidden="true" />
                </summary>
                <div className="activity-detail">
                  {entry.entries.map((call) => (
                    <div className="activity-call" key={call.id}>
                      {entry.count > 1 && (
                        <small>
                          {
                            labels[
                              call.status === "running" && !active ? "interrupted" : call.status
                            ]
                          }
                        </small>
                      )}
                      {call.detail && <p>{call.detail}</p>}
                      {!!call.sources.length && (
                        <ul aria-label="Sources">
                          {call.sources.map((source) => (
                            <li key={source.url}>
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                              >
                                {source.title || new URL(source.url).hostname}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </details>
              {!!documents.length && (
                <div className="activity-files">
                  {documents.map((file) => (
                    <Button
                      key={file.id}
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() =>
                        navigate ? navigate(reference, file.id) : setDocument(file.id)
                      }
                    >
                      <FileText size={14} />
                      {file.name}
                      <span className="sr-only">, open saved file</span>
                    </Button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {document && (
        <DocumentDetail reference={reference} id={document} onClose={() => setDocument(null)} />
      )}
    </div>
  );
}
