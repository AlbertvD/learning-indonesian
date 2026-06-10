# Current System Documentation

This folder documents what the `capability-learning-system-implementation` branch has built and why it is shaped this way.

It is intentionally different from the planning docs in `docs/plans/`. The planning docs explain the target architecture and implementation slices. These documents explain the current implemented system so a future coding session, reviewer, or human product owner can quickly understand the branch.

## Reading Order

1. [Capability System Handoff](capability-system-handoff.md)
   - Audience: a new coding session or AI agent.
   - Goal: understand the actual implementation, module seams, flags, current limitations, and safe next steps.

2. [Human Product and Learning Guide](human-product-and-learning-guide.md)
   - Audience: a human who wants to understand the app experience.
   - Goal: explain what the app does, how the learning engine works, what exercise types exist, how progression works, and how the learner experience ties together.

3. [Content Pipeline and Quality Gates](content-pipeline-and-quality-gates.md)
   - Audience: a future content-production session, linguist/reviewer, or developer extending publishing.
   - Goal: explain how content is staged, how capabilities and exercises are produced, which review roles exist, and how quality is checked before content becomes schedulable.

## Release Posture

The capability runtime is unified. `Session.tsx` always invokes `loadCapabilitySessionPlanForUser({ enabled: true, ... })`; the legacy migration flags that gated rollout (`VITE_CAPABILITY_REVIEW_SHADOW`, `VITE_CAPABILITY_REVIEW_COMPAT`, `VITE_CAPABILITY_STANDARD_SESSION`, `VITE_EXPERIENCE_PLAYER_V1`, `VITE_LESSON_READER_V2`) are no longer load-bearing and the runtime ignores them.

The one flag still consulted is `VITE_LOCAL_CONTENT_PREVIEW`, which enables the `/preview` routes — local review surfaces for visual/product iteration that do not replace publishing approved content into Supabase.

## Status snapshots

These are point-in-time architectural finding docs, named so future sessions don't re-investigate the same gaps:

- [Capability runtime vs data model gap](capability-runtime-data-model-gap.md) — 2026-05-21. Documents that the data model accommodates six source kinds and twelve capability types, but the runtime renders one source kind (`item`). 97% of capability rows are renderable; ~105 rows across pattern / dialogue_line / affixed_form_pair are projected-but-inert. Lays out the cost of closing each gap.
- [Page framework — adoption status](page-framework-status.md) — page-primitive adoption per surface.
- [Lesson content / audio migration status](lesson-content-audio-migration-status.md) — per-lesson migration state.
- [CEFR level rubric](cefr-level-rubric.md) — 2026-06-09. The BIPA/CEFR-aligned definition of the `level` field, keyed on affix sequencing (`ber-` at A1, productive `meN-` at the B1 threshold). The contract the per-lesson level assessment is graded against.

## Key References

- `CLAUDE.md` — project rules, conventions, and runtime invariants.
- `docs/target-architecture.md` — the locked-in module roster the codebase is migrating toward.
- `docs/current-system/modules/` — per-module specs (`capabilities`, `exercise-content`, `experience`, `lesson-renderer`, `session-builder`).
- `docs/adr/` — architecture decision records (0001 capability core through 0007 receptive-before-productive).
- `docs/process/content-pipeline.md` — the authoring + 2-stage publish pipeline.