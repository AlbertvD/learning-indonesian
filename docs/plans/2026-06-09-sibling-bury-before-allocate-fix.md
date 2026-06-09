---
status: shipped
reviewed_by: [architect]
data_architect: N/A — read-only planner logic; no schema/migration/grant/writer-reader-validator change (same posture as the original sibling-burying plan)
implementation: fix/sibling-bury-before-allocate
merged_at: 2026-06-09
implementation_paths:
  - src/lib/session-builder/siblingBury.ts        # partitionBuried
  - src/lib/session-builder/pedagogy.ts           # usedSourceRefs + bury before allocate + sibling_buried
  - src/lib/session-builder/builder.ts            # pass usedSourceRefs; remove post-hoc bury
  - src/__tests__/pedagogyPlanner.test.ts
  - src/__tests__/capabilitySessionLoader.test.ts
supersedes: []
amends: docs/plans/2026-06-09-sibling-burying-design.md
grounded_against:
  - docs/target-architecture.md (lib/session-builder LOCKED)
  - docs/current-system/modules/session-builder.md
  - src/lib/session-builder/pedagogy.ts (planLearningPath, gateCandidates, prioritizeCandidates, allocateBudget)
  - src/lib/session-builder/builder.ts (loadCapabilitySessionPlan — post-hoc bury at :344)
  - src/lib/session-builder/siblingBury.ts (buryThinSiblings)
---

# Sibling-burying runs before budget allocation; session-size is the contract

## Operating Context

Build-stage, single learner. Read-only session-builder logic — no schema, no
migration, no writer/reader change. Pure pipeline-ordering fix.

## 1. Problem (diagnosed 2026-06-09, live, user `7eaacda5` = Albert)

"No cards to practice" despite **10 active lessons**. Verified by a headless
planner run against live data:

- `dueCount = 0` (the FSRS short-term-step fix, PR #184, parks "Good" reviews
  ~6 days out — nothing due today).
