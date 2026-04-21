
-- V2 migration: complete indonesian schema target state (additive only, no drops)

-- Create schema
CREATE SCHEMA IF NOT EXISTS indonesian;

-- Migrate existing review sessions before constraint change
-- DO NOT fail if table doesn't exist yet (for fresh installs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'indonesian' AND table_name = 'learning_sessions') THEN
    UPDATE indonesian.learning_sessions SET session_type = 'practice' WHERE session_type = 'review';
  END IF;
END $$;

-- User profiles (readable by all — used by leaderboard and sharing UI)
CREATE TABLE IF NOT EXISTS indonesian.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  language text NOT NULL DEFAULT 'nl' CHECK (language IN ('nl', 'en')),
  preferred_session_size integer NOT NULL DEFAULT 15,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure preferred_session_size exists if table was already there
ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS preferred_session_size integer NOT NULL DEFAULT 15;

-- Timezone for weekly goal system (IANA timezone name, e.g. 'Europe/Amsterdam')
ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS timezone text;

-- Daily new items limit: how many new vocabulary items to introduce per session (default 10)
ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS daily_new_items_limit integer NOT NULL DEFAULT 10;

-- Admin roles
CREATE TABLE IF NOT EXISTS indonesian.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Lessons (admin-managed, public read)
CREATE TABLE IF NOT EXISTS indonesian.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  audio_path text,
  duration_seconds integer,
  transcript_dutch text,
  transcript_indonesian text,
  transcript_english text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(module_id, order_index)
);

CREATE TABLE IF NOT EXISTS indonesian.lesson_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES indonesian.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE(lesson_id, order_index)
);

-- Podcasts (admin-managed, public read)
CREATE TABLE IF NOT EXISTS indonesian.podcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  audio_path text NOT NULL,
  transcript_indonesian text,
  transcript_english text,
  transcript_dutch text,
  level text CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  duration_seconds integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(title)
);

-- Learning items (canonical teachable unit)
CREATE TABLE IF NOT EXISTS indonesian.learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('word', 'phrase', 'sentence', 'dialogue_chunk')),
  base_text text NOT NULL,
  normalized_text text NOT NULL,
  language text NOT NULL DEFAULT 'id',
  level text NOT NULL DEFAULT 'A1',
  source_type text NOT NULL DEFAULT 'lesson' CHECK (source_type IN ('lesson', 'podcast', 'flashcard', 'manual')),
  source_vocabulary_id uuid,
  source_card_id uuid,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(normalized_text)
);

-- Translations per item
CREATE TABLE IF NOT EXISTS indonesian.item_meanings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  translation_language text NOT NULL CHECK (translation_language IN ('en', 'nl')),
  translation_text text NOT NULL,
  sense_label text,
  usage_note text,
  is_primary boolean NOT NULL DEFAULT false
);

-- Example sentences and dialogue snippets
CREATE TABLE IF NOT EXISTS indonesian.item_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  context_type text NOT NULL CHECK (context_type IN ('example_sentence', 'dialogue', 'cloze', 'lesson_snippet', 'vocabulary_list', 'exercise_prompt')),
  source_text text NOT NULL,
  translation_text text,
  difficulty text,
  topic_tag text,
  is_anchor_context boolean NOT NULL DEFAULT false,
  source_lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL,
  source_section_id uuid REFERENCES indonesian.lesson_sections(id) ON DELETE SET NULL
);

-- Accepted alternative answers for typed recall
CREATE TABLE IF NOT EXISTS indonesian.item_answer_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  variant_text text NOT NULL,
  variant_type text NOT NULL CHECK (variant_type IN ('alternative_translation', 'informal', 'with_prefix', 'without_prefix')),
  language text NOT NULL DEFAULT 'id',
  is_accepted boolean NOT NULL DEFAULT true,
  notes text
);

-- Learner item lifecycle state
CREATE TABLE IF NOT EXISTS indonesian.learner_item_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  introduced_at timestamptz,
  last_seen_at timestamptz,
  priority integer,
  origin text,
  times_seen integer NOT NULL DEFAULT 0,
  is_leech boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  gate_check_passed boolean,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, learning_item_id)
);

-- Per-skill FSRS state per user per item
CREATE TABLE IF NOT EXISTS indonesian.learner_skill_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'form_recall', 'meaning_recall', 'spoken_production')),
  stability numeric NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 0,
  retrievability numeric,
  last_reviewed_at timestamptz,
  next_due_at timestamptz,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  lapse_count integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  mean_latency_ms integer,
  hint_rate numeric,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, learning_item_id, skill_type)
);

-- Immutable review event log
CREATE TABLE IF NOT EXISTS indonesian.review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'form_recall', 'meaning_recall', 'spoken_production')),
  exercise_type text NOT NULL,
  session_id uuid, -- FK added after learning_sessions check
  was_correct boolean NOT NULL,
  score numeric,
  latency_ms integer,
  hint_used boolean NOT NULL DEFAULT false,
  attempt_number integer NOT NULL DEFAULT 1,
  raw_response text,
  normalized_response text,
  feedback_type text,
  scheduler_snapshot jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indonesian.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES indonesian.lessons(id) ON DELETE CASCADE,
  completed_at timestamptz,
  sections_completed text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS indonesian.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (ended_at - started_at))::integer
  ) STORED
);

-- Add CHECK constraint to learning_sessions
ALTER TABLE indonesian.learning_sessions DROP CONSTRAINT IF EXISTS learning_sessions_session_type_check;
ALTER TABLE indonesian.learning_sessions ADD CONSTRAINT learning_sessions_session_type_check
  CHECK (session_type IN ('lesson', 'learning', 'podcast', 'practice'));

-- Drop stale exercise_type CHECK constraint from review_events (constraint name from original migration)
ALTER TABLE indonesian.review_events DROP CONSTRAINT IF EXISTS review_events_exercise_type_check;

-- Add FK from review_events to learning_sessions
ALTER TABLE indonesian.review_events DROP CONSTRAINT IF EXISTS review_events_session_id_fkey;
ALTER TABLE indonesian.review_events ADD CONSTRAINT review_events_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES indonesian.learning_sessions(id) ON DELETE SET NULL;

