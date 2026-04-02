# FSRS Goal System Specification

**Date:** 2026-04-02
**Status:** Proposed
**Depends On:** Retention-First Learning System V2 design (`2026-03-30-retention-first-v2-design.md`, user-provided external design doc)
**Audience:** Product, design, frontend, backend, analytics

---

## 1. Goal

Add a goal system that works with the existing retention-first FSRS design and helps Indonesian learners stay consistent, see meaningful progress, and build speaking and understanding ability without optimizing for shallow activity.

This system should:
- reinforce daily return behavior without making missed days feel catastrophic
- measure progress in terms of usable vocabulary, recall quality, and backlog health
- convert weekly goals into adaptive daily recommendations
- fit the current schema with minimal new data storage
- support future social features and leaderboard-safe competition

This system should not:
- reward raw review volume as the primary success metric
- depend on global competition for motivation
- punish users harshly for one missed day
- require FSRS parameter optimization to be useful at launch

---

## 2. Product Principles

### 2.1 Retention first
Goals should reward durable memory, not activity volume. A user who reviews fewer items but meaningfully advances recall and stage progression should be considered more successful than a user who taps through many low-value interactions.

### 2.2 Speaking and understanding over passive recognition only
Because the app is for learning Indonesian to speak and understand, recall and comprehension-related outcomes should carry more weight than recognition alone.

### 2.3 Weekly framing, daily guidance
Weekly goals provide the primary sense of progress. Daily goals are recommendations derived from weekly targets and current due load.

### 2.4 Recovery-friendly motivation
The system should encourage returning after a miss. Broken perfection should not collapse the entire motivation model.

### 2.5 Adaptive pacing
When due load grows, the system should reduce suggested new items automatically.

---

## 3. Goal Model Overview

The goal system has 3 layers.

### 3.1 Weekly goals
These are the main progress targets the user sees on the dashboard and progress page.

At launch, every learner has 4 weekly goals:
- Consistency Goal
- Recall Quality Goal
- Usable Vocabulary Goal
- Review Health Goal

### 3.2 Daily plan
Each day, the app computes a recommended study plan from:
- weekly goals
- current due items
- overdue pressure
- preferred session size
- recent completion history

The daily plan answers:
- how many due reviews should I do today?
- how many new items should I introduce today?
- how many recall-heavy interactions should I complete today?

### 3.3 Goal scoring
Every weekly goal has:
- a direction (`at_least` or `at_most`)
- a unit (`count` or `percent`)
- a target value
- a current progress value
- a status (`on_track`, `at_risk`, `achieved`, `missed`)
- an `is_provisional` flag for low-confidence or low-sample metrics
- optional confidence or forecast text

---

## 4. Launch Goal Set

## 4.1 Consistency Goal

**Purpose:** Build habit and keep exposure frequent.

**User-facing text examples:**
- Study on 4 days this week
- 3 of 4 study days completed
- On track: one more study day by Sunday to complete this goal

**Definition:**
Count unique local-calendar days within the current week on which the learner completed at least one valid learning interaction.

**Valid interaction rule:**
A day counts as studied if either:
- the user has at least 1 `review_events` row on that date, or
- the user completed a `learning_sessions` row of type `learning` or `practice` with at least 1 logged review event

**Recommended default target:**
- starter target: 4 days/week
- adaptive range after first completed week: 4-6 days/week

**Primary source tables:**
- `review_events`
- optionally `learning_sessions` for display only

**Why it matters:**
Frequent return behavior is essential for spaced repetition success and language exposure.

---

## 4.2 Recall Quality Goal

**Purpose:** Reward active retrieval quality, not just completion.

**User-facing text examples:**
- Keep recall accuracy at 82%+
- Recall accuracy 79%, slightly below target
- Strong week: recall quality above target for 3 days running

**Definition:**
Measure weekly success rate on recall-oriented interactions.

**Launch formula:**
- numerator = number of `review_events` where `skill_type = 'recall'` and `was_correct = true`
- denominator = number of `review_events` where `skill_type = 'recall'`
- `recall_accuracy = numerator / denominator`

**Valid sample floor:**
If the learner has fewer than 10 recall events in the week, show progress as provisional and avoid strong judgmental messaging.

**Recommended default target:**
- starter target: 0.80
- adaptive range after first completed week: 0.80 to 0.85

**Primary source tables:**
- `review_events`

