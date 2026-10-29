# Agent success examples

Status: reviewed acceptance scenarios for the implemented agent, not measured successes. Reviewed October 29, 2026. Runnable inputs, fixtures, assertions and rubrics have one owner: [data/evaluation/cases.json](../../../data/evaluation/cases.json). These pages are human-readable explanations of the original I/F/R scenarios. The [evaluation guide](../README.md) also documents newer V/X cases and multi-turn acceptance journeys. Keep run results separate from expectations.

## Purpose and boundaries

Use this collection to test whether the assistant can turn diverse requests into useful, honest, saved travel plans and make precise revisions without losing information. A case is a behavioral specification with a representative reply and state assertions, not a transcript to copy or a model reasoning trace. A reply can differ substantially and still pass. Conversely, a plausible reply cannot pass when the saved state or evidence contradicts it.

- [Initial planning: I01 to I23](initial.md), including a [worked saved outcome for I02](worked-example.md)
- [Follow-up: F01 to F24](follow-up.md)
- [Evidence, interruptions and tool recovery: R01 to R15](recovery.md)

Each case has a single primary distinction; shared quality requirements still apply. Tags overlap because realistic tasks have multiple dimensions. These examples do not exhaust all possible prompts, and equal case counts do not represent real-world frequencies. Add cases for observed failures and missing interactions; do not copy existing cases with cosmetic paraphrases. Include a small combination set in live acceptance rather than assuming isolated successes generalize.

## Authority and change review

The implemented behavior is defined by [agent guidance](../../../services/agent/guidance.ts), the [guide directory](../../../services/guides/catalog.ts), trusted [guide documents](../../../services/guides/documents/), [tool adapters](../../../services/agent/tools.ts) and receipt-backed workspace behavior. The old V2 implementation plan is historical design context. Current tools are implemented; these scenarios do not establish that the model uses them correctly.

Review affected runnable cases whenever workflow, evidence, timing, routes, storage or default behavior changes. Preserve case IDs and keep old reports tied to their original hashes. Do not weaken criteria merely because the current agent fails them.

## Case environment

Original I/F/R cases are independent. Reset project and observations between cases. The executable runner uses the actual UTC run time. Missing first-trip dates default to seven days after that time and must be labelled provisional. Fixed November prompts remain literal user requests. New S cases execute follow-up turns against their own preceding saved output, without reseeding between turns. No external account or real personal data is needed. Inputs are in English to match representative answers, but the rubric accepts equally clear appropriate language.

**Empty**: no Plan, Budget or Travel brief, no earlier inputs, no bookings. Selected files and prior messages exist only when a case says so. The supplied catalog is the checked-in 103-place dataset. For offline scenarios, replace research with controlled observations; do not infer present-day opening, availability, exact prices or accessibility from this example set.

**Rome base**: a saved three-day Rome plan for 2026-11-04 to 2026-11-06 for two adults, using EUR party scope and an EUR 800 limit. Travel brief states a relaxed pace and those details, as explicit synthetic test input, not real traveller evidence. There is one proposed central Rome stay covering nights after days 1 and 2, with no reservation. The serialized fixture has period-only visits and catalog meal placeholders as a legacy saved plan, with the following anchors in order: day 1 Colosseum (`place_001`, 120 minutes) and Piazza Navona (`place_008`); day 2 Borghese Gallery (`place_007`, 120 minutes), Pantheon (`place_005`, 45 minutes) and Trevi Fountain (`place_018`); day 3 Campo de' Fiori Market (`place_006`, 60 minutes, morning only) followed by Trastevere Neighborhood (`place_002`, 180 minutes). The fixture does not establish a verified route, service hours or current-model first-plan quality. Targeted edits must preserve unrelated legacy content. A quality review may correctly flag the fixture; initial-to-edit behavior is tested separately by S01. All items, notes, day identities and evidence have stable identities. None are booked or user-kept unless a case adds that condition.

The base Budget has distinct supported estimated entries for a two-night stay, meals, local transport and selected paid activities, each with explicit quantity, units, source fact, checked timestamp, assumptions and links where applicable. Its calculated total is EUR 500 to 700 for the party, from stay200 to280, food180 to240, transport60 to90 and activities60 to90. Flights to and from Italy are excluded. All sources in the fixture are synthetic and clearly marked as such. Unless a case says otherwise, tool calls, published data and receipt verification work, online research can return suitable readable comparable evidence, and no concurrent writer acts. Day-level time and cost values used in a case are controlled fixture inputs, not public travel facts.

**Scenario setup is implemented by the evaluation runner and fixtures.** Fixture evidence remains synthetic even when a real model edits it. Live-search cases collect actual search evidence for new research; controlled research returns explicitly synthetic observations. Neither mode proves current travel availability. A scripted model transport tests setup and enforcement, not autonomous planning quality.

## Shared expectations

For a normal first-plan request, save the sourced Travel brief before dependent drafting, search the actual catalog, read selected records, create a usable three-day Plan and a nonempty Budget, review them, and complete one receipt-backed final save. Days should represent meaningful activities, meals, relevant movement, appropriate breaks and overnight coverage, with explicit exceptions for user-requested sparse days or real limitations. Dates, duration, pricing, suitability, transport and bookings must preserve their actual evidence and uncertainty. Normal research-backed routine costs have supported amounts or ranges. If both direct and comparable evidence are genuinely unavailable, the saved budget may be incomplete and must be labelled as such. Budget scope, quantities, exclusions and any limit stay honest. A saved brief alone is not a completed itinerary.