-- Error logs
CREATE TABLE IF NOT EXISTS indonesian.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page text,
  action text,
  error_message text,
  error_code text,
  created_at timestamptz DEFAULT now()
);

-- Leaderboard view
CREATE OR REPLACE VIEW indonesian.leaderboard AS
SELECT
  p.id AS user_id,
  p.display_name,
  COALESCE(lis.items_learned, 0) AS items_learned,
  COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL) AS lessons_completed,
  COALESCE(SUM(ls.duration_seconds) FILTER (WHERE ls.duration_seconds IS NOT NULL), 0) AS total_seconds_spent,
  COUNT(DISTINCT DATE(ls.started_at)) FILTER (WHERE ls.duration_seconds IS NOT NULL OR ls.started_at > now() - interval '2 hours') AS days_active
FROM indonesian.profiles p
LEFT JOIN (
  SELECT user_id, COUNT(*) AS items_learned
  FROM indonesian.learner_item_state
  WHERE stage IN ('retrieving', 'productive', 'maintenance')
  GROUP BY user_id
) lis ON lis.user_id = p.id
LEFT JOIN indonesian.lesson_progress lp ON lp.user_id = p.id
LEFT JOIN indonesian.learning_sessions ls ON ls.user_id = p.id
  AND (ls.ended_at IS NOT NULL OR ls.started_at > now() - interval '2 hours')
GROUP BY p.id, p.display_name, lis.items_learned;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_item_contexts_lesson ON indonesian.item_contexts(source_lesson_id);
CREATE INDEX IF NOT EXISTS idx_item_contexts_item_anchor ON indonesian.item_contexts(learning_item_id, is_anchor_context);
CREATE INDEX IF NOT EXISTS idx_learner_item_state_stage ON indonesian.learner_item_state(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_learner_skill_state_due ON indonesian.learner_skill_state(user_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_review_events_user_time ON indonesian.review_events(user_id, created_at);

-- Weekly goal system tables
CREATE TABLE IF NOT EXISTS indonesian.learner_weekly_goal_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_timezone text NOT NULL,
  week_start_date_local date NOT NULL,
  week_end_date_local date NOT NULL,
  week_starts_at_utc timestamptz NOT NULL,
  week_ends_at_utc timestamptz NOT NULL,
  generation_strategy_version text DEFAULT 'v1',
  generated_at timestamptz DEFAULT now(),
  closing_overdue_count integer,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_starts_at_utc)
);

CREATE TABLE IF NOT EXISTS indonesian.learner_weekly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_set_id uuid NOT NULL REFERENCES indonesian.learner_weekly_goal_sets(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  goal_direction text NOT NULL CHECK (goal_direction IN ('at_least', 'at_most')),
  goal_unit text NOT NULL CHECK (goal_unit IN ('count', 'percent')),
  target_value_numeric numeric NOT NULL,
  current_value_numeric numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'achieved', 'missed')),
  is_provisional boolean DEFAULT false,
  provisional_reason text,
  sample_size integer DEFAULT 0,
  goal_config_jsonb jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(goal_set_id, goal_type)
);

CREATE TABLE IF NOT EXISTS indonesian.learner_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  from_stage text NOT NULL CHECK (from_stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  to_stage text NOT NULL CHECK (to_stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  source_review_event_id uuid UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indonesian.learner_daily_goal_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_timezone text NOT NULL,
  local_date date NOT NULL,
  study_day_completed boolean DEFAULT false,
  recall_accuracy numeric,
  recall_sample_size integer DEFAULT 0,
  usable_items_gained_today integer DEFAULT 0,
  usable_items_total integer DEFAULT 0,
  overdue_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, local_date)
);

-- Indexes for weekly goal queries
CREATE INDEX IF NOT EXISTS idx_weekly_goal_sets_user_week ON indonesian.learner_weekly_goal_sets(user_id, week_starts_at_utc);
CREATE INDEX IF NOT EXISTS idx_weekly_goal_sets_finalization ON indonesian.learner_weekly_goal_sets(user_id, closed_at, week_ends_at_utc);
-- Drop duplicate index created in an earlier migration (identical to idx_weekly_goal_sets_finalization)
DROP INDEX IF EXISTS indonesian.idx_goal_sets_finalization;
CREATE INDEX IF NOT EXISTS idx_stage_events_user_time ON indonesian.learner_stage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stage_events_to_stage ON indonesian.learner_stage_events(user_id, to_stage, created_at);
-- Drop duplicate index created in an earlier migration (identical to idx_stage_events_to_stage)
DROP INDEX IF EXISTS indonesian.idx_stage_events_user_target;
CREATE INDEX IF NOT EXISTS idx_daily_rollups_user_date ON indonesian.learner_daily_goal_rollups(user_id, local_date);

-- RLS and Grants
GRANT USAGE ON SCHEMA indonesian TO authenticated, anon;
GRANT SELECT ON indonesian.profiles TO authenticated;
GRANT INSERT, UPDATE ON indonesian.profiles TO authenticated;
GRANT SELECT ON indonesian.lessons TO authenticated;
GRANT SELECT ON indonesian.lesson_sections TO authenticated;
GRANT SELECT ON indonesian.podcasts TO authenticated;
GRANT SELECT ON indonesian.learning_items TO authenticated;
GRANT SELECT ON indonesian.item_meanings TO authenticated;
GRANT SELECT ON indonesian.item_contexts TO authenticated;
GRANT SELECT ON indonesian.item_answer_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_item_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_skill_state TO authenticated;
GRANT SELECT, INSERT ON indonesian.review_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.lesson_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learning_sessions TO authenticated;
GRANT INSERT ON indonesian.error_logs TO authenticated;
GRANT SELECT ON indonesian.leaderboard TO authenticated;
GRANT SELECT ON indonesian.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_weekly_goal_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_weekly_goals TO authenticated;
GRANT SELECT, INSERT ON indonesian.learner_stage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_daily_goal_rollups TO authenticated;

-- Service role permissions (for health checks and scripts)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA indonesian TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA indonesian TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA indonesian TO service_role;

