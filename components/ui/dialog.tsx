"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "cn";
import "./dialog.css";

// Adapted from shadcn/ui's Base UI Dialog.
// https://ui.shadcn.com/docs/components/base/dialog
export function Dialog(props: Omit<DialogPrimitive.Root.Props, "disablePointerDismissal">) {
  return <DialogPrimitive.Root {...props} disablePointerDismissal={false} />;
}
export function DialogTrigger({ className, ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" className={cn("cursor-pointer", className)} {...props} />;
}
export function DialogClose({ className, ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" className={cn("cursor-pointer", className)} {...props} />;
}
export function DialogContent({ className, children, showCloseButton = true, ...props }: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  // Share focus and dismissal.
  // Nested dialogs need backdrops.
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop forceRender data-slot="dialog-overlay" className="ui-dialog-overlay" />
    <DialogPrimitive.Popup data-slot="dialog-content" className={cn("ui-dialog", className)} {...props}>
      {children}
      {showCloseButton && <DialogClose className="ui-dialog-close" aria-label="Close dialog"><X size={18} aria-hidden="true" /></DialogClose>}
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>;
}
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("ui-dialog-header", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("ui-dialog-footer", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("ui-dialog-title", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("ui-dialog-description", className)} {...props} />;
}
