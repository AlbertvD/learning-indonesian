# ADR 0006: Every Lesson-Derived Capability Has An Introducing Lesson

## Status

Accepted

## Context

[Decision 3 in `docs/plans/2026-05-10-capability-stage-spec-rewrite.md:243-251`](../plans/2026-05-10-capability-stage-spec-rewrite.md) introduced the rule that `learning_capabilities.lesson_id` is stamped *only* on morphology capabilities (`source_kind = 'affixed_form_pair'`), resolving a tie-break: an affixed form could be claimed by the lesson where the form appears, the lesson where the root was first taught, or the lesson where the morphology rule was introduced — Decision 3 picks the rule-introducing lesson.

Decision 3 did **not** state that vocab, grammar, dialogue, or cloze capabilities should be lesson-independent. The current implementation at `scripts/lib/pipeline/capability-stage/runner.ts:378-381` conditionally stamps `lessonId` only for `affixed_form_pair`; every other source kind is left at `null`. That null state is an *unfilled spec gap*, not a deliberate architectural choice.

A SQL sweep on 2026-05-17 turned up **1,613 of 2,649 `learning_capabilities` rows (61%) with `lesson_id IS NULL`**. The null rows degrade runtime behaviour in three concrete ways:

- **Planner activation gate** (`src/lib/session-builder/pedagogy.ts:209`) suppresses capabilities only when `capability.lessonId != null && !activatedLessons.has(...)`. NULL-lesson caps bypass the gate entirely — they surface in standard sessions regardless of which lessons the learner has activated.
- **Drying detector** (`src/lib/session-builder/builder.ts`, PR-B) matches `learningPlan.eligibleNewCapabilities.some(e => e.capability.lessonId === currentLessonId)`. NULL-lesson caps never match the current lesson, but they inflate the cross-lesson candidate count past the 70% suppression threshold — net effect: drying never fires.
- **Lesson-practice mode** filters by `selectedSourceRefs[]` (from `lesson_page_blocks`) instead of `lesson_id`, so it works *by accident* — the M:N exposure bridge is doing the job the 1-to-1 `lesson_id` column couldn't.

## Decision

Every **lesson-derived** capability has a non-null `lesson_id` equal to the lesson whose pipeline run projected it. Podcast capabilities are explicitly carved out (see "Podcast carve-out" below).

The unifying rule for the pipeline is simple: **a capability emitted by `runCapabilityStage` for lesson N has `lesson_id = N`**. Per-source-kind framing:

| Source kind | Introducing-lesson rule |
|---|---|
| `affixed_form_pair` (morphology) | The lesson that introduces the morphology rule (Decision 3, preserved — the runner is invoked per lesson and only morphology-introducing lessons project these capabilities) |
| `item` (vocab) | The lesson whose `learning-items.ts` staging file declares the item |
| `pattern` (grammar) | The lesson whose `grammar-patterns.ts` staging file declares the pattern (aligns with `grammar_patterns.introduced_by_lesson_id` already set at `projectors/grammar.ts:68`) |
| `dialogue_line` | The lesson that owns the dialogue (the staging file the line lives in) |
| `item`-derived `contextual_cloze` capability (Decision 5b emission) | Same as the dialogue's owning lesson (by construction — the projector runs per lesson) |
| `podcast_segment` / `podcast_phrase` | **NULL permitted via CHECK constraint** — see carve-out |

### Podcast carve-out

Podcasts are not lessons. `runCapabilityStage` is keyed on `lessonNumber`/`lessonId` and is not invoked for podcast staging. There is no existing podcast-to-lesson association.

The schema constraint admits podcasts as the documented exception. Instead of `NOT NULL`, the constraint (introduced in PR-4) is a CHECK that allows null *only* for podcast source kinds:

```sql
alter table indonesian.learning_capabilities
  add constraint learning_capabilities_lesson_id_required_for_lessons
    check (
      source_kind in ('podcast_segment', 'podcast_phrase')
      or lesson_id is not null
    );
```

If podcasts later acquire a lesson-affinity story, the carve-out narrows. For now, the constraint expresses the actual invariant: lesson-derived capabilities must have a lesson; podcast capabilities are allowed to be lesson-free.

### Defense in depth

Two gates enforce the invariant:

1. **Pipeline validator** (`scripts/lib/pipeline/capability-stage/validators/lessonId.ts`) throws synchronously before `upsertCapabilities` writes, naming the violating canonical_key. Catches authoring or projector regressions during development.
2. **DB CHECK constraint** (PR-4) refuses inserts/updates that violate the invariant. Catches anything that bypasses the pipeline.

## Consequences

- **Planner activation gate becomes correct for non-podcasts.** A learner who has only activated lesson 1 will see only lesson-1 capabilities as eligible new introductions, not the full cross-lesson pool.
- **Drying detector fires reliably.** With `lesson_id` populated on every lesson-derived cap, `currentLessonHasEligibleIntroductions` accurately reflects whether the current lesson has unintroduced material.
- **Schema enforces non-null for lesson-derived caps; podcasts remain null-tolerated.** The narrowing of the null contract is encoded in the CHECK constraint, not the column nullability.
- **M:N exposure bridge keeps its separate role.** `lesson_page_blocks.source_refs[]` continues to drive `lesson_practice` scope and per-lesson exercise-coverage counts. The 1-to-1 `lesson_id` becomes the primary signal for activation/gating; the M:N bridge stays the primary signal for exposure/revisit. The two roles complement, they don't compete.
- **`CAPABILITY_PROJECTION_VERSION` bumps to `'capability-v3'`** to mark the emission-semantics change. Re-projection (PR-3) restamps every cap with v3.
- **No change to FSRS scheduling.** Capabilities remain the schedulable unit per ADR 0003. Per-lesson `lesson_id` is metadata for the planner, not the scheduler.
- **Future authoring rule (PR-2):** each item is declared in exactly one lesson's staging directory; re-use is expressed via `lesson_page_blocks.source_refs[]`. The pipeline lint refuses to publish duplicate declarations across lessons. This authoring rule is the upstream fix; the schema constraint and the runtime validator are the downstream safety nets.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md)
- [ADR 0003: FSRS schedules capabilities, not content sources](./0003-fsrs-schedules-capabilities-not-content-sources.md)
- [Decision 3](../plans/2026-05-10-capability-stage-spec-rewrite.md) — the original morphology-only stamping rule (preserved as a special case of the new universal rule).
- [Decision 3b plan](../plans/2026-05-17-extend-decision-3-lesson-id.md) — the rollout plan in five PRs.
