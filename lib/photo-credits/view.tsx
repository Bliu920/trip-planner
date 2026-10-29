import Link from "next/link";
import { photoUrl, type Place } from "@/lib/catalog";
import type { Photo } from "@/lib/plan/presentation/model";
import "./credits.css";

export function AboutLink() {
  return <footer className="photo-credits-footer"><Link href="/about">About</Link></footer>;
}

export function PhotoCredits({ places, fallbackPhotos = [] }: { places: readonly Place[]; fallbackPhotos?: readonly Photo[] }) {
  return <main className="photo-credits-page">
    <header><Link href="/projects/new">Trip planner</Link><Link href="/projects/new" className="photo-credits-back">Back to planning</Link></header>
    <section aria-labelledby="photo-credits-title">
      <h1 id="photo-credits-title">Image credits</h1>
      <p className="photo-credits-intro">Photography used across Explore and trip plans. Related images show a place’s setting or activity rather than the exact venue.</p>
      <ul className="photo-credits-list">
        {fallbackPhotos.map((photo, index) => <li key={photo.src}>
          <a className="photo-credits-thumbnail" href={photo.creditUrl} target="_blank" rel="noreferrer" aria-label={`View original fallback image for Day ${index + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={photo.alt} width={80} height={60} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </a>
          <div className="photo-credits-place"><h2>Day {index + 1} fallback cover</h2><p>Illustrative travel image, not a planned stop</p></div>
          <a className="photo-credits-source" href={photo.creditUrl} target="_blank" rel="noreferrer"><span>{photo.credit}</span><span>Pexels<span className="sr-only">, opens in a new tab</span></span></a>
        </li>)}
        {places.flatMap(place => place.photo ? [<li key={place.id}>
          <a className="photo-credits-thumbnail" href={place.photo.source_url} target="_blank" rel="noreferrer" aria-label={`View original image for ${place.name}`}>
            {/* Provider thumbnails use their CDN. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(place.photo, 160)} alt={place.photo.alt} width={80} height={60} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </a>
          <div className="photo-credits-place"><h2>{place.name}</h2><p>{place.city}{place.photo.match === "illustrative" ? " · Related image" : ""}</p></div>
          <a className="photo-credits-source" href={place.photo.source_url} target="_blank" rel="noreferrer"><span>{place.photo.photographer}</span><span>{place.photo.provider === "pexels" ? "Pexels" : "Unsplash"}<span className="sr-only">, opens in a new tab</span></span></a>
        </li>] : [])}
      </ul>
    </section>
  </main>;
}
