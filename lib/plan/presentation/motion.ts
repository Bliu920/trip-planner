import { useEffect, useLayoutEffect, useRef } from "react";

type Position = { element: HTMLElement; top: number; left: number };
type Capture = { id: string; rect: DOMRect; height: number; x: number; y: number; scrolls: Position[] };
const timing = { duration: 340, easing: "cubic-bezier(.22,.68,.22,1)" };

/** One reversible live-card animation, including interrupted navigation. */
export function useDayMotion(dayId: string | null) {
  const stage = useRef<HTMLElement>(null);
  const pending = useRef<Capture | null>(null);
  const running = useRef<Animation[]>([]);
  const generation = useRef(0);

  // Capture the current frame.
  function capture(id: string) {
    const host = stage.current;
    if (!host) return;
    const cards = Array.from(host.querySelectorAll<HTMLElement>(".pp-dayShell"));
    const target = cards.find(card => card.dataset.dayId === id && card.getBoundingClientRect().width > 0)
      ?? cards.find(card => card.getBoundingClientRect().width > 0);
    if (!target) return;
    const scrolls: Position[] = [];
    for (let element: HTMLElement | null = host; element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) scrolls.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
    pending.current = { id, rect: target.getBoundingClientRect(), height: host.getBoundingClientRect().height, x: window.scrollX, y: window.scrollY, scrolls };
  }

  // Continue from that frame.
  useLayoutEffect(() => {
    const host = stage.current;
    const from = pending.current;
    pending.current = null;
    const token = ++generation.current;
    running.current.forEach(animation => animation.cancel());
    running.current = [];
    if (!host) return;
    host.style.minHeight = "";
    host.querySelectorAll<HTMLElement>(".pp-dayShell").forEach(card => { card.style.zIndex = ""; });
    if (!from) return;
    host.style.minHeight = `${Math.max(from.height, host.getBoundingClientRect().height)}px`;
    from.scrolls.forEach(({ element, top, left }) => { if (element.isConnected) element.scrollTo({ top, left, behavior: "instant" }); });
    window.scrollTo({ top: from.y, left: from.x, behavior: "instant" });
    const cards = Array.from(host.querySelectorAll<HTMLElement>(".pp-dayShell"));
    const card = cards.find(value => value.dataset.dayId === from.id);
    if (!card || !card.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      host.style.minHeight = "";
      host.dataset.motion = "idle";
      return;
    }
    const to = card.getBoundingClientRect();
    host.dataset.motion = dayId ? "opening" : "closing";
    card.style.zIndex = "2";
    const animation = card.animate([
      { transform: `translate(${from.rect.x - to.x}px, ${from.rect.y - to.y}px)`, width: `${from.rect.width}px` },
      { transform: "translate(0, 0)", width: `${to.width}px` },
    ], timing);
    running.current.push(animation);
    if (!dayId) cards.filter(value => value !== card && value.getBoundingClientRect().width > 0).forEach(peer => {
      running.current.push(peer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 100, fill: "backwards" }));
    });
    void animation.finished.then(() => {
      if (generation.current !== token) return;
      host.style.minHeight = "";
      host.dataset.motion = "idle";
      card.style.zIndex = "";
      running.current = [];
      host.dispatchEvent(new Event("plan-motion-end"));
    }).catch(() => {});
  }, [dayId]);

  // Settle on viewport changes.
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let width = host.clientWidth;
    const cancel = () => {
      generation.current++;
      running.current.forEach(animation => animation.cancel());
      running.current = [];
    };
    const settle = () => {
      cancel();
      host.style.minHeight = "";
      host.dataset.motion = "idle";
      host.querySelectorAll<HTMLElement>(".pp-dayShell").forEach(card => { card.style.zIndex = ""; });
      host.dispatchEvent(new Event("plan-motion-end"));
    };
    const observer = new ResizeObserver(() => {
      if (width === host.clientWidth) return;
      width = host.clientWidth;
      settle();
    });
    observer.observe(host);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onPreference = () => { if (preference.matches) settle(); };
    preference.addEventListener("change", onPreference);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", onPreference);
      cancel();
    };
  }, []);
  return { stage, capture };
}
