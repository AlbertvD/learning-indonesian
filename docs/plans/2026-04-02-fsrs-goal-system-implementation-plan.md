# FSRS Goal System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a weekly goal system and adaptive daily plan for the Indonesian FSRS learning app using the retention-first V2 schema, with special emphasis on speaking-oriented progress and backlog-safe pacing.

**Architecture:** Add a goal computation layer that reads existing learner state and review events, persists stable weekly targets, computes daily recommendations from due pressure and preferred session size, and exposes goal progress in dashboard/progress/session-summary UI surfaces. Introduce stage transition events so usable vocabulary growth can be measured accurately.

**Tech Stack:** TypeScript app, existing Indonesian learning schema, FSRS-backed learner state, Supabase/Postgres, frontend dashboard/session/progress pages.

---

## Assumptions

- The V2 schema from `2026-03-30-retention-first-v2-design.md` is implemented or close to implementation.
- The app already has access to `profiles`, `learning_sessions`, `learner_item_state`, `learner_skill_state`, and `review_events`.
- Session submission already updates learner state after each review.
- Exact file paths are not yet known from this workspace, so this plan names target modules by responsibility. Resolve to concrete files before coding.

---

### Task 1: Confirm current implementation surfaces and file ownership

**Files:**
- Inspect: app routes for dashboard, progress, session summary, profile
- Inspect: review submission path, session builder, schema migrations, database RPCs or services
- Inspect: existing leaderboard and analytics modules

**Step 1: Identify the concrete frontend files for the dashboard, progress page, session shell, and session summary**
Run the project file search and note exact file paths.

**Step 2: Identify the concrete backend files for review submission and learner state updates**
Find where `review_events`, `learner_skill_state`, and `learner_item_state` are written.

**Step 3: Identify the migration mechanism**
Find where schema changes are defined so the goal tables/events can be added cleanly.

**Step 4: Write a short implementation note**
Record the exact files and responsibilities before changing code.

**Step 5: Commit**
Commit only the discovery note if your workflow wants checkpoints at this stage.

---

### Task 2: Add schema support for weekly goals and stage transition history

**Files:**
- Modify: database migration folder for new tables and indexes
- Modify: generated database types if present
- Test: schema or migration verification scripts

**Step 1: Write the failing schema expectations**
Add or update migration verification tests to assert the presence of:
- `learner_weekly_goal_sets`
- `learner_weekly_goals`
- `learner_stage_events`
- `learner_daily_goal_rollups`
- appropriate indexes
- appropriate RLS/grants
- correct goal direction/unit fields
- correct provisional fields
- correct timezone and week-boundary fields

**Step 2: Run schema verification and confirm failure**
Run the migration/schema test command and confirm the new tables are missing.

**Step 3: Create a migration for `learner_weekly_goal_sets`**
Include columns:
- `id`
- `user_id`
- `goal_timezone`
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

Add a uniqueness constraint on `(user_id, week_starts_at_utc)`.
Add an index supporting finalization queries on older open weeks, for example `(user_id, closed_at, week_ends_at_utc)`.

**Step 4: Create a migration for `learner_weekly_goals`**
Include columns:
- `id`
- `goal_set_id`
- `goal_type`
- `goal_direction`
- `goal_unit`
- `target_value_numeric`
- `current_value_numeric`
- `status`
- `is_provisional`
- `provisional_reason`
- `sample_size`
- `goal_config_jsonb`
- `created_at`
- `updated_at`

Add a uniqueness constraint on `(goal_set_id, goal_type)`.

**Step 5: Create a migration for `learner_stage_events`**
Include columns:
- `id`
- `user_id`
- `learning_item_id`
- `from_stage`
- `to_stage`
- `source_review_event_id`
- `created_at`

Add indexes for:
- `(user_id, created_at)`
- `(user_id, to_stage, created_at)`

Add a uniqueness constraint on `source_review_event_id`.

**Step 6: Create a migration for `learner_daily_goal_rollups`**
Include columns:
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

Add a uniqueness constraint on `(user_id, local_date)`.

**Step 7: Add RLS and grants**
- owner-only read/write for `learner_weekly_goal_sets`
- owner-only read/write for `learner_weekly_goals`
- owner-only select/insert for `learner_stage_events`
- owner-only read/write for `learner_daily_goal_rollups`
- no destructive grants for stage events

