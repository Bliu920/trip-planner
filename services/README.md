# Backend services

Services are grouped by responsibility. Assistant owns a public orchestration entry; Projects and Places are grouping folders whose individual modules keep their own entries.

```text
services/
  assistant/
    index.ts              Public chat and conversation HTTP entry
    request.ts            Scoped HTTP validation and conversation handlers
    turn.ts               Request preparation, heartbeat and reply persistence
    stream.ts             SDK response stream and independent drain
    agent/
      index.ts            Complete harness entry
      loop.ts             Execution, recovery and stop classification
      model.ts            One model/tool pass
      context/            History, attachments and dynamic instructions
      tools/              Checked application capabilities
      guides/             Trusted planning guidance
      actions/            Replay, outcomes and receipt verification
      authoring/          Semantic commands to artifact operations
      diagnostics/        Safe errors, provider facts and metrics
    conversation-store/   Message, reply and progress persistence
    progress/             Observable step reduction and display summaries
  projects/               Trip identity, generated titles and covers
  places/                 Catalog, message references, geo and feasibility
  plans/                  Itinerary persistence and manual edits
  budgets/                Budget persistence and price review
  documents/              Library files, versions and storage
  attachments/            Existing attachment HTTP adapter
  workspace/              Effective changes, publication and recovery
  audio-input/            Recorded speech transcription
  evaluation/             Isolated development scenarios
```

## Reading order

Start at assistant/index.ts, then turn.ts for an interaction and agent/loop.ts for its execution. Agent Context assembles history and instructions; Tools accesses the existing environment. Workspace owns drafts and publication. Conversation Store owns saved messages. Progress projects observable work without deciding whether changes saved.

Agent termination, artifact publication and reply persistence are separate outcomes. Turn waits for SDK onEnd and pending heartbeat writes before saving the final reply. Retry keeps the response identity but receives a new generation. No extra run table, event bus or context store is introduced.

## Boundaries

- App and evaluation chat callers use assistant/index.ts, not the internal model pass.
- Conversation Store accepts validated data, not HTTP requests. Progress receives persistence and emit callbacks.
- Stream handles SDK encoding and draining, not model work or database writes.
- Agent owns tools, reasoning context and recovery. It does not create HTTP responses or save chat replies.
- Projects and Places remain grouping folders; import their individual modules.
- Runtime guide loading and Next tracing use services/assistant/agent/guides/documents.
- Evaluation fingerprints the whole services/assistant tree. Tool-registration lint protection covers agent descendants.
- Existing wire names, SQL operations, frontend modules and domain ownership remain unchanged.

See [Agent](../docs/modules/agent.md) for the authoring contract and [module guides](../docs/modules/README.md) for maintained behavior.
