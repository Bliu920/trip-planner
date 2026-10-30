import { z } from "zod";
import { catalogQuerySchema, type queryCatalog, type CatalogQuery } from "@/lib/catalog";
import { readGuide } from "@/services/assistant/agent/guides";
import type { AgentEnvironment } from "../contracts";
import type { researchWeb } from "./research";
import { ActionRun, actionTool, succeeded } from "../actions";
import { artifactTools } from "./artifacts";
const id = z.string().min(1).max(100);
export function agentTools(environment: AgentEnvironment, run = new ActionRun(environment), research?: (query: string) => ReturnType<typeof researchWeb>) {
  // Bind artifact capabilities.
  const artifacts = environment.artifacts ? artifactTools(environment, run) : {};
  return {
    ...artifacts,
    ...(environment.resolvePlace && environment.getJourneys ? {
      resolvePlace: actionTool(run, "read", {
        description: "Resolve a researched restaurant or hotel name, street address and city in Italy. Returns host-issued map evidence, matching status and candidate coordinates in longitude/latitude order. For a matched result pass its id as venue.geoEvidenceId or hotel.geoEvidenceId in editPlan; the host supplies coordinates. Ambiguous candidates need better address research. Does not confirm venue identity or availability.",
        inputSchema: z.object({ name: z.string().trim().min(1).max(300), address: z.string().trim().min(1).max(500), city: z.string().trim().min(1).max(100) }),
        execute: async query => succeeded(await environment.resolvePlace!(query)),
      }),
      getJourneys: actionTool(run, "read", {
        description: "Check all required journeys in the current effective Plan, including implicit transfers and overnight connections. Returns distances, map duration, buffered allowance and specific timing conflicts. Directions support pure walking and driving, without ferries. Other transport remains unverified. Proposals and final saves also run this check automatically.",
        inputSchema: z.object({}), execute: async () => succeeded(await environment.getJourneys!()),
      }),
    } : {}),
    ...(research ? { researchWeb: actionTool(run, "read", {
      description: "Research travel facts, prices, real restaurants and suitable hotels online. Returns readable evidence with source URLs, checked time, venue names and street addresses, meal service, room assumptions, prices, units and conditions when found. Use for suitable meal venues missing from the catalog and for budget research. For venues, name the adjacent planned sight or neighborhood in the query and check address proximity. Batch related neighborhood meals or costs. Does not save or book anything.",
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