- `planLearningPath` returns **15 eligible** new introductions — but **all 15 are
  productive siblings of the 26 words reviewed *earlier today*** (early-lesson
  words rank highest in `prioritizeCandidates`' lesson-order sort).
- `buryThinSiblings` then drops all 15 (their `source_ref`s were used today) →
  **0 survivors** → diagnostic `learning_pipeline_drying_up`, **0 blocks**.
- Meanwhile **545 eligible no-prerequisite new-word entry caps**
  (`text_recognition`) sat just below the 15-slot budget cutoff (tagged
  `load_budget_exhausted`) and were **never reconsidered**.

An empty session does **not** mean prerequisites are exhausted: each word's
`text_recognition` entry cap has **no** prerequisite; only its siblings are gated
behind it (correct gating). There is a large supply of introducible new words;
they just never get a turn.

## 2. Root cause

`buryThinSiblings` is applied **after** budget allocation. The pipeline is:

```
gateCandidates → prioritizeCandidates → allocateBudget(top N=preferredSessionSize)   [pedagogy.ts]
  → buryThinSiblings(those N)                                                          [builder.ts:344]
```

An order-dependent **suppression** filter running **after** a fixed-size budget
allocation can only *shrink* the result — the slots it frees are never
backfilled from the next-ranked survivors. When the top-N are all buryable, the
session collapses to zero even with hundreds of eligible candidates waiting.

> **General lesson** (logged: deployment-lesson `a262d9e9`,
> `memory/project_sibling_bury_after_budget_bug.md`): a suppression/dedup/spacing
> filter that can remove candidates must run **before** (or be folded into) a
> fixed-size allocation, never as a post-allocation trim.

## 3. The contract

**`preferredSessionSize` is a hard target, not a ceiling on a pre-bury pool.**
The builder fills to `preferredSessionSize` from non-suppressed candidates;
sibling-burying only **reorders / deprioritizes** (defers a word's extra siblings
to a later day), it **never starves** the session. With material available
(due reviews, gate-passing new caps), a standard session reaches its size.

This refines — does not revoke — the original burying rule
(`docs/plans/2026-06-09-sibling-burying-design.md` / CONTEXT.md → Sibling
burying): "≤ 1 cap per `source_ref` per day" still holds (a word touched today
won't reappear today), but it is applied at the candidate-selection stage so the
freed slots fill with *other* words.

## 4. Fix

Move burying **into `planLearningPath`, between `prioritizeCandidates` and
`allocateBudget`**, and delete the post-hoc bury in `builder.ts`.

> **Cross-pass invariant (the load-bearing part — do not break it).** The shipped
> feature threads **one** mutable `usedRefs` set through three passes *in priority
> order* — due (`builder.ts:261`) → practice (`:294`) → new (`:344`) — each pass
> mutating it. So a `source_ref` claimed by a **due or practice review selected in
> *this* build** buries the matching new-intro sibling: a word reviewed-as-due
> today cannot also be introduced today. `snapshot.reviewedTodayRefs`
> (`adapter.ts:279`) covers only **prior** sessions' reviews — it does **not**
> contain the current build's due/practice picks. The fix must preserve the full
> accumulation, or the same word surfaces twice in one session (active/due
> `meaning_recall` + dormant `text_recognition` is the normal staging shape, not an
> edge case).
>
> **This is straightforward because `planLearningPath` is already called at
> `builder.ts:336`, AFTER the due (`:261`) and practice (`:294`) passes have run
> and mutated `usedRefs`.** So at the call site, `usedRefs` already =
> `reviewedTodayRefs ∪ due-picks ∪ practice-picks`. We pass that accumulated set
> into the planner.

### 4.1 `pedagogy.ts`
- Add `usedSourceRefs?: ReadonlySet<string>` to `PedagogyInput` — the bury seed:
  `source_ref`s already spoken-for today = prior-session reviews **∪ this build's
  due + practice selections** (NOT just DB-reviewed-today; named accordingly so
  the accumulation is explicit).
- In `planLearningPath`, after `prioritizeCandidates`:
  ```ts
  const usedRefs = new Set(input.usedSourceRefs ?? [])
  const { kept, buried } = partitionBuried(prioritized, cap => cap.sourceRef, usedRefs)
  const { eligible, suppressed: budgetSuppressed } = allocateBudget(kept, loadBudget)
  // buried → suppressedCapabilities with reason 'sibling_buried'
  ```
  `PlannerCapability.sourceRef` is a non-nullable `string` (`pedagogy.ts:16`), so
  the key fn `cap => cap.sourceRef` never returns undefined here. Buried caps are
  recorded in `suppressedCapabilities` with a new `PlannerReason` value
  **`sibling_buried`** (diagnostics parity), replacing the silent post-hoc drop.
- Add `partitionBuried` to `siblingBury.ts` (returns `{ kept, buried }`) so the
  buried set is observable — preferred over reusing `buryThinSiblings` and diffing
  (less code, nothing dropped silently). `partitionBuried` keeps `buryThinSiblings`'
  semantics (first-per-`source_ref` wins, walking *prioritized* order so the
  highest-priority sibling of a not-today word is kept).

### 4.2 `builder.ts`
- **Keep** the due (`:261`) and practice (`:294`) passes exactly as they are —
  they still seed `usedRefs` from `input.reviewedTodayRefs` (`:257`) and mutate it
  for their own within-pass dedup **and** the cross-pass priority threading. This
  is what guarantees due-beats-practice-beats-new for a contested word.
- **Pass the accumulated `usedRefs`** (live at `:336`, after both passes) into the
  planner as `usedSourceRefs`. No new accumulation logic — the set is already
  built.
- **Delete only the post-hoc new-intro bury** (`:344`): consume
  `learningPlan.eligibleNewCapabilities` directly (now already bury-filtered +
  budgeted inside the planner). The builder no longer needs `sourceRefOfKey` for
  the new pass (the due/practice passes still use it).

### 4.3 Behavior after the fix (same live inputs)
Burying removes the 26 today-word sibling groups from the *prioritized pool*
before allocation; `allocateBudget` then fills 15 slots from the next-ranked
survivors — the new-word entry caps + productive siblings of **not-today** words.
Session reaches **15 cards**, none of them a word already done today. The
`learning_pipeline_drying_up` diagnostic stops firing because
`goodCandidateCount` (= due + post-allocate eligible) is now full.

## 5. Non-goals / preserved behavior

- **Hard pedagogical gates stay**: readiness, publication, lesson-activation,
  prerequisites, receptive-before-productive staging. The fill never crosses
  them (per the user's "keep hard gates" intent). A productive cap still never
  precedes its receptive sibling; a prereq-locked word stays locked.
- **Due reviews are not buried** (you always review what's due); burying applies
  only to the new-introduction candidate pool, as today.
- **Cross-day, not reschedule**: a buried sibling is still just *not offered
  today*; no FSRS/state write (unchanged from the original rule).
- **Review-ahead** (pulling not-yet-due reviews forward) is **out of scope** —
  with the bury-ordering fix the new-intro supply already fills the session for
  the foreseeable backlog; if a learner ever exhausts *all* gate-passing new caps
  AND has 0 due, that is genuine "activate the next lesson" territory (the
  drying diagnostic), not something to paper over with early reviews.

## 6. Tests

- **Planner unit (`pedagogy.test.ts`)** — the bug's direct regression: given
  `dueCount=0`, `usedSourceRefs` = the source_refs of the top-`preferredSessionSize`
  prioritized candidates, plus ≥ size *not-today* candidates ranked below them →
  assert `eligibleNewCapabilities.length === preferredSessionSize`, none are in
  `usedSourceRefs`, and the buried ones appear in `suppressedCapabilities` with
  reason `sibling_buried`.
- **Planner unit**: ≤ 1 eligible per `source_ref` (within-batch dedup preserved by
  `partitionBuried`).
- **Builder integration (`builder.test.ts` / `capabilitySessionLoader.test.ts`)**:
  full `loadCapabilitySessionPlan` with the above shape → `blocks.length ===
  preferredSessionSize`, no `learning_pipeline_drying_up`.
- **Cross-pass regression — KEEP at the builder layer** (do NOT move): the existing
  assertions at `capabilitySessionLoader.test.ts:640-659` (due sibling kept;
  today-reviewed word fully buried) validate the due/practice→new threading the
  §4.2 invariant depends on — they exercise the due pass, which is **not** moving.
  **Add** a new builder-integration case: a word with an **active/due**
  `meaning_recall` sibling **and** a **dormant** `text_recognition` new sibling →
  exactly **one** block for that word (the due review; the new cap is buried by the
  due pass's `usedRefs` mutation, now surfaced to the planner via `usedSourceRefs`).
  Without this test the cross-pass regression could ship green.
- **No planner-layer "undefined sourceRef" test**: `PlannerCapability.sourceRef` is
  non-nullable (`pedagogy.ts:16`), so the fail-open branch is unreachable in the
  planner. Podcast `podcast_phrase` caps are already gate-suppressed
  (`pedagogy.ts:180`) and `podcast_segment` carries a real `source_ref`; the
  builder's due/practice key fns (`capabilitiesByKey.get(...)?.sourceRef`) keep the
  fail-open path where it can actually be `undefined`.

## Supabase Requirements

- **Schema changes**: N/A — read-only planner logic, no tables/columns/RPC.
- **RLS / grants**: N/A.
- **homelab-configs**: N/A.
- **Health checks**: N/A (no DB-observable change; covered by unit + integration
  tests).

## Plan grounding

- `lib/session-builder/` is **LOCKED** (target-architecture.md). This is a
  bug-fix *within* the module — it **removes** a mis-placed step (`builder.ts:344`)
  and folds burying into the planner stage that already owns candidate selection
  (`pedagogy.ts`). No new file, no new parallel surface; net **less** mechanism.
- Amends the shipped `docs/plans/2026-06-09-sibling-burying-design.md` (records
  the corrected pipeline position) and the CONTEXT.md → Sibling burying entry
  (adds "session-size is the contract; burying selects *which* caps fill it, never
  *whether* it fills").

## Deliverables checklist

- [ ] `pedagogy.ts`: add `usedSourceRefs` to `PedagogyInput`; bury between
      `prioritizeCandidates` and `allocateBudget`; add `sibling_buried` to
      `PlannerReason`; buried → `suppressedCapabilities`.
- [ ] `siblingBury.ts`: add `partitionBuried(candidates, keyFn, usedRefs) →
      { kept, buried }` (keeps `buryThinSiblings` semantics).
- [ ] `builder.ts`: keep the due (:261) + practice (:294) passes and their
      `usedRefs` accumulation; pass the accumulated `usedRefs` into the planner as
      `usedSourceRefs` (:336); delete only the post-hoc new-intro bury (:344).
- [ ] Tests §6 (incl. the KEEP'd cross-pass builder tests + the new due+dormant
      single-block regression).
- [ ] Update CONTEXT.md → Sibling burying (add: session-size is the contract;
      burying selects *which* caps fill it, applied before budget allocation) +
      the shipped bury plan (corrected pipeline position note).
- [ ] Update `docs/current-system/modules/session-builder.md` if it pins the bury
      stage position.