**Step 8: Add or update profile timezone support if missing**
Ensure `profiles.timezone` exists, stores an IANA timezone name, and is required before first weekly goal generation.

**Step 9: Add timezone setup UX guard**
If the user has no valid profile timezone, the app should return a stable `timezone_required` state instead of generating goals, and the UI should show a friendly prompt that routes to the existing Profile timezone setting.

**Step 10: Regenerate database types if the app uses generated types**
Update typed clients or DB schema declarations.

**Step 11: Run schema verification again**
Confirm the migration passes.

**Step 12: Commit**
`feat: add weekly goals and stage transition tables`

---

### Task 3: Emit stage transition events from the review submission path

**Files:**
- Modify: review submission service / RPC / edge function
- Test: backend tests covering stage progression and demotion

**Step 1: Write a failing test for promotion event insertion**
Test that when an item moves from `retrieving` to `productive`, the review submission path inserts a `learner_stage_events` row.

**Step 2: Write a failing test for no-op state updates**
Test that if stage remains unchanged, no stage event row is inserted.

**Step 3: Write a failing test for demotion event insertion**
Test that 2 consecutive failures causing stage demotion insert the correct `from_stage` and `to_stage` values.

**Step 4: Run the tests and verify they fail**
Use the project test runner for the review submission module.

**Step 5: Implement stage event writes**
In the same logical write unit that already saves review events and learner state:
- compute previous stage
- compute new stage
- if changed, insert `learner_stage_events`
- ensure the write is atomic with the rest of review submission
- make the insert idempotent by enforcing unique `source_review_event_id`

**Step 6: Re-run tests and verify they pass**
Confirm promotion, demotion, and no-op behavior.

**Step 7: Commit**
`feat: log learner stage transitions`

---

### Task 4: Build weekly goal generation and progress computation

**Files:**
- Create: goal service/module
- Create or modify: DB queries/RPCs for weekly goals
- Test: unit tests for all four goal types

**Step 1: Write failing tests for weekly goal generation**
Cover:
- no current week set -> service creates 1 goal set and 4 child rows
- existing current week set -> service reuses it
- concurrent generation requests still result in exactly 1 goal set and exactly 4 child rows
- scheduled pre-generation creates a current-week goal set for an eligible user with a valid timezone
- new learner -> conservative starter targets
- prior week with all key goals achieved and sufficient recall sample -> increased targets
- prior week with review-health missed -> protective reduction
- prior week with mixed results -> unchanged targets
- profile timezone drives generation of local Monday-start week boundaries
- timezone change mid-week reuses the existing goal set rather than generating a second one
- missing or invalid profile timezone returns a stable `timezone_required` state instead of generating goals

**Step 2: Write failing tests for progress computation**
Cover:
- consistency based on distinct study dates
- recall quality from recall-only review events
- review health from overdue learner skill states using `at_most`
- usable vocabulary from stage transitions into `productive` and `maintenance`
- usable vocabulary headline metric counts distinct `learning_item_id` only once per week, even if an item reaches both qualifying stages
- weekly finalization stores `closing_overdue_count` and uses it as the canonical source for final closed-week review-health status

**Step 3: Write failing tests for status computation**
Cover:
- consistency status using remaining study opportunities
- usable-vocabulary status using elapsed-week expected pace
- recall-quality status using target and 0.03 recovery band
- recall-quality zero-sample handling: `on_track + provisional` during the week, `missed + provisional` at week close
- review-health status using immediate threshold comparison during the week
- `achieved`
- `on_track`
- `at_risk`
- `missed`
- provisional recall metric when denominator is too small
- `is_provisional` stored separately from `status`

