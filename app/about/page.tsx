import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { PhotoCredits } from "@/lib/photo-credits";
import { loadCatalog, loadDayCoverPhotos } from "@/services/catalog";

export const metadata: Metadata = { title: "Image credits | Trip planner" };

export default async function AboutPage() {
  "use cache";
  // Load canonical photo credits.
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const [places, fallbackPhotos] = await Promise.all([loadCatalog(), loadDayCoverPhotos()]);
  return <PhotoCredits places={places} fallbackPhotos={fallbackPhotos} />;
}
