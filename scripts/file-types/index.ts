/** Emit policy for a NEW migration. Never rewrite an applied migration. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { policySql } from "./sql";
export { policySql } from "./sql";

// Emit the migration fragment.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(policySql());
