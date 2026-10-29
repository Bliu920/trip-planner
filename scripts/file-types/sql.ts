import { readFileSync } from "node:fs";

export function policySql() {
  const formats = JSON.parse(readFileSync(new URL("../../lib/file-types/formats.json", import.meta.url), "utf8"));
  return `-- Generated from lib/file-types/formats.json. Do not hand-edit.\ncreate or replace function public.library_file_types()\nreturns jsonb language sql immutable set search_path = '' as $policy$\n  select '${JSON.stringify(formats).replaceAll("'", "''")}'::jsonb;\n$policy$;`;
}