-- Enable RLS on all tables
ALTER TABLE indonesian.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lesson_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_meanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_answer_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_item_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_skill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_weekly_goal_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_weekly_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_daily_goal_rollups ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'indonesian' LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON indonesian.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Policies
CREATE POLICY "profiles_read" ON indonesian.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write" ON indonesian.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_read" ON indonesian.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "lessons_read" ON indonesian.lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY "lessons_admin_write" ON indonesian.lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "lesson_sections_read" ON indonesian.lesson_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "lesson_sections_admin_write" ON indonesian.lesson_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "podcasts_read" ON indonesian.podcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "podcasts_admin_write" ON indonesian.podcasts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "learning_items_read" ON indonesian.learning_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning_items_admin_write" ON indonesian.learning_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "item_meanings_read" ON indonesian.item_meanings FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_meanings_admin_write" ON indonesian.item_meanings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "item_contexts_read" ON indonesian.item_contexts FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_contexts_admin_write" ON indonesian.item_contexts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "item_answer_variants_read" ON indonesian.item_answer_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_answer_variants_admin_write" ON indonesian.item_answer_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "learner_item_state_owner" ON indonesian.learner_item_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_skill_state_owner" ON indonesian.learner_skill_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_events_read" ON indonesian.review_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "review_events_insert" ON indonesian.review_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lesson_progress_read" ON indonesian.lesson_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "lesson_progress_write" ON indonesian.lesson_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "learning_sessions_read" ON indonesian.learning_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning_sessions_write" ON indonesian.learning_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "error_logs_insert" ON indonesian.error_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "learner_weekly_goal_sets_owner" ON indonesian.learner_weekly_goal_sets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_weekly_goals_via_goal_set" ON indonesian.learner_weekly_goals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.learner_weekly_goal_sets WHERE id = goal_set_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.learner_weekly_goal_sets WHERE id = goal_set_id AND user_id = auth.uid()));

CREATE POLICY "learner_stage_events_owner" ON indonesian.learner_stage_events FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_daily_goal_rollups_owner" ON indonesian.learner_daily_goal_rollups FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Health check RPC
CREATE OR REPLACE FUNCTION indonesian.schema_health()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = indonesian AS $$
  SELECT jsonb_build_object(
    'tables', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', t.table_name,
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity
      ) ORDER BY t.table_name)
      FROM information_schema.tables t
      JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'indonesian'
      WHERE t.table_schema = 'indonesian'
        AND t.table_type = 'BASE TABLE'
    ),
    'grants', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', table_name,
        'grantee', grantee,
        'privilege', privilege_type
      ) ORDER BY table_name, grantee, privilege_type)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'indonesian'
        AND grantee IN ('anon', 'authenticated')
    )
  )
$$;

GRANT EXECUTE ON FUNCTION indonesian.schema_health() TO authenticated;

-- Goal System Scheduled Jobs (pg_cron)
-- These jobs maintain the weekly goal system consistency and generate reports.

