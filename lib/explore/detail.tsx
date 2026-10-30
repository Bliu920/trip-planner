import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MapPin, Star, X } from "lucide-react";
import { catalogText, durationLabel, typeLabel, type Place } from "@/lib/catalog";
import { Photo } from "./photo";

export function PlaceDetails({
  place,
  children,
  action,
  open,
  onOpenChange,
}: {
  place: Place;
  children?: ReactNode;
  action?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const booking =
    place.booking_required === null
      ? "Check with the venue"
      : place.booking_required
        ? "Booking required. Availability is not confirmed."
        : "No advance booking requirement listed.";
  // Compose persistent controls.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className="explore-dialog" showCloseButton={false}>
        <header className="explore-detail-header">
          <DialogTitle>{place.name}</DialogTitle>
          <div className="explore-detail-actions">
            {action}
            <DialogClose className="cursor-pointer explore-close" aria-label="Close place details">
              <X size={20} aria-hidden="true" />
            </DialogClose>
          </div>
          <p>
            {place.city} · {typeLabel(place.type)}
            <span className="explore-detail-rating">
              <Star size={14} aria-hidden="true" />
              <span className="sr-only">Rating </span>
              {place.rating.toFixed(1)}
            </span>
          </p>
        </header>
        <div
          className="explore-detail-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${place.name} details`}
        >
          <div className="explore-detail-summary">
            <Photo key={place.photo?.url} photo={place.photo} large />
            <dl className="explore-key-facts">
              <div>
                <dt>Typical visit</dt>
                <dd>{durationLabel(place.duration_minutes)}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{place.price_range}</dd>
              </div>
            </dl>
          </div>
          <DialogDescription className="explore-description">
            {catalogText(place.description)}
          </DialogDescription>
          <section className="explore-detail-section" aria-label="Visiting details">
            <dl className="explore-visit-facts">
              <div>
                <dt>Hours</dt>
                <dd>{place.hours ? catalogText(place.hours) : "Check with the venue"}</dd>
              </div>
              <div>
                <dt>Booking</dt>
                <dd>{booking}</dd>
              </div>
              {place.seasonal_notes && (
                <div>
                  <dt>Seasonal notes</dt>
                  <dd>{catalogText(place.seasonal_notes)}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="explore-detail-section" aria-label="Location and interests">
            <div className="explore-location-heading">
              <h3>Location</h3>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={16} aria-hidden="true" />
                View map<span className="sr-only"> for {place.name}, opens in a new tab</span>
              </a>
            </div>
            <p>{[place.neighborhood, place.city, place.region].filter(Boolean).join(", ")}</p>
            {place.tags.length > 0 && (
              <p className="explore-detail-tags">
                {place.tags.map((tag) => tag.replaceAll("-", " ")).join(" · ")}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
