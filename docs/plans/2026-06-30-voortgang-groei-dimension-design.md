---
status: draft
reviewed_by: [staff-engineer]   # soundness/simplicity pass 2026-06-30 (see §9). STILL REQUIRES architect + data-architect (reader RPC contracts) before status: approved
supersedes: []
---

# Voortgang "Groei" Dimension — Progress as Motion, Not Position

**Date:** 2026-06-30
**Author:** brainstorm + research session (see `docs/research/2026-06-30-progress-metrics-evidence.md`)
**One-line:** Add a sixth Voortgang tab, **Groei** (Growth), holding two *trajectory* statistics — a **growth curve** (units mastered per week) and a **durability curve** (average memory strength over time) — both derived **read-only** from the existing append-only `capability_review_events` log. No new tables, no new writes.

## 1. Problem & motivation

Every current Voortgang statistic is a **snapshot**: the mastery funnel (`Woordenschat`/`Grammatica`/`Morfologie`) shows where the learner's units sit *today*; Vaardigheden shows *today's* skill counts; Tijd is mostly *this week's* minutes. The page answers "where am I" and never "where am I heading." For a learner, change-over-time *is* the most literal meaning of progress, and it is the page's one genuine gap.

Two trajectory lenses, both requested ("both"), both recoverable from data already recorded:

- **Growth / velocity** — "how fast is my knowledge growing?" (`+40 words mastered this month, vs 25 last`).
- **Durability** — "how solid is what I know?" (`my memory now holds ~32 days on average, up from 18`).

**Evidence base** (`docs/research/2026-06-30-progress-metrics-evidence.md`): the literature's warning targets *activity-vanity* metrics (streaks/minutes — the existing Tijd tab), not outcome metrics; both Groei metrics are outcome metrics that dodge that critique. **Durability is the more defensible** — it is metacognitive *calibration feedback* (PMC6390881) aimed at the documented illusion-of-competence failure of apps in this category. The research doc's six design reads are folded into §4 below.

## 2. Architectural grounding (per `docs/target-architecture.md:642-771`)

- `lib/analytics/` is **read-only** — "no writes, no mutations" (target-arch:644). This design adds only readers. ✅
- The target roster **reserved a `memory` sub-module** (`retention/accuracy/health/latency`, target-arch:655-659, 702-704). The 2026-06-11 redesign **shelved it as "FSRS decoration with no learner-facing home"** (target-arch:684-692). **The durability curve is that missing home** — this design revives `memory` minimally, with a learner-facing purpose, rather than inventing a new surface.
- Weekly movement "lives IN `mastery`, not a separate `movement/` sub-module" (target-arch:688-689). The growth curve is the **time-series generalization of the existing `deriveWeeklyMovement` / `get_weekly_movement`** (`masteryModel.ts:745`, `:1003`), so it extends `mastery` — it does not add a parallel module.
- ADR 0015 (server-side RPC aggregation for small bounded results; mirrored predicate held in lockstep by a health check) is the precedent both new RPCs follow.

**No constraint conflict found:** both surfaces the design touches are reserved-but-empty in the target architecture; this design fills them at the intended seam.

## 3. Design

### 3.1 Data source (already recorded — this is the crux)

`capability_review_events` (migration.sql:1457) is **append-only, one row per review attempt**, never overwritten, indexed on `(user_id, created_at DESC)` (`:2352`). Each row carries `created_at`, `state_before_json`, `state_after_json` — the latter two include `stability`, `reviewCount`, `lapseCount`, `consecutiveFailureCount`, `lastReviewedAt`. The snapshot stats read the *overwritten* `learner_capability_state`; the trajectory stats read this *log*. **The history already exists; we add reads, not writes.** Trend depth is bounded by log age (currently short / test data — acceptable; real history accrues automatically from launch).

### 3.2 Growth curve — generalize weekly movement to a series

**New RPC `get_mastery_movement_series(p_user_id, p_timezone, p_weeks int default 12)`** → one row per ISO week (most recent `p_weeks`):
`week_start date, advanced_vocab int, advanced_grammar int, advanced_morphology int, reached_mastered int, slipped int`.

Body is `get_weekly_movement` (migration.sql:2382) with the current-week `where` filter replaced by a `date_trunc('week', created_at)` GROUP BY over the last `p_weeks` weeks, same `funnelBucket` split, same distinct-`source_ref` dedup, same `_mastery_label`.

