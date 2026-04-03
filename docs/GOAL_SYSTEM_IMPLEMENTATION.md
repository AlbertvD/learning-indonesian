# FSRS Goal System Implementation Guide

**Status:** Implemented  
**Date:** 2026-04-03  
**Related:** `2026-04-02-fsrs-goal-system-spec.md`, `2026-04-02-fsrs-goal-system-implementation-plan.md`

---

## Overview

The FSRS Goal System adds weekly goal tracking and adaptive daily recommendations to the Indonesian learning app. It tracks four goal types: study consistency, recall quality, vocabulary growth, and review backlog health.

---

## Schema

### New Tables

#### `learner_weekly_goal_sets`
Represents a user's goals for one local week.

```sql
CREATE TABLE indonesian.learner_weekly_goal_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_timezone text NOT NULL, -- IANA timezone, e.g. 'Europe/Amsterdam'
  week_starts_at_utc timestamptz NOT NULL,
  week_ends_at_utc timestamptz NOT NULL,
  closing_overdue_count integer, -- Capture overdue count at week end
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  UNIQUE(user_id, week_starts_at_utc)
);
```

#### `learner_weekly_goals`
Individual goal rows under a weekly goal set.

```sql
CREATE TABLE indonesian.learner_weekly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_set_id uuid NOT NULL REFERENCES indonesian.learner_weekly_goal_sets(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_track', 'at_risk', 'achieved', 'missed')),
  current_value_numeric numeric NOT NULL DEFAULT 0,
  target_value_numeric numeric NOT NULL,
  current_value_text text,
  target_value_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(goal_set_id, goal_type)
);
```

#### `learner_stage_events`
Audit trail of when items transition between learning stages (new → anchoring → retrieving → productive → maintenance).

```sql
CREATE TABLE indonesian.learner_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  source_review_event_id uuid,
  created_at timestamptz DEFAULT now()
);
```

#### `learner_daily_goal_rollups`
Denormalized daily snapshots for trends and analytics.

```sql
CREATE TABLE indonesian.learner_daily_goal_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_timezone text NOT NULL,
  local_date date NOT NULL,
  study_day_completed boolean DEFAULT false,
  recall_accuracy numeric, -- 0-100, null if no samples
  recall_sample_size integer DEFAULT 0,
  usable_items_gained_today integer DEFAULT 0,
  usable_items_total integer DEFAULT 0,
  overdue_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, local_date)
);
```

#### `learner_analytics_events`
User interaction and event tracking for goal system and learning experience.

