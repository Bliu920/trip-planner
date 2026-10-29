# Module guides

This directory is the shared home for maintained, self-contained feature guides. Each guide describes the current implementation, its boundaries and the operational work needed to use it. Task files record temporary coordination; module guides remain useful after a task ends.

## Index

| Module | Guide | Status |
|---|---|---|
| Library | [library.md](library.md) | Implemented; migration and scheduler deployment pending |
| Plan | [plan.md](plan.md) | Implemented; hosted migration pending |
| Budget | [budget.md](budget.md) | Implemented; migration applied; live price research acceptance failed |
| Guiding documents | [guides.md](guides.md) | Implemented; automatic first guide and on-demand task guides |
| Agent | [agent.md](agent.md), [action results](agent-actions.md) | Implemented; durable action-state migration applied |
| Explore | [explore.md](explore.md) | Implemented; catalog imported and verified |
| Place references | [place-references.md](place-references.md) | Implemented; migration applied and verified |
| Markdown | [markdown.md](markdown.md) | Assistant reply formatting, verified locally |
| Work disclosure | [work-progress.md](work-progress.md) | Trailing preview, full history and saved elapsed time |
| Chat response | [chat-response.md](chat-response.md) | Centralized live progress and response layout |
| Project titles | [project-titles.md](project-titles.md) | Implemented; live model and local integration verified |
| Project header | [project-header.md](project-header.md) | Implemented and verified locally |
| Audio input | [audio-input.md](audio-input.md) | Implemented; original verification record preserved |

Use [the module template](_template.md) for new guides. Library, Audio input, Plan and Agent use this shared home. The old `docs/audio-input.md` path redirects here so existing task links remain useful. New module guides should be created here directly.

## Maintenance contract

Every change to a documented module must update its guide in the same change, including integration changes made outside the module directory. Record the behavior, contract, schema, operating requirement or limitation that changed. For an internal-only change, add a short dated entry explaining that public behavior is unchanged and record relevant verification.

Before editing a module:

1. Read its guide and check active ownership when coordination records are available.
2. Preserve its public boundary, or explain the boundary change in the guide.
3. Update current-state sections rather than appending contradictory descriptions.
4. Add a dated change entry and verification evidence. Separate local tests from live deployment checks.
5. Keep deployment prerequisites, known limitations and deferred proposals explicit.

A guide is documentation, not another runtime state store. Code, migrations and persisted data remain authoritative for execution. Do not copy credentials, uploaded contents, or complete raw conversations into guides. Link to neighboring guides for their responsibilities.

- [Locations and routes](geo.md): server positioning, private route evidence, hotel support and feasibility checks.