**Why it matters:**
For speaking ability, active recall matters more than recognition-only success.

---

## 4.3 Usable Vocabulary Goal

**Purpose:** Show durable vocabulary growth tied to speaking readiness.

**User-facing text examples:**
- Move 15 items into productive this week
- 9 of 15 usable words gained
- 3 items reached maintenance this week

**Definition:**
Count weekly increases in items that reach higher-utility stages.

**Launch metric:**
`usable_items_gained = count(distinct learning_item_id) for items whose stage entered 'productive' or 'maintenance' during the current week`

Counting rule:
- one learning item can contribute at most once to the headline weekly gain metric in a given week
- if the same item enters both `productive` and `maintenance` in the same week, it still counts as 1 usable item gained
- breakdown views may still show separate counts for `entered productive` and `entered maintenance`

**Important note:**
This is intentionally different from total items learned. It focuses on items that are genuinely becoming usable for speech and stable recall.

**Recommended default target:**
- starter target: 8 items/week
- adaptive range after first completed week: 6-16 items/week

**Primary source tables:**
- `learner_stage_events`
- `learner_item_state` for current-state drill-down

**Implementation note:**
The current schema does not store stage transition history explicitly. To support precise weekly stage gains, one of these approaches is needed:

### Recommended approach
Add a lightweight append-only stage transition table:
- `learner_stage_events(id, user_id, learning_item_id, from_stage, to_stage, source_review_event_id, created_at)`

This is the cleanest and most accurate option.

### Fallback approach
Infer transitions from `review_events.scheduler_snapshot` plus current `learner_item_state.updated_at`.

This is not recommended for product-grade goal accuracy because:
- `updated_at` changes on every item-state update, not only stage changes
- it is difficult to reconstruct whether a productive-stage item became productive this week or earlier

---

## 4.4 Review Health Goal

**Purpose:** Prevent backlog stress and support a manageable learning system.

**User-facing text examples:**
- Keep overdue items at 20 or fewer
- 12 overdue items: healthy
- At risk: overdue queue grew by 7 since Monday

**Definition:**
Track the number of skill states that are already due beyond the current day and use that as a backlog-health metric.

**Launch formula:**
- `due_now = count of learner_skill_state rows where next_due_at <= now()`
- `overdue = count of learner_skill_state rows where next_due_at < start_of_today_local`

The weekly goal should be based on `overdue`, not `due_now`, because same-day due items are normal.

Interpretation:
- during the week, review health is a snapshot-based operational metric using the current overdue count
- at week close, final success/failure is resolved from a stored `closing_overdue_count`
- `closing_overdue_count` is captured once by the weekly finalization routine and becomes the canonical closed-week value
- this goal does not claim that the learner stayed under the threshold continuously throughout the week

**Recommended default target:**
- starter target: keep overdue items at 20 or fewer
- launch behavior: keep review-health target fixed at 20

**Primary source tables:**
- `learner_skill_state`

**Why it matters:**
Backlog stress is a major reason users avoid return in spaced repetition systems.

---

## 5. Should the app include words to learn/review per day?

Yes, but as adaptive daily guidance, not as the primary weekly success measure.

### 5.1 Include these daily plan values
- `due_reviews_today_target`
- `new_items_today_target`
- `recall_interactions_today_target`
- `estimated_minutes_today`

### 5.2 Do not use these as main weekly KPIs
Avoid making these the headline success metrics:
- total reviews completed this week
- total new cards added this week
- total minutes spent this week

### 5.3 Why
For this app, learners should feel that they are building Indonesian they can use, not grinding numbers.

---

## 6. Daily Recommendation Engine

## 6.1 Inputs
The daily recommendation engine should use:
- `profiles.preferred_session_size`
- current due count from `learner_skill_state`
- current overdue count from `learner_skill_state`
- recommendation recall quality from `review_events`
- recent completion history
- weekly goal progress state
- optional day-of-week remaining study opportunities

Launch behavior expectations for these inputs:
- if the learner has already completed a study session on the current local day, reduce `new_items_today_target` by 1
- day-of-week remaining study opportunities may support consistency-aware pacing later, but are optional at launch and should not block implementation

### Recommendation recall quality definition
Use this precedence order:
1. current-week recall accuracy, if current-week recall sample size >= 10
2. trailing 14-day recall accuracy, if trailing 14-day recall sample size >= 10
3. current weekly recall target, if neither sample is large enough

