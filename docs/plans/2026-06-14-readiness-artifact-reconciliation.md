---
status: shipped
implementation: PR #249
merged_at: 2026-06-14
last_verified_against_code: 2026-07-02
implementation_paths:
  - scripts/lib/pipeline/capability-stage/satellitePresence.ts          # Layer 1: findCapsMissingSatellite (shared predicate)
  - scripts/lib/pipeline/capability-stage/adapter.ts                     # softRetireCapabilities (+ next_due_at clear, M1) + reconcileArtifactPresence
  - scripts/lib/pipeline/capability-stage/runner.ts                      # Layer 2: non-item invocation (after satellite writes, before promotion)
  - scripts/lib/pipeline/capability-stage/vocabulary/publish.ts          # Layer 2: item invocation
  - scripts/check-supabase-deep.ts                                       # Layer 3: HC14/15/17/19/20 import the shared predicate
reviewed_by: [architect, data-architect]   # round 2: both APPROVE. (R1: architect C1-C3/W1-W3, data-architect M1/m1 — all folded in.) Implementation note: extend/wrap retireOrphanedCapabilities to also write learner_capability_state.next_due_at=NULL before returning.
supersedes: []
---

# Readiness ↔ artifact reconciliation: an unrenderable cap must never stay schedulable

> **One-liner.** A capability is `readiness_status='ready'`/`published` and therefore
> schedulable, yet its required typed satellite row is **absent**, so it cannot
> render. The runtime drops it, but it stays *due forever* and silently shrinks
> every session. Make the capability stage **reconcile readiness against artifact
> presence** so an artifact-less cap can never remain schedulable.
>
> **Target-architecture grounding (plan-grounding rule):** no existing seam in
> `docs/target-architecture.md` covers this (the only "reconciliation" there is an
> unrelated analytics roster sync, `target-architecture.md:684`). The runner has no
> module spec; the precedent is `docs/current-system/modules/capability-stage-vocabulary.md`
> §"Orphan-sweep scoping". This lands at the capability-stage seam **beside
> `retireOrphanedCapabilities`** — as a *sibling soft-retire reason*, not a new
> mechanism (architect N3).

## 1. Problem (live bug, diagnosed 2026-06-14)

A learner's standard session was consistently **2 cards short** of
`preferredSessionSize` (23 of 25), every session, every day. Root cause:

- Two `contextual_cloze` caps (`lesson-1/section-3/line-2`, `line-3`) were
  `readiness_status='ready'`, `publication_status='published'`, active in the
  learner's state, and **due** — but their `lesson_dialogue_lines` row had **zero
  `dialogue_clozes` rows** (an **HC15 violation**). The learner had reviewed them
  before (`review_count` 2–3), so they rendered once; the cloze rows later
  disappeared.
- They are the **most-overdue** due caps (never answered → never rescheduled), so
  `getDueCapabilities` pulls them into every session's top-N window.
- `validateCapability` (`src/lib/capabilities/capabilityContracts.ts:48-86`) is
  **intentionally type-level** — it returns `ready` because `contextual_cloze`
  *has* a render design, and **delegates "does the artifact exist?" to the live
  health checks HC15/HC17/HC19/HC20** (its own comment, lines 62-71). So the cap
  passes `resolveExercise` and **is** in the built plan.
- At render, `src/lib/exercise-content/resolver.ts` emits a **fail context**;
  `ExperiencePlayer.renderableBlocks` (`src/components/experience/ExperiencePlayer.tsx:81-90`)
  filters it out → the queue is 23. Never answered → stay most-overdue → forever.

Live scope at diagnosis: **22 such caps** (L8×17, L2×5) plus L1×2. The data was
hot-fixed (`publish-approved-content.ts <N> --regenerate-dialogue` for L1/L2/L8 →
**HC15 = 0**), restoring 25-card sessions. **This spec is the durable prevention.**

## 1a. Why the existing mechanisms do NOT prevent recurrence

