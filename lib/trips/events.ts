// Shared project invalidation; legacy channel names keep open tabs compatible.
const CHANGE_EVENT = "trip-documents-changed";
const CHANNEL = "trip-documents";

export function notifyTripChanged(reference: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: reference }));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(reference);
      channel.close();
    }
  } catch { /* Cross-tab refresh is optional in restricted browsers. */ }
}

export function subscribeTripChanges(reference: string, changed: () => void) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const local = (event: Event) => { if ((event as CustomEvent<string>).detail === reference) changed(); };
  const visible = () => { if (document.visibilityState === "visible") changed(); };
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(CHANNEL);
    if (channel) channel.onmessage = event => { if (event.data === reference) changed(); };
  } catch { /* Same-tab and focus refresh still work. */ }
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener("focus", changed);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener("focus", changed);
    document.removeEventListener("visibilitychange", visible);
    channel?.close();
  };
}
