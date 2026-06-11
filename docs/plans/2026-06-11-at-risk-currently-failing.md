---
status: shipped
implementation: PR #223
merged_at: 2026-06-11
implementation_paths:
  - src/lib/analytics/mastery/mastered.ts
  - src/lib/analytics/mastery/masteryModel.ts
  - scripts/migration.sql                    # get_lessons_overview mastered clause; _mastery_label
  - scripts/check-supabase-deep.ts           # HC27/HC28 mirrors
reviewed_by: [architect, data-architect]   # architect APPROVE-WITH-CHANGES; data-architect REQUEST-CHANGES — all findings applied below
review_notes: |
  data-architect M1 (blocking): two more unit tests key on lapseCount and would fail —
  masteryModel.test.ts:144 and weeklyMovement.test.ts:41 — now listed in §3 + fixed in build.
  architect: (W1) grep-backed completeness — the canonical label has exactly TWO definitions
  (isCapabilityMastered, labelForCapability); all funnel/skill/movement/lesson-tile surfaces
  consume them transitively (verified). (W2) the learnerProgressService lapse surfaces
  (get_lapse_prevention/get_vulnerable_capabilities/get_memory_health) are a SEPARATE, soon-retired
  predicate, deliberately out of scope. (Q-B) the leech follow-up should CONSOLIDATE with those
  existing vulnerable/lapse-prevention surfaces, not add a third lapse notion.
  Also: update the stale lapse comment in mastered.ts in the same commit.
supersedes: []
grounded_against:
  - CONTEXT.md → Mastered (the canonical predicate this tightens)
  - docs/adr/0015-read-model-aggregation-server-side-parity-tested-mirror.md (the TS↔SQL mirror + parity obligation)
  - src/lib/analytics/mastery/mastered.ts (isCapabilityMastered) + masteryModel.ts (labelForCapability)
  - scripts/migration.sql (get_lessons_overview mastered clause; _mastery_label for get_weekly_movement)
related:
  - docs/plans/2026-06-10-learner-progress-analytics-redesign.md (the funnel/skill/movement surfaces that consume this label)
---

# Make "at risk" self-healing: currently-failing only (drop the permanent lapse flag)

## 1. Problem

The mastery ladder's `at_risk` rung (and the `mastered` exclusion) keys on **two**
counters that behave oppositely:

- `consecutiveFailureCount` — resets to 0 on a correct answer (migration.sql:1710). Self-healing.
- `lapseCount` — FSRS's **cumulative** lapse counter; only ever increments, never decreases (migration.sql:1709).

The current rule is `at_risk if consecutiveFailureCount > 0 OR lapseCount > 0`, and
`mastered` additionally requires `lapseCount === 0`. Because `at_risk` short-circuits
the ladder, **any word that has ever lapsed is flagged "needs attention" permanently
and can never climb back to strengthening/mastered**, no matter how well it is
relearned. This is `lapseCount > 0` acting as an "Anki leech with threshold 1" —
but mislabelled as "at risk of forgetting." It only grows, and it suppresses the
`mastered`/skill-% counts on voortgang **and** the per-lesson `% mastered` on the
Lessons tiles. (Diagnosed 2026-06-11 from the live data; literature: FSRS
retrievability = "at risk of forgetting now" and self-heals; an Anki leech is a
*separate*, cumulative "chronically hard card" concept with a threshold of ~8.)

## 2. The change (Decision B)

**`at_risk` means "currently failing" — `consecutiveFailureCount > 0` only. Drop the
`lapseCount > 0` clause from both the `at_risk` rule and the `mastered` exclusion.**

A word you just got wrong is at risk until you next get it right; then it flows back
up the ladder on its real FSRS stability (which a lapse already reset low). The
word's forgetting *history* still lives in FSRS difficulty (it keeps coming up more
often) — just not as a permanent badge.

- **Not** changing: the `mastered` thresholds (reviewCount ≥ 4, stability ≥ 14d,
  recency), the ladder order, FSRS, the commit RPC's counter math.
- **Out of scope (follow-up, tracked):** "stubborn words" = the leech concept
  (lapseCount ≥ ~5–8) as a *separate, optional* callout with a different action
  ("rewrite / add a mnemonic"), never folded into `at_risk`.

