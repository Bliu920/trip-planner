"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function CopyId({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const [copying, setCopying] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    if (copying) return;
    setCopying(true);
    try { await navigator.clipboard.writeText(reference); setCopied(true); }
    catch { setCopied(false); setManual(true); }
    finally { setCopying(false); }
  }
  return <>
    <Button ref={trigger} type="button" variant="ghost" className="cursor-pointer project-copy" disabled={copying} onClick={copy} aria-label={copied ? "Project ID copied" : "Copy project ID"} title="Copy project ID">
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span aria-live="polite">{copied ? "Copied" : "Copy ID"}</span>
    </Button>
    <Dialog open={manual} onOpenChange={setManual}>
      <DialogContent className="project-dialog" finalFocus={trigger}>
        <DialogTitle>Project ID</DialogTitle>
        <DialogDescription>Automatic copying is unavailable. Copy the selected ID.</DialogDescription>
        <Input aria-label="Project ID" value={reference} readOnly onFocus={event => event.target.select()} className="project-id" />
      </DialogContent>
    </Dialog>
  </>;
}
