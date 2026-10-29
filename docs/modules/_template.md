# Module name

Status: proposed / implementing / verified locally / deployed (state the evidence).
Owner: feature responsibility, not a particular agent.
Last updated: YYYY-MM-DD.

## Purpose and boundary

User-facing purpose, owned responsibilities, exclusions, public entrypoints and dependencies. Explain how the module works independently.

## Information model

For every object: purpose, concrete fields, authoritative owner, relationships, initial state, storage form and independent loading boundary. Distinguish originals, references, historical snapshots and derived views.

## Lifecycle and interaction

User entrypoints, state transitions, normal operations, missing-information behavior, cancellation, retries, recovery and removal semantics. Separate durable states from transient operation errors.

## Public contracts and integrations

Exported API, HTTP or event contracts, callers, validation, errors and integration ownership. State invariants and concurrency/idempotency rules.

## Storage and access

Schema/migrations, object storage, access model, quotas, retention, cleanup and sensitive-data handling. Describe migrations from previous versions.

## Operations

Setup, environment variable names without values, migration/deployment steps, background jobs, diagnostics and recovery. Distinguish prepared code from applied infrastructure.

## Verification

Meaningful behavior tests and commands, observed results, manual/browser checks and unverified paths.

## Limitations and future work

Current limitations, explicit non-goals and separate proposals. Do not imply planned behavior is shipped.

## Change history

- YYYY-MM-DD: What changed, why, migration or integration impact, and verification.

## Maintenance

Update this guide in the same change as module or integration changes. Follow the shared [maintenance contract](README.md#maintenance-contract).
