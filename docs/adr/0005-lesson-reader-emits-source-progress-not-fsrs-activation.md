# ADR 0005: Lesson Reader Emits Source Progress, Not FSRS Activation

## Status

Superseded by retirement #6 (shipped 2026-05-07).

The reader is now fully passive: source-progress emission was removed along with the `learner_source_progress_*` tables and functions. The renderer composes lesson page blocks and bridges to practice, but it does not emit events or activate FSRS. The capability-system module specs are the current authority — see `docs/current-system/modules/lesson-renderer.md` §3.

The original decision is kept below as the historical record.

## Context

Lessons derived from book content should feel web-native and should prepare learners for practice. But reading a lesson is not the same as committing a review or activating a memory trace.

## Decision

The Lesson Reader emits source progress events such as opened, section exposed, intro completed, heard once, pattern noticing seen, guided practice completed, and lesson completed. It may link to capability keys for practice bridges, but it does not directly activate FSRS review.

## Consequences

- Pedagogy Planner can use lesson progress to decide eligibility.
- Review Processor remains the activation/write owner.
- Lesson UI can improve independently from scheduling and review logic.
