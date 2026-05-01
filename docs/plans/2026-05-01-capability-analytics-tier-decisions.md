# Capability Analytics Tier — Design Decisions

**Date:** 2026-05-01
**Status:** Design decisions captured. Spec to be written separately.
**Source:** Brainstorm session 2026-05-01 evening, after analytics review found gaps not covered by `2026-05-01-learner-progress-service-spec.md` v6 (which only handles surfacing-layer reads from legacy tables).

This doc records design decisions for the **analytics tier** upgrade (a sister concern to the surfacing-layer migration that just shipped in PR-1/2/3/5). The full spec will be written when we have token budget; this captures the choices so we don't re-litigate.

## Context — what we found

Three user-visible analytics surfaces were not migrated by the canonical-contract work and now show stale or empty data on the capability path:

1. **Voortgang Leerpijplijn** (5-stage funnel) — reads `learner_item_state` which only the legacy session path writes. Capability-path users see frozen counts.
2. **Session-end fact messages** (`sessionSummaryService.getSessionLocalFacts`) — reads `review_events` + `learner_stage_events`. Capability-path sessions return zero rows; the end-of-session toast is silent.
3. **Daily-rollup pg_cron + JS job** — `indonesian.job_daily_rollup_snapshot()` writes `learner_daily_goal_rollups` from 4 legacy tables every hour. Consumer (`useProgressData.ts`) fetches but Progress.tsx doesn't render. Dead pipe with ongoing compute cost.

Plus an architectural finding: the capability system has no equivalent of `learner_item_state.stage`. Mastery dimensions (introduced/learning/strengthening/mastered) are computed at query time from capability state. The 5-stage funnel UX needs a redesign, not a 1:1 replacement.

The brainstorm broadened from "migrate these 3 surfaces" to "**upgrade the analytics model** while migrating," informed by web research (Anki/FSRS, Duolingo, WaniKani, vanity-vs-actionable-metrics literature).

## Fork 1 — Headline metric

**Decision: Replace stability with average retrievability across the user-facing tier.**

### Why
- Today's "Gem. Stabiliteit 2.4" / "24% Herkenning" derives from `MemoryHealthHero.tsx:10-12`'s `daysToPct(days) = min(100, round(days/10*100))` — a placeholder mapping that doesn't reference the forgetting curve and saturates at any stability ≥ 10 days. Doesn't correlate with anything actionable.
- Retrievability is FSRS's canonical user-facing metric. Formula already in `lib/fsrs.ts:102`: `R = (1 + t/(9·S))^(-1)`. Returns 0–1, naturally a percentage, moves with calendar time (skipping reviews drops the number), targets the FSRS desired-retention default of 90%.

### Sub-decisions
- **1a. Replace, not display both.** Stability is an internal mechanic; users shouldn't see it. Keep `getMemoryHealth` available for admin/diagnostic use, don't render.
- **1b. Threshold scheme: 4-tier (90% / 75% / 60%) labels.**
  - ≥ 90% → "Sterk" / "Strong"
  - 75–90% → "Goed" / "Good"
  - 60–75% → "Verzwakkend" / "Weakening"
  - < 60% → "Risico" / "At risk"
- **1c. Skip true retention from user UI.** Diagnostic-grade metric (admin route only).
- **1d. Surfaces:**
  - Voortgang Geheugensterkte hero — three retrievability gauges (Recognition / Recall / Overall)
  - Voortgang Details "Gem. Stabiliteit" card — replace with overall retrievability + delta vs 7d ago
  - Dashboard — small overall-retrievability ring next to the streak

### Implementation pointer
New SQL function `indonesian.get_memory_retrievability(p_user_id uuid)` returning `recognition_retrievability, recognition_sample_size, recall_retrievability, recall_sample_size, overall_retrievability, overall_sample_size`. Computes `R = 1 / (1 + days_elapsed / (9 * stability))` per active capability with `review_count > 0`, then averages by capability_type. Pure read, indexed scan on `learner_capability_state_due_idx`.

## Fork 2 — Mastery panel (Voortgang Leerpijplijn replacement)

**Decision: Per-direction funnels (Recognition + Recall), 5 forward buckets each, plus a separate at_risk callout. Use `masteryModel.ts`'s existing 6 labels with two threshold fixes.**

### Why
- WaniKani-style discrete tier display (per-item) collapses bidirectional asymmetry. Language learners typically have recognition far ahead of recall — that asymmetry IS the meaningful insight.
- Two side-by-side funnels (Recognition row, Recall row) make the asymmetry the headline insight.
- `masteryModel.ts:191-202` already has the per-capability classifier with FSRS-tuned thresholds. Reuse, don't reinvent.

