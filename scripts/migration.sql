
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
  UNIQUE(normalized_text, item_type)
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
  context_type text NOT NULL CHECK (context_type IN ('example_sentence', 'dialogue', 'cloze', 'lesson_snippet')),
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
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'recall')),
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
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'recall')),
  exercise_type text NOT NULL CHECK (exercise_type IN ('recognition_mcq', 'typed_recall', 'cloze')),
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
CREATE INDEX IF NOT EXISTS idx_stage_events_user_time ON indonesian.learner_stage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stage_events_to_stage ON indonesian.learner_stage_events(user_id, to_stage, created_at);
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

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('indonesian-lessons', 'indonesian-lessons', true),
  ('indonesian-podcasts', 'indonesian-podcasts', true)
ON CONFLICT (id) DO NOTHING;