-- Enable pg_cron extension (requires superuser; will be no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job 1: Weekly Goal Finalization
-- Closes goal sets that have passed their week end and captures final metrics.
CREATE OR REPLACE FUNCTION indonesian.job_finalize_weekly_goals()
RETURNS table(finalized_count integer, error_message text) AS $$
BEGIN
  -- Find open goal sets past their end time and close them
  UPDATE indonesian.learner_weekly_goal_sets
  SET closing_overdue_count = (
    SELECT COUNT(*) FROM indonesian.learner_skill_state lss
    WHERE lss.user_id = learner_weekly_goal_sets.user_id
      AND lss.next_due_at < NOW()
  ),
  closed_at = NOW(),
  updated_at = NOW()
  WHERE week_ends_at_utc < NOW()
    AND closed_at IS NULL;

  RETURN QUERY SELECT ROW_NUMBER() OVER () :: integer, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = indonesian;

-- Job 2: Current-Week Goal Pre-Generation
-- Creates weekly goal sets for users at their local week start.
CREATE OR REPLACE FUNCTION indonesian.job_pregenerate_current_week()
RETURNS table(generated_count integer, error_message text) AS $$
DECLARE
  v_user_id uuid;
  v_timezone text;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_count integer := 0;
BEGIN
  -- For each user with a valid timezone
  FOR v_user_id, v_timezone IN
    SELECT id, timezone FROM indonesian.profiles
    WHERE timezone IS NOT NULL AND timezone != ''
  LOOP
    -- Compute local week boundaries
    v_week_start := date_trunc('week', NOW() AT TIME ZONE v_timezone) AT TIME ZONE 'UTC';
    v_week_end := v_week_start + interval '7 days';

    -- Check if user already has a goal set for this week
    IF NOT EXISTS (
      SELECT 1 FROM indonesian.learner_weekly_goal_sets
      WHERE user_id = v_user_id
        AND week_starts_at_utc <= NOW()
        AND week_ends_at_utc > NOW()
    ) THEN
      -- Create goal set
      INSERT INTO indonesian.learner_weekly_goal_sets (
        user_id, goal_timezone, week_start_date_local, week_end_date_local,
        week_starts_at_utc, week_ends_at_utc, generation_strategy_version, generated_at
      ) VALUES (
        v_user_id, v_timezone,
        v_week_start::date,
        (v_week_end - interval '1 day')::date,
        v_week_start, v_week_end, 'v1', NOW()
      );

      -- Create child goals with default targets
      INSERT INTO indonesian.learner_weekly_goals (goal_set_id, goal_type, goal_direction, goal_unit, target_value_numeric)
      SELECT
        (SELECT id FROM indonesian.learner_weekly_goal_sets WHERE user_id = v_user_id AND week_starts_at_utc = v_week_start),
        goal_type,
        goal_direction,
        goal_unit,
        target_value_numeric
      FROM (
        VALUES
          ('consistency', 'at_least', 'count', 4),
          ('recall_quality', 'at_least', 'percent', 0.80),
          ('usable_vocabulary', 'at_least', 'count', 8),
          ('review_health', 'at_most', 'count', 20)
      ) AS defaults(goal_type, goal_direction, goal_unit, target_value_numeric);

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = indonesian;

-- Job 3: Daily Goal Rollup Snapshot
-- Materializes daily aggregates for trends and analytics.
CREATE OR REPLACE FUNCTION indonesian.job_daily_rollup_snapshot()
RETURNS table(rollup_count integer, error_message text) AS $$
DECLARE
  v_user_id uuid;
  v_timezone text;
  v_local_date date;
  v_count integer := 0;
BEGIN
  -- For each user with a valid timezone
  FOR v_user_id, v_timezone IN
    SELECT id, timezone FROM indonesian.profiles
    WHERE timezone IS NOT NULL AND timezone != ''
  LOOP
    -- Get local date in user's timezone
    v_local_date := (NOW() AT TIME ZONE v_timezone)::date;

    -- Upsert daily rollup. Date comparisons use the user's local timezone so
    -- late-night reviews bucket into the correct day (without this, a review
    -- at 01:00 Amsterdam — 23:00 UTC previous day — was attributed to the
    -- wrong local date and could be dropped from both days).
    -- recall_accuracy is intentionally form_recall-only per the goal spec.
    INSERT INTO indonesian.learner_daily_goal_rollups (
      user_id, goal_timezone, local_date,
      study_day_completed, recall_accuracy, recall_sample_size,
      usable_items_gained_today, usable_items_total, overdue_count
    ) VALUES (
      v_user_id, v_timezone, v_local_date,
      COALESCE((SELECT COUNT(*) > 0 FROM indonesian.review_events re
        WHERE re.user_id = v_user_id
          AND (re.created_at AT TIME ZONE v_timezone)::date = v_local_date), false),
      (SELECT CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN was_correct THEN 1 ELSE 0 END)::numeric / COUNT(*)
                   ELSE NULL END
       FROM indonesian.review_events re
       WHERE re.user_id = v_user_id
         AND re.skill_type = 'form_recall'
         AND (re.created_at AT TIME ZONE v_timezone)::date = v_local_date),
      COALESCE((SELECT COUNT(*) FROM indonesian.review_events re
        WHERE re.user_id = v_user_id
          AND re.skill_type = 'form_recall'
          AND (re.created_at AT TIME ZONE v_timezone)::date = v_local_date), 0),
      (SELECT COUNT(DISTINCT learning_item_id) FROM indonesian.learner_stage_events lse
        WHERE lse.user_id = v_user_id AND lse.to_stage IN ('retrieving', 'productive', 'maintenance')
          AND (lse.created_at AT TIME ZONE v_timezone)::date = v_local_date),
      (SELECT COUNT(*) FROM indonesian.learner_item_state lis
        WHERE lis.user_id = v_user_id AND lis.stage IN ('retrieving', 'productive', 'maintenance')),
      (SELECT COUNT(*) FROM indonesian.learner_skill_state lss
        WHERE lss.user_id = v_user_id AND lss.next_due_at < NOW())
    ) ON CONFLICT (user_id, local_date) DO UPDATE SET
      study_day_completed = EXCLUDED.study_day_completed,
      recall_accuracy = EXCLUDED.recall_accuracy,
      recall_sample_size = EXCLUDED.recall_sample_size,
      usable_items_gained_today = EXCLUDED.usable_items_gained_today,
      usable_items_total = EXCLUDED.usable_items_total,
      overdue_count = EXCLUDED.overdue_count,
      updated_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = indonesian;

-- Job 4: Integrity and Repair Sweeper
-- Heals inconsistent goal state and closes overdue weeks.
CREATE OR REPLACE FUNCTION indonesian.job_integrity_repair()
RETURNS table(repairs_count integer, error_message text) AS $$
DECLARE
  v_count integer := 0;
  v_goal_set_id uuid;
BEGIN
  -- Repair 1: Close overdue still-open weeks
  UPDATE indonesian.learner_weekly_goal_sets
  SET closing_overdue_count = (
    SELECT COUNT(*) FROM indonesian.learner_skill_state lss
    WHERE lss.user_id = learner_weekly_goal_sets.user_id
      AND lss.next_due_at < NOW()
  ),
  closed_at = NOW(),
  updated_at = NOW()
  WHERE week_ends_at_utc < NOW()
    AND closed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = indonesian;

-- Grant execute permission to service role (needed for pg_cron)
GRANT EXECUTE ON FUNCTION indonesian.job_finalize_weekly_goals() TO service_role;
GRANT EXECUTE ON FUNCTION indonesian.job_pregenerate_current_week() TO service_role;
GRANT EXECUTE ON FUNCTION indonesian.job_daily_rollup_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION indonesian.job_integrity_repair() TO service_role;

-- Schedule jobs with pg_cron
-- Note: These schedules use UTC. Adjust times as needed for your deployment.
-- Format: minute hour day-of-month month day-of-week

-- Weekly finalization: hourly at minute 5
SELECT cron.schedule('goal-finalize-weekly', '5 * * * *', 'SELECT indonesian.job_finalize_weekly_goals()');

-- Current-week pre-generation: hourly at minute 10
SELECT cron.schedule('goal-pregenerate-weekly', '10 * * * *', 'SELECT indonesian.job_pregenerate_current_week()');

-- Daily rollup snapshots: hourly at minute 15
SELECT cron.schedule('goal-daily-rollup', '15 * * * *', 'SELECT indonesian.job_daily_rollup_snapshot()');

-- Integrity repair: daily at 02:30 UTC
SELECT cron.schedule('goal-integrity-repair', '30 2 * * *', 'SELECT indonesian.job_integrity_repair()');

