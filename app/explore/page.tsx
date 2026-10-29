import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Explore } from "@/lib/explore";
import { loadCatalog } from "@/services/catalog";

export const metadata: Metadata = { title: "Explore | Trip planner", description: "Find places to visit, eat and explore in Italy." };
export default async function ExplorePage() {
  "use cache";
  // Refresh the shared catalog.
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return <Explore places={await loadCatalog()} />;
}
