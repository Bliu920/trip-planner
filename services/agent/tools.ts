import { z } from "zod";
import { catalogQuerySchema, type queryCatalog, type CatalogQuery } from "@/lib/catalog";
import { readGuide } from "@/services/guides";
import type { AgentEnvironment } from "./contracts";
import type { researchWeb } from "./research";
import { ActionRun, actionTool, succeeded } from "./actions";
import { artifactTools } from "./artifact-tools";
const id = z.string().min(1).max(100);
export function agentTools(environment: AgentEnvironment, run = new ActionRun(environment), research?: (query: string) => ReturnType<typeof researchWeb>) {
  // Bind artifact capabilities.
  const artifacts = environment.artifacts ? artifactTools(environment, run) : {};
  return {
    ...artifacts,
    ...(research ? { researchWeb: actionTool(run, "read", {
      description: "Research travel facts and prices online and return a readable evidence report with amounts, units, conditions and source URLs. Use for budget research so facts remain available in later planning steps. Batch related costs in one query. Does not save or book anything.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(4000) }),
      execute: async ({ query }) => succeeded(await research(query)),
    }) } : {}),
    readGuide: actionTool(run, "read", {
      description: "Read a trusted task guide by its ID from the system guide directory.",
      inputSchema: z.object({ id: z.string().max(80) }),
      execute: ({ id }) => succeeded(readGuide(id)),
    }),
    describeCatalog: actionTool(run, "read", {
      description: "Discover actual cities, regions, types, tags, price tiers and filter semantics in the supplied Italy dataset. Counts describe catalog coverage, not city quality. Use before exploratory searches when valid filters are unknown.",
      inputSchema: z.object({}),
      execute: async () => succeeded(await environment.describeCatalog()),
    }),
    searchPlaces: actionTool(run, "read", {
      description:
        "Explore catalog places using shared filters. Query words all match; filter fields intersect. Returns total matches, city distributions before pagination, source records and unknown fields. Price tiers are not money amounts. Unknown duration/booking fails an explicit filter. Use describeCatalog for actual filter values. Zero results do not authorize relaxing user constraints.",
      inputSchema: catalogQuerySchema,
      execute: async (query: CatalogQuery) => {
        const result = await environment.search(query) as ReturnType<typeof queryCatalog>;
        return succeeded({ ...result, places: result.places.map(place => Object.fromEntries(Object.entries(place).filter(([key]) => key !== "photo"))) });
      },
    }),
    readPlaces: actionTool(run, "read", {
      description: "Read complete catalog records before choosing stops.",
      inputSchema: z.object({ ids: z.array(id).min(1).max(20) }),
      execute: async ({ ids }) => succeeded(await environment.places(ids)),
    }),
    readMessage: actionTool(run, "read", {
      description: "Read a saved message within this project by ID.",
      inputSchema: z.object({ id }),
      execute: async ({ id }) => succeeded(await environment.readMessage(id)),
    }),
  };
}
