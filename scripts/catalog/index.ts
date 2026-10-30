import { readFile } from "node:fs/promises";
import { placeSchema, photoManifestSchema } from "../../services/places/catalog/validation";
import { checkImages, syncCatalog, syncPhotos, verifyCatalog } from "./sync";

async function main() {
  // Validate the import manifests.
  const places = placeSchema.array().parse(JSON.parse(await readFile(new URL("../../data/italy.json", import.meta.url), "utf8")));
  const photos = photoManifestSchema.parse(JSON.parse(await readFile(new URL("../../data/place-photos.json", import.meta.url), "utf8")));
  const ids = new Set(places.map(place => place.id));
  if (ids.size !== places.length || photos.length !== places.length || new Set(photos.map(photo => photo.place_id)).size !== ids.size || photos.some(photo => !ids.has(photo.place_id))) throw new Error("Every source place needs exactly one photo record.");
  // Execute the selected operation.
  const mode = process.argv[2];
  if (mode === "--write") await syncCatalog(places, photos);
  else if (mode === "--write-photos") await syncPhotos(photos);
  else if (mode === "--verify") await verifyCatalog(places, photos);
  else if (mode === "--check-images") await checkImages(photos);
  else if (mode) throw new Error("Use --write, --write-photos, --verify, --check-images, or no flag for validation.");
  else console.log(`Validated ${places.length} places and ${photos.length} photo assignments. No database writes.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Catalog import failed."); process.exitCode = 1; });