## 3. Surfaces touched (the predicate lives in lockstep, ADR 0015)

**TS (the canonical predicate):**
- `src/lib/analytics/mastery/mastered.ts` — `isCapabilityMastered`: `if (consecutiveFailureCount > 0 || lapseCount > 0) return false` → drop `lapseCount`.
- `src/lib/analytics/mastery/masteryModel.ts` — `labelForCapability`: `if (consecutiveFailureCount > 0 || lapseCount > 0) return 'at_risk'` → drop `lapseCount`.

**SQL mirrors (must change in the same commit or parity fails):**
- `scripts/migration.sql` — `get_lessons_overview` mastered clause: drop `and coalesce(lapse_count, 0) = 0` (keep the `consecutive_failure_count = 0`).
- `scripts/migration.sql` — `indonesian._mastery_label` (get_weekly_movement): `when p_consec > 0 or p_lapse > 0 then 'at_risk'` → `when p_consec > 0 then 'at_risk'`.

**Parity tests + deep check (the guardrails):**
- `scripts/__tests__/lessons-overview-mastery-parity.test.ts` — remove the `coalesce(lapse_count, 0) = 0` structural assertion (assert it's *absent*); keep the consecutive-failure one.
- `scripts/__tests__/weekly-movement-parity.test.ts` — update the at_risk short-circuit assertion to consecutive-failure-only.
- `scripts/check-supabase-deep.ts` — HC28's inline `rankOf`/`isMastered`/`isAtRisk` mirror the predicate; drop `lapse` from them. (HC27 uses the imported `isCapabilityMastered`, so it tracks automatically.)

**Unit tests (all key on lapseCount → at_risk; switch the driver to consecutiveFailureCount):**
- `src/lib/analytics/mastery/__tests__/masteryFunnel.test.ts:60` — the `pergi` second cap `lapseCount: 1` → `consecutiveFailureCount: 1`.
- `src/lib/analytics/mastery/__tests__/masteryModel.test.ts:144` — `lapseCount: 1` driving `at_risk` → `consecutiveFailureCount: 1`. (data-architect M1)
- `src/lib/analytics/mastery/__tests__/weeklyMovement.test.ts:41` — `{ reviewCount: 6, lapseCount: 1 }` slip case → add `consecutiveFailureCount: 1`; update the test name to consecutive-failure semantics. (data-architect M1)

**Completeness (architect W1):** the canonical label has exactly the TWO definitions above
(`isCapabilityMastered`, `labelForCapability`); every funnel / skill-mode / weekly-movement /
lesson-tile surface consumes them transitively — no other predicate edits needed (grep-verified).
The `learnerProgressService` lapse surfaces (`get_lapse_prevention`, `get_vulnerable_capabilities`,
`get_memory_health`) are a **separate, soon-retired** predicate (CONTEXT.md:131), deliberately out
of scope — they are not the canonical `at_risk` rung.

**Docs:**
- `CONTEXT.md` → **Mastered** (drop "AND no lapse") and the at-risk meaning (currently-failing).

## 4. Supabase Requirements

### Schema changes
- **None** — only two function *bodies* change (`get_lessons_overview`, `_mastery_label`). No table/column/grant change.
- RLS / grants: unchanged.

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage — **N/A**.

### Health check additions
- No new checks. HC27 (% mastered parity) + HC28 (weekly-movement parity) already guard the TS↔SQL mirror and must stay green after both sides change in lockstep. `make migrate-idempotent-check` before merge.

## 5. Consequences (intended)
- `at_risk` becomes a small, self-healing set ("words you're currently getting wrong"), not a growing pile.
- Previously-lapsed-but-relearned words can reach `mastered` again → `mastered` / skill-% / weekly-movement on voortgang AND the lesson-tile `% mastered` will *rise* for affected learners (a one-time correction). This is the point.
- The lesson tiles change too (same predicate) — verify they read sensibly post-change.

## 6. Open questions for review
- **Q-A (data-architect):** confirm the two SQL mirrors are the *only* places the lapse-clause appears in a mastery/at-risk predicate (grep `lapse_count` in mastery/overview contexts), so nothing drifts.
- **Q-B (architect):** the leech follow-up — confirm it belongs as a *separate* label/callout, not a new ladder rung, when it lands.
