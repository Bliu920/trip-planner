"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MapPin, Plus, X } from "lucide-react";
import { photoUrl, type Place } from "@/lib/catalog";
import { PlaceDetails } from "@/lib/explore/place";
import { loadPlaceReferences, togglePlace, type PlaceReference } from "./model";
import "./references.css";

type Selection = {
  places: Place[];
  disabled: boolean;
  toggle: (place: Place) => void;
  remove: (id: string) => void;
};
const SelectionContext = createContext<Selection | null>(null);

export function PlaceSelection({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  return (
    <SelectionContext.Provider
      value={{
        places,
        disabled,
        toggle: (place) => {
          if (!disabled) setPlaces((current) => togglePlace(current, place));
        },
        remove: (id) => {
          if (!disabled) setPlaces((current) => current.filter((place) => place.id !== id));
        },
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function usePlaceSelection() {
  return useContext(SelectionContext);
}

export function PlaceToggle({ place, detailed = false }: { place: Place; detailed?: boolean }) {
  const selection = usePlaceSelection();
  if (!selection) return null;
  const selected = selection.places.some((item) => item.id === place.id);
  return (
    <button
      type="button"
      className={`cursor-pointer place-toggle${detailed ? " place-toggle-detail" : ""}`}
      disabled={selection.disabled}
      aria-pressed={selected}
      aria-label={`${selected ? "Remove" : "Add"} ${place.name} ${selected ? "from" : "to"} your message`}
      title={selected ? "Remove from message" : "Add to message"}
      onClick={() => selection.toggle(place)}
    >
      <span className="place-toggle-symbol" aria-hidden="true">
        {selected ? <Check size={16} /> : <Plus size={16} />}
      </span>
    </button>
  );
}

function Thumbnail({ place }: { place: PlaceReference }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="place-chip-photo">
      {place.photo && !failed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(place.photo, 100)} alt="" onError={() => setFailed(true)} />
        </>
      ) : (
        <MapPin size={16} aria-hidden="true" />
      )}
    </span>
  );
}

function PlaceChip({
  place,
  onRemove,
  disabled,
}: {
  place: PlaceReference;
  onRemove?: (id: string) => void;
  disabled: boolean;
}) {
  const [detail, setDetail] = useState<Place | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function show() {
    if (loading) return;
    if (detail) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const [loaded] = await loadPlaceReferences([place.id], controller.signal);
      if (!controller.signal.aborted) {
        setDetail(loaded);
        setOpen(true);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "Could not load this place.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="place-chip">
      <button
        type="button"
        className="cursor-pointer place-chip-open"
        onClick={() => {
          void show();
        }}
        disabled={loading}
        aria-label={`View ${place.name}`}
        title={`${place.name}, ${place.city}`}
      >
        <Thumbnail place={place} />
        <span>{place.name}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="cursor-pointer place-chip-remove"
          aria-label={`Remove ${place.name} from your message`}
          disabled={disabled}
          onClick={() => onRemove(place.id)}
        >
          <X size={14} />
        </button>
      )}
      {detail && <PlaceDetails place={detail} open={open} onOpenChange={setOpen} />}
      {error && (
        <span className="place-chip-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function PlaceChips({
  places,
  onRemove,
  disabled = false,
}: {
  places: readonly PlaceReference[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!places.length) return null;
  const collapsed = !expanded && places.length > 4;
  const visible = collapsed ? places.slice(0, 3) : places;
  return (
    <div className="place-references" role="group" aria-label="Places in this message">
      {visible.map((place) => (
        <PlaceChip key={place.id} place={place} onRemove={onRemove} disabled={disabled} />
      ))}
      {places.length > 4 && (
        <button
          type="button"
          className="cursor-pointer place-references-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {collapsed ? `+${places.length - visible.length}` : "Show less"}
        </button>
      )}
      {onRemove && (
        <span className="sr-only" role="status">
          {places.length} {places.length === 1 ? "place" : "places"} selected
        </span>
      )}
    </div>
  );
}