### Sub-decisions
- **2a. 5 forward buckets** displayed in funnel order: not_assessed / introduced / learning / strengthening / mastered. The not_assessed count is genuinely useful — it answers "how much catalog is left untouched?" which the legacy 4-bucket Leerpijplijn never did.
- **2b. Per-direction display.** Recognition row + Recall row. Items get classified per capability_type, not aggregated to a single per-item label. `weakestLabel` aggregation can be exposed in a tap-to-drill view (v2 polish), not the headline.
- **2c-1. Redefine at_risk** — currently `masteryModel.ts:192` flags any item with `lapse_count > 0` as at_risk *forever*, even after recovery. Replace with: `lapse_count > 0 AND stability < 2.0` (matches `getLapsingCount` semantics already shipped). "Currently struggling," not "ever struggled."
- **2c-2. Replace mastered's calendar recency with retrievability check** — currently requires `last_reviewed_at` within 30 days, which contradicts FSRS (high stability is supposed to *protect* you from needing recent reviews). Replace with: `review_count ≥ 4 AND stability ≥ 14 AND retrievability ≥ 0.85`. Items only lose mastered status when their forgetting curve actually drops, not on a calendar trigger.

### Implementation pointer
- New SQL function `indonesian.get_item_mastery_distribution(p_user_id uuid)` returning per-capability_type × per-label counts. Mirrors the (fixed) `labelForCapability` classifier from `masteryModel.ts:191`. Same shadow-mirror discipline as `_capability_source_progress_met` / `sourceProgressGates.ts`.
- TS-side `masteryModel.ts:labelForCapability` updated with the same threshold fixes (2c-1 and 2c-2). Keep TS and SQL in sync.
- Per-direction = filter by `c.capability_type IN ('text_recognition', 'meaning_recall', 'l1_to_id_choice')` for Recognition row vs `('form_recall')` for Recall row. Audio/dictation/grammar capabilities go into their own rows OR collapse into "Other" — to be decided at spec time.

## Fork 3 — Session-end facts

**Decision: Three categories — Goal impact (existing), Activity (migrated), Movement (new). Specific names for movement (capped at 3) + a summary line. Tier crossings only. Positive only at session-end; negatives surface elsewhere.**

### Why
- Today's `sessionSummaryService.getSessionLocalFacts` reads `review_events` and `learner_stage_events` — silent on capability-path sessions.
- Research consensus: specificity beats summary at session-end. Item-level callouts ("akhir → strengthening!") are the dopamine hit. Generic summary ("you reviewed 5 prompts") is hygiene baseline only.
- Loss-aversion / negative messaging works ON the streak and persistently (Voortgang) — NOT at session completion, which should be celebratory.

### Sub-decisions
- **3a. Three categories:**
  - **Goal impact** — keep `getWeeklyImpactChanges` from `sessionSummaryService.ts` as-is. Already works on both paths.
  - **Activity** — "5 reviewed, 3 correct, 12 minutes." Migrate to read `capability_review_events` (filtered by `session_id`).
  - **Movement** — NEW. Tier crossings during the session, with named items.
- **3b. Movement specificity: summary line + ≤3 specific names.**
  - Summary: "1 item beheerst, 2 items in versterking" (or English equiv).
  - Named items: highest-significance crossing first (→ mastered before → strengthening). Cap at 3, collapse rest into "+ N more."
  - Render `learning_items.base_text` (no translation lookup needed).
- **3c. Movement triggers — tier crossings only.** Detect transitions across the (Fork 2) thresholds: introduced→learning, learning→strengthening, strengthening→mastered, and at_risk on/off transitions. Plain forward reviews that don't cross a tier do NOT generate movement messages.
- **3d. Positive-only at session-end.** Items going FORWARD (to a higher tier or leaving at_risk) are surfaced. Items going BACKWARD (entering at_risk, regressing) are NOT shown at session-end.

### Where do negative warnings surface?
- **Voortgang at_risk callout** (Fork 2) — persistent panel listing items needing attention. Names them. User goes here to act.
- **Session-start framing** — reframe loss-aversion at the moment the user has energy to act: "Vandaag focus op 3 woorden die wat extra hulp nodig hebben" with specific items. Not at session-end.
- **Dashboard subtle badge** — small indicator on the lapsing/Achterstand card when items entered at_risk recently. Low-key but visible.