## 6.2 Outputs
Each day the app computes:
- `due_reviews_today_target`
- `new_items_today_target`
- `recall_interactions_today_target`
- `estimated_minutes_today`
- optional explanatory text

Semantics:
- `due_reviews_today_target` is the number of due review interactions planned for today
- `new_items_today_target` is the number of new items planned for introduction today
- `recall_interactions_today_target` is the minimum number of today's planned interactions that should be active-recall interactions
- `recall_interactions_today_target` is not additive on top of due + new; it is a composition requirement inside the day's planned workload
- `estimated_minutes_today` should be computed from the union of the planned interactions, not by summing due + new + recall as independent buckets

## 6.3 Launch heuristics

### Due reviews target
- if `due_now <= preferred_session_size`: target all due items
- else if `overdue > 20`: target `min(due_now, preferred_session_size + 5)`
- else: target exactly `preferred_session_size`

### New items target
Start from a deterministic base target derived from the current week's usable-vocabulary target:
- if usable-vocabulary target <= 6: base = 3
- if usable-vocabulary target is 7-10: base = 4
- if usable-vocabulary target is 11-14: base = 5
- if usable-vocabulary target >= 15: base = 6

Apply caps:
- if `due_now > 20`: max 2 new items
- if `due_now > 40`: max 0 new items
- if recommendation recall quality < target - 0.05: reduce by 2
- if user already achieved usable vocabulary goal this week: reduce by 1
- if recent completion history shows a study session already completed on the current local day: reduce by 1

### Recall interactions target
Ensure at least one meaningful block of active recall each study day.

Launch rule:
- `desired_recall_target = max(8, ceil(due_reviews_today_target * 0.4))`
- `recall_supply_cap = count of active-recall-capable interactions available in today's planned workload`
- `recall_interactions_today_target = min(desired_recall_target, recall_supply_cap)`

Launch recall-supply rule:
- count planned due interactions that are explicitly recall-skill interactions
- add planned new-item interactions only if the session design includes a recall-capable step for those new items
- do not promise more recall interactions than the planned session can actually supply

### Estimated minutes
Estimate with a simple heuristic:
- recognition MCQ average: 8-12 sec
- typed recall average: 15-25 sec
- cloze average: 20-30 sec

Use a conservative blended launch estimate:
- `estimated_minutes_today = ceil(total_interactions_today * 0.33)`

This can be replaced later by using `review_events.latency_ms`.

---

## 7. Recommended Data Additions

The goal system can mostly run on the current schema, but 4 data additions are strongly recommended, plus a profile timezone requirement.

## 7.1 New table: learner_weekly_goal_sets

Purpose:
Store the generated weekly contract for one learner-week so all child goals share the same frozen timezone, week boundaries, and adaptive target-generation context.

Suggested columns:
- `id`
- `user_id`
- `goal_timezone` (IANA timezone name, for example `Europe/Amsterdam`)
- `week_start_date_local`
- `week_end_date_local`
- `week_starts_at_utc`
- `week_ends_at_utc`
- `generation_strategy_version`
- `generated_at`
- `closing_overdue_count`
- `closed_at`
- `created_at`
- `updated_at`

Notes:
- one row per user per generated week
- this is the source of truth for the week contract
- current-week lookup should first search for an existing goal set where `week_starts_at_utc <= now_utc < week_ends_at_utc`
- goal-set creation must be atomic with creation of all 4 child goal rows
- if a concurrent request finds an existing goal set with missing child rows, it must fill in the missing rows before returning
- add an index supporting week finalization lookups, for example on `(user_id, closed_at, week_ends_at_utc)`

## 7.2 New table: learner_weekly_goals

Purpose:
Store the generated weekly targets and per-goal lifecycle state under a parent weekly goal set.

Suggested columns:
- `id`
- `goal_set_id`
- `goal_type` (`consistency`, `recall_quality`, `usable_vocabulary`, `review_health`)
- `goal_direction` (`at_least`, `at_most`)
- `goal_unit` (`count`, `percent`)
- `target_value_numeric`
- `current_value_numeric`
- `status` (`on_track`, `at_risk`, `achieved`, `missed`)
- `is_provisional`
- `provisional_reason`
- `sample_size`
- `goal_config_jsonb`
- `created_at`
- `updated_at`

