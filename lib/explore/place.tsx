import type { ReactNode } from "react";
import { DialogTrigger } from "@/components/ui/dialog";
import { Clock3, Star, TicketCheck } from "lucide-react";
import { durationLabel, typeLabel, type Place } from "@/lib/catalog";
import { Photo } from "./photo";
import { PlaceDetails } from "./detail";
export { PlaceDetails } from "./detail";

export function PlaceCard({ place, action, detailAction }: { place: Place; action?: ReactNode; detailAction?: ReactNode }) {
  return <PlaceDetails place={place} action={detailAction}>
    <article className="explore-card">
      <DialogTrigger className="cursor-pointer explore-card-open" aria-label={`View ${place.name}`}>
        <Photo key={place.photo?.url} photo={place.photo} />
        <span className="explore-card-body">
          <span className="explore-card-heading"><span className="explore-card-name">{place.name}</span><span className="explore-card-rating"><Star size={13} aria-hidden="true" /><span className="sr-only">Rating </span>{place.rating.toFixed(1)}</span></span>
          <span className="explore-card-location">{place.city} · {typeLabel(place.type)}</span>
          <span className="explore-card-meta">
            {place.duration_minutes !== null && <span><Clock3 size={12} aria-hidden="true" />{durationLabel(place.duration_minutes)}</span>}
            <span className="explore-price">{place.price_range}</span>
          </span>
          <span className="explore-card-booking" aria-hidden={place.booking_required !== true || undefined}>{place.booking_required === true && <><TicketCheck size={13} aria-hidden="true" />Booking required</>}</span>
        </span>
      </DialogTrigger>
      {action}
    </article>
  </PlaceDetails>;
}
