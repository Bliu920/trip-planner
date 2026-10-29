"use client";

import { createContext, useContext, type ReactNode } from "react";

export type DocumentTab = { id: string; name: string; dirty: boolean; saving: boolean };
export type DocumentOpenRequest = { id: string; requestId: string };
type OpenDocument = (reference: string, id: string) => void;
const DocumentNavigation = createContext<OpenDocument | null>(null);

// Share workspace navigation.
export function DocumentNavigationProvider({ open, children }: { open: OpenDocument; children: ReactNode }) {
  return <DocumentNavigation.Provider value={open}>{children}</DocumentNavigation.Provider>;
}
export function useDocumentNavigation() { return useContext(DocumentNavigation); }
