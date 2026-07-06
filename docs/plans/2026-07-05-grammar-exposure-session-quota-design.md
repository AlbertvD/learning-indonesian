---
status: implementing
implementation: PR pending (branch feat/grammar-due-floor)
reviewed_by: [architect, staff-engineer]
supersedes: []
---

# Grammar exposure: a grammar reserve in the session builder

**Date:** 2026-07-05 (v1 scope locked 2026-07-06)
**Author context:** Owner observed grammar felt like "a second-class citizen — not enough exposure." A live-DB audit of the owner's learner state (`albert@duin.home`, `7eaacda5-…`) confirmed it and located the mechanism. This spec is the fix.

**⭐ v1 SCOPE (owner decision 2026-07-06): Part A only — the grammar due-floor.** Part B (new-grammar introduction reserve) is **DEFERRED**: a live check found the owner is review-saturated. Correct derivation of `openSlots` = `preferredSessionSize − dueCount`, where `dueCount` is the count *after* slicing to session size and sibling-burying (`builder.ts:346`), NOT the raw backlog. Measured 2026-07-06: **350 caps due across 289 distinct words; the 25 most-overdue are 25 distinct words**, so burying doesn't collapse them → `dueCount ≈ 25` → **`openSlots ≈ 0`**. Part B is a fraction of `openSlots`, so it is throttled to ~0 until the backlog clears. The frozen frontier (lessons 9–30, grammar *and* vocab) is a separate root cause (§10). Part A works under saturation and is the real lever for grammar's *share* of attention. **The floor percentage is a first-class tunable (§4A) — one constant, one edit, no schema.**

**Module touched:** `src/lib/session-builder/` (LOCKED per `docs/target-architecture.md:175`). Pure-read builder; no schema change. Grounded against `docs/current-system/modules/session-builder.md` (verified 2026-07-02) and the target-architecture § `lib/session-builder/`.

---

## 1. The problem, from ground-truth data

All figures are live queries (via openbrain → indonesian schema), owner's account, 2026-07-05. His entire history sits in the last ~30 days.

**Exposure is lopsided.** Of 3,039 review events: **88.1% vocabulary, 6.0% grammar** (182 events), 4.1% dialogue, 1.8% word-form. The last-7-day mix is the same shape (grammar 5.3%). This is steady-state, not a transient.

**Three distinct failures, verified:**

1. **Share.** Grammar is ~4% of the *due pool* (15 grammar due vs 343 vocab due) and the due pass is type-blind, so grammar lands at ~its pool share of each session.
2. **Depth.** Within grammar, exposure collapses down the tiers: recognise 98 events / contrast 44 / **produce 40 (only 18 of 191 patterns)**. The productive tier — the one the research says builds usable grammar — is the most starved.
3. **Coverage.** Grammar exercises exist for **30 lessons / 191 patterns**. The owner has been exposed to lessons **1–8 only**; **lessons 9–30 grammar has never surfaced once** (0 state rows), even though lessons 9–12 are *activated*.

## 2. Root cause (traced to code)

Two type-blind allocation points, one shared cause (vocab volume):

- The owner's active pool is ~1,487 vocab caps vs 86 grammar (17:1). **Source (corrected 2026-07-06):** NOT collections — `learner_collection_activation` = 0, `learner_reading_harvest` = 0, every active vocab cap is lesson-homed. The real driver is **mode-multiplication**: each vocab word spawns up to 6 independently-scheduled caps, and the owner's matured early lessons carry the full fan-out (lesson 1 = 66 words → 394 caps @ 6.0/word; lesson 2 = 80 words → 421 caps @ 5.3). Lessons 1–2 alone = 815 active caps. Grammar is only ≤33 caps/lesson. This mode-multiplied review load — not any opt-in — is what saturates sessions (§10).
- **Due pass** (`dueFilter.ts`): buckets by days-overdue, shuffles within bucket, slices to size. No family awareness → grammar served at pool share → **failure #1**.
- **Introduction pass** (`pedagogy.ts` → `prioritizeCandidates`): sort key #1 is **`lessonOrder ASC`**. The family round-robin (sort key #2) only interleaves families *within* a lesson. So every gate-passing vocab cap in lessons 4–8 outranks any lesson-9 grammar cap; with `openSlots` small (the due backlog eats the session) and hundreds of vocab caps per lesson ahead, the introduction frontier is stalled at ~lesson 8 for *everything* (lesson-8 vocab is 3/219 introduced, lesson-9+ is 0). Grammar 9–30 absence is a symptom of this general stall → **failure #3**.
- **Depth** (`prioritize` phase order + `siblingBury` + slow frontier): the within-pattern recognise→contrast→produce chain (grammar-only prereqs) advances only as fast as the frontier and one-cap-per-word-per-day burying allow → **failure #2**.

