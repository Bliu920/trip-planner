import { cacheLife } from "next/cache";
import { loadCatalog } from "@/services/places/catalog";

async function cachedCatalog() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return loadCatalog();
}

export async function GET() {
  // Read public catalog fields.
  try {
    return Response.json(await cachedCatalog());
  } catch {
    return Response.json({ error: "Could not load places." }, { status: 503 });
  }
}
