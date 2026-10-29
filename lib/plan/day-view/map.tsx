import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LocateFixed, Minus, Plus } from "lucide-react";
import type { Map as LeafletMap, Marker, LatLngBounds } from "leaflet";
import type { CheckedLeg } from "@/lib/journeys";
import type { Day, Stop } from "../presentation/model";

const location = (stop: Stop) => stop.omitted ? null : stop.coordinates;
const directions = (stop: Stop) => stop.coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${stop.coordinates.join(",")}&travelmode=walking` : null;
import "leaflet/dist/leaflet.css";

type MapState = "loading" | "ready" | "unavailable";

/** Browser-only map lifecycle, separate from itinerary rendering. */
export function DayMap({ day, selected, selectionRequest, onSelect, routes }: { routes?: CheckedLeg[]; day: Day; selected: string | null; selectionRequest: number; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const bounds = useRef<LatLngBounds | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const callback = useRef(onSelect);
  const [status, setStatus] = useState<MapState>("loading");
  const [attempt, setAttempt] = useState(0);
  // Stable geometry avoids resetting on unrelated host renders.
  const routeGeometry = JSON.stringify((routes ?? []).filter(route => route.geometry?.length).map(route => ({ geometry: route.geometry, status: route.status })));
  const mapped = new Map<string, [number, number]>();
  for (const route of routes ?? []) {
    if (route.fromCoordinates && !mapped.has(route.fromItemId)) mapped.set(route.fromItemId, [route.fromCoordinates[1], route.fromCoordinates[0]]);
    if (route.toCoordinates) mapped.set(route.toItemId, [route.toCoordinates[1], route.toCoordinates[0]]);
  }
  const mappedLocation = (stop: Stop) => stop.omitted ? null : mapped.get(stop.id) ?? location(stop);
  const mapStops = [...day.stops, ...(day.stays ?? [])].map(stop => ({ ...stop, coordinates: mappedLocation(stop) }));
  const geometry = JSON.stringify(mapStops.map((stop, index) => ({ id: stop.id, title: stop.title, coordinates: location(stop), number: index < day.stops.length ? index + 1 : "H" })));
  const hasLocations = mapStops.some(stop => location(stop)) || !!routes?.some(route => route.geometry?.length);
  const picked = mapStops.find(stop => stop.id === selected && location(stop));
  const url = picked ? directions(picked) : null;
  useEffect(() => { callback.current = onSelect; }, [onSelect]);

  // Initialize geographic context.
  useEffect(() => {
    if (!hasLocations) return;
    const currentMarkers = markers.current;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loadedTiles = false;
    import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      setStatus("loading");
      const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
      map.current = instance;
      instance.attributionControl.setPrefix(false);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, referrerPolicy: "origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      });
      tiles.on("tileload", () => { if (!cancelled) { loadedTiles = true; setStatus("ready"); } });
      tiles.on("tileerror", () => { if (!cancelled && !loadedTiles) setStatus("unavailable"); });
      tiles.addTo(instance);
      const points: [number, number][] = [];
      const stops: { id: string; title: string; coordinates: [number, number] | null; number: number | string }[] = JSON.parse(geometry);
      stops.forEach(stop => {
        const coordinate = stop.coordinates;
        if (!coordinate) return;
        points.push(coordinate);
        const marker = L.marker(coordinate, {
          icon: L.divIcon({ className: "dp-geo-pin", html: `<span>${stop.number}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: stop.title, alt: stop.title, keyboard: true,
        }).addTo(instance);
        const label = document.createElement("span");
        label.textContent = stop.title;
        marker.bindTooltip(label, { direction: "top", offset: [0, -16], className: "dp-geo-label" });
        marker.on("click", () => callback.current(stop.id));
        currentMarkers.set(stop.id, marker);
      });
      const paths: { geometry: [number, number][]; status: string }[] = JSON.parse(routeGeometry);
      for (const path of paths) {
        const latLngs: [number, number][] = path.geometry.map(([longitude, latitude]) => [latitude, longitude]);
        L.polyline(latLngs, { color: path.status === "conflict" ? "#9b5c31" : "#175b43", weight: 3, opacity: 0.75, attribution: 'Routes: <a href="https://openrouteservice.org" target="_blank" rel="noreferrer">openrouteservice</a>', dashArray: path.status === "checked" ? undefined : "5 7" }).addTo(instance);
        points.push(...latLngs);
      }
      bounds.current = L.latLngBounds(points);
      if (points.length) instance.fitBounds(bounds.current, { padding: [32, 32], maxZoom: 15, animate: false });

      currentMarkers.forEach(marker => marker.getElement()?.setAttribute("aria-label", `Show ${marker.options.title} in the schedule`));
      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
      observer.observe(container.current);
      timer = setTimeout(() => { if (!cancelled && !loadedTiles) setStatus("unavailable"); }, 12000);
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      clearTimeout(timer);
      map.current?.remove();
      map.current = null;
      currentMarkers.clear();
    };
  }, [geometry, routeGeometry, hasLocations, attempt]);

  // Link map selection.
  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("dp-geo-selected", selected === id);
      marker.getElement()?.setAttribute("aria-pressed", String(selected === id));
      marker.setZIndexOffset(selected === id ? 1000 : 0);
      if (selected === id) {
        marker.openTooltip();
        map.current?.setView(marker.getLatLng(), Math.max(map.current.getZoom(), 15), { animate: false });
      } else marker.closeTooltip();
    });
  }, [selected, selectionRequest, status]);

  function fitDay() {
    if (bounds.current?.isValid()) map.current?.fitBounds(bounds.current, { padding: [32, 32], maxZoom: 15, animate: false });
  }

  if (!hasLocations) return <section className="dp-route dp-map-empty" aria-label="Day map"><h2>Your places</h2><p>Locations are not set for this day yet.</p></section>;
  return <section className="dp-route" aria-label="Day map">
    <h2 className="sr-only">Day map</h2>
    <div className="dp-map-frame">
      <div ref={container} className="dp-live-map" aria-label="Interactive map of this day's places" />
      <button type="button" className="dp-fit cursor-pointer" onClick={fitDay} disabled={status === "loading"} aria-label="Show all day locations" title="Show all day locations"><LocateFixed size={16} /></button>
      <div className="dp-map-zoom"><button type="button" className="cursor-pointer" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={16} /></button><button type="button" className="cursor-pointer" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={16} /></button></div>
      {status !== "ready" && <div className="dp-map-message" role="status">{status === "loading" ? "Loading map…" : <>Map could not load.<button type="button" className="cursor-pointer" onClick={() => setAttempt(value => value + 1)}>Retry map</button></>}</div>}
    </div>
    <div className="dp-route-caption" aria-hidden={!picked}>{picked && <><strong title={picked.title}>{picked.title}</strong>{url && <a href={url} target="_blank" rel="noreferrer">Directions <ArrowUpRight size={12} /></a>}</>}</div>
  </section>;
}
