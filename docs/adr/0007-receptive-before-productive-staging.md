# ADR 0007: Receptive-Before-Productive Staging Of Capabilities

## Status

Accepted

## Context

The runtime treats each `learning_capability` as an independent SR card. The planner (`src/lib/session-builder/pedagogy.ts`) walks ready+published+dormant capabilities, applies its suppression rules, and admits each that survives into the new-introduction pool — irrespective of whether other capabilities for the same `source_ref` exist and are also dormant.

For a vocabulary item like *apa kabar?*, the pipeline emits four renderable capability types: `text_recognition` (recognise the Indonesian form), `meaning_recall` (read it, recall the meaning), `l1_to_id_choice` (MCQ on the L1 → ID direction), and `form_recall` (type the ID form from the L1 cue). The first two are receptive; the latter two are productive. Under the prior planner behaviour, all four become eligible simultaneously the first time the item appears in a session. The learner is asked to *produce* the form within minutes of *first being shown it* — sometimes within the same session, sometimes within 30 seconds. A 36-hour audit on 2026-05-18 found 30.1% of reviews were part of a within-session repeat-group on the same `source_ref`, with the worst case being three different tests on *apa kabar?* in 31 seconds.

Two distinct phenomena were driving this:

1. **Simultaneous-form introduction.** All four capabilities for a freshly-activated word entered the new-introduction pool together; the planner walked them in input order and admitted each independently. No per-`source_ref` dedup or sequencing existed.
2. **Within-session retrieval clustering.** The composer concatenated due-pass + new-intro + practice-review blocks in macro order, but did not space same-`source_ref` blocks. Two retrievals of the same word within seconds aren't real retrieval practice — the answer is still in working memory (Karpicke 2009 on expanding retrieval).

Both issues are pedagogical: phenomenon (1) violates the receptive-before-productive principle (Nation's Four Strands, Krashen's Input Hypothesis); phenomenon (2) violates the desirable-difficulty / intervening-items principle.

## Decision

Two complementary mechanisms are introduced into the session-builder:

### Mechanism A — Staging gate (planner suppression rule)

A new suppression rule in `pedagogy.ts:planLearningPath`, inserted between the existing `recent_failure_fatigue` rule and the `isAllowedInSessionMode` check:

> For a candidate with `capabilityPhase(capabilityType) >= 3`, suppress as `productive_capability_not_unlocked` **unless** some sibling capability sharing the same `source_ref` has:
> - `activationState === 'active'`, AND
> - `stability >= 1` (in days), AND
> - `successfulReviewCount >= 1`.

The phase taxonomy is defined by an exhaustive switch over `CapabilityType`:

| Phase | Cognitive process | Capability types |
|---|---|---|
| 1 (receptive recognition) | input → "I know this" | `text_recognition`, `audio_recognition`, `podcast_gist` |
| 2 (receptive recall) | input → produce L1 meaning | `meaning_recall` |
| 3 (productive recognition) | L1 / cue → choose from options | `l1_to_id_choice`, `pattern_contrast` |
| 4 (productive recall) | L1 / cue → produce ID from memory | `form_recall`, `contextual_cloze`, `dictation`, `root_derived_recognition`, `root_derived_recall`, `pattern_recognition` |

Types that can render as both MCQ (Phase 3) and free-recall (Phase 4) exercises are conservatively placed at Phase 4 — the safer staging — at the cost of occasional over-restriction when the MCQ resolution fires. See `docs/plans/2026-05-18-capability-staging-gate.md` §3.1.

**Morphology carve-out.** `source_kind = 'affixed_form_pair'` is exempt from the gate. Morphology has no Phase 1+2 siblings (both `root_derived_recognition` and `root_derived_recall` are productive), so applying the gate would permanently orphan-suppress every morphology cap. The existing `prerequisiteKeys` chain (`root_derived_recall` requires `root_derived_recognition` to be satisfied) remains the within-pattern sequencing mechanism.

### Mechanism B — Block interleave (composer post-pass)

A greedy left-to-right post-pass in `compose.ts`, inserted after the three append loops and before the limit slice:

> For each block at position `i`, if any of the preceding `INTERLEAVE_WINDOW = 3` blocks share the same `block.renderPlan.sourceRef`, find the nearest later block with a different `sourceRef` and swap. Accept violations when no swap target is available (rare: end-of-queue, or all remaining blocks share a `source_ref`).

The macro three-pass order (due → new → practice-review) is preserved; the interleave performs only local swaps. `block.renderPlan.sourceRef` is read directly — no new fields are added to the composer input types or to `SessionBlock`.

## Consequences

- **A new word is introduced receptively before productively.** On first introduction, only Phase 1+2 caps for the word enter the session. The productive Phase 3+4 caps appear only after the receptive trace stabilises (typically one successful re-review the next day, when FSRS stability climbs past 1d).
- **Back-to-back retrievals of the same word are spread across the session.** Two same-`source_ref` blocks are never within 3 positions in the final ordering, unless the algorithm exhausts swap targets.
- **Newly-activated lessons surface marginally faster.** Lesson 1's dormant pool for a typical learner is ~50% productive caps; gating those productive caps means freshly-activated lessons (e.g. Lesson 2) compete with a smaller receptive-only backlog. Note: the adapter's input-order behaviour (caps returned without `ORDER BY` per `adapter.ts:262-268`) is the larger driver of new-lesson visibility; this ADR does not address that — see `docs/plans/2026-05-18-capability-staging-gate.md` §11.
- **Failed receptive caps stay locked.** If a learner repeatedly lapses on `text_recognition` for an item (`successfulReviewCount` stays at 0), the productive caps for that item never unlock. The system stops escalating difficulty on an unstable trace.
- **Morphology behaviour is unchanged.** The carve-out preserves the prior recognition→recall prerequisite chain.
- **Determinism is preserved.** Both mechanisms are deterministic functions of inputs. Same input → same output.
- **No DB writes; no schema changes.** Both mechanisms operate on data already projected through the adapter. The only type change is `PlannerLearnerCapabilityState.stability: number | null` to project the existing DB column through to the planner.
- **No `learning_capabilities` projection version bump.** `capability-v3` remains current; capability metadata is unchanged.

## Tuning levers

All thresholds are constants in `pedagogy.ts` / `compose.ts`:

- **Stability threshold (`>= 1d`)** — primary lever. Raise to `>= 2d` if productive caps feel too early; lower toward `>= 0.5d` if onboarding feels slow.
- **`successfulReviewCount >= 1`** — could raise to `>= 2` for stricter staging.
- **`INTERLEAVE_WINDOW` (`3`)** — raise for more spacing, lower for tighter sessions.
- **Phase boundary** — `l1_to_id_choice` could be demoted to a softer gate (count-only, no stability) if MCQ-from-L1 feels over-gated; needs a UX signal first.
- **Retrievability-based gating** — a follow-up could replace `stability >= 1d` with a retrievability-aware threshold (`retrievability >= 0.7` at session time). Requires projecting retrievability through the adapter or recomputing client-side. Out of scope for this ADR.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md) — the capability-as-SR-unit foundation this builds on
- [ADR 0003: FSRS schedules capabilities, not content sources](./0003-fsrs-schedules-capabilities-not-content-sources.md) — the stability field this gate consumes
- [ADR 0006: every lesson-derived capability has an introducing lesson](./0006-extend-lesson-id-to-all-capabilities.md) — the prior planner-gating mechanism that this rule layers on top of
- [Plan: capability staging gate + session interleave](../plans/2026-05-18-capability-staging-gate.md) — the architect-approved design document
