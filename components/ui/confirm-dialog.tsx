"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

type Request = { title: string; description: string; confirmLabel: string };

/** A local, nestable replacement for window.confirm. Dismissal means cancel. */
export function useConfirmDialog() {
  const [request, setRequest] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);

  const confirm = useCallback((title: string, description: string, confirmLabel = "Discard changes") => {
    resolve.current?.(false);
    setRequest({ title, description, confirmLabel });
    setOpen(true);
    return new Promise<boolean>(done => { resolve.current = done; });
  }, []);
  function settle(confirmed: boolean) {
    const done = resolve.current;
    resolve.current = null;
    setOpen(false);
    done?.(confirmed);
  }

  // Compose the shared confirmation.
  const confirmation = <Dialog open={open} onOpenChange={open => { if (!open) settle(false); }}>
    <DialogContent initialFocus={cancelButton}>
      <DialogHeader><DialogTitle>{request?.title}</DialogTitle><DialogDescription>{request?.description}</DialogDescription></DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button ref={cancelButton} variant="outline" className="cursor-pointer" />}>Cancel</DialogClose>
        <Button className="cursor-pointer" variant="destructive" onClick={() => settle(true)}>{request?.confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
  return { confirm, confirmation };
}
