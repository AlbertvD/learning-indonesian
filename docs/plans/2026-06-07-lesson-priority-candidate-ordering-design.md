---
status: approved
reviewed_by: [architect]       # round 2 APPROVED 2026-06-07; data-architect N/A (no schema — in-memory lessonOrder from already-read lessons.order_index)
implementation: null
related_issues: ["#166", "#125"]
related_commits: ["1e5be88"]   # pattern staging-gate carve-out (precondition)
---

# Lesson-priority candidate ordering — restoring the planner's prioritization stage

> **For Claude:** This is a **design spec (the WHAT/WHY)**, not an implementation task list.
> Implement only after `status: approved`. Touches the `session-builder` deep module's
> planner contract — ground every claim against `docs/current-system/modules/session-builder.md`
> and the code at the cited `file:line`.

## 1. Problem (grounded in live data, 2026-06-07)

For the author's account (`albert@duin.home`), new-capability introductions scatter across
lessons with no ordering. Measured per-lesson completion (practiced caps / total ready caps):

| Lesson | total caps | you practiced | % done |
|---|---|---|---|
| **L1** | 383 | **147** | **38%** |
| L2 | 410 | 3 | 1% |
| L3 | 425 | 7 | 2% |
| **L4** | 571 | **42** | 7% |
| L9 | 522 | **21** | 4% |

L1 is only 38% complete, yet 42 L4 caps and 21 L9 caps have already been introduced.

**Root cause (code-grounded).** The planner walks its candidate list in **raw DB row order**
and takes the first eligible caps until the budget fills (`pedagogy.ts:227-340`). There is no
lesson ordering. The module spec records this explicitly as a deliberate socket left open:

> *"The planner walks candidates in input order. The prior `orderedReadyCapabilities` priority
> sort was deleted in the fold … any future re-ordering should be a deliberate change with a
> product motivation."* — `session-builder.md:293`

A second, compounding effect (separately tracked): within any lesson, vocab outnumbers
grammar/cloze ~50:1 (L1 = 374 vocab vs 6 grammar + 3 cloze), so even with lesson ordering the
scarce grammar/cloze caps trail nearly all the vocab. This is the same family-starvation
diagnosed in **#166** (grammar/cloze never reach the learner) — the pattern hard-block half is
already fixed (`1e5be88`); this design fixes the budget-competition half.

## 2. Goal

A **deliberate, product-motivated** candidate-ordering policy for new introductions:

1. **Soft lesson priority.** Reach lower-lesson caps first; spill to lesson N+1 only when
   lesson N has nothing introducable *right now* (all done or still maturing behind the
   receptive-before-productive staging gate). Never stalls the learner on an empty session.
2. **Within-lesson family reservation.** Interleave a lesson's vocab / grammar / cloze so the
   scarce families surface alongside the vocab instead of trailing all of it.

Non-goals (YAGNI): difficulty weighting, weakness-targeting, cross-pass (due/practice) ordering,
strict lesson barriers, any new budget field, any schema change.

## 3. Design — decompose the planner into Gate → Prioritize → Allocate

Today `planLearningPath` tangles three concerns in one loop: gating, (accidental) ordering, and
budget capping. The robust solution separates them into three module-internal **pure functions**
— the module's own preferred form ("thin composition of pure functions"):

```
planLearningPath(input):
  const gated        = gate(input.readyCapabilities, state)   // existing suppression chain, lifted verbatim
  const prioritized  = prioritize(gated, ORDERING_POLICY)     // NEW first-class stage (restored concept)
  return allocate(prioritized, loadBudget)                    // existing maxNew* budget math, unchanged
```

- **`gate`** — the existing suppression-rule chain (`pedagogy.ts:232-311`: readiness, publication,
  lesson-scope, already-active, prerequisite, fatigue, **staging gate**, session-mode,
  lesson-activation). Lifted out unchanged; it now returns *all* gate-passing candidates plus the
  suppression list, and no longer also decides order or budget. Behaviour-preserving.
- **`prioritize`** — the **new** stage. A pure, deterministic comparator over gate-passing
  candidates implementing `ORDERING_POLICY`:
  1. `lessonOrder` ASC  (soft lesson priority — soft-spill falls out: a lesson with no
     gate-passing candidate contributes nothing, so the next lesson becomes lowest available)
  2. `rankWithinLessonFamily` ASC  (round-robin: vocab#1, grammar#1, cloze#1, vocab#2, … — the
     within-lesson family reservation, no tuning constant)
  3. stable family tiebreak (deterministic final order)
