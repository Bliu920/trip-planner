"use client";

import { useState } from "react";
import { MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trace, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent, TraceLine, TraceIcon, TraceTitle } from "@/components/ui/trace";

export type ItineraryDay = { title: string; stops: { period: string; name: string; note: string }[] };
export type AgentSource = { name: string; detail: string };

export function Itinerary({ days, onRevise, initialDay = 0 }: { days: ItineraryDay[]; onRevise: () => void; initialDay?: number }) {
  const [selected, setSelected] = useState(initialDay);
  const day = days[selected] ?? days[0];
  if (!day) return null;
  return <section className="agent-result" aria-label="Three-day itinerary"><div className="agent-result-heading"><h3>Your three days in Italy</h3><Badge variant="outline">Sample layout</Badge></div><div className="agent-day-tabs" role="group" aria-label="Choose itinerary day">{days.map((item, index) => <Button key={item.title} variant={selected === index ? "secondary" : "ghost"} aria-pressed={selected === index} onClick={() => setSelected(index)}>Day {index + 1}</Button>)}</div><h4>{day.title}</h4><ul className="agent-stops">{day.stops.map(stop => <li key={stop.period}><span>{stop.period}</span><div><strong><MapPin size={14} />{stop.name}</strong><p>{stop.note}</p></div></li>)}</ul><p className="agent-fineprint">Catalog placeholders only. Places, travel times, prices, and hours are not verified.</p><Button variant="outline" size="sm" onClick={onRevise}>Make day 2 slower</Button></section>;
}

// Adapted from the shadcn AI Elements Sources pattern.
export function Sources({ sources }: { sources: AgentSource[] }) {
  return <Trace><TraceCollapsible><TraceCollapsibleTrigger><TraceLine><TraceIcon><FileText /></TraceIcon><TraceTitle>Sources and confidence ({sources.length})</TraceTitle></TraceLine></TraceCollapsibleTrigger><TraceCollapsibleContent><ul className="agent-sources">{sources.map(source => <li key={source.name}><strong>{source.name}</strong><p>{source.detail}</p></li>)}</ul></TraceCollapsibleContent></TraceCollapsible></Trace>;
}
