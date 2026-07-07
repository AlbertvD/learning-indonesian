---
status: superseded
superseded_by: docs/plans/2026-07-05-grammar-exposure-session-quota-design.md
---

> **Superseded 2026-07-06.** The exposure fix shipped as the grammar due-floor (Part A) in PR #375 — see `docs/plans/2026-07-05-grammar-exposure-session-quota-design.md` (`status: shipped`). This file is the original design draft, kept for its problem framing / live-DB audit. Part B (new-grammar introduction reserve) is deferred there pending the review-saturation thread. Do not treat this as open work.

# Grammar exposure — give grammar a guaranteed share of practice

> Draft design. The last genuine open pedagogic item from roadmap §C (variety + wiring already shipped). Needs `architect` (planner seam) sign-off before `approved`; data-model is untouched, so `data-architect` is likely N/A (confirm).

## Problem (verified live, 2026-06-30)

Grammar is **drowned by vocabulary** in the session queue. Live `ready+published` capabilities:

| source_kind | caps | share |
|---|---|---|
| vocabulary_src | 12,402 | **89.4%** |
| word_form_pair_src (morphology) | 837 | 6.0% |
| grammar_pattern_src | **507** | **3.7%** |
| dialogue_line_src | 124 | 0.9% |

FSRS schedules proportionally and the planner has **no source-kind quota**, so a standard session is ~89% vocab and grammar surfaces roughly **1 card in 27**. The top-1000 vocab bands made this *worse* (they grew the denominator). Roadmap §C's other two problems are already fixed — **variety** (now 3–5 exercises/type across 169 patterns) and **wiring** (grammar moved to typed per-pattern tables; no more `grammar_pattern_id = NULL`). Exposure is what remains.

## Root cause (code)

- `src/lib/session-builder/loadBudget.ts:51-57` — standard mode fills every open slot with new caps (`maxNewCapabilities = openSlots`); `maxNewPatterns` exists but is also `openSlots`, so there is **no floor reserving slots for grammar**.
- The **due-review** stream (the bulk of most sessions) is selected by overdue-ness with **no source-kind awareness** at all — so when there's any review backlog, `openSlots` shrinks and the session is ~96% vocab reviews regardless.
- `compose.ts` interleaves by `source_ref` (avoids clustering the same word) but never by `source_kind`, so it doesn't rebalance grammar vs vocab either.
- Related open issue **#173** (grammar/cloze *introductions* starve when reviewers fill the budget) is one facet of this.

## Options

**A. Grammar practice mode (session filter).** A learner-selectable mode that builds a session drawn from grammar (`grammar_pattern_src`) caps — reusing the **listening-toggle filter** pattern (PR #244). Bounded, explicit, no interference with FSRS ordering in the default session.
- ✅ Minimum mechanism; reuses an existing pattern; safe. ❌ Opt-in — the *default* session still drowns grammar.

**B. Planner min-share quota.** Reserve a minimum fraction (e.g. 15–20%) of every standard session for grammar (and morphology), applied to **both** due-review selection and new-cap allocation.
- ✅ Fixes the default session automatically. ❌ Riskier: must not surface *not-due* grammar (anti-FSRS) or starve genuinely-overdue vocab; touches due-review ordering, the most load-bearing path.

**C. Hybrid (recommended).** (1) A **grammar min-reserve for new introductions** in `loadBudget` — guarantee grammar a small slice of the new-cap budget so patterns keep *entering* the queue (directly closes #173); plus (2) a **grammar practice mode** (option A) for focused review. Defer the full due-review weighting (B) until the hybrid is observed in use.
- ✅ Closes the introduction-starvation half cheaply + gives a focused-practice surface, without touching the risky due-review ordering. ❌ Default-session *review* mix still skews vocab (acceptable: the goal is regular grammar *practice*, which the practice mode + steady introductions deliver).

## Recommendation

**Option C.** Smallest mechanism that makes grammar regularly practised: a `loadBudget` floor for new grammar introductions (one knob, parity-tested) + a grammar practice mode reusing the session-filter pattern. Re-evaluate the full due-review quota (B) once this is live and observed.

## Seam

- `src/lib/session-builder/loadBudget.ts` — add a `minNewPatterns`/reserve floor (the new knob).
- `src/lib/session-builder/builder.ts` (`planLearningPath` / allocation, ~:338-365) — honour the floor when allocating new caps.
- The grammar practice mode — mirror the listening-toggle session filter (PR #244) wherever `SessionMode` / the session-filter UI lives.
- `compose.ts` interleave — leave as-is unless the floor needs source-kind interleaving.

## Supabase Requirements

- **Schema changes** — N/A (read-side planner change only; no new tables/columns/RLS).
- **homelab-configs** — N/A.
- **Health checks** — N/A (a planner unit test asserting the grammar floor is honoured suffices; no DB invariant).

## Open questions (for the grill)

1. Floor size — fixed N caps, or a % of the new-cap budget? Should morphology get its own floor (it's 6%, healthier than grammar but still minor)?
2. Does the grammar practice mode draw only `grammar_pattern_src`, or grammar + morphology together (a "structure" mode)?
3. Does the floor apply only to *introductions*, or also nudge the due-review mix (i.e. how far toward option B)?
