# Architecture Overview - Learning Indonesian

Progressive-disclosure reference. Start here, then follow the detail docs when you need implementation depth.

## [Current System Documentation](../current-system/README.md)

Start here for the capability-learning implementation handoff, the human product guide, and content pipeline quality gates.

## [Session Engine](session-engine.md)

The legacy item queue lives in `src/lib/sessionQueue.ts`. The newer capability path lives under `src/lib/session/` and `src/lib/pedagogy/`. Capability sessions use canonical capability rows, source-progress gates, posture-aware load budgets, and explicit exercise resolution.

## [Session Policies](session-policies.md)

Four active policy layers transform the legacy queue after `buildSessionQueue` returns: exercise availability gating, grammar-aware interleaving, consecutive exercise-type cap, and queue trimming. Capability sessions use planner/composer gates instead.

## [Session Modes](session-modes.md)

The active legacy queue modes are `standard`, `quick`, and `backlog_clear`. Capability planning also has future focus-mode budget concepts, but these are not active legacy `sessionQueue.ts` modes unless explicitly wired into a capability session flow.

## [Exercise Types](exercise-types.md)

Exercise rendering is selected through capability contracts and `src/lib/exercises/exerciseResolver.ts` on the capability path, and through stage-based queue selection on the legacy path.

## [Content Pipeline](content-pipeline.md)

The capability-era content pipeline stages content units, lesson page blocks, capabilities, and exercise assets before publishing. Published capability rows remain draft/unknown until the promotion gate validates their contracts.

## [Data Model](data-model.md)

All app tables live in the `indonesian` Postgres schema. Capability-era scheduling uses `learning_capabilities`, `learner_capability_state`, `capability_review_events`, `capability_artifacts`, source-progress tables, and content-unit relationships.

## [FSRS Scheduling](fsrs-scheduling.md)

Legacy item skills and capability skills both use FSRS-style review state, but the capability path schedules by canonical capability row instead of collapsing multiple learner abilities into one item stage.

## [Feature Flags](feature-flags.md)

Build-time `VITE_FEATURE_*` flags and database exercise availability gates control rollout. Capability rows must still be ready/published before they can be scheduled.

## [Infrastructure](infrastructure.md)

Frontend-only React app deployed as a static container behind Traefik and backed by the shared Supabase instance at `api.supabase.duin.home`.