```sql
CREATE TABLE indonesian.learner_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'goal_generated', 'goal_viewed', 'daily_plan_viewed',
    'session_started_from_today', 'goal_achieved', 'goal_missed',
    'session_summary_viewed'
  )),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid,
  goal_type text CHECK (goal_type IN ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  session_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

---

## Services

### `goalService`
Main service for goal operations.

**Key Methods:**
- `getGoalProgress(userId)` — Returns current goal state or timezone requirement
- `generateGoalsForCurrentWeek(userId, timezone)` — Creates goals atomically
- `updateGoalStatus(goalId)` — Recalculates and updates goal status

**Timezone Handling:**
- All weekly goal rows use `goal_timezone` to track user's timezone
- Goal set boundaries (`week_starts_at_utc`, `week_ends_at_utc`) are pre-computed from timezone
- Job logic converts UTC boundaries to local-date queries using `goal_timezone`

### `sessionSummaryService`
Computes goal impact messages for session completion.

**Key Methods:**
- `computeSessionImpactMessages(userId, sessionId, beforeGoals, afterGoals)` — Returns both session-local facts and weekly impact changes
- `getSessionLocalFacts(userId, sessionId)` — Queries review_events and learner_stage_events for session-specific facts
- `getWeeklyImpactChanges(beforeGoals, afterGoals)` — Compares goal status transitions

**Impact Messages:**
- Status transitions: achieved, back on track, at risk, missed
- Fact messages: items completed, items reached productive/maintenance stages

### `analyticsService`
Tracks user interactions with goals and learning experiences.

**Events Tracked:**
- `goal_generated` — When weekly goals are created
- `goal_viewed` — When goals are displayed (Progress page)
- `daily_plan_viewed` — When Dashboard Today card is viewed
- `session_started_from_today` — When session starts
- `goal_achieved` — When a goal reaches achieved status
- `goal_missed` — When a goal reaches missed status
- `session_summary_viewed` — When session summary with goal impact is shown

**Fire-and-Forget Design:**
- Errors never block user operations
- Failed inserts are logged to console only

### `goalJobService`
Scheduled background jobs for goal maintenance.

**Jobs:**
1. `runWeeklyFinalization()` — Closes past-due weeks, captures closing_overdue_count
2. `runCurrentWeekPreGeneration()` — Creates goal sets for users at local week start
3. `runDailyRollupSnapshot()` — Materializes daily aggregates
4. `runIntegrityRepairSweeper()` — Heals inconsistent goal state

**Timezone-Aware Scheduling:**
- All jobs use `goal_timezone` column to determine eligibility
- No per-timezone cron definitions needed
- Single UTC cron schedule handles all users globally

---

## Goal Formulas

### Study Consistency
**Target:** 7 study days per week (or user-defined target)  
**Formula:** Count of `study_day_completed = true` in rolling week  
**Status:**
- achieved: >= target
- on_track: >= 70% of target
- at_risk: >= 30% of target
- missed: < 30% of target

### Recall Quality
**Target:** 70% accuracy (or user-defined target)  
**Formula:** `SUM(was_correct) / COUNT(*) * 100` from recall reviews in current week  
**Provisional:** Sample size < 5 (marked with "provisional" copy if implemented)  
**Status:**
- achieved: >= target
- on_track: >= 80% of target
- at_risk: >= 50% of target
- missed: < 50% of target

### Usable Vocabulary (Productive Items)
**Target:** 5-10 new items reaching productive stage per week (goal-dependent)  
**Formula:** Count of items where `to_stage = 'productive'` in current week  
**Status:**
- achieved: >= target
- on_track: >= 70% of target
- at_risk: >= 30% of target
- missed: < 30% of target

### Review Backlog Health
**Target:** < 20 overdue items (or user-defined threshold)  
**Formula:** Count of overdue items (next_due_at < now)  
**Status:**
- achieved: <= target
- on_track: <= 150% of target
- at_risk: > 150% of target && < 300% of target
- missed: >= 300% of target

---

## Daily Recommendation Heuristics

### New Item Caps
When due load is high (`overdue_count > 20`):
- Cap new items at 2/day
- Prioritize clearing backlog over learning new vocabulary

### Due Load Assessment
- "high": overdue_count > 20
- "moderate": 10-20 overdue
- "low": < 10 overdue

### Item Selection
1. Always include overdue review items first
2. If due load is low, include some new items
3. If due load is moderate, new items are optional
4. If due load is high, defer all new items

---

## Frontend Components

### Progress Page (`src/pages/Progress.tsx`)
**New Sections:**
- **This Week's Goals** — Shows all weekly goals with progress bars and status
- **Productive Gains Trend** — 7-day rollup of items reaching productive stage
- **Backlog Trend** — 7-day rollup of overdue counts with health indicators

### Session Summary (`src/components/SessionSummary.tsx`)
**New Section:**
- **Goal Impact Messages** — Displays session-local facts and weekly goal transitions
- Shows messages like:
  - "You completed 8 of 12 recall prompts"
  - "2 items became productive"
  - "🎉 Study consistency goal achieved!"
  - "Recall quality is back on track"

### Dashboard
Integration points for daily recommendations (future: Task 5 expansion).

---

## Testing

### Unit Tests
- `sessionSummaryService.test.ts` — Goal status transitions, impact messages
- `goalJobService.test.ts` — Job logic with empty/partial data
- `analyticsService.test.ts` — Event payload construction and delivery

### Integration Tests
- `goalSystemIntegration.test.ts` — Goal lifecycle workflows, learner scenarios

### Manual Verification Checklist
- [ ] New learner gets 4 weekly goals on signup
- [ ] Goals track correctly after reviews
- [ ] Goal status transitions trigger impact messages
- [ ] Backlog spike causes new-item cap to reduce
- [ ] Week rollover generates new goal set at local week boundary
- [ ] Analytics events appear in learner_analytics_events table
- [ ] Daily rollup snapshots refresh daily at expected times
- [ ] Progress page trends load and render correctly

---

## Known Limitations & Future Work

1. **Provisional Metrics** — Recall quality with < 5 samples should show "provisional" badge (not yet implemented in UI)
2. **Adaptive Daily Plans** — Session recommendation logic (Task 5) not yet integrated into dashboard
3. **Leaderboard Integration** — Goal-based leaderboard rankings not implemented
4. **User Goal Customization** — Target values hardcoded; user-editable targets future work
5. **Social Goals** — Shared goals or collaborative challenges not implemented

---

## Deployment & Operations

### Database Migrations
```bash
make migrate POSTGRES_PASSWORD=<password>
```

Idempotent migration includes:
- All new tables and indexes
- RLS policies
- GRANT statements for authenticated users
- pg_cron extension setup
- Job schedule definitions

### Health Check
```bash
make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
```

Verifies:
- All goal tables exist with correct schema
- RLS policies are correctly defined
- Scheduled jobs are registered

### Scheduled Jobs
Four pg_cron jobs run hourly or daily:
- Weekly finalization: 5 * * * * (hour 0 minute 5 UTC)
- Current-week pre-generation: 10 * * * * (hour 0 minute 10 UTC)
- Daily rollup snapshots: 15 * * * * (hour 0 minute 15 UTC)
- Integrity repair: 30 2 * * * (02:30 UTC daily)

All jobs use user's `profiles.timezone` to determine eligibility — no per-timezone cron needed.

---

## References

- Spec: `2026-04-02-fsrs-goal-system-spec.md`
- Implementation Plan: `2026-04-02-fsrs-goal-system-implementation-plan.md`
- Retention System Design: `2026-03-30-retention-first-v2-design.md` (external)
- FSRS Research: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