Notes:
- one row per goal type per goal set
- `status` is the canonical progress status
- `is_provisional` is separate from `status` and is used mainly for low-sample metrics such as recall quality
- for the current open week, `current_value_numeric`, `status`, `is_provisional`, `provisional_reason`, `sample_size`, and `updated_at` are persisted snapshot fields refreshed by the goal service before returning data
- once a goal set is closed and finalization is applied, these fields are frozen and should not be recomputed except by explicit repair/admin tooling

## 7.3 New table: learner_stage_events

Purpose:
Store exact stage transitions so weekly stage-growth goals are accurate.

Suggested columns:
- `id`
- `user_id`
- `learning_item_id`
- `from_stage`
- `to_stage`
- `source_review_event_id`
- `created_at`

Notes:
- append-only
- insert only when stage actually changes
- enables weekly counts such as productive gains and maintenance gains
- `source_review_event_id` must be unique so replayed or retried review submissions do not duplicate stage events

## 7.4 Profile timezone requirement

The weekly goal system requires a source timezone for generation.

Recommended profile field:
- `profiles.timezone` (IANA timezone name)

Rules:
- weekly goal generation requires a valid `profiles.timezone`
- if `profiles.timezone` is missing or invalid, do not generate weekly goals yet
- instead prompt the user to set timezone in Profile before first weekly goal generation
- onboarding should collect timezone before weekly goal surfaces are shown
- use `profiles.timezone` when generating a new weekly goal set
- write that value into `learner_weekly_goal_sets.goal_timezone`
- once a goal set exists, all week-local computations for that goal set must use `learner_weekly_goal_sets.goal_timezone`, not the current `profiles.timezone`
- do not mutate the current goal set if the profile timezone changes mid-week
- profile timezone changes apply only to future generated weeks

### Timezone-required surface behavior
If weekly goals cannot be generated yet because `profiles.timezone` is missing or invalid, goal-related surfaces should return a stable non-error state instead of failing or rendering partial data.

Recommended response shape:
- `state = timezone_required`
- `weeklyGoalSet = null`
- `weeklyGoals = []`
- `todayPlan = null`
- `requiredProfileAction = set_timezone`

This should map to a friendly UI prompt that routes the learner to the existing Profile timezone setting.

## 7.5 New table: learner_daily_goal_rollups

Purpose:
Store denormalized per-user, per-local-day history for trends, analytics, and lightweight progress surfaces.

Suggested columns:
- `id`
- `user_id`
- `goal_timezone`
- `local_date`
- `study_day_completed`
- `recall_accuracy`
- `recall_sample_size`
- `usable_items_gained_today`
- `usable_items_total`
- `overdue_count`
- `created_at`
- `updated_at`

Notes:
- one row per user per local date
- add a uniqueness constraint on `(user_id, local_date)`
- this table is written by the daily rollup snapshot job
- this table is for history, analytics, and trend rendering
- this table is not the canonical source of truth for current open-week goal progress

## 7.6 Optional denormalized weekly view

Optional view for faster UI reads:
- `learner_weekly_goal_progress_v`

This can precompute:
- study_days_completed
- weekly_recall_accuracy
- usable_items_gained
- overdue_count

This is optional at launch; application-side aggregation is acceptable if scale is small.

---

## 8. Goal Generation Rules

Goals should be generated once per week and stay stable for that week.

## 8.1 Weekly generation moment
Generate current-week goal rows when:
- the user opens the app for the first time in a new week, or
- a scheduled backend process creates the week ahead of time

Use the user's local timezone when deriving week boundaries.

### Week boundary convention
- weeks start on local Monday at `00:00`
- weeks end at the next local Monday at `00:00`
- `week_start_date_local` should always be the local Monday date for that learner-week
- `week_starts_at_utc` should be the UTC instant corresponding to that local Monday `00:00`
- `week_ends_at_utc` should be the UTC instant corresponding to the next local Monday `00:00`
- uniqueness, scheduled jobs, finalization, elapsed-week calculations, and test fixtures should all use this Monday-start local-week convention

Generation flow:
1. Read and validate `profiles.timezone`
2. If timezone is missing or invalid, return the `timezone_required` state instead of generating goals
3. Finalize any older open goal sets whose `week_ends_at_utc < now_utc`
4. Look for an existing `learner_weekly_goal_sets` row where `week_starts_at_utc <= now_utc < week_ends_at_utc`
5. If found, reuse it and do not regenerate the week
6. If not found, create a new goal set and all 4 child goal rows in one transaction using the current profile timezone
7. Freeze that timezone on the goal set for the duration of the week