### Implementation pointer
New SQL function `indonesian.get_session_movement_facts(p_user_id uuid, p_session_id text)`:
- Reads `capability_review_events` for the session.
- For each capability touched, classifies the post-review label using the `labelForCapability` SQL mirror (Fork 2).
- For pre-session label: derive from the event payload (`schedulerSnapshot` field has prior `review_count`/`stability`/`lapse_count`/`consecutive_failure_count`; combined with `created_at` we can compute prior retrievability).
- Returns:
  - aggregate counts: items moved → mastered, → strengthening, etc.
  - top-3 named items by significance.
- TS-side: `sessionSummaryService.getSessionLocalFacts` becomes a wrapper around: `learnerProgressService` for activity counts, the new SQL for movement, the existing `goalImpactMessages` flow unchanged.

## Daily-rollup cleanup (separate decision)

**Decision: Delete the rollup pipe entirely.**

- Drop the pg_cron schedule (`cron.unschedule('goal-daily-rollup')`).
- Drop the `indonesian.job_daily_rollup_snapshot()` function.
- Drop the `learner_daily_goal_rollups` table (or keep for historical archive at admin discretion — TBD at spec time).
- Delete `scripts/lib/goal-job-service.ts` daily-rollup section.
- Remove `learnerStateService.getDailyRollups` and the `dailyRollups` field from `ProgressData` shape (`useProgressData.ts:142`).
- Remove from progressService.test.ts and any related tests.

Heatmap visualization (a related research finding from Duolingo / RemNote / Memrise) can be added later as a separate feature, computed on-demand from `capability_review_events` (single query with date_trunc bucket). Out of scope for this analytics-tier upgrade.

## Open items for spec time

These were intentionally not decided in this brainstorm; flag at spec writing:

1. **Audio/dictation/grammar capabilities in the mastery panel** — separate rows? "Other" bucket? Hidden from Voortgang for now? Likely punt to a v2.
2. **`weakestLabel` per-item drill-in** — when does the per-item view (tap an item from the funnel) get implemented? v1 of this work or v2?
3. **At_risk callout layout on Voortgang** — currently we have a separate "Vulnerable Items" panel. Does it merge with the new at_risk bucket from the mastery panel, or stay separate?
4. **Heatmap** — not in this scope, but worth a note in the spec's "Future Work" section.
5. **Streak loss-aversion tone shifts on Dashboard** — Day 6 of streak should feel different than Day 1. Brainstorm research flagged this; not decided here.

## References

### Research (web search, 2026-05-01)
- [Understanding retention in FSRS](https://expertium.github.io/Retention.html) — retrievability vs stability vs true retention
- [Target 80-90% Success Rate in Anki](https://eshapard.github.io/anki/target-an-80-90-percent-success-rate-in-anki.html) — retention-target tradeoffs
- [Duolingo Streak Habit Research](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) — 60% engagement; loss aversion A/B test
- [WaniKani SRS Stages](https://knowledge.wanikani.com//wanikani/srs-stages/) — discrete-tier display pattern
- [Vanity Metrics: How to Stop Using Them](https://improvado.io/blog/what-is-a-vanity-metric) — actionable vs vanity framing
- [Dealing with Leeches](https://controlaltbackspace.org/leech/) — surfacing struggling items + intervention strategies
- [RemNote Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition) — heatmap as standard pattern

### Codebase
- `src/lib/fsrs.ts:102` — `getRetrievability` already exposed
- `src/lib/mastery/masteryModel.ts:191-202` — per-capability classifier (existing)
- `src/lib/mastery/masteryModel.ts:223-235` — `weakestLabel` aggregation (existing)
- `src/components/progress/MemoryHealthHero.tsx:10-12` — broken `daysToPct` mapping (to be replaced)
- `src/services/sessionSummaryService.ts:90-124` — broken `getSessionLocalFacts` (to be migrated)
- `scripts/migration.sql:599-660` — `job_daily_rollup_snapshot` pg_cron function (to be dropped)
- `scripts/lib/goal-job-service.ts:130-260` — JS daily-rollup duplicate (to be dropped)
- `src/hooks/useProgressData.ts:142` — `dailyRollups` consumer (dead pipe; to be removed)

### Sister specs
- `docs/plans/2026-05-01-learner-progress-service-spec.md` v6 — surfacing-layer migration (shipped as PR-1/2/3/5)
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md` — broader capability migration roadmap
- `docs/plans/2026-04-28-learning-experience-implementation-spec.md` — already aware that legacy + capability events coexist for `lastMeaningfulPracticeAt`

## Next step

Write `docs/plans/2026-05-01-capability-analytics-tier-spec.md` from this decision log + the implementation pointers. Same six-pass-architect-review process as the surfacing-layer spec. Estimated: 1 spec session (~30k tokens) plus ~3 architect review passes.
