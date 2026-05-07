
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

-- (Weekly goal system tables retired in 2026-05-07 retirement #4 — see end of file)

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
GRANT SELECT ON indonesian.learning_sessions TO authenticated;
-- Retirement #5 (2026-05-07): INSERT/UPDATE/DELETE retired. Only the
-- commit_capability_answer_report RPC writes (service_role bypass). Browsers
-- never write directly. SELECT preserved for the leaderboard view.
GRANT INSERT ON indonesian.error_logs TO authenticated;
GRANT SELECT ON indonesian.leaderboard TO authenticated;
GRANT SELECT ON indonesian.user_roles TO authenticated;

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
    ),
    'policies', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'cmd', cmd,
        'roles', roles
      ) ORDER BY tablename, policyname)
      FROM pg_policies
      WHERE schemaname = 'indonesian'
    )
  )
$$;

GRANT EXECUTE ON FUNCTION indonesian.schema_health() TO authenticated;

-- Goal System Scheduled Jobs (pg_cron)
-- These jobs maintain the weekly goal system consistency and generate reports.

-- pg_cron extension stays available for non-goal jobs (currently none scheduled,
-- but learner_capability_state mastery refresh + future telemetry may use it).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- (Goal-system functions, cron schedules, and learner_analytics_events table
-- retired in 2026-05-07 retirement #4 — see end of file.)

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

-- (learner_analytics_events RLS/policies/grants retired in 2026-05-07 retirement #4)

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
-- Grammar Pattern Scheduling — RETIRED 2026-05-07
-- ============================================================
-- learner_grammar_state retired per docs/target-architecture.md §#5.
-- The capability system handles per-pattern FSRS via learner_capability_state.
-- Tracked-history rollout: scripts/migrations/2026-05-07-drop-learner-grammar-state.sql
-- Rollback: scripts/migrations/2026-05-07-drop-learner-grammar-state.rollback.sql
drop table if exists indonesian.learner_grammar_state cascade;

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

-- content_flags: make flag_type nullable + drop CHECK constraint
-- Part of the exercise UI redesign (docs/plans/2026-04-23-exercise-framework-design.md §12.1)
-- The new FlagButton drops the category chip UI; uncategorized flags store
-- 'other' today. The nullable + constraint-free column lets future admin UI
-- extensions add new categories without schema changes.
-- Both statements are inherently idempotent in Postgres:
--   - DROP NOT NULL is a no-op when already nullable.
--   - DROP CONSTRAINT IF EXISTS does nothing when the constraint is gone.
ALTER TABLE indonesian.content_flags
  ALTER COLUMN flag_type DROP NOT NULL;
ALTER TABLE indonesian.content_flags
  DROP CONSTRAINT IF EXISTS content_flags_flag_type_check;

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

-- (Stale-session sweep + cron retired in 2026-05-07 retirement #5 — see end of file.)

-- ============================================================================
-- Retirement #4 (goal subsystem + event log) — 2026-05-07
-- See docs/plans/2026-05-07-retire-goal-subsystem.md for context.
-- Idempotent: lowercase drop ... if exists + cron.unschedule wrapped in
-- exception handlers. Re-running on a node where the drops already applied
-- is a safe no-op.
-- ============================================================================

-- Unschedule cron jobs (case-sensitive job names from the original cron.schedule registrations).
do $$ begin perform cron.unschedule('goal-finalize-weekly');     exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-pregenerate-weekly');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-daily-rollup');        exception when others then null; end $$;
do $$ begin perform cron.unschedule('goal-integrity-repair');    exception when others then null; end $$;

-- Drop SQL functions: 4 from master + 5 from 2026-05-01 progress migration
-- (compute_todays_plan_raw plus 4 survivor-surface functions whose only caller was goalService).
drop function if exists indonesian.job_finalize_weekly_goals();
drop function if exists indonesian.job_pregenerate_current_week();
drop function if exists indonesian.job_daily_rollup_snapshot();
drop function if exists indonesian.job_integrity_repair();
drop function if exists indonesian.compute_todays_plan_raw(uuid, timestamptz);
drop function if exists indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text);
drop function if exists indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_overdue_count(uuid, text);

-- Drop tables in FK-aware order (cascade removes dependent indexes, policies, grants).
drop table if exists indonesian.learner_daily_goal_rollups cascade;
drop table if exists indonesian.learner_stage_events cascade;
drop table if exists indonesian.learner_weekly_goals cascade;
drop table if exists indonesian.learner_weekly_goal_sets cascade;

-- Drop event-log table (bundled retirement #7).
drop table if exists indonesian.learner_analytics_events cascade;

-- ============================================================================
-- Retirement #5 (session lifecycle module) — 2026-05-07
-- See docs/plans/2026-05-07-retire-session-lifecycle.md for context.
-- Replaces the explicit startSession/endSession lifecycle with an RPC-side
-- upsert from the answer-commit path. Idempotent: drops are wrapped in
-- exception handlers; the RPC re-definition uses CREATE OR REPLACE.
-- ============================================================================

-- Block A: drop the dead RLS policy.
-- learning_sessions_write granted FOR ALL to authenticated; under retirement #5
-- the GRANT narrows to SELECT only, making the INSERT/UPDATE/DELETE branches
-- dead. SELECT continues to work via the more-permissive learning_sessions_read
-- policy (FOR SELECT TO authenticated USING (true)).
drop policy if exists "learning_sessions_write" on indonesian.learning_sessions;

-- Block B: drop the cron job + finalisation function.
do $$ begin
  perform cron.unschedule('finalize-stale-sessions');
exception when others then null;
end $$;

drop function if exists indonesian.job_finalize_stale_sessions() cascade;

-- Block C: replace the commit_capability_answer_report RPC with the modified
-- body. The modification adds (1) submittedAt to both validation blocks and
-- (2) a learning_sessions UPSERT immediately before the final return. The
-- upsert materialises a session row on first answer (started_at = ended_at =
-- submittedAt) and advances ended_at = GREATEST(existing, submittedAt) on each
-- subsequent commit. session_type is hardcoded 'learning' because only the
-- capability path commits through this RPC.
create or replace function indonesian.commit_capability_answer_report(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_user_id uuid;
  v_capability_id uuid;
  v_existing_event record;
  v_capability record;
  v_state record;
  v_state_before jsonb;
  v_state_after jsonb;
  v_review_event_id uuid;
  v_requested_state_version integer;
  v_rating integer;
  v_created_state boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'commit_capability_answer_report requires a trusted service role caller';
  end if;

  if p_command is null
     or jsonb_typeof(p_command) is distinct from 'object'
     or not (p_command ? 'userId')
     or not (p_command ? 'capabilityId')
     or not (p_command ? 'canonicalKeySnapshot')
     or not (p_command ? 'idempotencyKey')
     or not (p_command ? 'sessionId')
     or not (p_command ? 'sessionItemId')
     or not (p_command ? 'attemptNumber')
     or not (p_command ? 'rating')
     or not (p_command ? 'answerReport')
     or not (p_command ? 'schedulerSnapshot')
     or not (p_command ? 'stateBefore')
     or not (p_command ? 'stateAfter')
     or not (p_command ? 'artifactVersionSnapshot')
     or not (p_command ? 'fsrsAlgorithmVersion')
     or not (p_command ? 'submittedAt') then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if nullif(p_command->>'userId', '') is null
     or nullif(p_command->>'capabilityId', '') is null
     or nullif(p_command->>'canonicalKeySnapshot', '') is null
     or nullif(p_command->>'idempotencyKey', '') is null
     or nullif(p_command->>'sessionId', '') is null
     or nullif(p_command->>'sessionItemId', '') is null
     or nullif(p_command->>'attemptNumber', '') is null
     or nullif(p_command->>'submittedAt', '') is null then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if p_command->>'fsrsAlgorithmVersion' is distinct from 'ts-fsrs:language-learning-v1' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if p_command->>'rating' is null or (p_command->>'rating') !~ '^[1-4]$' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if jsonb_typeof(p_command->'answerReport') is distinct from 'object'
     or jsonb_typeof(p_command->'schedulerSnapshot') is distinct from 'object'
     or jsonb_typeof(p_command->'artifactVersionSnapshot') is distinct from 'object' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  v_user_id := (p_command->>'userId')::uuid;
  v_capability_id := (p_command->>'capabilityId')::uuid;
  v_state_before := p_command->'stateBefore';
  v_state_after := p_command->'stateAfter';
  v_requested_state_version := nullif(p_command->>'currentStateVersion', '')::integer;
  v_rating := (p_command->>'rating')::integer;

  -- Serialize commits for the same learner/capability before idempotency
  -- lookup so concurrent first-review activation returns the committed event
  -- instead of leaking as a unique-constraint error or stale rejection.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || v_capability_id::text));

  if jsonb_typeof(v_state_before) is distinct from 'object'
     or jsonb_typeof(v_state_after) is distinct from 'object'
     or not (v_state_before ? 'stateVersion')
     or not (v_state_before ? 'activationState')
     or not (v_state_before ? 'reviewCount')
     or not (v_state_before ? 'lapseCount')
     or not (v_state_before ? 'consecutiveFailureCount')
     or not (v_state_after ? 'stateVersion')
     or not (v_state_after ? 'activationState')
     or not (v_state_after ? 'reviewCount')
     or not (v_state_after ? 'lapseCount')
     or not (v_state_after ? 'consecutiveFailureCount')
     or not (v_state_after ? 'stability')
     or not (v_state_after ? 'difficulty')
     or not (v_state_after ? 'nextDueAt')
     or not (v_state_after ? 'lastReviewedAt') then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  select id, state_after_json
    into v_existing_event
    from indonesian.capability_review_events
   where user_id = v_user_id
     and idempotency_key = p_command->>'idempotencyKey'
   limit 1;

  if found then
    return jsonb_build_object(
      'idempotencyStatus', 'duplicate_returned',
      'reviewEventId', v_existing_event.id,
      'schedule', v_existing_event.state_after_json,
      'masteryRefreshQueued', false
    );
  end if;

  select *
    into v_capability
    from indonesian.learning_capabilities
   where id = v_capability_id;

  if not found
     or v_capability.canonical_key is distinct from p_command->>'canonicalKeySnapshot'
     or v_capability.readiness_status is distinct from 'ready'
     or v_capability.publication_status is distinct from 'published' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  select *
    into v_state
    from indonesian.learner_capability_state
   where user_id = v_user_id
     and capability_id = v_capability_id
   for update;

  if not found then
    if not (p_command ? 'activationRequest')
       or v_requested_state_version is distinct from 0
       or (v_state_before->>'stateVersion')::integer is distinct from 0
       or v_state_before->>'activationState' is distinct from 'dormant'
       or (v_state_before->>'reviewCount')::integer is distinct from 0
       or (v_state_before->>'lapseCount')::integer is distinct from 0
       or (v_state_before->>'consecutiveFailureCount')::integer is distinct from 0
       or nullif(v_state_before->>'stability', '') is not null
       or nullif(v_state_before->>'difficulty', '') is not null then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_stale',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;
    v_created_state := true;
  end if;

  if not v_created_state then
    if v_state.activation_state in ('suspended', 'retired') then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_invalid_outcome',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;

    if v_requested_state_version is distinct from v_state.state_version
       or (v_state_before->>'stateVersion')::integer is distinct from v_state.state_version
       or v_state_before->>'activationState' is distinct from v_state.activation_state
       or (v_state_before->>'reviewCount')::integer is distinct from v_state.review_count
       or (v_state_before->>'lapseCount')::integer is distinct from v_state.lapse_count
       or (v_state_before->>'consecutiveFailureCount')::integer is distinct from v_state.consecutive_failure_count
       or nullif(v_state_before->>'stability', '')::double precision is distinct from v_state.stability
       or nullif(v_state_before->>'difficulty', '')::double precision is distinct from v_state.difficulty then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_stale',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;
  end if;

  if (v_state_after->>'stateVersion')::integer is distinct from coalesce(v_state.state_version, 0) + 1
     or v_state_after->>'activationState' is distinct from 'active'
     or coalesce(v_state_after->>'activationSource', 'review_processor') not in ('review_processor', 'admin_backfill', 'legacy_migration')
     or (v_state_after->>'reviewCount')::integer is distinct from coalesce(v_state.review_count, 0) + 1
     or (v_state_after->>'lapseCount')::integer is distinct from coalesce(v_state.lapse_count, 0) + (case when v_rating = 1 and coalesce(v_state.review_count, 0) > 0 then 1 else 0 end)
     or (v_state_after->>'consecutiveFailureCount')::integer is distinct from (case when v_rating = 1 then coalesce(v_state.consecutive_failure_count, 0) + 1 else 0 end)
     or nullif(v_state_after->>'stability', '') is null
     or nullif(v_state_after->>'difficulty', '') is null
     or nullif(v_state_after->>'nextDueAt', '') is null
     or nullif(v_state_after->>'lastReviewedAt', '') is null then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if v_created_state then
    insert into indonesian.learner_capability_state (
      user_id,
      capability_id,
      canonical_key_snapshot,
      activation_state,
      activation_source,
      fsrs_state_json,
      review_count,
      lapse_count,
      consecutive_failure_count,
      state_version
    ) values (
      v_user_id,
      v_capability_id,
      p_command->>'canonicalKeySnapshot',
      'active',
      'review_processor',
      '{}',
      0,
      0,
      0,
      0
    )
    returning * into v_state;
  end if;

  insert into indonesian.capability_review_events (
    user_id,
    capability_id,
    learner_capability_state_id,
    idempotency_key,
    session_id,
    session_item_id,
    attempt_number,
    rating,
    answer_report_json,
    scheduler_snapshot_json,
    state_before_json,
    state_after_json,
    artifact_version_snapshot_json
  ) values (
    v_user_id,
    v_capability_id,
    v_state.id,
    p_command->>'idempotencyKey',
    p_command->>'sessionId',
    p_command->>'sessionItemId',
    (p_command->>'attemptNumber')::integer,
    v_rating,
    p_command->'answerReport',
    p_command->'schedulerSnapshot',
    v_state_before,
    v_state_after,
    p_command->'artifactVersionSnapshot'
  )
  returning id into v_review_event_id;

  update indonesian.learner_capability_state
     set activation_state = v_state_after->>'activationState',
         activation_source = coalesce(activation_source, v_state_after->>'activationSource', 'review_processor'),
         fsrs_state_json = v_state_after,
         stability = nullif(v_state_after->>'stability', '')::double precision,
         difficulty = nullif(v_state_after->>'difficulty', '')::double precision,
         next_due_at = nullif(v_state_after->>'nextDueAt', '')::timestamptz,
         last_reviewed_at = nullif(v_state_after->>'lastReviewedAt', '')::timestamptz,
         review_count = (v_state_after->>'reviewCount')::integer,
         lapse_count = (v_state_after->>'lapseCount')::integer,
         consecutive_failure_count = (v_state_after->>'consecutiveFailureCount')::integer,
         state_version = (v_state_after->>'stateVersion')::integer,
         updated_at = now()
   where id = v_state.id;

  -- Retirement #5 (2026-05-07): derive learning_sessions row from the answer log.
  -- First answer materialises the row; subsequent answers advance ended_at.
  -- session_type hardcoded 'learning' because only the capability path commits
  -- through this RPC (Lesson + Podcast paths produce no answers, no session).
  insert into indonesian.learning_sessions (id, user_id, session_type, started_at, ended_at)
  values (
    (p_command->>'sessionId')::uuid,
    v_user_id,
    'learning',
    (p_command->>'submittedAt')::timestamptz,
    (p_command->>'submittedAt')::timestamptz
  )
  on conflict (id) do update
     set ended_at = greatest(
       indonesian.learning_sessions.ended_at,
       excluded.ended_at
     );

  return jsonb_build_object(
    'idempotencyStatus', 'committed',
    'reviewEventId', v_review_event_id,
    'activatedCapabilityStateId', v_state.id,
    'schedule', v_state_after,
    'masteryRefreshQueued', true
  );
end;
$$;

revoke all on function indonesian.commit_capability_answer_report(jsonb) from public;
revoke all on function indonesian.commit_capability_answer_report(jsonb) from authenticated;
grant execute on function indonesian.commit_capability_answer_report(jsonb) to service_role;