- **`validateCapability` is type-level by design** — correct to leave it so (both
  reviewers concur: making it query the DB would re-introduce the artifact-bag
  coupling PR #65 / Slice-4b removed, `capabilityContracts.ts:62-71`). The
  reconciliation pass is the *missing fourth corner* (state correction when a
  satellite disappears post-seed), not a reason to change the router.
- **The publish gate (CS22 et al.) already blocks NEW promotion.** A failed cloze
  gen → `status=partial` → "Skipping capability promotion (status=partial)". So a
  *fresh* bad cap is never promoted. **The gap is the already-`ready` cap**: a later
  `--regenerate-dialogue` deletes all clozes then reseeds; a line that fails
  sanitization gets **no row back**, but the cap promoted on a previous run **stays
  `ready`**. Nothing demotes it.
- **`retireOrphanedCapabilities` (`scripts/lib/pipeline/capability-stage/adapter.ts:187-224`)
  is `source_ref`-scoped** — it retires caps whose `source_ref` is no longer
  *emitted*. The broken cloze cap's source_ref **is** still emitted (the line
  exists); only its *cloze artifact* is missing. So the orphan sweep skips it. It
  also does **not** touch `learner_capability_state` (relevant to M1 below).
- **HC15/17/19/20 are post-publish health checks, not gates.** They *report* the
  violation but change no row, and a green-status publish does not run them.

Net: there is no step that **demotes an already-schedulable cap when its artifact
disappears**. That is the single missing mechanism.

## 2. Proposed fix (minimum mechanism)

A **per-lesson reconciliation step** in the capability stage: any **active +
`ready` + `published`** capability whose **required typed satellite row is absent**
is **soft-retired** — `retired_at` set (preserving FSRS history; ADR 0011 = state
correction, never content deletion) — so it leaves the schedulable pool. It
re-activates automatically on a later publish once its artifact exists
(`upsertCapabilities` sets `retired_at: null` unconditionally, `adapter.ts:146`;
idempotent round-trip confirmed by data-architect i3).

It is framed as a **sibling soft-retire reason on the existing
`retireOrphanedCapabilities` write seam** (predicate differs: *satellite-absent*
vs *key-not-emitted*), sharing the soft-retire write — not a separate sweep
(architect N3).

### 2a. Two source-kind-scoped invocations — NOT one (architect C1, load-bearing)
No single pass may sweep across source-kind ownership: the runner owns
`['dialogue_line','pattern','affixed_form_pair']` and the vocab module owns
`['item']`; an unscoped sweep retires the other owner's live caps (the documented
landmine — `adapter.ts:179-185`; `capability-stage-vocabulary.md:60-61`). So the
reconciliation is **two scoped invocations**, mirroring the existing
`retireOrphanedCapabilities` calls:
1. **non-item** in `scripts/lib/pipeline/capability-stage/runner.ts`, scoped to
   `['dialogue_line','pattern','affixed_form_pair']`.
2. **item** in `scripts/lib/pipeline/capability-stage/vocabulary/publish.ts`,
   scoped to `['item']` — though item is effectively a no-op (see §2c).

### 2b. Sequencing (architect C2, load-bearing)
The step must run **after** the lesson's typed satellite writes (so this run's
freshly-written rows count as present and a just-fixed cap is NOT wrongly retired)
and **before** promotion (so a cap retired this run is not re-promoted —
`loadPromotionPlan` filters `retired_at IS NULL`, `scripts/promote-capabilities.ts:230`).
- In the **runner**: between the satellite writes (`runner.ts:572-585`) and
  promotion (`runner.ts:670`). **Not** beside the orphan sweep at `runner.ts:434`.
- In **`publishVocabulary`**: after the distractor seed (`vocabulary/publish.ts:251`)
  and before promotion (`vocabulary/publish.ts:296`).
- It runs **regardless of `status`** (a `partial` run from a CS22 cloze gap is
  exactly when caps go artifact-less) and **soft-retiring caps does not itself flip
  `status` to `partial`** (architect W3).

### 2c. The "required satellite row" predicate — extract ONE shared home (architect C3 / data-architect i4)
The HC15/17/19/20 logic currently lives **inline** in `scripts/check-supabase-deep.ts`
(HC15 `:850-890`, HC17 `:947-979`, HC19/20 `:1012-1082`) — there is no importable
function, so "reuse the predicates" requires **extracting Layer 1**: a shared
satellite-presence predicate at **`scripts/lib/pipeline/capability-stage/satellitePresence.ts`**
(chosen over `src/lib/capabilities/` because both consumers live under `scripts/`),
imported by **both** the reconciliation step **and** the refactored HC15/17/19/20
**in the same PR**. Otherwise a third parallel predicate forks (the exact failure
the three-layer gate prevents).