**Step 4: Implement the goal computation module**
Responsibilities:
- determine local Monday-start week boundaries from `profiles.timezone`
- require a valid profile timezone before generation
- use `profiles.timezone` only for generating a new goal set
- use `learner_weekly_goal_sets.goal_timezone` for all existing-week local computations after a goal set has been created
- finalize older open goal sets before returning/generating the current week
- first reuse an existing active `learner_weekly_goal_sets` row by UTC boundary
- infer adaptive targets from the prior closed week using explicit increase/hold/reduce rules
- create stable weekly goal sets and child goal rows atomically in one transaction
- if an existing goal set is found, ensure all 4 expected child rows exist before returning
- assign `goal_direction` and `goal_unit` explicitly per goal type
- compute current values
- compute goal-type-specific `on_track` and `at_risk` states using the spec's deterministic status rules
- persist refreshed `current_value_numeric`, `status`, `is_provisional`, `provisional_reason`, `sample_size`, and `updated_at` for the current open week before returning
- when finalizing a week, persist `closing_overdue_count` and compute final review-health status from that stored value
- treat closed weeks as immutable snapshots except for explicit repair/admin tooling
- compute status enum and provisional metadata

**Step 5: Decide query location**
Choose one and keep it simple:
- application service with SQL queries, or
- database RPC/view for progress aggregation

Recommendation: start with application service unless the codebase already centralizes analytics in SQL.

**Step 6: Re-run tests and verify pass**
Confirm deterministic goal generation and progress results.

**Step 7: Commit**
`feat: add weekly goal generation and progress tracking`

---

### Task 4A: Add scheduled weekly-goal maintenance jobs

**Files:**
- Modify: scheduler/cron configuration
- Modify: backend job runner or scheduled function entrypoints
- Modify: shared goal service so jobs and app-read paths use the same logic
- Test: job-level integration tests

**Step 1: Add the weekly finalization job**
Job responsibilities:
- find open goal sets where `week_ends_at_utc < now_utc` and `closed_at is null`
- finalize them using the shared finalization routine
- persist `closing_overdue_count`
- set final statuses and `closed_at`
- schedule: shared hourly job
- timezone handling: determine which rows are eligible from stored UTC boundaries and `profiles.timezone`, not by creating separate cron jobs per timezone

**Step 2: Add the current-week pre-generation job**
Job responsibilities:
- find users with a valid timezone whose local week has started and who do not yet have a current-week goal set
- create the goal set through the same atomic generation path used by app-open generation
- schedule: shared hourly job
- timezone handling: compute local-week eligibility inside the job logic from `profiles.timezone`

**Step 3: Add the daily rollup snapshot job**
Job responsibilities:
- refresh denormalized daily aggregates used for trend/history/analytics surfaces
- write denormalized daily rows into `learner_daily_goal_rollups`
- do not replace live current-week progress refresh or today's recommendation logic
- schedule: shared hourly job
- timezone handling: compute local-day eligibility inside the job logic rather than defining per-timezone schedules

**Step 4: Add the integrity and repair sweeper**
Job responsibilities:
- heal goal sets missing child rows
- close overdue still-open weeks
- repair missed pre-generation cases
- reconcile or refresh stale denormalized rollups
- schedule: daily

**Step 5: Write idempotency and safety tests**
Cover:
- running the same job twice does not duplicate or corrupt data
- jobs reuse shared service logic rather than implementing separate business rules
- fallback app-read generation/finalization still works if a scheduled run is missed
- shared hourly jobs correctly process users across multiple timezones without requiring per-timezone cron definitions

**Step 6: Commit**
`feat: add scheduled weekly goal maintenance jobs`

---

### Task 5: Build adaptive daily recommendation logic

**Files:**
- Create or modify: session recommendation service
- Modify: dashboard/session preload API
- Test: unit tests for recommendation heuristics

**Step 1: Write failing tests for due-load adaptation**
Cover:
- low due load -> recommend all due + baseline new items
- due > 20 -> cap new items at 2
- due > 40 -> cap new items at 0
- existing study session already completed today -> reduce new item target by 1

**Step 2: Write failing tests for recall-overlap semantics**
Cover:
- recall target is treated as a composition requirement within the planned workload, not as extra additive work
- recommendation output never requires more active-recall interactions than can be sourced from the planned session design
- `recall_interactions_today_target = min(desired_recall_target, recall_supply_cap)`
- estimated minutes are computed from the union workload, not by double-counting recall interactions

**Step 3: Write failing tests for recall recommendation**
Ensure the recommendation always includes a minimum recall-focused target.

**Step 4: Write failing tests for low recall accuracy**
If recall quality is below target by more than 5 points, new item target should drop.

**Step 5: Implement the daily recommendation module**
Inputs:
- `preferred_session_size`
- `due_now`
- `overdue`
- recommendation recall quality using the spec's precedence rule
- recent completion history
- weekly goal state
- optional remaining study opportunities