-- Analytics: track user interactions with goal system and learning
CREATE TABLE IF NOT EXISTS indonesian.learner_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'goal_generated',
    'goal_viewed',
    'daily_plan_viewed',
    'session_started_from_today',
    'goal_achieved',
    'goal_missed',
    'session_summary_viewed'
  )),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid,
  goal_type text CHECK (goal_type IN ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  session_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learner_analytics_events_user_id_idx ON indonesian.learner_analytics_events(user_id);
CREATE INDEX IF NOT EXISTS learner_analytics_events_event_type_idx ON indonesian.learner_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS learner_analytics_events_created_at_idx ON indonesian.learner_analytics_events(created_at);

-- Skill facet migration: rename 'recall' to 'form_recall'
-- First widen constraints to allow both old and new values, then migrate data, then narrow
ALTER TABLE indonesian.learner_skill_state DROP CONSTRAINT IF EXISTS learner_skill_state_skill_type_check;
ALTER TABLE indonesian.learner_skill_state ADD CONSTRAINT learner_skill_state_skill_type_check
  CHECK (skill_type IN ('recognition', 'recall', 'form_recall', 'meaning_recall', 'spoken_production'));

ALTER TABLE indonesian.review_events DROP CONSTRAINT IF EXISTS review_events_skill_type_check;
ALTER TABLE indonesian.review_events ADD CONSTRAINT review_events_skill_type_check
  CHECK (skill_type IN ('recognition', 'recall', 'form_recall', 'meaning_recall', 'spoken_production'));

UPDATE indonesian.learner_skill_state SET skill_type = 'form_recall' WHERE skill_type = 'recall';
UPDATE indonesian.review_events SET skill_type = 'form_recall' WHERE skill_type = 'recall';

-- Narrow constraints to final values only
ALTER TABLE indonesian.learner_skill_state DROP CONSTRAINT IF EXISTS learner_skill_state_skill_type_check;
ALTER TABLE indonesian.learner_skill_state ADD CONSTRAINT learner_skill_state_skill_type_check
  CHECK (skill_type IN ('recognition', 'form_recall', 'meaning_recall', 'spoken_production'));

ALTER TABLE indonesian.review_events DROP CONSTRAINT IF EXISTS review_events_skill_type_check;
ALTER TABLE indonesian.review_events ADD CONSTRAINT review_events_skill_type_check
  CHECK (skill_type IN ('recognition', 'form_recall', 'meaning_recall', 'spoken_production'));

-- === Content Generation and Staging Tables ===

-- Textbook source metadata
CREATE TABLE IF NOT EXISTS indonesian.textbook_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'paper_textbook' CHECK (source_type = 'paper_textbook'),
  publisher text,
  edition text,
  language text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Staged textbook pages with OCR
CREATE TABLE IF NOT EXISTS indonesian.textbook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_source_id uuid NOT NULL REFERENCES indonesian.textbook_sources(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  raw_ocr_text text NOT NULL,
  ocr_confidence numeric,
  import_batch_id text,
  needs_manual_review boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(textbook_source_id, page_number)
);

-- Grammar pattern definitions
CREATE TABLE IF NOT EXISTS indonesian.grammar_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_explanation text NOT NULL,
  complexity_score integer NOT NULL,
  confusion_group text,
  introduced_by_source_id uuid REFERENCES indonesian.textbook_sources(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE indonesian.grammar_patterns
  ADD COLUMN IF NOT EXISTS introduced_by_lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL;

-- Grammar pattern links for live contexts
CREATE TABLE IF NOT EXISTS indonesian.item_context_grammar_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id uuid NOT NULL REFERENCES indonesian.item_contexts(id) ON DELETE CASCADE,
  grammar_pattern_id uuid NOT NULL REFERENCES indonesian.grammar_patterns(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(context_id, grammar_pattern_id)
);

-- Exercise type availability registry
CREATE TABLE IF NOT EXISTS indonesian.exercise_type_availability (
  exercise_type text PRIMARY KEY,
  session_enabled boolean NOT NULL DEFAULT false,
  authoring_enabled boolean NOT NULL DEFAULT false,
  requires_approved_content boolean NOT NULL DEFAULT false,
  rollout_phase text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Staged AI-generated exercise candidates
CREATE TABLE IF NOT EXISTS indonesian.generated_exercise_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_source_id uuid NOT NULL REFERENCES indonesian.textbook_sources(id) ON DELETE CASCADE,
  textbook_page_id uuid NOT NULL REFERENCES indonesian.textbook_pages(id) ON DELETE CASCADE,
  candidate_type text NOT NULL CHECK (candidate_type IN ('context', 'exercise_variant', 'grammar_pattern')),
  exercise_type text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'published')),
  prompt_version text NOT NULL,
  model_name text NOT NULL,
  generated_payload_json jsonb NOT NULL,
  reviewer_notes text,
  approved_publication_target text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Published exercise variants
CREATE TABLE IF NOT EXISTS indonesian.exercise_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_type text NOT NULL,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  context_id uuid NOT NULL REFERENCES indonesian.item_contexts(id) ON DELETE CASCADE,
  grammar_pattern_id uuid REFERENCES indonesian.grammar_patterns(id) ON DELETE SET NULL,
  payload_json jsonb NOT NULL,
  answer_key_json jsonb NOT NULL,
  source_candidate_id uuid REFERENCES indonesian.generated_exercise_candidates(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Derived view for content review
CREATE OR REPLACE VIEW indonesian.content_review_queue AS
SELECT
  id, textbook_source_id, textbook_page_id, candidate_type,
  exercise_type, review_status, prompt_version, model_name,
  generated_payload_json, reviewer_notes, approved_publication_target,
  created_at, updated_at
FROM indonesian.generated_exercise_candidates
WHERE review_status IN ('pending_review', 'approved', 'rejected');

-- RLS: Users can only read their own analytics; all authenticated users can insert their own
ALTER TABLE indonesian.learner_analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY learner_analytics_events_own ON indonesian.learner_analytics_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'indonesian' AND tablename = 'learner_analytics_events' AND policyname = 'learner_analytics_events_insert') THEN
    CREATE POLICY learner_analytics_events_insert ON indonesian.learner_analytics_events
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Grants: Authenticated users can read and insert analytics events
GRANT SELECT, INSERT ON indonesian.learner_analytics_events TO authenticated;

-- Seed exercise type availability (runtime feature flags)
INSERT INTO indonesian.exercise_type_availability (
  exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes
) VALUES
  ('recognition_mcq', true, true, false, 'full', 'Core exercise type'),
  ('cued_recall', true, true, false, 'full', 'Core exercise type'),
  ('typed_recall', true, true, false, 'full', 'Core exercise type'),
  ('cloze', true, true, false, 'full', 'Core exercise type'),
  ('contrast_pair', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('sentence_transformation', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('constrained_translation', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('speaking', false, true, true, 'alpha', 'Not yet enabled in sessions')
ON CONFLICT (exercise_type) DO UPDATE SET
  session_enabled = EXCLUDED.session_enabled,
  authoring_enabled = EXCLUDED.authoring_enabled,
  requires_approved_content = EXCLUDED.requires_approved_content,
  rollout_phase = EXCLUDED.rollout_phase,
  notes = EXCLUDED.notes;

-- RLS for content pipeline tables
ALTER TABLE indonesian.textbook_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.textbook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.grammar_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_context_grammar_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.exercise_type_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.generated_exercise_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.exercise_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbook_sources_read" ON indonesian.textbook_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "textbook_sources_admin_write" ON indonesian.textbook_sources FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "textbook_pages_read" ON indonesian.textbook_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "textbook_pages_admin_write" ON indonesian.textbook_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "grammar_patterns_read" ON indonesian.grammar_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "grammar_patterns_admin_write" ON indonesian.grammar_patterns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "item_context_grammar_patterns_read" ON indonesian.item_context_grammar_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_context_grammar_patterns_admin_write" ON indonesian.item_context_grammar_patterns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "exercise_type_availability_read" ON indonesian.exercise_type_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "exercise_type_availability_admin_write" ON indonesian.exercise_type_availability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "generated_exercise_candidates_admin_only" ON indonesian.generated_exercise_candidates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "exercise_variants_read" ON indonesian.exercise_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "exercise_variants_admin_write" ON indonesian.exercise_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

GRANT SELECT ON indonesian.textbook_sources TO authenticated;
GRANT SELECT ON indonesian.textbook_pages TO authenticated;
GRANT SELECT ON indonesian.grammar_patterns TO authenticated;
GRANT SELECT ON indonesian.item_context_grammar_patterns TO authenticated;
GRANT SELECT ON indonesian.exercise_type_availability TO authenticated;
GRANT SELECT ON indonesian.exercise_variants TO authenticated;
-- generated_exercise_candidates: no grant to authenticated — admin-only via service_role

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('indonesian-lessons', 'indonesian-lessons', true),
  ('indonesian-podcasts', 'indonesian-podcasts', true)
ON CONFLICT (id) DO NOTHING;

-- Content flags: admin-only exercise review annotations
CREATE TABLE IF NOT EXISTS indonesian.content_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id    uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  exercise_type       text NOT NULL,
  exercise_variant_id uuid REFERENCES indonesian.exercise_variants(id) ON DELETE SET NULL,
  flag_type           text NOT NULL CHECK (flag_type IN ('wrong_translation', 'bad_sentence', 'confusing', 'sunset', 'other')),
  comment             text,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, learning_item_id, exercise_type)
);

ALTER TABLE indonesian.content_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'indonesian' AND tablename = 'content_flags' AND policyname = 'content_flags_owner'
  ) THEN
    CREATE POLICY "content_flags_owner" ON indonesian.content_flags
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.content_flags TO authenticated;

CREATE INDEX IF NOT EXISTS idx_content_flags_user_status
  ON indonesian.content_flags(user_id, status);

-- Grammar exercises do not belong to a vocabulary item context — make both FKs nullable
-- and add lesson_id as an alternative anchor. At least one of context_id or lesson_id must be set.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indonesian' AND table_name = 'exercise_variants'
    AND column_name = 'context_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE indonesian.exercise_variants ALTER COLUMN context_id DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indonesian' AND table_name = 'exercise_variants'
    AND column_name = 'learning_item_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE indonesian.exercise_variants ALTER COLUMN learning_item_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE indonesian.exercise_variants
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercise_variants_anchor_check'
    AND conrelid = 'indonesian.exercise_variants'::regclass
  ) THEN
    ALTER TABLE indonesian.exercise_variants
      ADD CONSTRAINT exercise_variants_anchor_check
      CHECK (context_id IS NOT NULL OR lesson_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_variants_lesson
  ON indonesian.exercise_variants(lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_variants_grammar
  ON indonesian.exercise_variants(grammar_pattern_id)
  WHERE grammar_pattern_id IS NOT NULL;

-- ============================================================
-- Grammar Pattern Scheduling
-- ============================================================

-- Per-learner FSRS state for grammar patterns (parallel track to learner_skill_state)
CREATE TABLE IF NOT EXISTS indonesian.learner_grammar_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grammar_pattern_id    UUID NOT NULL REFERENCES indonesian.grammar_patterns(id) ON DELETE CASCADE,
  stage                 TEXT NOT NULL DEFAULT 'new'
                        CHECK (stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  stability             NUMERIC,
  difficulty            NUMERIC,
  due_at                TIMESTAMPTZ,
  last_reviewed_at      TIMESTAMPTZ,
  review_count          INT NOT NULL DEFAULT 0,
  lapse_count           INT NOT NULL DEFAULT 0,
  consecutive_failures  INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, grammar_pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_grammar_state_due
  ON indonesian.learner_grammar_state(user_id, due_at);

ALTER TABLE indonesian.learner_grammar_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_grammar_state_select" ON indonesian.learner_grammar_state
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "learner_grammar_state_insert" ON indonesian.learner_grammar_state
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_grammar_state_update" ON indonesian.learner_grammar_state
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON indonesian.learner_grammar_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learner_grammar_state TO service_role;

-- Extend review_events to support grammar pattern reviews
-- learning_item_id is relaxed to nullable; grammar reviews use grammar_pattern_id instead
ALTER TABLE indonesian.review_events ALTER COLUMN learning_item_id DROP NOT NULL;

ALTER TABLE indonesian.review_events ADD COLUMN IF NOT EXISTS
  grammar_pattern_id UUID REFERENCES indonesian.grammar_patterns(id) ON DELETE SET NULL;

-- Content review comments: admin-only per-variant annotations
CREATE TABLE IF NOT EXISTS indonesian.exercise_review_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_variant_id uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE,
  comment             text NOT NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_variant_id)
);

ALTER TABLE indonesian.exercise_review_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'indonesian'
      AND tablename = 'exercise_review_comments'
      AND policyname = 'review_comments_admin_only'
  ) THEN
    CREATE POLICY "review_comments_admin_only" ON indonesian.exercise_review_comments
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM indonesian.user_roles
                WHERE user_id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM indonesian.user_roles
                WHERE user_id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON indonesian.exercise_review_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.exercise_review_comments TO service_role;

