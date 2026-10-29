# Project titles

Status: implemented, locally tested and live model access verified.
Owner: concise title generation from a prompt.
Last updated: 2026-10-28.

## Purpose and boundary

`services/project-titles` is a server-only, self-contained module. It accepts a prompt and returns a plain title. It has no database access, chat history, tools or dependency on the planning agent. Three files separate the public orchestration (`index.ts`), model configuration (`model.ts`) and prompt/output rules (`prompt.ts`).

```ts
import { generateProjectTitle } from "@/services/project-titles";

const title = await generateProjectTitle(prompt);
// Optional cancellation:
const cancellableTitle = await generateProjectTitle(prompt, signal);
```

## Information model

The input is a nonempty prompt of at most 4,000 characters. The output is one complete line of at most 60 characters. Instructions request roughly 3 to 7 words, matching the input language, describing supplied destinations and intent without inventing details or exposing sensitive personal details. Format validation rejects empty, oversized, multiline, incomplete and unsuitable formatted output. Semantic relevance remains a model judgment.

The module does not save or duplicate the prompt. Creation stores the generated string in the existing authoritative `trips.name`; the original opening brief still follows the existing `trips.notes` flow. No generated metadata or second title state is persisted.

## Lifecycle and integration

The starter sends `POST /api/trips` with `{ prompt }`. The backend generates the name before persisting the trip, then returns the existing trip response. This replaces client-side truncation of the raw prompt. Existing explicit `{ name, notes? }` creation and manual PATCH operations bypass the model. Prompt input cannot be mixed with explicit name/notes or used to rename an existing trip.

The title call has an eight-second deadline, no automatic retries, no tools, 128 maximum output tokens and no reasoning. If it fails or returns an invalid title, the creation service uses the editable neutral name `Italy trip` and logs a fixed diagnostic without provider details or prompt content. Caller cancellation prevents fallback creation. The public generation function itself rejects failures so other callers can choose their own recovery policy.

The title is settled before navigation. There is no delayed background title write or automatic regeneration after a manual rename. Attachment-upload retries reuse the created project and its title. Existing projects are not renamed retroactively. Manual editing remains owned by the [project header](project-header.md).

## Model and provider contract

Verified against official documentation on October 28, 2026:

- Exact model: `gpt-6-luna`, the current low-cost focused-task model in the [model catalog](https://developers.openai.com/api/docs/models) and [model page](https://developers.openai.com/api/docs/models/gpt-6-luna).
- Standard prices: $0.10 per million input tokens and $0.50 per million output tokens, per [pricing](https://developers.openai.com/api/docs/pricing). Actual cost depends on input length and output tokens.
- Endpoint: `POST https://api.openai.com/v1/responses`, using installed `ai` 7.0.152 and `@ai-sdk/openai` 4.0.101 through `generateText` and `openai.responses`.
- `reasoning.effort: none` is supported per the [GPT-6 guide](https://developers.openai.com/api/docs/guides/latest-model). SDK options also set `text.verbosity: low`, `store: false`, and `max_output_tokens: 128`.
- Responses message output is aggregated by the SDK into `result.text`, per the [text generation guide](https://developers.openai.com/api/docs/guides/text). Only a complete finish is accepted.
- [Deprecations](https://developers.openai.com/api/docs/deprecations) lists older GPT-4 variants and GPT-5.4 nano for replacement by GPT-6 Luna. No deprecated alternative is used or accepted as a configuration override.

`OPENAI_TITLE_MODEL` defaults to and only accepts `gpt-6-luna`. It is independent of `OPENAI_MODEL`. Changing the permitted model requires a documented compatibility review and corresponding tests. The module uses the existing `OPENAI_API_KEY`; it never sends credentials to the browser.

## Storage and operations

No database migration, new endpoint, package or scheduler is required. Set the existing OpenAI key; the optional title-model setting is documented in `.env.example`. Deploy with the application. Existing reference-based project access is unchanged. Response storage is disabled for this provider call; provider-level retention policies still apply.

## Verification

- `node --import tsx --conditions=react-server --test tests/project-titles.test.ts tests/trips.test.ts`: 21 passed.
- Tests verify the actual SDK wire request, model independence, reasoning off, no tools/storage, bounded input/output, rejected obsolete overrides, missing credentials, incomplete output, cancellation, generated-title persistence, failure fallback without retries, explicit manual-name bypass and name-only PATCH preservation of notes.
- `npm run lint` and `npm run typecheck`: passed.
- Live synthetic calls with the existing account succeeded after retrying an environment DNS failure with network access. English: `Relaxed Florence Art and Food Trip` (1,367 ms). Chinese: `意大利三日悠闲漫游与美术馆之旅` (1,671 ms). Vague prompt: `Travel Planning` (1,295 ms).
- Live checks verified account access and output quality; database integration used mocked responses. No live project records were created or changed. Temporary smoke script removed.

## Limitations

Generation adds one bounded call to prompt-based creation. A provider outage leaves a generic editable title. The module only sees the supplied text, not attached files or selected place details. It does not backfill existing projects, continuously rename projects or run in the background.

## Change history

- 2026-10-28: Added prompt-based titles and creation integration. Retained manual names and notes, with no schema change. Verified SDK contract, current model support and live account access.

## Maintenance

Update this guide with module/integration changes under the shared [maintenance contract](README.md#maintenance-contract).