- **`allocate`** — the existing budget loop (`pedagogy.ts:312-340`), now consuming an explicitly
  ordered list. `maxNewCapabilities` / `maxNewPatterns` / `maxNewProductionTasks` /
  `maxHiddenAudioTasks` math is untouched; overflow still emits `load_budget_exhausted`.

**Why this is the robust shape, not a sort:** ordering becomes an intentional, independently
testable seam — restoring the `orderedReadyCapabilities` concept the module deliberately removed,
now under the product motivation its own invariant demanded. Future pedagogic ordering plugs into
`prioritize` without touching gates or budget.

### 3.1 Determinism & interaction with the composer

`prioritize` uses no clock/random — same inputs → same order, preserving the module determinism
invariant (`session-builder.md:286`). It governs **selection** (which caps win budget slots),
which is distinct from the composer's existing `interleaveBySourceRef` spacing pass
(`compose.ts:129`, Karpicke spacing) that orders the **already-selected** blocks. Selection bias
must live in the planner because the composer can only reorder what was selected.

**One real interaction to bound (architect catch).** The composer's spacing pass does *local
swaps* (window = 3, `compose.ts:129-149`) and then `blocks.slice(0, limit)` (`compose.ts:121`).
A swap near a lesson boundary could in principle pull an L2 block forward past an L1 block and,
combined with the slice, drop a just-past-the-boundary L1 cap. This is bounded to a non-issue in
practice: once selection is L1-first, L1 fills the budget, so there are few/no L2 blocks in the
selected set to swap forward. The acceptance bar (§6) therefore asserts on the **final composed
`SessionBlock[]` (post-interleave, post-slice)** being L1-first, not merely the planner output —
pinning the property the learner actually sees, not just the selection-stage intermediate.

### 3.2 Scope of effect

Only **pass 3 (new introductions)** is affected (`builder.ts:305-329`). Due reviews (pass 1) and
lesson-scope practice (pass 2) are lesson-agnostic and unchanged — lesson priority governs only
*new* material. In `lesson_practice`/`lesson_review` the candidate set is already single-lesson,
so the policy is a no-op there.

### 3.3 Expected behaviour (staging-gate interaction)

Early on, the staging gate makes only L1 *receptive* vocab eligible → lesson-major ordering gives
pure L1 receptive vocab. Once L1 vocab matures (≥1d stability + a success), L1 productive vocab +
grammar + cloze unlock together and the family round-robin interleaves them — still ahead of L2
because lesson order is primary. Net learner experience: **work through L1 (vocab → mixed
grammar/cloze) before L2 bleeds in**, with soft-spill to L2 only on a slot that L1 cannot fill
that day. This is exactly the author's stated goal.

## 4. Data / contract changes

- Add `lessonOrder: number | null` to `PlannerCapability` (`pedagogy.ts:10-25`). Null ⇒ podcast /
  null-lesson caps ⇒ sort last (`Infinity`).
- Populate it in `adapter.ts:toPlannerCapability` from a `lessonId → order_index` map built off
  the **lessons rows the adapter already loads** for `deriveLessonProgression`
  (`session-builder.md:135`, `adapter.ts:243`). **No new query.**
