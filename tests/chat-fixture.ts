import { readFile } from "node:fs/promises";
import italy from "../data/italy.json";
import { PGlite } from "@electric-sql/pglite";

export const reference = "8d4dc012-9723-41ac-8a0c-de0e254c7562";
export const otherTrip = "9d4dc012-9723-41ac-8a0c-de0e254c7562";
export const conversation = "ad4dc012-9723-41ac-8a0c-de0e254c7562";
export const generation = "bd4dc012-9723-41ac-8a0c-de0e254c7562";
export const trip = { reference, name: "Italy test", notes: "Slow pace, October", created_at: "2026-10-23", updated_at: "2026-10-23" };

export async function createDatabase(includeDocuments = true) {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);");
  for (const migration of ["20261026082914_create_trips.sql", "20261026091832_create_chat.sql", "20261026101408_create_attachments.sql", ...(includeDocuments ? ["20261026110643_documents.sql", "20261026122117_editable_documents.sql", "20261026134829_plans.sql", "20261026145652_planning_integration.sql", "20261026160311_catalog.sql", "20261026172536_place_references.sql", "20261027092518_budgets.sql", "20261027140742_brief_checkpoint.sql", "20261028090216_action_results.sql", "20261028114425_supported_files.sql", "20261028132354_chat_failures.sql", "20261028150137_chat_activity.sql", "20261029092500_geo_evidence.sql", "20261030090952_working_drafts.sql", "20261030210000_retire_document_cleanup.sql"] : [])]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  }
  if (includeDocuments) await db.query("insert into places select * from json_populate_recordset(null::places, $1::json)", [JSON.stringify(italy.map((place, source_order) => ({ ...place, source_order })))]);
  return db;
}

export async function seed(db: PGlite) {
  await db.exec("truncate public.trips cascade");
  await db.query("insert into public.trips(reference,name,notes) values ($1,'Italy test','Slow pace, October'),($2,'Other trip','')", [reference, otherTrip]);
  await db.query("select public.chat_snapshot($1, null, $2)", [reference, conversation]);
}

export async function databaseFetch(db: PGlite, url: URL, init?: RequestInit): Promise<Response> {
  if (url.pathname === "/rest/v1/trips") {
    const id = url.searchParams.get("reference")?.replace(/^eq\./, "");
    return Response.json((await db.query("select * from public.trips where reference = $1", [id])).rows);
  }
  if (url.pathname === "/rest/v1/places") return Response.json((await db.query("select p.*, null as photo from places p order by source_order")).rows);
  const operation = url.pathname.split("/").at(-1)!;
  if (!["chat_snapshot", "chat_begin_turn", "chat_begin_turn_places", "chat_write_reply", "chat_write_reply_result", "chat_record_activity", "attachment_reserve", "document_record", "document_list", "document_mutate", "chat_document_remove", "document_finalize_text", "document_stage", "document_upload_complete", "document_publish", "document_version", "document_paths", "plan_get", "plan_save", "planning_snapshot", "planning_begin", "planning_sources", "planning_message", "planning_commit", "planning_withdraw", "budget_get", "budget_save", "planning_commit_budget", "planning_save_brief", "planning_record_action", "planning_run_result", "planning_draft_read", "planning_draft_claim", "planning_draft_put", "geo_read", "geo_record"].includes(operation)) throw new Error("Unexpected storage operation");
  const body = JSON.parse(String(init?.body));
  const keys = Object.keys(body);
  if (!keys.every(key => /^p_[a-z_]+$/.test(key))) throw new Error("Invalid parameter");
  try {
    const result = await db.query<{ value: unknown }>(`select public.${operation}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")}) as value`, Object.values(body));
    return Response.json(result.rows[0].value);
  } catch (error) {
    const failure = error as { message: string; code: string };
    return Response.json({ message: failure.message, code: failure.code }, { status: 400 });
  }
}

export function providerStream() {
  const events = [
    { type: "response.created", response: { id: "resp_test", created_at: 1792713600, model: "gpt-6.1-terra" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_test" } },
    { type: "response.output_text.delta", item_id: "msg_test", output_index: 0, delta: "What pace do you prefer?" },
    { type: "response.output_item.done", output_index: 0, item: { type: "message", id: "msg_test" } },
    { type: "response.completed", response: { usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 } } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
}