| source_kind / cap_type | required row (HC mirrored) | in scope? |
|---|---|---|
| `dialogue_line` / `contextual_cloze` | a `dialogue_clozes` row for the line (HC15) | **yes** |
| `affixed_form_pair` / `root_derived_*` | an `affixed_form_pairs` row (HC17) | **yes** |
| `pattern` / `pattern_contrast` | a `contrast_pair` row (HC19) | **yes** |
| `pattern` / `pattern_recognition` | a recognition grammar row (HC20) | **yes** |
| `item` / MCQ types | **N/A — no per-cap satellite row to key on.** CS15 is `warning`-only so it never blocks promotion (`validators/itemCoverage.ts:54`), and item MCQ degrades via the runtime distractor-pool fallback rather than failing closed. (A separate content edge — distractor pool < 3 → a fail context at `src/components/exercises/.../recognitionMcq.ts:51-58` — has the same shape but no satellite-row predicate to reconcile against; out of scope here. Note the stale "no runtime fallback" comment at `itemCoverage.ts:58-59` contradicts its own `warning` severity — flag for cleanup, not load-bearing.) | no |

### 2d. Clear the orphaned scheduler row (data-architect M1 — MAJOR, mandatory)
The broken caps have past-due `learner_capability_state` rows. Setting only
`retired_at` on `learning_capabilities` leaves a state row with `next_due_at <= now()`
pointing at a retired cap → **HC14 fires** (`scripts/check-supabase-deep.ts:808-814`).
The runtime is unaffected (the builder adapter drops state rows whose cap is not in
the `retired_at IS NULL` set, `src/lib/session-builder/adapter.ts:217-234`), but the
**health-check invariant breaks**. So the reconciliation step must, in the same
transaction as the retire, also:
`UPDATE indonesian.learner_capability_state SET next_due_at = NULL WHERE capability_id IN (<newly-retired ids>)`
(`next_due_at = NULL` is sufficient — the due filter requires `nextDueAt != null`,
`src/lib/session-builder/dueFilter.ts:63`; FSRS params `stability`/`difficulty`/
`lapseCount`/`reviewCount` are untouched so history survives and re-activation
resumes scheduling). **This is new behaviour `retireOrphanedCapabilities` does not
have today** — it must be extended/wrapped to take the companion state write.

Effect: `readiness_status` becomes **honest** → `validateCapability`'s type-level
trust holds → the planner never surfaces an unrenderable cap → the session **fills
to size**, and the player never sees a fail context. This is the
architecturally-correct "always fill to size" lever (the drop is *post-build* at
render, so a builder-side backfill would be the wrong layer).

## 3. Design decisions (resolved by round-1 review)
1. **Retire vs demote → SOFT-RETIRE** (both reviewers CONFIRM). Soft-retire reuses
   the machinery, both scheduler reads filter `retired_at IS NULL`
   (`session-builder/adapter.ts:256-258`, `:217-234`), and re-emission un-retires.
   `publication_status` stays `'published'`; only `retired_at` changes.
2. **Learner state → must clear `next_due_at`** (data-architect M1). See §2d.
3. **Scope → per-lesson + per-sourceKind** (both CONFIRM). The global one-off was
   the hand hot-fix already done.
4. **Operator visibility** — the stage report logs "N caps soft-retired for missing
   artifact" (architect Q4 NOTE).
5. **Predicate drift → shared Layer-1 home** (§2c). Structurally prevented by one
   imported predicate; HC §5-AC1 is the live backstop.

## 4. Supabase Requirements

### Schema changes
- **None.** No new tables/columns. Reuses `learning_capabilities.retired_at`
  (soft-retire) and writes `learner_capability_state.next_due_at = NULL` for
  reconciled caps (existing column). Writes are pipeline/service-role via the
  existing capability-stage adapter; RLS/grants unchanged.

### homelab-configs changes
- [ ] PostgREST schema exposure — N/A. [ ] Kong — N/A. [ ] GoTrue — N/A. [ ] Storage — N/A.

### Health check additions
- No new check. HC14/HC15/HC17/HC19/HC20 already encode the invariants; this spec
  makes the **stage enforce** what they **assert**, and refactors HC15/17/19/20 to
  import the shared predicate (§2c). After it ships they are **0 by construction**
  on any green publish; they remain the live guard.

## 5. Acceptance criteria
1. After publishing any lesson, **zero** active+ready+published caps have a missing
   required satellite row, **and zero** HC14 violations (no past-due state row on a
   retired cap) — verified by `make check-supabase-deep`.
