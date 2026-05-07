-- 2026-05-07 — Retirement #4 (goal subsystem + bundled event log)
--
-- Spec: docs/plans/2026-05-07-retire-goal-subsystem.md
--
-- Drops the daily/weekly goal product layer (5 tables, 9 functions, 4 cron schedules,
-- RLS policies + grants) along with the goal-flavoured event-log table
-- (bundled retirement of target-arch §7).
--
-- The same drops are appended to scripts/migration.sql (master) so `make migrate`
-- applies them automatically. This file is the paper-trail copy operators can
-- `psql -f` directly for one-shot manual runs.
--
-- Companion rollback (best-effort schema restore — data lost):
--   scripts/migrations/2026-05-07-retire-goal-subsystem.rollback.sql
--
-- Idempotent: lowercase drop ... if exists + cron.unschedule wrapped in
-- exception handlers. Safe to re-run on nodes where drops already applied.

-- 1. Unschedule cron jobs.
do $$ begin perform cron.unschedule('goal-finalize-weekly');     exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-pregenerate-weekly');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-daily-rollup');        exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-integrity-repair');    exception when others then null; end $$;

-- 2. Drop SQL functions.
drop function if exists indonesian.job_finalize_weekly_goals();
drop function if exists indonesian.job_pregenerate_current_week();
drop function if exists indonesian.job_daily_rollup_snapshot();
drop function if exists indonesian.job_integrity_repair();
drop function if exists indonesian.compute_todays_plan_raw(uuid, timestamptz);
drop function if exists indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text);
drop function if exists indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_overdue_count(uuid, text);

-- 3. Drop tables in FK-aware order.
drop table if exists indonesian.learner_daily_goal_rollups cascade;
drop table if exists indonesian.learner_stage_events cascade;
drop table if exists indonesian.learner_weekly_goals cascade;
drop table if exists indonesian.learner_weekly_goal_sets cascade;

-- 4. Drop event-log table (bundled retirement #7).
drop table if exists indonesian.learner_analytics_events cascade;