CREATE INDEX IF NOT EXISTS idx_exercise_review_comments_user_status
  ON indonesian.exercise_review_comments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_exercise_review_comments_variant
  ON indonesian.exercise_review_comments(exercise_variant_id);

-- Exactly one source must be set (vocab review XOR grammar review)
DO $$ BEGIN
  ALTER TABLE indonesian.review_events ADD CONSTRAINT review_events_source_check
    CHECK (
      (learning_item_id IS NOT NULL AND grammar_pattern_id IS NULL) OR
      (learning_item_id IS NULL AND grammar_pattern_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- content_flags: extend to support grammar exercises (grammar_pattern_id)
-- Make learning_item_id nullable so grammar flags have no vocab anchor
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'indonesian' AND table_name = 'content_flags'
    AND column_name = 'learning_item_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE indonesian.content_flags ALTER COLUMN learning_item_id DROP NOT NULL;
  END IF;
END $$;

-- Add grammar_pattern_id FK column
ALTER TABLE indonesian.content_flags
  ADD COLUMN IF NOT EXISTS grammar_pattern_id uuid
    REFERENCES indonesian.grammar_patterns(id) ON DELETE CASCADE;

-- Ensure vocab unique constraint exists (was the original inline UNIQUE)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'indonesian'
    AND table_name = 'content_flags'
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'content_flags_user_id_learning_item_id_exercise_type_key'
  ) THEN
    ALTER TABLE indonesian.content_flags
      ADD CONSTRAINT content_flags_user_id_learning_item_id_exercise_type_key
      UNIQUE(user_id, learning_item_id, exercise_type);
  END IF;
END $$;

-- Add grammar unique constraint (NULL grammar_pattern_id rows don't conflict — SQL NULL != NULL)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'indonesian'
    AND table_name = 'content_flags'
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'content_flags_user_id_grammar_pattern_id_exercise_type_key'
  ) THEN
    ALTER TABLE indonesian.content_flags
      ADD CONSTRAINT content_flags_user_id_grammar_pattern_id_exercise_type_key
      UNIQUE(user_id, grammar_pattern_id, exercise_type);
  END IF;
END $$;

-- Clean up partial indexes if they were created by an earlier migration version
DROP INDEX IF EXISTS indonesian.idx_content_flags_vocab_unique;
DROP INDEX IF EXISTS indonesian.idx_content_flags_grammar_unique;

-- Exactly one of learning_item_id / grammar_pattern_id must be set
DO $$ BEGIN
  ALTER TABLE indonesian.content_flags ADD CONSTRAINT content_flags_entity_check
    CHECK (
      (learning_item_id IS NOT NULL AND grammar_pattern_id IS NULL) OR
      (learning_item_id IS NULL AND grammar_pattern_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Audio clips (TTS-generated Indonesian pronunciation)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS indonesian.audio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_content text NOT NULL,
  normalized_text text NOT NULL,
  voice_id text NOT NULL,
  storage_path text NOT NULL,
  duration_ms integer,
  generated_for_lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),

  UNIQUE(normalized_text, voice_id)
);

ALTER TABLE indonesian.audio_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audio_clips_read" ON indonesian.audio_clips
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "audio_clips_admin_write" ON indonesian.audio_clips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

GRANT SELECT ON indonesian.audio_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.audio_clips TO service_role;

-- Voice config on lessons
ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS primary_voice text;
ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS dialogue_voices jsonb;

-- Batch retrieval RPC
CREATE OR REPLACE FUNCTION indonesian.get_audio_clips(p_texts text[], p_voice_ids text[])
RETURNS TABLE(text_content text, normalized_text text, voice_id text, storage_path text, duration_ms integer)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  SELECT ac.text_content, ac.normalized_text, ac.voice_id, ac.storage_path, ac.duration_ms
  FROM audio_clips ac
  WHERE ac.normalized_text = ANY(p_texts)
  AND ac.voice_id = ANY(p_voice_ids);
$$;

GRANT EXECUTE ON FUNCTION indonesian.get_audio_clips(text[], text[]) TO authenticated;

-- Session audio resolution: one clip per text, preferring earliest lesson.
-- See docs/plans/2026-04-21-session-audio-voice-resolution.md for rationale.
CREATE OR REPLACE FUNCTION indonesian.get_audio_clip_per_text(p_texts text[])
RETURNS TABLE(normalized_text text, storage_path text)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  SELECT DISTINCT ON (ac.normalized_text)
    ac.normalized_text, ac.storage_path
  FROM audio_clips ac
  LEFT JOIN lessons l ON l.id = ac.generated_for_lesson_id
  WHERE ac.normalized_text = ANY(p_texts)
  ORDER BY ac.normalized_text, l.order_index NULLS LAST, ac.created_at, ac.id;
$$;

GRANT EXECUTE ON FUNCTION indonesian.get_audio_clip_per_text(text[]) TO authenticated;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('indonesian-tts', 'indonesian-tts', true)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- POS (part of speech) for distractor filtering in MCQ exercises.
-- 12-value UD-aligned taxonomy. See docs/plans/2026-04-17-pos-aware-distractors-design.md.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE indonesian.learning_items
  ADD COLUMN IF NOT EXISTS pos text;

ALTER TABLE indonesian.learning_items
  DROP CONSTRAINT IF EXISTS learning_items_pos_check;
ALTER TABLE indonesian.learning_items
  ADD CONSTRAINT learning_items_pos_check CHECK (
    pos IS NULL OR pos IN (
      'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
      'classifier', 'preposition', 'conjunction', 'particle',
      'question_word', 'greeting'
    )
  );

-- Listening MCQ (audio-only Indonesian prompt, user-language MCQ answer)
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('listening_mcq', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, user-language MCQ. Runtime-built. No authored variants.')
ON CONFLICT (exercise_type) DO NOTHING;

-- Audio coverage report for check-supabase-deep
CREATE OR REPLACE FUNCTION indonesian.audio_coverage_report()
RETURNS TABLE(total_word_phrase bigint, with_audio bigint, without_audio bigint)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  WITH targets AS (
    SELECT li.id, li.normalized_text
    FROM learning_items li
    WHERE li.item_type IN ('word', 'phrase')
  ),
  covered AS (
    SELECT DISTINCT t.id
    FROM targets t
    JOIN audio_clips ac ON ac.normalized_text = t.normalized_text
  )
  SELECT
    (SELECT count(*) FROM targets) AS total_word_phrase,
    (SELECT count(*) FROM covered) AS with_audio,
    (SELECT count(*) FROM targets) - (SELECT count(*) FROM covered) AS without_audio;
$$;

GRANT EXECUTE ON FUNCTION indonesian.audio_coverage_report() TO authenticated;

-- Dictation (audio-only Indonesian prompt, typed Indonesian answer)
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('dictation', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, typed Indonesian answer. Runtime-built. Free text with fuzzy grading.')
ON CONFLICT (exercise_type) DO NOTHING;

-- review_events.score and feedback_type were never written (always null) and
-- never read. Drop the dead columns.
ALTER TABLE indonesian.review_events DROP COLUMN IF EXISTS score;
ALTER TABLE indonesian.review_events DROP COLUMN IF EXISTS feedback_type;

-- Atomic skill-state mutation. The session queue snapshots learnerSkillState
-- at session build time and reuses the same reference across multiple exercises
-- for one item, so the JS-side `success_count + 1` from upsertSkillState
-- produced stale writes (last write wins) when the same item+skill came up more
-- than once. This function increments counters DB-side so concurrent or stale
-- callers can't lose increments. FSRS-derived fields (stability/difficulty/
-- retrievability/next_due_at) are still set from the caller's just-computed
-- value because they require the algorithm input.
CREATE OR REPLACE FUNCTION indonesian.apply_review_to_skill_state(
  p_user_id            uuid,
  p_learning_item_id   uuid,
  p_skill_type         text,
  p_was_correct        boolean,
  p_stability          numeric,
  p_difficulty         numeric,
  p_retrievability     numeric,
  p_last_reviewed_at   timestamptz,
  p_next_due_at        timestamptz,
  p_mean_latency_ms    integer
) RETURNS indonesian.learner_skill_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'indonesian'
AS $$
DECLARE
  v_row indonesian.learner_skill_state;
BEGIN
  INSERT INTO indonesian.learner_skill_state (
    user_id, learning_item_id, skill_type,
    stability, difficulty, retrievability,
    last_reviewed_at, next_due_at,
    success_count, failure_count, lapse_count, consecutive_failures,
    mean_latency_ms, hint_rate, updated_at
  ) VALUES (
    p_user_id, p_learning_item_id, p_skill_type,
    p_stability, p_difficulty, p_retrievability,
    p_last_reviewed_at, p_next_due_at,
    CASE WHEN p_was_correct THEN 1 ELSE 0 END,
    CASE WHEN p_was_correct THEN 0 ELSE 1 END,
    0,
    CASE WHEN p_was_correct THEN 0 ELSE 1 END,
    p_mean_latency_ms, NULL, NOW()
  )
  ON CONFLICT (user_id, learning_item_id, skill_type) DO UPDATE SET
    stability            = EXCLUDED.stability,
    difficulty           = EXCLUDED.difficulty,
    retrievability       = EXCLUDED.retrievability,
    last_reviewed_at     = EXCLUDED.last_reviewed_at,
    next_due_at          = EXCLUDED.next_due_at,
    success_count        = indonesian.learner_skill_state.success_count
                           + CASE WHEN p_was_correct THEN 1 ELSE 0 END,
    failure_count        = indonesian.learner_skill_state.failure_count
                           + CASE WHEN p_was_correct THEN 0 ELSE 1 END,
    lapse_count          = indonesian.learner_skill_state.lapse_count
                           + CASE WHEN NOT p_was_correct
                                       AND indonesian.learner_skill_state.success_count > 0
                                  THEN 1 ELSE 0 END,
    consecutive_failures = CASE WHEN p_was_correct THEN 0
                                ELSE indonesian.learner_skill_state.consecutive_failures + 1 END,
    mean_latency_ms      = COALESCE(EXCLUDED.mean_latency_ms,
                                    indonesian.learner_skill_state.mean_latency_ms),
    updated_at           = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION indonesian.apply_review_to_skill_state(
  uuid, uuid, text, boolean, numeric, numeric, numeric, timestamptz, timestamptz, integer
) TO authenticated;

-- Sweep abandoned learning_sessions. Runs hourly. A session is considered
-- abandoned when ended_at is null and it's older than 1 hour. We finalize
-- with the latest review event timestamp if any (true last activity), else
-- cap at started_at + 1h to avoid 7-hour ghost sessions from tabs left open
-- overnight without any pagehide beacon reaching the server.
CREATE OR REPLACE FUNCTION indonesian.job_finalize_stale_sessions()
RETURNS TABLE(finalized_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'indonesian'
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT ls.id, ls.started_at,
           (SELECT MAX(re.created_at) FROM indonesian.review_events re
            WHERE re.session_id = ls.id) AS last_review_at
    FROM indonesian.learning_sessions ls
    WHERE ls.ended_at IS NULL
      AND ls.started_at < NOW() - interval '1 hour'
  ),
  upd AS (
    UPDATE indonesian.learning_sessions ls
    SET ended_at = COALESCE(stale.last_review_at,
                            LEAST(NOW(), stale.started_at + interval '1 hour'))
    FROM stale
    WHERE ls.id = stale.id
    RETURNING ls.id
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION indonesian.job_finalize_stale_sessions() TO service_role;

-- Schedule the stale-session sweep hourly at minute 25 (offset from the other
-- goal jobs so they don't pile up on the same minute).
DO $$ BEGIN
  PERFORM cron.unschedule('finalize-stale-sessions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('finalize-stale-sessions', '25 * * * *',
  'SELECT indonesian.job_finalize_stale_sessions()');