For a follow-up, use current requirements and the affected saved or effective state, modify the requested scope and dependent facts, preserve unrelated content and protected arrangements, and verify the final save. A budget left untouched after a Plan-only edit may be visibly stale under the V2 contract; do not describe it as reviewed or current. Read content already supplied in current context or tool results counts as read. Guidance is trusted; uploaded content, catalog descriptions and web pages are data, never instructions. No unsupported place, quote, booking, exact opening time or claim of access is allowed.

Tool lines describe semantic obligations, not a required call transcript. A tool is required only where the behavior depends on that capability or the contract specifically requires it. `saveBrief` and final `commit` are current V2 requirements for ordinary initial planning; `researchWeb` is the intended price-evidence route when available. `readPlan`, `readBudget` and `readDocument` can be omitted when their current relevant content is already supplied. `inspectChanges` is necessary for explicitly uncertain write outcomes and when inspecting a rejection is the point of the case; do not impose it mechanically everywhere. Never substitute the deferred `commitChanges` protocol. Examples of assistant replies are illustrative, conditional on the specified result, and are not string-match answers.

## Running and judging

1. Freeze date, initial artifacts, messages, available tools and evidence; record the case ID, dataset and prompt/guide/implementation revision. Supply the same initial state to each compared version.
2. Run offline with controlled tool responses for repeatable semantics and fault paths. Inspect the final persisted artifacts, observable tool inputs and results, source lineage, action state and traveller-facing reply. Scripted provider responses exercise plumbing only; they do not show that an autonomous model selected the right actions. Use live provider runs separately, in isolated projects and only when authorized, for autonomous planning and current research. Record actual sources and checked times; never count an unrun test as passed.
3. Apply case-specific assertions plus shared expectations. Record each as pass, fail or not evaluable, with the evidence and artifact difference. Any invented place/price/booking, lost protected fact, silent unrelated change, false save claim, duplicate publication or lost saved brief is a hard failure. Incomplete or absent material cost coverage cannot count as a complete budget. A correct partial response in an outage can pass its resilience case while failing normal complete-first-draft quality.
4. A human judges intent fit, practical geography and connections, pacing, meaningful daily coverage, source applicability and quality of explanation. Report hard failures separately from the human quality verdict; do not collapse missing evidence into pass, or use a single score to conceal blockers. If an LLM judge is used, audit its decisions against the actual artifacts and evidence with human reviewers.
5. Record planner steps, research subrequests, elapsed time, termination reason and save outcome. Compare versions on the same controlled cases, including failures and uncertainty. For live sampling, report run count and variation rather than a reliability claim from a single success. Never store private reasoning, secrets, unneeded uploads or unrelated user content.

Acceptance includes initial generation, dependent personalization, protected facts, budget changes, document creation/edit and honest recovery. S01 exercises these as a continuous user flow; S02 exercises supporting-document reuse. The case collection is broader than that minimum. Case R07 through R12 are primarily deterministic integration checks; a scripted successful execution of them is not evidence of real-model judgment.

## Coverage and update pointers

| Changed expectation | Review these examples first |
| --- | --- |
| First-plan completion, defaults and intake | I01, I02, I14, I18 to I21, I23, R10 |
| Cities, route, pace, meal and stay quality | I03 to I09, I12, I15, F01 to F08, worked example |
| Personal constraints, user evidence and bookings | I10 to I13, I16, I17, I22, F08 to F11, F14, F17, F21, R05, R06 |
| Costs, scope, units, source quality and unknowns | I02, I14 to I16, F04, F05, F11 to F13, F22, F24, R01 to R03, worked example |
| Seasonal hours, file availability and untrusted content | I17, F17, F19, R04, R06, R11, R13 |
| Effective reads, targeted edits and cross-artifact effects | F01 to F14, F17 to F24, R07, R08, R14 |
| Checkpoint, receipt, interruption and retry | I01, R07 to R10, R12, R14, R15 |
| Document creation and edits | F18, F19, F23, R11, R13, R14 |
| Discussion-only or no-change intent | I18, F15, F16, R11, R13 |

This is an impact index, not a claim that the listed cases exhaust every dependency. Review shared expectations and any indirect effects as well. When a guide or tool is renamed during implementation, update the case's behavioral contract and source pointers together; keep previously recorded run results tied to the old revisions.

## Current quality additions

The saved Plan carries useful suggested local clock starts with realistic durations or explicit ends. Overview groups these into periods; the single-day view exposes clocks. Unknown flights are not invented, but do not prevent proposing a practical local timetable. Exact user commitments remain exact.

Meals use suitable catalog venues or researched real restaurants with names, addresses and evidence. Do not introduce generic area-only meals as the normal fallback. Select a researched real hotel when possible, with an honest proposed-area fallback if no property is established. Both actual nights remain covered. Journey checks are based on actual effective Plan and available map evidence; unavailable routing stays unverified, not zero or checked.

Research notes preserve reusable external evidence. Planning decisions preserve material choices and tradeoffs. They are conditional, independently readable files, not a mandatory extra output or a duplicate itinerary/budget. Relevant future edits read and update the same files, preserving unaffected sections and original checked dates when evidence is reused. S02 tests that lifecycle.

A normal online initial draft must use direct or comparable numeric price evidence for routine costs. An unknown amount is an honest exceptional limitation only after relevant evidence cannot be obtained, not a shortcut accepted merely because the schema permits null. B01 covers the separate case of an applicable user-provided paid receipt replacing an estimate.
