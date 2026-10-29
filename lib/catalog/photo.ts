export type PlacePhoto = {
  place_id: string;
  provider: "pexels" | "unsplash";
  provider_id: string;
  url: string;
  source_url: string;
  photographer: string;
  alt: string;
  match: "place" | "illustrative";
  verified_at: string;
};

export function photoUrl(photo: PlacePhoto, width = 800) {
  const url = new URL(photo.url);
  url.searchParams.set("auto", photo.provider === "pexels" ? "compress" : "format");
  url.searchParams.set("w", String(width));
  url.searchParams.set("fit", "crop");
  url.searchParams.set("q", "80");
  return url.toString();
}