2. **Retire path — fixture-driven, NOT live manual deletion** (revised 2026-07-02; see §7).
   The retire path is proven by the **Layer-2 unit fixture** (`adapter.test.ts` →
   `reconcileArtifactPresence`): a ready+published cap whose `findCapsMissingSatellite`
   reports its required satellite **absent** is **soft-retired** AND its
   `learner_capability_state.next_due_at` is set **NULL** (§2d M1); a cap whose satellite
   is present is untouched (no-op); source-kind scoping holds (the item sweep never
   touches non-item caps and vice-versa). Per-source-kind satellite-absence — dialogue
   (`dialogue_clozes`), affixed (`affixed_form_pairs`), and pattern
   contrast·recognise·produce (the typed grammar-exercise tables) — is covered by the
   **Layer-1 fixtures** in `satellitePresence.test.ts`. Re-activation on re-emission is
   the `upsertCapabilities retired_at:null` unit test.
   **The original "delete a satellite row → plain re-publish → observe soft-retire"
   live procedure is retired** (§7): a plain re-publish *regenerates* a deleted
   `dialogue_clozes` row (self-heal), so it never reaches the retire path; and relying on
   which source kinds are seed-once vs regenerated makes the procedure per-kind-fragile.
   The fixture models the only real trigger — generation yields **no** row for a line/
   pattern whose cap was promoted on a **prior** run (§1a) — directly and deterministically.
3. **Guard the §2b ordering:** a satellite row written **this run** is NOT retired
   (after-satellite-writes ordering); a cap soft-retired **this run** is NOT
   re-promoted in the same run (before-promotion ordering).
4. A standard session for a learner with ≥ `preferredSessionSize` renderable due
   caps **fills to `preferredSessionSize`** (no silent N−2) — the original bug
   cannot recur.
5. **Three-layer coverage** (`project_three_layer_invariant_gates`): the shared
   `satellitePresence` predicate + per-source-kind unit fixtures (Layer 1); the two
   scoped reconciliation invocations, with `reconcileArtifactPresence`'s
   retire + `next_due_at`-clear path unit-tested in `adapter.test.ts` (Layer 2,
   pipeline); HC14/15/17/19/20 importing the same predicate (Layer 3, live DB).

## 6. Out of scope
- The completion bug (shipped, PR #248).
- Why cloze sanitization fails for specific short lines (a generator-quality
  question; reconciliation makes such failures *safe*, not *invisible* — §3.4).

## 7. Verification (2026-07-02 — shipped in PR #249, merged 2026-06-14)
Confirmed the three-layer gate is fully implemented, wired, and green:
- **Layer 1** — `findCapsMissingSatellite` (`satellitePresence.ts`), unit-tested; the
  `grammar_patterns` slug read was later chunked (PR #329) to fix a Kong 502 at scale.
- **Layer 2** — `reconcileArtifactPresence` (`adapter.ts`) wired in `runner.ts` (non-item,
  after satellite writes, before promotion) and `vocabulary/publish.ts` (item), per §2b.
  Unit-tested in `adapter.test.ts`: "soft-retires a ready+published dialogue cap whose
  dialogue_clozes row vanished, and clears next_due_at" asserts BOTH the `retired_at` set
  AND the §2d M1 `next_due_at=NULL` state-clear, plus a no-op case and source-kind scoping.
- **Layer 3** — HC14/15/17/19/20 import the shared predicate; `make check-supabase-deep`
  green (HC15 123 caps, HC14 clean) 2026-07-02.

**Note on the §5.2 acceptance round-trip.** The "delete a `dialogue_clozes` row → plain
re-publish → cap soft-retired" test is **not reproducible by manual row deletion**: a plain
re-publish *regenerates* the missing dialogue cloze (the dialogue writer rewrites the line's
clozes), so the satellite is present again and the cap is correctly NOT retired — the
pipeline **self-heals** (contra §1a's "seed-once skips clozes" for the dialogue case;
distractors do skip). The retire path fires only when generation genuinely produces no row
for a line whose cap was promoted on a prior run (§1a). That path is covered by the Layer-2
unit test above and guarded live by HC15 (Layer 3), so the acceptance intent (§5.1/§5.5)
holds; the manual-deletion procedure in §5.2 does not exercise it. Verified against lesson 25
(the last HC15 offender, data-fixed via `--regenerate-dialogue` on 2026-07-01).