- One `capabilityFamily(sourceKind) → Family` helper — single source of truth for the round-robin
  axis. **Family keys on `source_kind` alone, NOT on `capability_type`** — this is the load-bearing
  taxonomy decision. `capability_type` is the wrong axis: `contextual_cloze` attaches to both
  `item` (vocab cloze, `source_ref learning_items/<slug>`) and `dialogue_line`
  (`source_ref lesson-N/section-M/line-K`) — `pedagogy.ts:276-283` — so a type-keyed partition is
  ambiguous, whereas `source_kind` is a clean total axis. The mapping is **exhaustive over
  `CapabilitySourceKind`** (`capabilityTypes.ts:5-11`), enforced with an exhaustive `switch` or
  `as const satisfies Record<CapabilitySourceKind, Family>` so a new source kind fails compilation
  here (matching the module's existing `capabilityPhase` / `CAPABILITY_DISPLAY` exhaustiveness
  discipline, `pedagogy.ts:149`, `labels.ts:79`):

  | `source_kind` | `Family` | Notes |
  |---|---|---|
  | `item` | `vocab` | the 6 core item types; an `item`-kind `contextual_cloze`, if re-emitted (#167), is vocab — **intended**: item-cloze (vocab stream) and dialogue-cloze (cloze stream) deliberately interleave separately, since they are different content sources despite sharing a `capability_type` |
  | `dialogue_line` | `cloze` | the 85 ready dialogue cloze caps |
  | `pattern` | `grammar` | grammar pattern caps (now unblocked by `1e5be88`) |
  | `affixed_form_pair` | `morphology` | morphology; its own stream so it interleaves separately |
  | `podcast_segment` | `podcast` | gated out before `prioritize` (exposure-only); bucket exists for totality |
  | `podcast_phrase` | `podcast` | gated out before `prioritize` (`isAllowedInSessionMode`); totality only |

  `Family = 'vocab' | 'cloze' | 'grammar' | 'morphology' | 'podcast'`. `rankWithinLessonFamily`
  is then computed per `(lessonOrder, Family)` group. This **replaces** the scattered `isPattern()`
  (`pedagogy.ts:96-103`) + dialogue/cloze predicates as the single family axis; `isPattern` remains
  only where it gates the *budget* (`maxNewPatterns`), which is a separate concern from the ordering
  family and is left untouched.
- `gate` / `prioritize` / `allocate` are module-internal. `planLearningPath`'s signature and the
  `LearningPlan` return shape are **unchanged** — every consumer (`builder.ts`, tests) is untouched.

## 5. Spec & invariant updates (same commit as code)

- Rewrite `session-builder.md` §3.3 from "suppression-rule engine, walks in input order" to the
  Gate → Prioritize → Allocate pipeline.
- **Replace** the §4 invariant at `session-builder.md:293` with its successor, **scoped** so a
  future reader does not expect ordering where it is a no-op: *"New-introduction candidate ordering
  (pass 3 only) is deterministic and lesson-major with within-lesson family round-robin
  (`ORDERING_POLICY`). It applies only when the candidate set spans more than one lesson — i.e.
  `standard` mode; it is a no-op in `lesson_practice`/`lesson_review` (single-lesson sets) and
  never affects the due (pass 1) or practice-review (pass 2) passes. This is the
  `orderedReadyCapabilities` concept deliberately restored under product motivation #166/#125 — the
  re-ordering the prior invariant required to be explicit and motivated."*
- Partially resolve the §6 limitation "composer fill ordering is flat three-pass"; cross-link
  #166 + commit `1e5be88`.

## 6. Testing

- **`prioritize` unit tests — NET-NEW and load-bearing** (pure): lesson-major ordering; soft-spill
  (L2 appears only when L1 has no gate-passing candidate); family round-robin interleaves
  grammar/cloze among vocab; `morphology`/`podcast` families bucket correctly; null-lesson sorts
  last; determinism. **This is the gate for the whole change** — note that the existing suite at
  `src/__tests__/pedagogyPlanner.test.ts` asserts eligible *membership* only, via order-insensitive
  `.toContain` / single-element `.toEqual` (e.g. lines 182, 214, 291, 439, 467), so it has **no**
  multi-candidate ordering assertion and would pass even if `prioritize` were a no-op. The ordering
  contract is therefore not covered by any existing test and must be added here.
- **Planner→compose integration test** reproducing the real scatter: fixture with L1 partially done
  + L2–L9 dormant ⇒ the **final composed `SessionBlock[]`** (post `compose`, post interleave +
  slice) is all-L1 with grammar/cloze interleaved, never an L4/L9 block, until L1 is exhausted.
  Asserting on the composed blocks (not just `planLearningPath` output) closes the §3.1 swap+slice
  interaction.
- **`gate`/`allocate` characterization tests**: the lift-out is behaviour-preserving for *these two
  stages* — the existing `src/__tests__/pedagogyPlanner.test.ts` suppression-reason assertions must
  stay green unchanged (they exercise `gate` + `allocate`, not ordering).
- **Live re-probe** of `albert@duin.home` post-deploy: confirm sessions become L1-first.

## 7. Supabase Requirements

### Schema changes
- New tables / columns — **N/A.** No DDL. `lessonOrder` is an in-memory field derived from
  `lessons.order_index`, which is already read.
- RLS policies — **N/A.** No new table or access path.
- Grants — **N/A.**

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema/table).
- [ ] Kong CORS — **N/A.**
- [ ] GoTrue — **N/A.**
- [ ] Storage — **N/A.**

### Health check additions
- `scripts/check-supabase.ts` — **N/A** (no API/contract change).
- `scripts/check-supabase-deep.ts` — **N/A** (no structural change). Ordering correctness is
  covered by the unit/integration tests in §6, not a DB health check.

## 8. Review gating

- **`architect`** — REQUIRED. Module placement, the Gate→Prioritize→Allocate seam, and the
  restored-ordering invariant are squarely its lens.
- **`data-architect`** — **N/A.** No schema, no migration, no typed-table writer/reader/validator
  contract change; the only new value is an in-memory field derived from an already-read column.
  Recorded here per the CLAUDE.md dual-sign-off rule's "mark N/A with a one-line reason" clause.