This avoids goal rows drifting if the user changes timezone or travels mid-week.

## 8.1a Scheduled background jobs

The design should include 4 scheduled background jobs. These jobs complement the live app flows, but do not replace live on-read refresh for open-week progress or today's plan.

### Scheduling model
- use a small number of shared scheduled jobs, not separate cron jobs per user timezone
- for Supabase-backed implementations, these jobs can be implemented as shared scheduled SQL/database functions
- timezone eligibility should be determined inside the job logic from `profiles.timezone`
- users may be processed in internal timezone batches, but cron definitions themselves should stay shared and fixed-cadence
- hourly cadence is sufficient for timezone-sensitive weekly and daily boundary work in this system

### 1. Weekly finalization job
Purpose:
- close past-due weekly goal sets shortly after `week_ends_at_utc`
- capture `closing_overdue_count`
- compute final goal statuses
- set `closed_at`

Rules:
- this job is required for correctness of closed-week history
- run this job hourly
- it must be idempotent
- it should use the same finalization service logic as any fallback read-path closure

### 2. Current-week pre-generation job
Purpose:
- create the new weekly goal set shortly after a user's local week begins
- reduce first-open latency and ensure weekly goals already exist when the learner returns

Rules:
- skip users with missing or invalid `profiles.timezone`
- run this job hourly
- use the same atomic goal-set generation logic as the app-read path
- app-open generation may remain as a fallback if pre-generation has not yet run

### 3. Daily rollup snapshot job
Purpose:
- materialize denormalized daily aggregates for trend, analytics, and lightweight history surfaces

Candidate outputs:
- daily study-day completion marker
- daily recall accuracy snapshot
- daily usable vocabulary total or gain marker
- daily overdue snapshot

Rules:
- run this job hourly by default so local-day rollovers can be captured without per-timezone cron definitions
- write rollups into `learner_daily_goal_rollups`
- this job is for history/trends and analytics, not for the canonical current-week source of truth
- open-week UI progress and today's recommendations should still be refreshed live on read

### 4. Integrity and repair sweeper
Purpose:
- detect and repair inconsistent goal state across scheduled and live flows

Examples:
- goal sets missing one or more child goal rows
- weeks that should be closed but are still open
- pre-generation missed for an eligible user
- stale or inconsistent denormalized rollups

Rules:
- use the same shared creation/finalization logic as the core services
- run this job daily
- remain idempotent and safe to run repeatedly

## 8.2 Adaptive target generation

There are no user-facing difficulty settings at launch.

Instead, weekly targets should adapt quietly from the prior closed week using deterministic rules.

### New learner defaults
- consistency target: 4 days
- recall quality target: 0.80
- usable vocabulary target: 8 items
- review health target: keep overdue items at 20 or fewer
- new items/day base: 4

### Inputs from the prior closed week
- final goal statuses for consistency, recall quality, usable vocabulary, and review health
- closing overdue snapshot
- recall sample size for the week
- prior target values

### Deterministic adjustment order
Evaluate in this order:

1. **Protective reduction rule**
- if prior week `review_health` was `missed`, reduce next week targets:
  - consistency: `max(previous_consistency_target - 1, 4)`
  - recall quality: `max(previous_recall_target - 0.02, 0.80)`
  - usable vocabulary: `max(previous_usable_target - 2, 6)`
  - review health: keep at `20 or fewer`

2. **Promotion rule**
- else if prior week achieved all of:
  - `consistency`
  - `recall_quality`
  - `usable_vocabulary`
  - and `review_health` was not `missed`
  - and recall sample size was at least 20
- then increase next week targets:
  - consistency: `min(previous_consistency_target + 1, 6)`
  - recall quality: `min(previous_recall_target + 0.02, 0.85)`
  - usable vocabulary: `min(previous_usable_target + 2, 16)`
  - review health: keep at `20 or fewer`

3. **Stability rule**
- otherwise, keep all targets unchanged from the prior week

### Conflict resolution rule
- if signals conflict, `review_health missed` wins and blocks all increases
- if recall sample is below 20, do not increase recall or usable-vocabulary targets that week
- if no prior closed week exists, use new learner defaults

### Product rule
- do not expose named difficulty tiers such as `light`, `standard`, or `ambitious`
- do not ask users to tune weekly difficulty at launch
- let the system increase challenge only when learner behavior indicates readiness

