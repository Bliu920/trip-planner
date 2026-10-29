# Trip Planner

Build **3 Days in Italy**, an interactive, personalized three-day itinerary planner for an AI Engineer take-home assessment.

The assessment brief may be stored privately in `.local/`, which is gitignored.

## Requirements

- Use the supplied `italy.json`, approximately 100 places across Italy, as the source of truth. External enrichment is optional. Do not substitute invented places.
- Handle seasonal hours, missing details, and inconsistent data without presenting uncertain information as fact.
- Submit a live URL, reviewable source code, and either a written note (maximum two pages) or video (maximum five minutes). Explain what was built and why, improvements with more time, and how AI was used.
- AI product features are optional. Expected effort is a few hours, with no hard timebox or hidden requirements.

## Project structure

- Next.js App Router, React, TypeScript, Tailwind CSS, and Supabase.
- `app/`: pages and API routes. `lib/`: frontend modules. `services/`: backend modules. `supabase/migrations/`: schema changes.
- Trips use account-free UUID references that grant read and edit access. The device remembers recent references; Supabase stores trip data.
- Check `docs/tasks/` for active file ownership before editing. Preserve existing changes.
- Keep private files in `.local/` and credentials in ignored environment files. See `.env.example` for configuration; keep server secrets out of client code.

## Coding rules

- Separate module responsibilities, usually across two to four files, with short descriptive names and an `index.ts` public API and orchestration entry point.
- Single-file modules are allowed for roughly 80 lines or fewer of non-trivial logic, or no side effects. Briefly note the exception in the response.
- Label orchestration phases with unnumbered comments under five words.
- Add `cursor-pointer` to every button element.
- Prefer explicit parameters unless inputs are tightly coupled or there are many optional parameters.
- Never use em dashes or en dashes in user-facing writing.

## Consumer language

- Write all consumer-facing text from the traveller's perspective, including labels, tooltips, accessibility names, loading states, errors and AI replies. Describe the useful fact, result or next action, not its internal implementation.
- Do not expose database/catalog terms, schema fields, raw record IDs, revision counters, tool names, runtime details or deployment instructions. Keep technical diagnostics in developer logs and documentation. Show a technical detail only when it helps the user perform a real task, such as copying a trip access code or identifying a cited document version.
- Preserve uncertainty, sources and honest save status in plain language. Do not turn unverified information into fact or an uncertain save into success/failure while simplifying copy.
- Review the rendered happy path, empty states, errors and accessible labels before finishing. Follow docs/ui-principles.md for examples and the review checklist.

## Model selection

- Before selecting or changing any AI model, verify the provider's current official model catalog, task-specific guide and deprecation notices. Do not choose from memory, old examples or SDK defaults.
- Use a current, supported model appropriate to the workload. Never select deprecated or obsolete models, or silently fall back to them. An older model requires the user's explicit request and a clear explanation of its status.
- Verify endpoint, request options, response schema and installed SDK compatibility. Record the exact model ID, source links and verification date in the feature's maintained guide; distinguish documented support from account access and live testing.
- Update runtime defaults, environment examples, accepted overrides, tests and documentation together. Regression tests must reject deprecated model overrides rather than merely repeating the new default.

## Design collaboration

- During design discussions, work in chat. Do not create specifications, task paperwork, code, or other artifacts until the user explicitly requests that output. Authorization to record a lesson permits that record only.
- Define the actual information model before proposing tools or guidance: each artifact's purpose, concrete contents, exclusions, relationships, initial state, storage form, and independent loading boundary. A broad brief or generic workflow is not a substitute for this work.
- Give each fact one authoritative owner. Reference existing chat history instead of duplicating raw input. Separate user requirements, external evidence, and agent proposals. Derived summaries are views, not independently maintained facts.
- Choose artifact boundaries for clear ownership, maintainability, and progressive disclosure. Related information can be linked without being merged into one large document.
- Discuss missing-information behavior alongside the specific information being designed. Establish the core environment and plan representation before adding generic policies, audit logs, or optimization features.
- Keep proposals distinct from agreed decisions. Explain concrete tradeoffs and resolve the requested design problem instead of expanding the discussion into unrelated implementation detail.

## Commands

- Setup: `npm ci`; development: `npm run dev`; production build: `npm run build`.
- After code changes, run `npm run lint` and `npm run typecheck`, and fix errors. Run `npm test` when relevant.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
