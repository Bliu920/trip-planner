/* eslint-disable @next/next/no-img-element */
import { ArrowUpRight, ChevronDown, Pencil } from "lucide-react";
import type { Photo, Stop } from "../presentation/model";
import { Reminders } from "../presentation/reminders";

/** Selected activity facts, independent of edits and persistence. */
export function StopDetails({ stop, cover, onEdit, onToggleOptional, locked = false }: {
  stop: Stop; cover?: Photo | null; onEdit?: (id: string) => void;
  onToggleOptional?: (id: string) => void; locked?: boolean;
}) {
  const description = stop.description ?? stop.note;
  const booking = stop.details?.find(detail => detail.label === "Booking");
  const remaining = stop.details?.filter(detail => detail !== booking) ?? [];
  const image = stop.photo;
  return <section className="dp-details" aria-label={`Details: ${stop.title}`}>
    <div className="dp-detail-summary">
      <header><h3 tabIndex={-1} title={stop.title}>{stop.title}</h3>{onEdit && <button type="button" className="dp-edit-action cursor-pointer" disabled={locked} onClick={() => onEdit(stop.id)}><Pencil size={13} />Edit activity</button>}</header>
      <div className="dp-facts"><span>{stop.time}{stop.endTime ? ` to ${stop.endTime}` : ""}</span><span>{stop.duration === "Duration unknown" ? "Duration not set" : stop.duration}</span>{stop.priceLabel && <span>{stop.priceLabel}</span>}{stop.optional && <span>Optional</span>}</div>
    </div>
    <div className="dp-detail-body" role="region" aria-label={`About ${stop.title}`} tabIndex={0}>
    {stop.locationLabel && <p className="dp-location">{stop.locationLabel}</p>}
    {image && image.src !== cover?.src && <img className="dp-detail-photo" src={image.src} alt={image.alt} width={480} height={180} />}
    {description && <p className="dp-detail-description">{description}</p>}
    <Reminders items={stop.reminders} />
    {(stop.bookingLabel || booking) && <p className="dp-booking">{stop.bookingLabel || booking?.value}</p>}
    {!stop.coordinates && <p className="dp-location">{stop.locationLabel ? "Map pin not available" : "Location not set"}</p>}
    {(remaining.length > 0 || !!stop.sources?.length || image) && <details className="dp-more"><summary className="cursor-pointer">Practical details & sources<ChevronDown size={13} /></summary>
      <div className="dp-evidence">{remaining.map((detail, index) => <p key={index}><strong>{detail.label}: </strong>{detail.value}</p>)}
        {stop.sources?.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">{source.label} {index + 1}<ArrowUpRight size={12} /></a>)}
        {image && <a className="dp-credit" href={image.creditUrl} target="_blank" rel="noreferrer">Photo: {image.credit}</a>}
      </div>
    </details>}
    {stop.canToggle && onToggleOptional && <button type="button" className="dp-optional cursor-pointer" disabled={locked} onClick={() => onToggleOptional(stop.id)}>{stop.omitted ? "Restore this stop" : "Skip this stop"}</button>}
    </div>
  </section>;
}