---

## 9. Goal Progress Status Rules

Each goal row should expose a status.

### achieved
Current value has met or exceeded the target.

### on_track
Current pace is sufficient to plausibly hit the target this week.

### at_risk
Current pace is behind target and requires action, but is still recoverable.

### missed
The week ended and the target was not reached.

### provisional handling
`Provisional` is not a status. It is a separate display/confidence flag, used when the metric is sample-sensitive and the denominator is too small, especially for recall quality.

Recommended fields:
- `is_provisional`
- optional `provisional_reason`
- optional `sample_size`

API guidance:
- if the frontend is expected to explain provisional state, the goal payload should expose `isProvisional`, `provisionalReason`, and `sampleSize`
- if a surface only needs a badge, `isProvisional` alone is sufficient

Additional rule:
- cumulative `at_least` goals such as consistency and usable vocabulary may transition to `achieved` before week end
- stability or threshold goals such as review health should normally remain `on_track` or `at_risk` during the week and resolve to `achieved` or `missed` when the week closes

### Deterministic status rules by goal type

#### Consistency
- `achieved` if `study_days_completed >= target`
- `on_track` if `study_days_completed < target` and the remaining calendar study opportunities in the current local week are enough to still reach target
- `at_risk` if `study_days_completed < target` and even perfect use of the remaining calendar study opportunities would not reach target
- `missed` at week close if target was not reached

#### Usable vocabulary
- `achieved` if `usable_items_gained >= target`
- `on_track` if `usable_items_gained < target` but current progress is at or above expected elapsed-week pace
- `at_risk` if `usable_items_gained < target` and current progress is below expected elapsed-week pace
- `missed` at week close if target was not reached

Expected elapsed-week pace rule:
- `expected_progress = target * elapsed_week_fraction`
- `elapsed_week_fraction` should be clamped between 0 and 1 using the user's local Monday-start week boundaries

#### Recall quality
- during the week, if recall sample size is `0`, set status to `on_track` and `is_provisional = true`
- during the week, `on_track` if current recall accuracy is at or above target, or no more than 0.03 below target
- during the week, `at_risk` if current recall accuracy is more than 0.03 below target
- at week close, if final recall sample size is `0`, set status to `missed` and `is_provisional = true`
- `achieved` at week close if final recall accuracy is at or above target
- `missed` at week close if final recall accuracy is below target
- `is_provisional` remains a separate confidence flag and does not change the underlying status rule

#### Review health
- during the week, `on_track` if `overdue_count <= target`
- during the week, `at_risk` if `overdue_count > target`
- `achieved` at week close if `closing_overdue_count <= target`
- `missed` at week close if `closing_overdue_count > target`

Week closing rule:
- a goal set is closed when `now_utc >= week_ends_at_utc` and finalization has been applied
- finalization stores `closing_overdue_count`, sets `closed_at`, and resolves any still-open goal statuses to their final values
- the scheduled weekly finalization job is the primary mechanism for closing weeks
- goal-service reads for the current week may still finalize unexpectedly open older weeks as a fallback safety path

---

## 10. UI Specification

## 10.1 Dashboard

The dashboard should show a compact weekly goal module.

The dashboard should stay recall-focused. Recognition detail belongs on the Progress page.

### Module content
- heading: `This Week`
- 4 goal rows with progress bars or rings
- one `Today` card underneath

### Goal row format
- title
- current / target
- short supportive status text
- optional icon

Example:
- `Study days` -> `3/5`
- `Recall quality` -> `81% / 82%`
- `Usable words` -> `7/15`
- `Overdue items` -> `12 / max 20`

### Today card
- `Today: 18 reviews, 2 new words, 8 recall prompts`
- `About 10 minutes`
- CTA: `Start Today's Session`

### Timezone-required state
If no valid profile timezone exists yet, replace the weekly goal module and Today card with a friendly setup card:
- title: `Set your timezone`
- body: `Set your timezone so we can create your weekly goals correctly.`
- CTA: `Set timezone`
- CTA behavior: open the existing Profile timezone setting

## 10.2 Progress Page

The progress page should provide more detail.

Sections:
- weekly goals summary
- trend sparkline for the last 4-8 weeks
- recognition vs recall comparison
- productive and maintenance growth trend
- backlog trend

## 10.3 Session Summary

After a session, connect the session to weekly goals.

Use 2 message categories with separate canonical sources:

