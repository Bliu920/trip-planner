import { useState } from "react";
import { photoUrl, type PlacePhoto } from "@/lib/catalog";

// Frame reviewed portrait assets.
const cardFocus: Readonly<Record<string, string>> = {
  "pexels:36789182": "50% 85%", // Trastevere street life.
  "pexels:16167168": "50% 78%", // Carbonara bowl.
  "pexels:16735127": "50% 65%", // Bernini figures.
  "pexels:35709294": "50% 65%", // Navona fountain.
  "pexels:16970095": "50% 74%", // Trevi statues and water.
  "pexels:16878544": "50% 75%", // Spanish Steps flowers.
  "pexels:37122204": "50% 20%", // Duomo dome and lantern.
};

export function Photo({ photo, large = false }: { photo?: PlacePhoto | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className="explore-photo">
    {photo && !failed ? <>
      {/* Use responsive provider images. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(photo, large ? 400 : 800)} srcSet={`${photoUrl(photo, 400)} 400w, ${photoUrl(photo, 800)} 800w, ${photoUrl(photo, 1200)} 1200w`} sizes={large ? "(max-width: 600px) 100px, 180px" : "(max-width: 600px) 100vw, (max-width: 960px) 50vw, (max-width: 1199px) 33vw, 264px"} style={large ? undefined : { objectPosition: cardFocus[`${photo.provider}:${photo.provider_id}`] }} alt={photo.alt} width={800} height={600} loading={large ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
    </> : null}
  </span>;
}
