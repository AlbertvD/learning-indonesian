---
status: shipped
implementation: PR #396
merged_at: 2026-07-08
implementation_paths:
  - src/lib/session-builder/pedagogy.ts
reviewed_by: [staff-engineer, architect]
---
<!-- staff-engineer 2026-07-08: SOUND/approved with three amendments, all folded in
     below (usedRefs narrative includes the practice pass; load-budget suppressor
     acknowledged; exemption narrowed from sourceKind to produce_derived_form_cap).
     Post-ship FSRS watch item recorded in §Tests.
     architect 2026-07-08: SIGN-OFF. Verified vs code: carve-out is the ONLY remaining
     suppressor at round 2 (staging gate already exempts word_form_pair_src; ADRs
     0004/0007/0018/0021 unviolated). Wording fix applied below (invariant amendment
     names produce_derived_form_cap, and BOTH session-builder.md §3.2 :191 and §4 :364
     are amended). Implementation note adopted: filter-in-planLearningPath (partition
     exempt/non-exempt around partitionBuried), do NOT touch siblingBury.ts's shared
     surface. data-architect N/A (no data-model surface). -->

# Affix production fast-path (C1 of the affix quick-wins plan)

**Problem (review P1/P2, live DB 2026-07-07).** Production caps on `word_form_pair_src` have ZERO review events ever. The funnel stalls structurally: a produce cap's `prerequisiteKeys` include its recognise sibling (satisfied only from PERSISTED state — active + ≥1 successful review, `pedagogy.ts:527-529`), and even once satisfied, the sibling-bury rule (one cap per `source_ref` per calendar day) buries the produce cap on the very day its recognise sibling was answered — the pair's ref enters `usedRefs` via `reviewedTodayRefs` (`builder.ts:272`) AND via the same build's practice pass surfacing the now-active recognise cap (`builder.ts:308-328`), then `partitionBuried` drops the produce cap (`pedagogy.ts:546-550`). Net: a learner who drills an affix today cannot reach ANY production form until tomorrow — and nobody returns the next day to drill the same affix, so production stays at zero.

**Target behaviour.** In `affix_practice` mode, a learner who answers recognise caps correctly and immediately starts another round of the same affix gets the corresponding produce caps introduced in that next round — same day, no new runtime machinery. ("Next round" is subject to the standard load budget as in every mode: `affix_practice` has no `decideLoadBudget` branch, so `maxNewProductionTasks = openSlots = max(0, size − dueCount)` — a due-saturated scoped queue can still defer the introduction as `load_budget_exhausted`. Accepted; consistent system-wide behaviour, not a new suppressor.)

**Design (one mode-scoped bury carve-out).**

- In `planLearningPath`'s new-introduction bury (`pedagogy.ts:546-547`), exempt candidates with `ctx.mode === 'affix_practice' && capability.capabilityType === 'produce_derived_form_cap'` from burying (staff-engineer: type-narrowed rather than the whole `word_form_pair_src` sourceKind — tighter blast radius, self-documenting; the recognise type never needs unburying). Implementation: filter the candidate partition, or pass an exempt predicate into `partitionBuried` — builder's choice, pure either way.
- Everything else is ALREADY in place and unchanged: the prereq ladder stays hard (recognise sibling must be active + ≥1 successful review — the previous round's atomic commit, ADR 0004, persists this before the next build fetches state), the root-vocab prerequisite stays hard (ADR 0018), the grammar-pattern prereq relaxation for scoped modes stays as-is (`pedagogy.ts:317-319`), standard/lesson modes keep the full bury rule.
- The due and practice passes' bury (`buryThinSiblings` in `builder.ts`) is NOT touched — the carve-out applies only to new introductions. A produce cap introduced today and a recognise cap reviewed today for the same pair coexisting in one day is exactly the drill semantics the learner asked for by opening the trainer.

**Why not the originally-pinned same-session `satisfiedKeys` augmentation** (affix plan §6): counting a same-session correct answer as prereq-satisfied requires either mid-session replanning or runtime-conditional queue items — new Session machinery — and STILL needs this bury carve-out to have any effect. The carve-out alone reaches the target behaviour (next round = same day, one tap away) at ~5 lines + tests; the augmentation adds mechanism without changing the reachable outcome except by one round. Session-end CTA ("N productievormen ontgrendeld — nog een ronde?") is DEFERRED: after task A1 the trainer tiles already show the Produceren bar, and the drill loop's natural re-tap covers discovery; add the CTA only if production events stay near-zero after this ships.

**Invariant change (same-commit obligation):** `docs/current-system/modules/session-builder.md` states "at most one capability per `source_ref` per learner per calendar day" — amend BOTH the §3.2 sibling-burying narrative (`:191`) AND the §invariants bullet (`:364`) to note the `affix_practice` × `produce_derived_form_cap` new-introduction exemption + rationale (architect: the exemption is TYPE-narrowed — `recognise_word_form_link_cap` is also `word_form_pair_src` and must stay buried), bump `last_verified_against_code`.

**Implementation shape (architect):** filter inside `planLearningPath` — partition the prioritized list into exempt/non-exempt, run `partitionBuried` on the non-exempt only, concat the exempt back in. Do NOT add an exemption predicate to `siblingBury.ts` — that surface is shared with the due/practice passes (`buryThinSiblings`), which must keep full bury semantics.

**Tests.** Planner unit tests: (a) affix_practice + `produce_derived_form_cap` whose recognise key is in `satisfiedKeys` and whose sourceRef is in `usedSourceRefs` → ELIGIBLE (not `sibling_buried`); (b) same input in `today`/lesson modes → still `sibling_buried`; (c) affix_practice with recognise key NOT satisfied → still `missing_prerequisite` (ladder intact); (d) other capability types (incl. `recognise_word_form_link_cap` and non-pair source kinds) in affix_practice → still buried.

**Post-ship watch (staff-engineer Q4, monitor not gate):** producing a form seconds after recognising the same pair is massed practice — check after launch whether same-day-introduced produce caps show inflated first intervals or early lapses (separate FSRS rows, so no data-integrity risk; if observed it's an FSRS-init tuning question, not a rollback).

**Deliberately narrow:** `produce_form_from_context_cap` (the carrier-based usage tier) stays under the normal bury rule — it sits deeper in the ladder and there's no evidence yet that its day-delay is the binding constraint. Revisit only if production events flow but usage-tier events stay at zero.

## Supabase Requirements

- Schema changes: none (pure client-side planner logic).
- RLS/grants: N/A. homelab-configs: N/A. Health checks: N/A (no new data invariants).
