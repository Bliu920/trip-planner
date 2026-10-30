"use client";

import { useState } from "react";
import { Map } from "lucide-react";
import { photoUrl } from "@/lib/catalog";
import type { ProjectCoverPhoto } from "./types";

export function CoverImages({ photos }: { photos: ProjectCoverPhoto[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const visible = photos.filter(({ photo }) => !failed.includes(photo.url)).slice(0, 3);
  return (
    <span className="project-cover">
      {visible.length ? (
        visible.map(({ placeId, photo }) => (
          <span className="project-cover-slice" key={`${placeId}:${photo.url}`}>
            {/* Provider images use their responsive CDN. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(photo, visible.length === 1 ? 800 : 400)}
              alt={photo.alt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailed((current) => [...current, photo.url])}
            />
          </span>
        ))
      ) : (
        <Map size={24} strokeWidth={1.25} aria-hidden="true" />
      )}
    </span>
  );
}