### Session-local event messages
Derived only from events created by the just-completed session.

Good examples:
- completed recall prompts in this session
- items that entered `productive` or `maintenance` in this session
- reviews completed in this session

### Weekly-status transition messages
Derived only from recomputing the persisted weekly goal snapshot after the session has been applied and comparing the before/after weekly state.

Before/after snapshot contract:
- the `before` snapshot is the persisted `learner_weekly_goals` state read immediately before applying the session
- the `after` snapshot is the recomputed and persisted `learner_weekly_goals` state after the session has been applied
- weekly-impact messages should compare those two persisted weekly snapshots, not ad hoc aggregate recalculations from unrelated reads

Good examples:
- a weekly goal moved from `at_risk` to `on_track`
- a weekly goal moved to `achieved`
- a weekly backlog-health status became compliant again

Rule:
- do not derive the same message type from both session events and weekly recomputation
- session-local fact messages must come from session-local events only
- weekly-impact messages must come from post-session weekly goal recomputation only

Example lines:
- `You completed 6 of today's 8 recall prompts`
- `Recall quality is now back on track for this week`
- `2 items became productive today`

This is one of the highest-value motivation surfaces in the app.

---

## 11. Leaderboard and Competition Guidance

The implemented design already includes a leaderboard. The goal system should shape how competition is presented.

## 11.1 Do not rank by raw review count
Avoid competition based on:
- total reviews
- total time spent
- total new items introduced

## 11.2 Better leaderboard metrics for this app
If a competitive element is added or revised later, prefer:
- weekly productive gains
- maintenance gains
- consistency streak quality
- recall quality above target
- healthy backlog recovery

## 11.3 Safer social design
At launch or early iterations, prefer:
- personal bests
- weekly missions
- cohort or friend-group leagues
- opt-in visibility

Global public ranking should not be the main motivational system.

---

## 12. Analytics Events

The following analytics events are useful for product iteration:
- weekly goals generated
- weekly goal viewed
- daily plan viewed
- daily plan accepted via session start
- weekly goal achieved
- weekly goal missed
- session summary goal-impact viewed

Recommended properties:
- user_id
- week_start_date
- goal_type
- target_value
- current_value
- status

---

## 13. Edge Cases

### New user with no history
- requires valid timezone setup before first weekly goal generation
- set consistency target to 4 days
- set usable vocabulary target to 8 items
- suppress harsh status messaging during first week

### User with backlog spike
- lower new item target automatically
- change Today card emphasis to backlog recovery
- keep usable vocabulary goal unchanged for the week, but update status text compassionately

### User with low recall sample count
- label recall metric provisional until denominator >= 10

### User studies a lot in one day but not others
- progress toward consistency only counts once per local day

---

## 14. Implementation Notes Against Current Schema

The current schema already supports most of the required computation:
- consistency from `review_events`
- recall quality from `review_events`
- review health from `learner_skill_state`
- daily pacing from `profiles.preferred_session_size` + current due state

The only significant gap for product-grade usable vocabulary growth is the lack of explicit stage transition history.

If scope must be reduced unexpectedly, an emergency fallback can proceed in two phases:

### Contingency Phase A
Ship consistency, recall quality, review health, and daily recommendations.

### Contingency Phase B
Add `learner_stage_events` and launch usable vocabulary weekly goals.

This is a contingency fallback only. The canonical delivery scope for this spec is the unified scope defined below.

---

## 15. Canonical Delivery Scope

This spec represents one unified delivery scope.

The intended implementation includes:
- weekly consistency goal
- weekly recall quality goal
- weekly usable vocabulary goal
- weekly review health goal
- `learner_stage_events`
- `learner_weekly_goal_sets` + child `learner_weekly_goals`
- scheduled maintenance and finalization jobs
- adaptive daily plan with due reviews, new items, recall prompts
- dashboard weekly-goal module and Today card
- progress page trend charts
- session summary goal impact
- analytics and verification

If scope must be reduced unexpectedly, use the contingency fallback above as an exception. It should not be treated as the default roadmap structure for this design.

---

## 16. Acceptance Criteria

The goal system is successful when:
- users can understand what the week is asking from them in under 10 seconds
- users can see a daily plan derived from actual due pressure
- goals reward speaking-oriented progress, not shallow throughput
- missed days do not invalidate the whole week
- product can compute goal progress reliably from stored state

---

## 17. Open Questions

No known blocking product questions remain at this time.
