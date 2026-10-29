# 3 Days in Italy

An account-free planner for a three-day Italy trip. Explore the supplied places, create a trip, chat with an assistant, edit an itinerary and budget, and keep supporting documents in the trip library. Opening hours, availability and prices can be uncertain and should be checked before travel.

## Local setup

Use Node.js 22 and npm. For a complete local setup, use a Supabase project and an OpenAI API key with access to the configured models.

1. Install the locked dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local`. Replace the placeholders with your own `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `OPENAI_API_KEY` for the features you want to use. Remove or leave blank any credentials you do not configure; the example values are not valid credentials. Keep this file private. The server also accepts `NEXT_PUBLIC_SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` aliases. Never expose a service key to the browser.
3. For a **new, empty** Supabase project, apply every SQL file in `supabase/migrations/` in filename order. Use your Supabase migration workflow or the SQL editor. Apply them once, in order. The migrations create the tables, functions, access restrictions and private attachment bucket. Executing SQL manually in the editor does not itself record the versions in the Supabase CLI migration history. Keep track of which method you use and reconcile history before switching workflows.
4. Import the supplied places and photo assignments after the catalog migration. With the variables available to the process, run:

   ```sh
   node --env-file-if-exists=.env.local --import tsx scripts/catalog/index.ts --write
   ```

   This writes to the configured Supabase project and verifies the results. To validate the local data without writing, run `node --import tsx scripts/catalog/index.ts`. To compare the database with the supplied files without writing, run `node --env-file-if-exists=.env.local --import tsx scripts/catalog/index.ts --verify`.
5. Run `npm run dev` and open [localhost:3000](http://localhost:3000).

Without Supabase configuration, the place browser can use the bundled data, but trip creation and persistence require storage. AI chat and transcription require the OpenAI key and model access. These services do not silently simulate successful saves. For Library cleanup, configure `DOCUMENT_CLEANUP_SECRET` and a trusted scheduler as described in the [Library guide](docs/modules/library.md).

**Existing databases:** migration files were renamed for the product baseline. Some older versions were already applied to an existing database. Do not blindly rerun or repair them. Compare the actual schema and migration history with the [old-to-new mapping](docs/migration-versions.md), then plan reconciliation for that database before applying further migrations. The mapping does not establish which migrations have been applied in any particular environment.

## Routes and access

- `/projects/new` starts a trip or resumes one saved on this device. `/` and `/projects` redirect there.
- `/trips/:reference` opens the trip workspace. `/explore` browses places; `/about` explains the product and `/credits` provides image credits.
- A trip reference grants read and edit access to that trip. Anyone with the link can edit it. Keep links private and retain a copy. Device history is stored locally; there is no account-based recovery.
- The server uses privileged Supabase access. Browser roles do not have direct access to trip tables. Add deployment-level rate limiting and abuse controls before broad public use of anonymous creation and paid AI requests.

## AI and research

The server uses the configured OpenAI model for trip chat. The current allowed default and provider details are documented in the [Agent guide](docs/modules/agent.md). Web research is enabled unless `AGENT_WEB_SEARCH=false`; it can incur provider costs. The assistant uses the supplied catalog and can save a Plan, Budget and supporting documents. Research quality and availability must be verified independently; an automated test is not a live acceptance test.

The chat route requests a 600-second hosting duration and uses a 540-second application timeout. The agent uses a 14,000-token output limit per model call and does not automatically retry provider requests. Hosting plans can impose lower limits. For workflow, persistence and current limits, see the [Agent guide](docs/modules/agent.md) and [action results](docs/modules/agent-actions.md).

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use isolated fixtures and mocked providers where documented. Passing tests does not verify a hosted database, deployed cleanup scheduler, microphone, model access or live research.

## Code structure

- `app/`: page and API entry points.
- `lib/`: frontend modules and shared types, validation and domain logic.
- `services/`: server-side orchestration, persistence and agent tools.
- `components/ui/`: reusable UI controls.
- `data/`: source catalog and photo metadata.
- `supabase/migrations/`: ordered database changes.
- `tests/`, `scripts/`: regression tests and maintenance tools.
- `docs/modules/`: maintained feature guides. Update them with changes under the [maintenance contract](docs/modules/README.md). Frontend changes also follow [UI principles](docs/ui-principles.md).

Local experiments, when present, live under ignored `.local/experiments/` and are not part of this repository's production application.
