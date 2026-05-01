-- Rollback for 2026-05-01-learner-progress-functions.sql
--
-- Drop order matters: indexes (some are functional indexes on stable_slug)
-- must drop BEFORE the functions they reference, otherwise DROP FUNCTION
-- fails on dependency. Then top-level metric functions, then helpers.

-- Step 1: drop indexes first
DROP INDEX IF EXISTS indonesian.lsps_user_source_ref_idx;
DROP INDEX IF EXISTS indonesian.cre_user_created_idx;
DROP INDEX IF EXISTS indonesian.cre_user_capability_created_idx;
DROP INDEX IF EXISTS indonesian.learning_items_slug_idx;

-- Step 2: drop top-level metric functions
DROP FUNCTION IF EXISTS indonesian.compute_todays_plan_raw(uuid, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_lapsing_count(uuid);
DROP FUNCTION IF EXISTS indonesian.get_lapse_prevention(uuid);
DROP FUNCTION IF EXISTS indonesian.get_memory_health(uuid);
DROP FUNCTION IF EXISTS indonesian.get_review_latency_stats(uuid);
DROP FUNCTION IF EXISTS indonesian.get_recall_accuracy_by_direction(uuid);
DROP FUNCTION IF EXISTS indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_overdue_count(uuid, text);
DROP FUNCTION IF EXISTS indonesian.get_current_streak_days(uuid, text);
DROP FUNCTION IF EXISTS indonesian.get_vulnerable_capabilities(uuid, int);
DROP FUNCTION IF EXISTS indonesian.get_review_forecast(uuid, int, text);

-- Step 3: drop helpers (signatures match the create signatures exactly)
DROP FUNCTION IF EXISTS indonesian._capability_source_progress_met(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS indonesian.stable_slug(text);
DROP FUNCTION IF EXISTS indonesian.immutable_unaccent(text);

-- Step 4: optionally drop the extension. Skipped by default — other features may
-- start using unaccent and dropping the extension would be disruptive. If a
-- pristine rollback is needed:
--   DROP EXTENSION IF EXISTS unaccent;