**Decisive enabling fact:** grammar caps carry **no vocabulary prerequisite** (recognise = 0 prereqs, contrast/produce = 1 grammar-only prereq). So every lesson-9–12 grammar recognise cap is **gate-passing today** — nothing blocks it but the lesson-major sort. Surfacing it is mechanically free and prerequisite-safe; the recognise→contrast→produce chain then self-advances depth.

## 3. Goal

Grammar stops being a second-class citizen: a guaranteed, research-grounded share of both *review* and *new-introduction* attention, biased toward production, that advances across the whole course independent of the vocabulary backlog. The goal is fixed; mechanism is the free variable (Minimum Mechanism).

Pedagogical grounding (`docs/research/2026-06-15-…-morphology-research.md`, our strongest local evidence): explicit rules + **design for generation, not recognition alone**; force noticing of form↔meaning. The 2026-04-25 sequencing research *explicitly flagged grammar scheduling as a known, deferred stall* — this spec closes that.

## 4. Proposed mechanism — one concept, two hook points

A **grammar reserve**: a guaranteed floor of session slots for the `grammar` family, reusing the existing `capabilityFamily` taxonomy. **Grammar-scoped, not family-parameterized** — grammar is the goal and the one family safe to advance ahead of the frontier (§2, no vocab prereq); a config registry for cloze/morphology is speculative generality (stripped per architect + Minimum Mechanism). Composition (`compose.ts`) needs the family axis without importing from the planner, so **move `capabilityFamily` (+ `CapabilityFamily`) from `pedagogy.ts` to `model.ts`** (the module's shared-types home, target-arch:393; every builder file already depends on `model.ts`). **No new tables, columns, or types.**

### Deep-module grounding (target architecture + module spec)

Per the plan-grounding rule, both hooks are checked against `docs/target-architecture.md` and the `session-builder.md` module spec (verified 2026-07-02, stable):

- **`lib/session-builder/` is LOCKED** (target-arch:175) — a permanent module, not a fold-target. Both hooks land here.
- **Part B → `pedagogy.ts` + `model.ts`: lands at the target seam.** Both are named permanent files in the target layout (target-arch:393, 398-401); `pedagogy.ts` is where "known-word coverage, intro-before-practice rules" live (it *folds in* `lib/pedagogy/*` — folded *into*, never out). Relocating `capabilityFamily` to `model.ts` matches the target's shared-types placement. ✓
- **Part A must NOT modify `getDueCapabilitiesFromRows`.** The target explicitly moves that function **out of this module into `lib/analytics/upcoming/filter.ts`** as a pure, family-agnostic date+flag due-projection (target-arch:379, 900, **921-922**), consumed by session-builder via `analytics.upcoming.dueCapabilities` (target-arch:199, 778). Threading grammar-family/reserve logic into it (the round-1 "data seam" resolution) would inject session-composition policy into an analytics-bound projection — the shallow-module drift this rule guards against. **Corrected placement: the floor moves to `compose.ts`** (target-arch:402, "final queue composition + drying fallback"), reading a family-agnostic due list. The projection stays pure and migrates cleanly; the family axis stays inside session-builder.
- **`data-architect` not required** — no schema, typed-content-table, migration, or writer/reader/validator contract (per CLAUDE.md data-model rule).

**Part A — Due reserve (fixes #1).** The grammar floor is a session-**composition** policy, so it lives in `compose.ts`, **not** inside the due-projection `getDueCapabilitiesFromRows` (see grounding above). Flow: `getDueCapabilitiesFromRows` returns the family-agnostic, overdue-ordered due list **without a composition-blind hard slice** (or with a generous bound, so grammar sorting below the size cut is still visible to composition); `compose.ts` then, before the final `preferredSessionSize` cut, guarantees up to `DUE_GRAMMAR_FLOOR` of the slots to grammar-family due caps. Floor not cap: grammar naturally ≥ floor → no change; no grammar due → slots revert to vocab (session size is the contract, never left short).

*Data seam.* `LearnerCapabilityStateRow` (`dueFilter.ts:4-20`) carries no `sourceKind` — but composition already holds `capabilitiesByKey` (the snapshot), so the builder hands `compose.ts` a **`canonicalKey → CapabilityFamily` lookup** (the existing `sourceRefOfKey` pattern, `builder.ts:258-259`). Family knowledge stays in session-builder and is **never** threaded into the analytics-bound due filter. *Invariant note:* the floor deliberately **bends the most-overdue-first priority** (`dueFilter.ts:90-97`) for up to the floor's slots — an intended trade; applied in composition after the overdue ordering, before the size cut; determinism preserved (the bucket shuffle already uses injected `random` in tests).

*⭐ Tunable knob (owner requirement — must be trivial to retune).* The floor is a **single exported constant** `GRAMMAR_DUE_FLOOR_FRACTION = 0.20` at the top of `compose.ts`, with a doc-comment stating: what it does (min fraction of due slots guaranteed to grammar), valid range `[0, 1]`, and that **changing this one number is the only edit needed** to retune — no call-site changes, no schema, no other constants. The slot count is derived `Math.floor(limit * GRAMMAR_DUE_FLOOR_FRACTION)` at use. A unit test asserts the derivation so the knob's effect is pinned. (If we later want to retune *without a redeploy*, promoting it to a `profiles` column or env value is a deliberate follow-up — deliberately NOT v1, to keep Minimum Mechanism; a constant + fast redeploy is sufficient for tuning now.)

**Part B — Introduction reserve (DEFERRED, was: fixes #3).** *Not built in v1.* It would reserve ~`NEW_GRAMMAR_RESERVE` of `openSlots` for gate-passing grammar in grammar-family lesson order (post-bury `nonBuried`, before `allocateBudget`), surfacing lessons 9–30. **Why deferred:** the owner has `openSlots ≈ 0` under review saturation (§10), so a fraction-of-`openSlots` reserve is inert until the backlog clears — building it now would ship dead code. It re-activates naturally once §10's saturation work frees slots; the design (post-bury draw; depth left to the prereq chain) is preserved here for when it does. The architect-required post-bury ordering and its tests (B1–B4) move with it.

Part A respects every existing invariant: due selection stays pure-read, sibling-burying and the composer interleave are unchanged, determinism holds, and `preferredSessionSize` remains the contract (floor never leaves the session short).

## 5. The one real design tension (DEFERRED with Part B — not a v1 concern)

*Part A introduces no comprehensibility change (it only re-orders already-due grammar the learner has met). The tension below applies solely to the deferred Part B and is retained for when it lands.*

Grammar has **no known-word-coverage guard** (no vocab prereqs). Part B surfaces more of it, and a grammar exercise may contain not-yet-studied words (violating Nation's 95% coverage / Krashen i+1). This gap is **pre-existing and unchanged in kind** — it already applies to the grammar the owner sees today; Part B changes only the *volume*. `knownWordCoverage.ts` exists in-module (unwired, `session-builder.md:404`) for exactly this.

**Resolution: bound Part B to activated lessons for v1** — and, as the architect notes, this is **already the invariant**: Part B draws from *gate-passing* caps, and the gate already suppresses `lesson_not_activated` (`pedagogy.ts:407-414`, ADR 0006). So activation-binding adds **no new mechanism**; the reserve only reorders within the activated set. Precise claim: this yields **zero *new* comprehensibility regression** (it does not *resolve* the pre-existing gap — it prevents leaping to an un-activated lesson 30, and the owner's real gap is lessons 9–12, which are already activated). Wiring `knownWordCoverage.ts` is correctly deferred (§9).

## 6. Open questions

1. **Floor size (v1 tuning).** Ships at `GRAMMAR_DUE_FLOOR_FRACTION = 0.20` (20% of due slots → ~5 of a 25-card session). A pedagogy knob, not correctness; retune via the single constant (§4A) once live data shows the right level. Staff-engineer sanity-checked 20% (leaves ≥80% vocab; can't starve the vocab backlog).

**Deferred with Part B:** `NEW_GRAMMAR_RESERVE` sizing; the drying-detector interaction (`drying.ts` — only Part B touches `openSlots`/introductions, so Part A cannot affect drying).

**Resolved in round 1 (no longer open):**
- *Grammar-only vs family-parameterized* → **grammar-only, hardcoded** (architect; Minimum Mechanism — cloze/morphology are not current goals).
- *Explicit depth-bias* → **cut from v1** (both reviewers; prereq chain + phase-sort already sequence tiers, and an explicit production-first bias would conflict with the receptive-first phase-sort). Re-open only if live data shows grammar spreading wide-but-shallow.

## 7. Testing (enumerated scenarios — required by architect)

**v1 tests** — unit tests over `compose` (Part A), injecting `random` for determinism:

- **A1 — floor is a no-op when grammar is already ≥ floor:** due pool with grammar ≥ floor → output identical to today (reserve changes nothing).
- **A2 — sliced-out grammar rides the reserve:** many overdue vocab + few less-overdue grammar, `limit` < dueCount → grammar appears up to the floor; a lower-overdue vocab cap is displaced.
- **A3 — no grammar due → full revert:** zero grammar due → session still fills to `preferredSessionSize` entirely from vocab (no empty reserved slots).
- **A4 — determinism:** identical inputs + injected `random` → identical output.
- **A5 — knob derivation:** `Math.floor(limit * GRAMMAR_DUE_FLOOR_FRACTION)` slot count is what the floor uses (pins the tunable's effect); floor of 0 → exact current behaviour.
- **C2 — invariants intact:** composer interleave and `preferredSessionSize`-as-floor hold with the reserve active; total session size unchanged.

**Deferred with Part B:** B1–B4 (later-lesson surfacing, post-bury draw, revert, stress) and C1 (drying flag).

## 8. Supabase Requirements

### Schema changes
- **N/A** — pure in-memory read logic in `session-builder`. No new tables/columns, no RLS, no grants. The reserve is computed at build time from data the `get_session_build_data` RPC already returns (capabilities carry `source_kind`, `lesson_id`, `prerequisite_keys`; learner states carry activation/stability).

### homelab-configs changes
- [ ] PostgREST: **N/A** — no new schema exposure.
- [ ] Kong: **N/A**.
- [ ] GoTrue: **N/A**.
- [ ] Storage: **N/A**.

### Health check additions
- Consider a `check-supabase-deep.ts` observability query (not a hard gate) reporting per-family session-pool composition, so grammar-share regressions are visible. Optional; decide in review.

## 9. Review routing + status

- **`architect`** — round 1 changes-required → round 2 **sign-off: yes** → round 3 **sign-off: yes** (2026-07-06, confirmed the `compose.ts` re-placement after deep-module grounding found the target migrates `getDueCapabilitiesFromRows` to `lib/analytics/upcoming/filter.ts`, target-arch:921-922).
- **`staff-engineer`** — round 1 needs-work → round 2 **SOUND, ship it** (2026-07-05): validated grammar-only scope, depth-bias cut, and the 20% floor.
- **v1 scope narrowing to Part A only** (owner, 2026-07-06) is a **reduction**, not new risk — both reviewers explicitly validated Part A; Part B is deferred, not redesigned (§4, §10). Safe under Minimum Mechanism.
- **`data-architect`** — **not required** (no schema, typed-content-table, migration, or writer/reader/validator contract touched). Confirmed by architect.

## 10. Out of scope → recommended next thread: review saturation

The dominant finding behind the frozen frontier is **not** grammar-specific and is **not** fixed here:

- **Review saturation / mode-multiplication.** Live 2026-07-06: **350 caps due across 289 distinct words** (of ~515 active words — 56% behind); the 25 most-overdue are 25 distinct words, so after slice+bury `dueCount ≈ 25` → `openSlots ≈ 0`, so **~no new material of any kind is introduced** (grammar and vocab past lesson 8 both stranded). Contributing cause = each vocab word scheduling up to 6 independent modes (active pool ~1,487 caps / ~515 words); even at word level the backlog (289 due) dwarfs a 25-card session. This gates reaching lessons 9–30 and throttles Part B to ~0. **It deserves its own diagnosis** (is 6 modes/word right for every word? should production modes be selective? should the load budget drain backlog or reserve guaranteed new-material slots under saturation?). Part B re-activates once this frees slots.
- Rebalancing/​sizing vocabulary (per-lesson word counts, mode selectivity).
- Wiring `knownWordCoverage.ts` (travels with Part B).
