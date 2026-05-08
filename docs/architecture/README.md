# Architecture Overview - Learning Indonesian

Progressive-disclosure reference. Start here, then follow the detail docs when you need implementation depth.

## [Current System Documentation](../current-system/README.md)

Start here for the capability-learning implementation handoff, the human product guide, and content pipeline quality gates.

## [Session Engine](session-engine.md)

The runtime session engine lives under `src/lib/session/` and `src/lib/pedagogy/`. Capability sessions use canonical capability rows, lesson-activation gates, posture-aware load budgets, and explicit exercise resolution.

## [Session Modes](session-modes.md)

The runtime `SessionMode` is `standard | lesson_practice | lesson_review`. The capability planner also has focus-mode budget concepts that are not active session modes unless explicitly wired into a capability session flow.

## [Exercise Types](exercise-types.md)

Exercise rendering is selected through capability contracts and `src/lib/exercises/exerciseResolver.ts`.

## [Content Pipeline](content-pipeline.md)

The capability-era content pipeline stages content units, lesson page blocks, capabilities, and exercise assets before publishing. Published capability rows remain draft/unknown until the promotion gate validates their contracts.

## [Data Model](data-model.md)

All app tables live in the `indonesian` Postgres schema. Capability-era scheduling uses `learning_capabilities`, `learner_capability_state`, `capability_review_events`, `capability_artifacts`, source-progress tables, and content-unit relationships.

## [FSRS Scheduling](fsrs-scheduling.md)

The capability path uses FSRS-style review state, scheduled by canonical capability row.

## [Feature Flags](feature-flags.md)

Build-time `VITE_FEATURE_*` flags and database exercise availability gates control rollout. Capability rows must still be ready/published before they can be scheduled.

## [Infrastructure](infrastructure.md)

Frontend-only React app deployed as a static container behind Traefik and backed by the shared Supabase instance at `api.supabase.duin.home`.