> **Design decision for data-architect (§7 Q1):** the single-week RPC evaluates `_mastery_label(..., now())` because its events *are* current. For a *past* week, recency must be evaluated **as of the event** — pass `e.created_at` as the label's `now` arg, not `now()` — so a word that was "mastered" in week −8 is counted as mastered *then*, not relabelled by today's recency clock. The single-week RPC's behaviour is unchanged (its `now()` ≈ `created_at` within the current week); HC parity (§6) asserts the series' newest bucket equals `get_weekly_movement`.

**TS:** `getMovementSeries(userId, tz, weeks)` in `masteryModel.ts`, sibling to `getWeeklyMovement`; returns `MovementWeek[]`. (No client-side re-derivation — the RPC is authoritative, mirroring the existing pattern.)

### 3.3 Durability curve — revive `analytics.memory`

**New RPC `get_stability_series(p_user_id, p_timezone, p_weeks int default 12)`** → per week-end, the **average last-known stability across the learner's reviewed capabilities as of that week-end**:
`week_start date, avg_stability_days numeric, sample_size int`.

This reconstructs `get_memory_health`'s *current* average (which reads `learner_capability_state`) at each historical week-end: for each week boundary, `distinct on (capability_id) … where created_at <= week_end order by capability_id, created_at desc`, then `avg(state_after.stability)`. Cumulative state ⇒ a true trend, not "stability of words touched this week." Bounded `p_weeks`, indexed scan; SECURITY INVOKER, `where user_id = p_user_id`.

**TS:** revive `src/lib/analytics/memory/index.ts` with `stabilitySeries(userId, tz, weeks) → StabilityWeek[]` and add `memory` back to the `analytics` barrel.

> **Self-contained — does NOT depend on `get_memory_health`** (staff-engineer pass, §9). That function lives ONLY in the paper-trail `scripts/migrations/2026-05-01-learner-progress-functions.sql`, is absent from the canonical `scripts/migration.sql`, and is rendered nowhere — its live presence/shape is unverified, so the durability curve must not lean on it. `get_stability_series` reads `capability_review_events` directly and stands alone. (If a current-snapshot `health()` is wanted later, re-declare `get_memory_health` in `migration.sql` first, with its own verification — out of scope here.)

### 3.4 UI — one new tab

`Progress.tsx`: add `'groei'` to `Tab`/`TABS` and a `PillSegmented` entry (label `T.progress.tabGrowth`). Two cards under it:

- **`GrowthCurveCard`** — bar/line of per-week mastered units (stacked vocab/grammar/morphology, reusing the funnel's colour tokens), `slipped` shown honestly. **Carries a strategy nudge** (design read #2): e.g. "+12 woorden — houd je dagelijkse sessie vast om dit tempo te halen." Not a naked number.
  > **Headline = NET-DISTINCT, not a sum of weekly flows** (staff-engineer pass, §9). The per-week `reached_mastered` is a *flow* ("advanced a rung this week"); mastery is non-monotonic (advance→slip→re-advance), so **summing weeks double-counts** a word re-mastered twice — exactly the inflated vanity number the research warns against. The bars are honest *velocity*; the month headline must be **net-distinct words mastered now that weren't a month ago** (a snapshot diff, not a flow sum), or be labelled plainly as "rung-vooruitgang" (activity), never "X woorden geleerd."
- **`DurabilityCard`** — line of `avg_stability_days` over weeks. **Plain-language, calibrating headline** (design read #3): "Je geheugen houdt nu ~32 dagen vast (was 18 vorige maand)" — never raw "stability: 32.4". Pairs conceptually with the recognise/produce/listen skill card.

**Plateau handling** (design read #5): a flat/declining curve is framed as direction, not failure — a dip surfaces "X words to review" (the funnel already models `at_risk`/`slipped`), so a downturn reads as a recovery action, not a scolding. **Personal-trajectory only — no social comparison** (design read #4; the leaderboard stays retired).

## 4. Minimum-mechanism / omission test

| New piece | What breaks if omitted |
|---|---|
| `get_mastery_movement_series` | No growth trend — only Dashboard's single-week count exists; cannot show velocity/month-over-month. |
| `get_stability_series` | No durability trend — only a current snapshot (and that snapshot is itself unrendered today). |
| Revived `memory` sub-module | Durability reader has no home; would otherwise be mis-placed in `mastery`/`engagement` against the target roster. |
| `Groei` tab + 2 cards | The data has no surface; RPCs would be dead. |

**Explicitly NOT built** (would be mechanism beyond the goal): no new tables; no write-path instrumentation; no per-day granularity (week buckets match every existing time stat); no capability/coverage/reading-listening trajectory (those need the activity-tracking plumbing the user declined). `p_weeks` defaults to 12 — a bounded window, not unbounded history.

## 5. Supabase Requirements

### Schema changes
- **No new tables or columns.** Two new **SECURITY INVOKER** read RPCs in `scripts/migration.sql`: `get_mastery_movement_series`, `get_stability_series`. Both filter `where user_id = p_user_id` (the project's invoker-RPC safety idiom, migration.sql:571).
- **RLS:** none added. Both RPCs read `capability_review_events`, which already has owner-only read RLS (migration.sql:1514) + `grant select … to authenticated` (`:1535`).
- **Grants:** `grant execute on function … to authenticated` for both (mirrors `get_weekly_movement`, migration.sql:2476).
- Run `make migrate-idempotent-check` before merge (RPCs use `create or replace`).

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (`indonesian` already exposed; RPCs are reachable once defined).
- [ ] Kong CORS — **N/A** (no new headers/origins).
- [ ] GoTrue — **N/A.**
- [ ] Storage — **N/A.**

### Health check additions
- `scripts/check-supabase-deep.ts`: assert both functions exist + are `authenticated`-executable.
- **Parity check (lockstep, ADR 0015 / HC28 precedent):** assert `get_mastery_movement_series(...).→ newest week` equals `get_weekly_movement(...)` for the same user/tz, so the series and the shipped single-week RPC never drift.

## 6. Testing

- **TS derivers** (Vitest): movement-series bucketing (empty log → zero-filled weeks; multi-week advancement dedups per `source_ref`; `slipped` counted), stability-series (empty → empty; cumulative last-known semantics), plateau/decline framing in the card.
- **Component** (RTL): `Groei` tab renders both cards; deep-link `/progress?tab=groei`; headline delta + strategy nudge present; durability shows plain-language days not raw stability.
- **RPC parity** test backing the §5 health check.

## 7. Phasing (staff-engineer pass, §9)

The event log is currently short and mostly disposable test data; a 12-week trajectory over it shows noise, not a learner. So **build in two phases — sequencing, not goal-shrinking; both curves remain the design:**

- **Phase 1 — durability curve** (`get_stability_series` + `memory` revival + `DurabilityCard`). The research's defensible-if-forced-to-one pick; self-contained; the calibration value lands even on a short log because it's about *strength*, not *count*.
- **Phase 2 — growth curve** (`get_mastery_movement_series` + `GrowthCurveCard`), landing once real post-launch history exists so the velocity bars and net-distinct headline are meaningful rather than test-noise.

Both phases ship behind the same `Groei` tab; Phase 1 may launch the tab with one card.

## 8. Open questions for review

- **Q1 (data-architect):** confirm passing `e.created_at` (not `now()`) as the label clock for historical weeks in `get_mastery_movement_series` (§3.2). Does this preserve `_mastery_label` semantics for the recency rule across the full window? *(Staff-engineer confirmed the trap is real — `get_weekly_movement` hardcodes `now()` at migration.sql:2411,2419.)*
- **Q2 (data-architect) — DECIDED, confirm perf only:** `get_stability_series` uses the cumulative `distinct on (capability_id)` per week-end (the snapshot the card claims to trend). The "in-week proxy" is rejected — it is a different, biased metric (staff-engineer pass). Confirm the bounded 12-week window cost is acceptable.
- **Q3 (architect):** revive `memory` sub-module (target-roster-faithful) vs. fold the durability headline into the existing skill card to avoid a thin ~1–2-function module — staff-engineer flagged this as minimum-mechanism pressure. Which better serves the locked roster intent?

## 9. Review log

- **2026-06-30 — staff-engineer (soundness/simplicity):** verdict NEEDS WORK → addressed. Folded in: dropped the unverified `get_memory_health` dependency (§3.3); net-distinct growth headline to avoid the double-count vanity number (§3.4); committed to cumulative stability, rejected the in-week proxy (§8 Q2); phased the build durability-first (§7). Carried forward to rigor review: Q1 (label clock, confirmed real), Q3 (`memory` sub-module thinness).

## 10. Reviewers required

Per CLAUDE.md (data-model / reader-contract rule + `plan-review-gate`): this adds **reader RPC contracts**, so it needs **both `architect`** (Q3 placement) **and `data-architect`** (Q1/Q2 RPC shape) in `reviewed_by:` before `status: approved`.
