# Audio input

Status: implemented; verification results and remaining manual checks below. Owner: audio-input module. Updated: October 26, 2026.

## Purpose and product boundary

Voice dictation is another way to write the existing trip prompt. It does not start a voice conversation, generate a spoken response, upload an attachment to the trip, or send a message automatically. It is available in the starter and live chat composers. The isolated development test page exercises the same module without creating trips.

The model is `gpt-transcribe`, accessed server-side through the existing AI SDK. Leave `OPENAI_TRANSCRIPTION_MODEL` unset or set it to `gpt-transcribe`. Other values are rejected before provider access, including deprecated models and live-streaming models incompatible with this completed-recording workflow. This is independent of `OPENAI_MODEL`; changing dictation does not change the chat model. The existing approved OpenAI key is reused. Languages are detected automatically, including Chinese and English; no default translation or travel-vocabulary prompt biases the transcript.

### Model selection and compatibility

Verified October 26, 2026 against the official [transcription workflow guide](https://developers.openai.com/api/docs/guides/transcription), [file-transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text), [model page](https://developers.openai.com/api/docs/models/gpt-transcribe) and [deprecation notices](https://developers.openai.com/api/docs/deprecations). OpenAI recommends `gpt-transcribe` for completed recordings. The previous mini and full GPT-4o transcription models are deprecated, with shutdown scheduled for February 26, 2027. They are not supported alternatives in this feature.

The endpoint remains `/v1/audio/transcriptions`. The installed AI SDK accepts the model ID and the JSON response containing `text` and optional `languages: [{ code }]`. We omit provider options and use the endpoint's default JSON response, matching the official example. Passing even a JSON-only provider-options object causes this SDK version to inject legacy temperature and segment-timestamp defaults. The regression test asserts that the actual multipart request contains only `model` and `file`. No temperature override, language restriction, context hints or legacy response options are sent. Detected-language metadata is not needed by the composer; it consumes only transcript text for the user to edit in the draft. Tests inspect the actual SDK multipart request and parse responses with both populated and empty language arrays.

A read-only request to OpenAI's model endpoint returned 200 and the expected model ID using this project's existing key on October 26, 2026. This verifies account access, not microphone behavior or recognition quality. Adding another model requires fresh official documentation and deprecation checks, endpoint/SDK compatibility review, test updates and an update to this guide. The project-wide rule lives in `AGENTS.md`.

## Information model and ownership

| Artifact | Purpose and contents | Owner and initial state | Storage and loading boundary |
| --- | --- | --- | --- |
| Composer draft | User's typed text and accepted dictation; excludes raw audio | Existing starter/chat composer, initially unchanged | Existing React state; persisted by normal Send only |
| Capture session | Microphone stream, recorder, chunk buffers, audio analyser, sampled levels, timer, cancellation signal | Browser capture adapter, absent until an explicit mic click | Memory only; acquired on demand |
| Recording | Encoded WebM/Opus or MP4/AAC clip, byte size and MIME type | Audio session, initially absent | Memory only; sent to our transcription route after confirmation |
| Transcription result | Model text awaiting immediate insertion; retained only if insertion fails | Audio session, initially empty | Local memory; delivered once into the host draft, no separate editor |
| Transcription request | Validated audio bytes and cancellation signal | Backend module, one request at a time per client session | Request memory; no database, bucket, provider file object or application logs |
| Dictated text | Transcript appended to the current composer text for editing before Send | Existing composer becomes authoritative owner | Audio state is discarded immediately after successful insertion |

Dictated text is an editable interpretation of audio, not an authoritative record of what the user meant. The module does not create a second independently maintained requirements document. Other project context and chat history are not sent to the transcription service.

## UI and visual design

Follow the [ChatGPT dictation flow](https://help.openai.com/en/articles/12168547-voice-dictation-faq): microphone, record, confirm, editable text in the ordinary message draft, then Send. The user explicitly rejected a second transcript editor, a separate Use text action, repeated recording labels and explanatory captions.

Retain the white composer, system font and compact controls. In the starter, the idle microphone sits immediately before Send in the right action group; attachment stays on the left. During capture, the normal textarea, attachments and toolbar are visually hidden but remain mounted. One row replaces them inside the same composer: X on the left, a live waveform and elapsed time in the middle, and a dark circular checkmark on the right. No nested card or extra heading. Desktop controls are 32px; mobile targets are 44px with the confirm circle visually kept at 32px. The recording row keeps the short composer footprint. Keyboard focus changes button fill without adding outline rings. Processing uses the same row with a short status and cancellable spinner state.

The waveform shows the last 48 RMS audio-level samples from a Web Audio analyser at 80ms intervals. Silence stays quiet. No production animation invents speech activity, and audio is never connected to speakers. If metering is unavailable, recording can continue with a quiet waveform. Permission, recording, processing and errors have accessible status text; the ticking timer and waveform are hidden from screen readers.

The checkmark ends recording and transcribes it. Successful text is appended once to the latest host draft, with a space only when needed. The capture surface disappears and focus returns to that draft. No second acceptance step and no automatic Send. Cancel or Escape discards the recording and restores the untouched draft and attachments, with focus on the mic. Input stays mounted while hidden so draft contents and attachment selection survive.

Only failures show feedback, as a compact inline error inside the composer. A failed transcription offers a retry icon and X; the original clip is retained for retry. Capture failures need only dismissal before trying the mic again. If the combined text exceeds the host's 4,000-character limit, existing text is untouched and the full transcript remains in memory with a Copy transcript action for recovery. Nothing is truncated. Clipboard failure retains the transcript and shows a concise recovery error. Dismissing discards that pending transcript. Sending remains blocked while any audio state needs resolution.

## Lifecycle and state transitions

| State | Entry and allowed actions | Exit and cleanup |
| --- | --- | --- |
| Idle | Mic available unless the host is busy | Explicit click checks secure context and codec support |
| Requesting permission | Browser permission prompt; Cancel available | Grant starts capture; denial shows guidance; late grant after cancel is immediately stopped |
| Recording | Waveform, elapsed time, X and checkmark | Confirm ends tracks immediately and waits for final bytes; 60 seconds automatically confirms |
| Stopping | Same processing surface; Cancel available | Valid clip proceeds to transcription; capture failure becomes error |
| Transcribing | Server upload and model call; Cancel available | Success delivers text directly to the draft; failure retains clip for Retry |
| Ready (internal) | Validated transcript is delivered synchronously through the hook subscription | Host accepts all text and state becomes Idle, or insertion failure preserves text in Error; never a visible review screen |
| Error | Concise inline feedback; Retry for a usable clip, Copy for an uninserted transcript, X to dismiss | Retry reuses the clip; successful copy or dismissal clears state and returns idle |

Each operation carries a generation token. Cancel, re-record and unmount invalidate earlier callbacks and abort network work. A late permission grant or provider response cannot resurrect an abandoned session. Rapid duplicate starts/stops/retries are ignored by state guards. React Strict Mode cleanup is safe.

Leaving the page releases the microphone, timers and requests. Hiding the tab while requesting or recording cancels capture rather than recording silently in the background. A disconnected microphone produces a recoverable error without automatically uploading partial speech. Browser suspension cannot guarantee millisecond-precise limits; byte limits remain enforced.

## Limits and resource policy

- Browser recording limit: 60 seconds. Confirmation is automatic at the cap.
- Recorder finalization deadline: three seconds after Confirm. Microphone tracks are released immediately, before waiting for the final encoded chunk.
- Clip size: 3 MiB, enforced during capture and by streamed server reads. Oversized input is rejected before provider access.
- Very short or empty recordings are rejected locally. Valid encoded silence may still produce empty or inaccurate model output; users can edit the normal draft before sending, and an empty transcript is a retryable failure.
- Browser upload/transcription deadline: 50 seconds. Provider deadline: 40 seconds. No automatic provider retries.
- Server request body deadline: 10 seconds. Raw audio body avoids multipart parsing and extra base64 transfer.
- Per-process maximum concurrent provider calls: two. Extra callers receive 429 and can retry. This is a resource guard, not distributed abuse protection.
- Result size is bounded. A too-long transcript is not silently sliced; the clip remains available for retry or re-recording.

The 60-second cap is a browser UX limit, not a server-verified duration claim. The server enforces bytes and supported container signatures; it does not decode or inspect audio duration. Before broad anonymous deployment, add shared rate limits at the hosting edge. Origin checks are not authentication and do not prevent scripted callers. Starter dictation intentionally works before a trip exists.

## Backend contract

`POST /api/audio/transcribe`, Node runtime. Request: raw supported audio bytes with their media type in `Content-Type`. No client-selected provider, model, prompt, trip reference, file URL or remote fetch target. The browser calls the same-origin route; the server validates Origin and Fetch Metadata, and does not grant cross-origin access.

Success: `{ "text": "..." }`. Failure: `{ "error": "actionable message", "code": "stable_code" }` with 400/413/415 for invalid input, 403 for origin mismatch, 422 for unusable speech or transcript, 429 for capacity/provider limit, 499 for a cancelled body upload, 503 for configuration, 504 for timeout and 502 for upstream failure. Responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Server secrets, provider bodies and raw audio are never returned in errors.

MIME and container signatures must agree: WebM EBML header or MP4 ftyp box. These are format guards, not full decoders. Browser recording supports WebM/Opus first and MP4/AAC where available. Browsers without a supported recorder keep typing available and receive a clear message on mic activation.

## Module boundaries

- `lib/audio-input/index.tsx`: public hook and UI orchestration, exposing the existing toolbar control, panel slot and active state. The panel now replaces the composer surface during capture and processing; it is not a second editor.
- `lib/audio-input/session.ts`: testable state machine and transcription transport; no React, trip or chat imports.
- `lib/audio-input/recorder.ts`: browser microphone and MediaRecorder lifecycle; no networking or app state.
- `lib/audio-input/types.ts`: shared limits and contracts, pure and safe for backend imports.
- `lib/audio-input/meter.ts`: optional Web Audio level sampling and AudioContext cleanup, isolated from recorder correctness.
- `lib/audio-input/audio.css`: isolated visual styles, including hiding the host draft/toolbar only when the recording surface exists. Six files separate capture, metering, state, UI, contracts and styling.
- `services/audio-input/index.ts`: request orchestration and capacity guard.
- `services/audio-input/validation.ts`: bounded request reading and input validation.
- `services/audio-input/provider.ts`: OpenAI adapter and provider error translation.
- `.local/experiments/lib/audio-input-lab/`: local isolated UI, injected fixture sessions and styles. Simulations run without a microphone or provider.
- Route files are small adapters using the small-module exception. The local experiment app hosts the audio lab; `app/api/audio/transcribe` delegates to the backend module.

Integration uses the shared prompt's optional panel slot. Starter and chat own their text and receive transcript text directly after confirmation. The audio module imports no attachment, trip, chat persistence or workspace services. The preview composer remains simulated and does not capture audio.

## Privacy and cancellation

Microphone access starts only on an explicit click. Confirming the recording sends it to OpenAI for transcription; the recording UI has no permanent provider caption. Discard while recording sends nothing. The application does not persist raw audio; local buffers are discarded on insertion, discard or unmount. OpenAI processes uploaded audio under its API data policies. Do not claim zero provider retention or add unsupported `store: false` options to the transcription endpoint. Cancellation releases local resources and aborts the request, but cannot guarantee a provider has not already processed or billed a submitted clip.

## Testing and acceptance

Automated lifecycle tests use fake capture handles and deferred provider promises to verify permission races, duplicate actions, final chunks, failures, retry, cancellation, unmount and stale results. Capture adapter tests verify track cleanup and format negotiation. Backend tests inspect the actual AI SDK multipart request using mocked fetch, enforce limits and validate sanitized errors without live model calls.

The local experiment app’s `/test/audio` surface provides actual microphone dictation plus deterministic simulated scenarios with no microphone or provider calls. Browser checks cover idle, recording, processing, direct draft insertion, failure and narrow layouts. Tests do not secretly activate the user's microphone. A real microphone check requires an explicit user action and browser permission.

Acceptance: editable text is preserved; no automatic send; no hidden ongoing microphone; late results are ignored; retry keeps the clip; unavailable services do not prevent typing; compact controls remain aligned; mobile has no overflow; lint, types, tests and build pass.

## Implementation adjustments

1. Final recorder events can fail to arrive. Added a three-second deadline and immediate microphone release. A deterministic capture-adapter test covers this case.
2. Recording duration must exclude encoding delay. The short-recording check measures duration when Stop is pressed, before waiting for final bytes.
3. Browser review showed focus falling to the page when Stop disappeared. Permission, stopping, transcription and error states now focus the dismiss control; the later dictation simplification restores the host draft after insertion. Escape discards the panel, and focus returns to the mic after React enables it. Acceptance returns focus to the host draft.
4. Error states do not always have a transcript. The later dictation simplification removes review entirely and uses Cancel voice input consistently for discarding any pending audio work.
5. The installed Next.js version rejects an explicit runtime export when Cache Components is enabled. Removed that export after the build check and confirmed the local runtime guide. The route uses the default Node.js runtime.
6. The lab's frontend implementation lives in `.local/experiments/lib/audio-input-lab/`, keeping page adapters small and conforming to the project folder convention.
7. Request-contract testing caught SDK defaults added when a provider-options object was present. Removed the entire options object so the new model receives only its ID and the encoded file, matching the official example.
8. The original model choice was outdated. It relied on an older model family without adequately checking the current workflow recommendation and deprecation notice. Replaced it with verified `gpt-transcribe`, removed the deprecated alternative from configuration, added rejection tests and recorded a project-wide rule requiring current official evidence before model selection. SDK support alone is not evidence that a model is current or appropriate.

9. Replaced the original multi-step review panel after user feedback. Dictation now replaces the composer contents temporarily, confirms directly into the editable draft, and uses a measured waveform. The normal path contains no second textarea, Use text button, Record again button or provider caption. Added metering cleanup tests and a reentrant delivery test to prove one insertion, no second acceptance and preservation of the latest draft.

## Verification record

- Current dictation UX verification: full-project ESLint, typecheck, all 89 tests and the production build pass. The 29 audio tests cover session races, direct insertion, overflow recovery, final chunks, track/analyser cleanup, format fallback, limits, cancellation, provider compatibility and deprecated model rejection.
- Model verification remains unchanged: `gpt-transcribe` is verified against current official sources; the account model lookup returned 200; SDK requests contain only `model` and `file`. Real AI SDK serialization is tested for WebM and MP4 with mocked provider responses.
- Browser verification used simulated capture/transcription on desktop and at 390px width. Confirm returned multilingual text directly to the existing draft with focus restored; no second editor or acceptance button appeared. Cancel preserved existing text. Retry recovered with the same recording, and Escape during transcription prevented a late insertion.
- Mobile capture has no horizontal overflow, no visible draft textarea behind recording controls, and two 44px touch targets. Its confirm circle remains visually 32px. The waveform shows changing fixture levels; production levels come from the microphone analyser. Keyboard focus uses fill changes without button rings.
- No real microphone was activated and no paid transcription was made during this UX verification. Manual checks remaining: actual capture and transcription on target Chrome/Safari devices, permission prompts, mobile backgrounding, and physical microphone disconnects. Mocks verify cleanup logic but cannot certify device codec behavior or recognition quality.
- The earlier production probe confirmed the then-existing `/test/audio` returned 404 and `/api/audio/transcribe` rejects a JSON body with 415. The server was stopped afterward. The current UX change does not alter either route or the backend.

No new infrastructure, database migration or dependency is required. Set the existing server OpenAI key, optionally set the transcription model, and use HTTPS outside localhost. Before a broad anonymous rollout, distributed rate limiting remains a separate deployment requirement.

## References

- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [GPT Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe)
- [Transcription API contract](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [OpenAI deprecation notices](https://developers.openai.com/api/docs/deprecations)
- [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Microphone permission and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## Shared maintenance

This is the authoritative Audio module guide. Update it in the same change as Audio or its integration behavior, following the [module maintenance contract](README.md#maintenance-contract).

- 2026-10-26: Moved the existing guide into the shared module documentation directory without changing the Audio implementation. The previous path remains a redirect.

- 2026-10-26: Corrected the deprecated transcription default, verified the new model and API contract, and added model-selection and override regression safeguards.

- 2026-10-26: Replaced the original review panel with direct dictation and measured waveform; desktop/mobile browser checks, lint, typecheck, 89 tests and production build passed.

2026-10-28 consumer copy audit: Configuration failures use Voice input is temporarily unavailable and offer typing. No model, credentials, recording limits or transcription behavior changed.

Consumer copy audit verification: lint, typecheck and 106 targeted tests passed. Rendered Explore and Trip details were checked; no live trip or file data was changed.
