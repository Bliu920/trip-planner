import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LocateFixed, Minus, Plus } from "lucide-react";
import type { Map as LeafletMap, Marker, LatLngBounds } from "leaflet";
import type { CheckedLeg } from "@/lib/journeys";
import { visibleMapLabels, type MapPlace } from "./locations";
import "leaflet/dist/leaflet.css";

type MapState = "loading" | "ready" | "unavailable";

/** Browser-only map lifecycle, separate from itinerary rendering. */
export function DayMap({
  places,
  selected,
  selectionRequest,
  onSelect,
  routes,
}: {
  places: MapPlace[];
  routes?: CheckedLeg[];
  selected: string | null;
  selectionRequest: number;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const bounds = useRef<LatLngBounds | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const callback = useRef(onSelect);
  const selection = useRef(selected);
  const syncSelection = useRef<() => void>(() => {});
  const [status, setStatus] = useState<MapState>("loading");
  const [attempt, setAttempt] = useState(0);
  // Stable geometry preserves the viewport.
  const geometry = JSON.stringify(places);
  const routeGeometry = JSON.stringify(
    (routes ?? [])
      .filter(
        (route) =>
          route.geometry &&
          route.geometry.length > 1 &&
          route.geometry.every(
            ([longitude, latitude]) =>
              Number.isFinite(longitude) &&
              Number.isFinite(latitude) &&
              Math.abs(longitude) <= 180 &&
              Math.abs(latitude) <= 90,
          ),
      )
      .map((route) => ({ geometry: route.geometry, status: route.status })),
  );
  const hasLocations = places.length > 0;
  const picked = places.find((place) => place.id === selected);
  const directions = picked
    ? `https://www.google.com/maps/dir/?api=1&destination=${picked.coordinates.join(",")}&travelmode=walking`
    : null;
  useEffect(() => {
    callback.current = onSelect;
  }, [onSelect]);

  // Initialize geographic context.
  useEffect(() => {
    if (!hasLocations) return;
    const currentMarkers = markers.current;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loadedTiles = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        setStatus("loading");
        const instance = L.map(container.current, {
          zoomControl: false,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        map.current = instance;
        instance.attributionControl.setPrefix(false);
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          referrerPolicy: "origin",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        });
        tiles.on("tileload", () => {
          if (!cancelled) {
            loadedTiles = true;
            setStatus("ready");
          }
        });
        tiles.on("tileerror", () => {
          if (!cancelled && !loadedTiles) setStatus("unavailable");
        });
        tiles.addTo(instance);
        const points: [number, number][] = [];
        let hovered: string | null = null;
        const updateLabels = () => {
          const frame = container.current?.getBoundingClientRect();
          if (!frame) return;
          container.current?.style.setProperty(
            "--dp-map-label-width",
            `${Math.max(0, Math.min(220, frame.width - 24))}px`,
          );
          const labels: { id: string; box: DOMRect }[] = [],
            pins: DOMRect[] = [];
          currentMarkers.forEach((marker, id) => {
            const tooltip = marker.getTooltip();
            const label = tooltip?.getElement();
            const pin = marker.getElement();
            if (pin) pins.push(pin.getBoundingClientRect());
            if (!label) return;
            label.classList.toggle(
              "dp-geo-label-selected",
              id === selection.current || id === hovered,
            );
            if (tooltip) {
              tooltip.options.direction = "top";
              tooltip.options.offset = L.point(0, -16);
            }
            tooltip?.update();
            let box = label.getBoundingClientRect();
            const point = pin?.getBoundingClientRect();
            const onMap =
              point &&
              point.left + point.width / 2 >= frame.left &&
              point.right - point.width / 2 <= frame.right &&
              point.top + point.height / 2 >= frame.top &&
              point.bottom - point.height / 2 <= frame.bottom;
            if (tooltip && onMap && box.top < frame.top + 4) {
              tooltip.options.direction = "bottom";
              tooltip.options.offset = L.point(0, 16);
              tooltip.update();
              box = label.getBoundingClientRect();
            }
            const shift = !onMap
              ? 0
              : box.left < frame.left + 4
                ? frame.left + 4 - box.left
                : box.right > frame.right - 4
                  ? frame.right - 4 - box.right
                  : 0;
            label.style.setProperty("--dp-map-label-shift", `${shift}px`);
            if (tooltip && shift) {
              tooltip.options.offset = L.point(
                shift,
                tooltip.options.direction === "bottom" ? 16 : -16,
              );
              tooltip.update();
            }
            labels.push({ id, box: label.getBoundingClientRect() });
          });
          const priority =
            selection.current && currentMarkers.has(selection.current)
              ? selection.current
              : hovered;
          const shown = visibleMapLabels(labels, pins, frame, priority);
          currentMarkers.forEach((marker, id) => {
            const label = marker.getTooltip()?.getElement();
            label?.classList.toggle("dp-geo-label-hidden", !shown.has(id));
            label?.setAttribute("aria-hidden", "true");
          });
        };
        const stops: MapPlace[] = JSON.parse(geometry);
        stops.forEach((stop) => {
          points.push(stop.coordinates);
          const marker = L.marker(stop.coordinates, {
            icon: L.divIcon({
              className: "dp-geo-pin",
              html: `<span>${stop.number}</span>`,
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            }),
            title: stop.title,
            alt: stop.title,
            keyboard: true,
          }).addTo(instance);
          const label = document.createElement("span");
          label.textContent = stop.title;
          marker.bindTooltip(label, {
            permanent: true,
            direction: "top",
            offset: [0, -16],
            className: "dp-geo-label",
          });
          marker.on("click", () => callback.current(stop.id));
          marker.on("mouseover", () => {
            hovered = stop.id;
            updateLabels();
          });
          marker.on("mouseout", () => {
            hovered = null;
            updateLabels();
          });
          currentMarkers.set(stop.id, marker);
        });
        const paths: { geometry: [number, number][]; status: string }[] = JSON.parse(routeGeometry);
        for (const path of paths) {
          const latLngs: [number, number][] = path.geometry.map(([longitude, latitude]) => [
            latitude,
            longitude,
          ]);
          L.polyline(latLngs, {
            color: path.status === "conflict" ? "#9b5c31" : "#175b43",
            weight: 3,
            opacity: 0.75,
            attribution:
              'Routes: <a href="https://openrouteservice.org" target="_blank" rel="noreferrer">openrouteservice</a>',
            dashArray: path.status === "checked" ? undefined : "5 7",
          }).addTo(instance);
          points.push(...latLngs);
        }
        bounds.current = L.latLngBounds(points);
        instance.fitBounds(bounds.current, {
          paddingTopLeft: [56, 64],
          paddingBottomRight: [56, 32],
          maxZoom: 15,
          animate: false,
        });
        // Markers exist after first view.
        currentMarkers.forEach((marker, id) => {
          const element = marker.getElement();
          element?.setAttribute("aria-label", `Show ${marker.options.title} in the schedule`);
          element?.setAttribute("data-map-place", id);
          element?.addEventListener("focus", () => {
            hovered = id;
            updateLabels();
          });
          element?.addEventListener("blur", () => {
            hovered = null;
            updateLabels();
          });
        });
        syncSelection.current = () => {
          currentMarkers.forEach((marker, id) => {
            const active = selection.current === id;
            marker.getElement()?.classList.toggle("dp-geo-selected", active);
            marker.getElement()?.setAttribute("aria-pressed", String(active));
            marker.setZIndexOffset(active ? 1000 : 0);
            const label = marker.getTooltip()?.getElement();
            if (label) label.style.zIndex = active ? "1000" : "";
          });
          const marker = selection.current ? currentMarkers.get(selection.current) : null;
          if (marker)
            instance.setView(marker.getLatLng(), Math.max(instance.getZoom(), 15), {
              animate: false,
            });
          updateLabels();
        };
        instance.on("moveend zoomend resize", updateLabels);
        syncSelection.current();
        observer = new ResizeObserver(() => {
          instance.invalidateSize({ pan: false });
          updateLabels();
        });
        observer.observe(container.current);
        timer = setTimeout(() => {
          if (!cancelled && !loadedTiles) setStatus("unavailable");
        }, 12000);
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      clearTimeout(timer);
      syncSelection.current = () => {};
      map.current?.remove();
      map.current = null;
      bounds.current = null;
      currentMarkers.clear();
    };
  }, [geometry, routeGeometry, hasLocations, attempt]);

  // Link map selection.
  useEffect(() => {
    selection.current = selected;
    syncSelection.current();
  }, [selected, selectionRequest]);

  function fitDay() {
    if (bounds.current?.isValid())
      map.current?.fitBounds(bounds.current, {
        paddingTopLeft: [56, 64],
        paddingBottomRight: [56, 32],
        maxZoom: 15,
        animate: false,
      });
  }

  if (!hasLocations) return null;
  return (
    <section className="dp-route" aria-label="Day map">
      <header className="dp-map-heading">
        <h2>Day map</h2>
        <span>
          {places.length} mapped {places.length === 1 ? "place" : "places"}
        </span>
      </header>
      <div className="dp-map-frame">
        <div
          ref={container}
          className="dp-live-map"
          aria-label="Interactive map of this day's places"
        />
        <button
          type="button"
          className="dp-fit cursor-pointer"
          onClick={fitDay}
          disabled={status === "loading"}
          aria-label="Show all day locations"
          title="Show all day locations"
        >
          <LocateFixed size={16} />
        </button>
        <div className="dp-map-zoom">
          <button
            type="button"
            className="cursor-pointer"
            aria-label="Zoom in"
            onClick={() => map.current?.zoomIn()}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="cursor-pointer"
            aria-label="Zoom out"
            onClick={() => map.current?.zoomOut()}
          >
            <Minus size={16} />
          </button>
        </div>
        {status !== "ready" && (
          <div className="dp-map-message" role="status">
            {status === "loading" ? (
              "Loading map..."
            ) : (
              <>
                Map could not load.
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry map
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="dp-route-caption" aria-hidden={!picked}>
        {picked && (
          <>
            <strong title={picked.title}>{picked.title}</strong>
            {directions && (
              <a href={directions} target="_blank" rel="noreferrer">
                Directions <ArrowUpRight size={12} />
              </a>
            )}
          </>
        )}
      </div>
    </section>
  );
}