Outputs:
- `due_reviews_today_target`
- `new_items_today_target`
- `recall_interactions_today_target`
- `estimated_minutes_today`

**Step 6: Integrate recommendation data into the dashboard/session entry loader**
The dashboard should be able to render a stable `Today` card.

**Step 7: Re-run tests and verify pass**
Confirm heuristics work as expected.

**Step 8: Commit**
`feat: add adaptive daily study recommendations`

---

### Task 6: Expose goal and recommendation data through app-facing APIs

**Files:**
- Modify: API routes/loaders/hooks/query layer
- Test: integration tests for response shape

**Step 1: Write a failing API test for weekly goal payload**
Expected payload should include:
- goal set metadata (`goalTimezone`, local week boundaries)
- goal type
- goal direction
- goal unit
- current value
- target value
- status
- `isProvisional`
- `provisionalReason`
- `sampleSize`

**Step 1a: Write a failing API test for timezone-required payload**
Expected payload should include:
- `state = timezone_required`
- `weeklyGoalSet = null`
- `weeklyGoals = []`
- `todayPlan = null`
- `requiredProfileAction = set_timezone`

**Step 2: Write a failing API test for daily plan payload**
Expected payload should include:
- due target
- new target
- recall target
- estimated minutes

**Step 3: Implement API serialization**
Keep formatting responsibility split cleanly:
- backend returns values and enums
- backend returns provisional metadata needed for explanation (`isProvisional`, `provisionalReason`, `sampleSize`)
- backend returns `timezone_required` state metadata when timezone setup is missing
- frontend owns presentation strings such as goal titles and status copy
- frontend renders the timezone-required card and routes the CTA to the existing Profile timezone setting

**Step 4: Re-run integration tests**
Confirm consumers receive stable shapes.

**Step 5: Commit**
`feat: expose weekly goals and daily plan data`

---

### Task 7: Add dashboard UI for weekly goals and Today plan

**Files:**
- Modify: dashboard route/component
- Create or modify: reusable goal row/progress components
- Test: component tests or route tests

**Step 1: Write failing UI tests for the weekly goal module**
Verify the dashboard shows 4 goal rows and a Today card.

**Step 2: Write failing UI tests for status states**
Cover achieved/on-track/at-risk/missed rendering and provisional-state rendering.

**Step 3: Implement the dashboard goal module**
Show:
- study days
- recall quality
- usable words
- overdue items

Show Today card:
- due reviews
- new items
- recall prompts
- estimated minutes
- start CTA

**Step 4: Add supportive copy**
Avoid punitive language. Prefer:
- `On track`
- `A bit behind, still recoverable`
- `Strong week so far`

**Step 5: Re-run UI tests**
Confirm rendering and empty-state handling.

**Step 6: Commit**
`feat: add dashboard weekly goals and today plan`

---

### Task 8: Add progress page detail and trend surfaces

**Files:**
- Modify: progress route/component
- Create or modify: charts/trend components
- Test: component/integration tests

**Step 1: Write failing tests for progress sections**
Verify the page shows:
- weekly goals summary
- recognition vs recall comparison
- productive gains trend
- backlog trend

**Step 2: Implement progress page sections**
Keep launch scope modest:
- current week summary
- previous weeks mini-trend if data is available
- deeper detail hidden from the dashboard

**Step 3: Re-run tests**
Confirm sections render with real and sparse data.

**Step 4: Commit**
`feat: add goal trends to progress page`

---

### Task 9: Add session-summary goal impact messaging

**Files:**
- Modify: session summary component / loader
- Test: UI tests for summary lines

**Step 1: Write failing tests for goal impact messages**
Examples:
- `You completed 6 recall prompts today`
- `2 items became productive`
- `Recall quality is back on track`

**Step 2: Implement summary derivation**
Use one canonical source per message category:
- derive session-local fact messages only from session review events and stage-transition events created in that session
- derive weekly-impact messages only from before/after comparison of persisted weekly goal snapshots
- read the `before` snapshot from `learner_weekly_goals` immediately before applying the session
- derive the `after` snapshot from the recomputed and persisted `learner_weekly_goals` state immediately after applying the session
- do not allow the same message type to be produced by both derivation paths

