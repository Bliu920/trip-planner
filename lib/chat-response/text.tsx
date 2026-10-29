"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const previewLines = 6;

export function MessageText({ text, id, collapsible = false }: { text: string; id?: string; collapsible?: boolean }) {
  const generatedId = useId();
  const textId = id ?? generatedId;
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Measure visible line capacity.
  useLayoutEffect(() => {
    const element = content.current;
    if (!element || !collapsible) return;
    const measure = () => setOverflows(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * previewLines + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, collapsible]);

  return <>
    <div ref={content} id={textId} className="workspace-message-text" style={collapsible && !expanded ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: previewLines, overflow: "hidden" } : undefined}>{text}</div>
    {collapsible && overflows && <Button type="button" variant="plain" className="cursor-pointer workspace-message-toggle" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show more"}</Button>}
  </>;
}