**Step 3: Re-run tests**
Ensure messages are truthful and suppressed when evidence is weak.

**Step 4: Commit**
`feat: connect session summaries to weekly goals`

---

### Task 10: Add analytics instrumentation

**Files:**
- Modify: analytics tracking module
- Test: analytics payload tests if present

**Step 1: Write failing tests for key analytics events**
Cover:
- goals generated
- goal viewed
- daily plan viewed
- session started from Today card
- goal achieved
- goal missed
- session summary goal-impact viewed (when Task 9 is implemented)

**Step 2: Implement event emission**
Keep payloads small and consistent.

**Step 3: Re-run tests**
Confirm event names and properties.

**Step 4: Commit**
`feat: track weekly goal interactions`

---

### Task 11: Verify end-to-end behavior with realistic data

**Files:**
- Modify: test fixtures/seeds only if needed
- Test: end-to-end or integration verification scripts

**Step 1: Seed or construct realistic learner scenarios**
At minimum:
- new learner
- steady learner on track
- learner with backlog spike
- learner with low recall quality

**Step 2: Verify each scenario end-to-end**
Check dashboard, progress page, and session summary outputs together.

**Step 3: Verify week rollover**
Confirm new weekly goal rows are generated at the correct local week boundary.

**Step 4: Verify sparse-data behavior**
Confirm low-sample recall metrics are marked provisional.

**Step 5: Commit**
`test: verify weekly goal system scenarios`

---

### Task 12: Update documentation

**Files:**
- Modify: product/design docs folder
- Modify: backend schema docs if present
- Reference: `docs/plans/2026-04-02-fsrs-goal-system-spec.md`

**Step 1: Document the new tables and goal formulas**
Add concise schema and product docs.

**Step 2: Document the daily recommendation heuristics**
Explain why new items are capped when due load is high.

**Step 3: Document known launch limitations**
Examples:
- recall quality provisional below minimum sample
- no spoken-audio facet yet
- usable vocabulary depends on stage transitions

**Step 4: Commit**
`docs: document weekly goal system`

---

## Canonical Delivery Scope

This plan represents one unified implementation scope.

All tasks in this document are part of the intended delivery:
- Task 2
- Task 3
- Task 4
- Task 4A
- Task 5
- Task 6
- Task 7
- Task 8
- Task 9
- Task 10
- Task 11
- Task 12

This delivers:
- weekly goals
- stage events
- scheduled maintenance and finalization jobs
- daily plan
- dashboard support
- progress surfaces
- session motivation loop
- analytics and verification

If scope must be reduced unexpectedly, that should be treated as an exception and documented explicitly, not assumed by the structure of this plan.

---

## Test Strategy

Required test coverage before claiming this implementation complete:
- schema migration tests for new tables/policies
- review-submission tests for stage transition logging
- goal generation unit tests
- goal progress unit tests
- daily recommendation unit tests
- dashboard integration/component tests
- week rollover integration tests
- progress page integration/component tests
- session summary integration/component tests
- analytics instrumentation tests

---

## Risks and Mitigations

### Risk: goal drift within a week
Mitigation:
Persist weekly contracts in `learner_weekly_goal_sets` and child `learner_weekly_goals` rows instead of recomputing them with changing baselines.

### Risk: usable vocabulary metric is inaccurate without stage history
Mitigation:
Do not ship that goal without `learner_stage_events`, or clearly mark it as beta.

### Risk: users optimize for numbers instead of learning
Mitigation:
Keep raw review counts out of the main goal system and avoid leaderboard ranking by volume.

### Risk: backlog users feel punished
Mitigation:
Reduce new item recommendations automatically and use recovery-friendly copy.

---

## Completion Checklists

### Implementation Complete
- weekly goals generate exactly once per user-week
- daily recommendation adapts correctly to due pressure
- dashboard displays clear weekly and daily guidance
- progress page trends render correctly
- session summaries connect effort to meaningful progress
- stage transitions are logged correctly
- scheduled jobs run correctly and remain idempotent
- tests pass for all core scenarios
- documentation reflects formulas and schema changes

---

Execution note:
- verify stage-event writes before enabling usable-vocabulary UI
- follow the task order in this document, but treat the whole plan as one delivery scope
