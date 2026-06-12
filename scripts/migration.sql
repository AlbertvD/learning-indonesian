
-- ============================================================================
-- learning-indonesian — runtime schema migration (applied by `make migrate`)
-- ============================================================================
-- This file is the source of truth for everything `make migrate` applies.
-- All schema changes that should reach the live DB via the canonical pipeline
-- must land here. The whole file is designed to be idempotent — re-running
-- `make migrate` against an existing DB must converge to the same end state
-- and not regress any policy, grant, or trigger.
--
-- Idempotency conventions in this file:
--   * `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
--   * `CREATE OR REPLACE FUNCTION` / `CREATE OR REPLACE VIEW`
--   * `DROP POLICY IF EXISTS "X" ON Y;` immediately before each
--     `CREATE POLICY "X" ON Y ...` (PG has no `CREATE POLICY IF NOT EXISTS`
--     even on PG 18 — verified 2026-05-08; the per-policy drop+create idiom
--     is the canonical workaround). Do NOT reintroduce a bulk-drop-all-policies
--     loop: it silently wipes policies declared in scripts/migrations/*.sql.
--
-- Relationship to scripts/migrations/*.sql:
--   These files are paper-trail audit logs and emergency rollback tools.
--   Some predate the inversion of 2026-04-02 (when migrate.ts stopped
--   regenerating migration.sql) and still hold load-bearing schema for the
--   capability + content-units subsystem (tracked:
--   content_units, capability_content_units, learning_capabilities,
--   capability_aliases, capability_artifacts, learner_capability_state,
--   capability_review_events, capability_resolution_failure_events).
--   Until those are folded back here in a follow-up, fresh DB rebuilds need
--   both this file AND those standalone files. New schema must land here,
--   not in a new standalone file.
--
-- See docs/known-regressions.md and CLAUDE.md (Health checks) for context.
-- ============================================================================

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

-- Practice Time analytics (#206): get_practice_time aggregates learning_sessions
-- by (user_id, started_at) on the request path. Only the PK existed before.
CREATE INDEX IF NOT EXISTS ls_user_started_idx
  ON indonesian.learning_sessions(user_id, started_at);

-- Session completion marker: the streak + streak bar count COMPLETED sessions
-- (the learner finished their full session at their configured length), not raw
-- answers, so a single tap no longer keeps a streak. Set by mark_session_complete
-- when ExperiencePlayer fires onComplete (queue exhausted). NULL = started but not
-- finished (or abandoned). Partial index serves the per-day streak walk.
ALTER TABLE indonesian.learning_sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE INDEX IF NOT EXISTS ls_user_completed_idx
  ON indonesian.learning_sessions(user_id, completed_at) WHERE completed_at IS NOT NULL;

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

-- Policies (idempotent: each CREATE is paired with DROP IF EXISTS so the file
-- can be re-applied against an existing DB without "policy already exists").
-- The previous bulk-drop loop was removed in 2026-05-08 because it silently
-- wiped policies declared in scripts/migrations/*.sql files; per-policy
-- `drop if exists; create` only touches policies this file owns.
DROP POLICY IF EXISTS "profiles_read" ON indonesian.profiles;
CREATE POLICY "profiles_read" ON indonesian.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_write" ON indonesian.profiles;
CREATE POLICY "profiles_write" ON indonesian.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "user_roles_read" ON indonesian.user_roles;
CREATE POLICY "user_roles_read" ON indonesian.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lessons_read" ON indonesian.lessons;
CREATE POLICY "lessons_read" ON indonesian.lessons FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lessons_admin_write" ON indonesian.lessons;
CREATE POLICY "lessons_admin_write" ON indonesian.lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "lesson_sections_read" ON indonesian.lesson_sections;
CREATE POLICY "lesson_sections_read" ON indonesian.lesson_sections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lesson_sections_admin_write" ON indonesian.lesson_sections;
CREATE POLICY "lesson_sections_admin_write" ON indonesian.lesson_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "podcasts_read" ON indonesian.podcasts;
CREATE POLICY "podcasts_read" ON indonesian.podcasts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "podcasts_admin_write" ON indonesian.podcasts;
CREATE POLICY "podcasts_admin_write" ON indonesian.podcasts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "learning_items_read" ON indonesian.learning_items;
CREATE POLICY "learning_items_read" ON indonesian.learning_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "learning_items_admin_write" ON indonesian.learning_items;
CREATE POLICY "learning_items_admin_write" ON indonesian.learning_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "item_meanings_read" ON indonesian.item_meanings;
CREATE POLICY "item_meanings_read" ON indonesian.item_meanings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "item_meanings_admin_write" ON indonesian.item_meanings;
CREATE POLICY "item_meanings_admin_write" ON indonesian.item_meanings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "item_contexts_read" ON indonesian.item_contexts;
CREATE POLICY "item_contexts_read" ON indonesian.item_contexts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "item_contexts_admin_write" ON indonesian.item_contexts;
CREATE POLICY "item_contexts_admin_write" ON indonesian.item_contexts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "item_answer_variants_read" ON indonesian.item_answer_variants;
CREATE POLICY "item_answer_variants_read" ON indonesian.item_answer_variants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "item_answer_variants_admin_write" ON indonesian.item_answer_variants;
CREATE POLICY "item_answer_variants_admin_write" ON indonesian.item_answer_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "learner_item_state_owner" ON indonesian.learner_item_state;
CREATE POLICY "learner_item_state_owner" ON indonesian.learner_item_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "learner_skill_state_owner" ON indonesian.learner_skill_state;
CREATE POLICY "learner_skill_state_owner" ON indonesian.learner_skill_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "review_events_read" ON indonesian.review_events;
CREATE POLICY "review_events_read" ON indonesian.review_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "review_events_insert" ON indonesian.review_events;
CREATE POLICY "review_events_insert" ON indonesian.review_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_read" ON indonesian.lesson_progress;
CREATE POLICY "lesson_progress_read" ON indonesian.lesson_progress FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lesson_progress_write" ON indonesian.lesson_progress;
CREATE POLICY "lesson_progress_write" ON indonesian.lesson_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "learning_sessions_read" ON indonesian.learning_sessions;
CREATE POLICY "learning_sessions_read" ON indonesian.learning_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "learning_sessions_write" ON indonesian.learning_sessions;
CREATE POLICY "learning_sessions_write" ON indonesian.learning_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "error_logs_insert" ON indonesian.error_logs;
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
  ('speaking', false, true, true, 'alpha', 'Not yet enabled in sessions'),
  -- PR 0 §3.6: backfill rows for exercise types that route through the
  -- registry but had no availability row. recognition_mcq and cued_recall
  -- already had rows; meaning_recall + cloze_mcq were missing.
  ('meaning_recall', true, true, false, 'full', 'Item meaning recall — derived from learning_items + variants'),
  ('cloze_mcq', true, true, true, 'full', 'Cloze MCQ — item + pattern source kinds')
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

DROP POLICY IF EXISTS "textbook_sources_read" ON indonesian.textbook_sources;
CREATE POLICY "textbook_sources_read" ON indonesian.textbook_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "textbook_sources_admin_write" ON indonesian.textbook_sources;
CREATE POLICY "textbook_sources_admin_write" ON indonesian.textbook_sources FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "textbook_pages_read" ON indonesian.textbook_pages;
CREATE POLICY "textbook_pages_read" ON indonesian.textbook_pages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "textbook_pages_admin_write" ON indonesian.textbook_pages;
CREATE POLICY "textbook_pages_admin_write" ON indonesian.textbook_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "grammar_patterns_read" ON indonesian.grammar_patterns;
CREATE POLICY "grammar_patterns_read" ON indonesian.grammar_patterns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "grammar_patterns_admin_write" ON indonesian.grammar_patterns;
CREATE POLICY "grammar_patterns_admin_write" ON indonesian.grammar_patterns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "item_context_grammar_patterns_read" ON indonesian.item_context_grammar_patterns;
CREATE POLICY "item_context_grammar_patterns_read" ON indonesian.item_context_grammar_patterns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "item_context_grammar_patterns_admin_write" ON indonesian.item_context_grammar_patterns;
CREATE POLICY "item_context_grammar_patterns_admin_write" ON indonesian.item_context_grammar_patterns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "exercise_type_availability_read" ON indonesian.exercise_type_availability;
CREATE POLICY "exercise_type_availability_read" ON indonesian.exercise_type_availability FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exercise_type_availability_admin_write" ON indonesian.exercise_type_availability;
CREATE POLICY "exercise_type_availability_admin_write" ON indonesian.exercise_type_availability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "generated_exercise_candidates_admin_only" ON indonesian.generated_exercise_candidates;
CREATE POLICY "generated_exercise_candidates_admin_only" ON indonesian.generated_exercise_candidates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "exercise_variants_read" ON indonesian.exercise_variants;
CREATE POLICY "exercise_variants_read" ON indonesian.exercise_variants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exercise_variants_admin_write" ON indonesian.exercise_variants;
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

-- ── Slice 2 Task 8 (OQ2-3, architect-APPROVED 2026-06-01): decouple
-- exercise_review_comments from exercise_variants. The review UI keys comments
-- by the TYPED grammar-exercise row id (one of the 4 typed exercise tables), not
-- by exercise_variants.id. That id only coincidentally lived in exercise_variants
-- for the 716 legacy rows the PR-4 one-shot bridge migrated (it reused the uuid);
-- runner-minted typed rows get their own gen_random_uuid (adapter.ts
-- insertGrammarExerciseTyped), so once the grammar dual-write stops, the FK
-- target no longer exists and commenting on a new grammar exercise would violate
-- it. The "exercise" is a 4-table union with no shared parent — a single FK can't
-- express it. Integrity moves app-side (exerciseReviewService resolves the id
-- across the 4 typed tables) + a deep health check counts orphans
-- (check-supabase-deep.ts). ON DELETE CASCADE is given up: --regenerate/cutover
-- typed-row deletes may orphan comments; getOpenComments already filters
-- unresolvable ids. FORWARD-ONLY: re-adding the FK is unsafe once a non-bridged
-- comment exists. Name-agnostic drop (by confrelid) so it is idempotent + immune
-- to the auto-generated constraint name.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'indonesian.exercise_review_comments'::regclass
    AND contype = 'f'
    AND confrelid = 'indonesian.exercise_variants'::regclass;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE indonesian.exercise_review_comments DROP CONSTRAINT %I', cname);
  END IF;
END $$;

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

DROP POLICY IF EXISTS "audio_clips_read" ON indonesian.audio_clips;
CREATE POLICY "audio_clips_read" ON indonesian.audio_clips
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "audio_clips_admin_write" ON indonesian.audio_clips;
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
-- Capability subsystem — base tables (cap-v2 Slice 1 fold, issue #161)
-- ----------------------------------------------------------------------------
-- Folded here from scripts/migrations/2026-04-25-capability-core.sql and
-- 2026-05-02-capability-resolution-failures.sql so a migration.sql-only fresh
-- rebuild creates them WITH their RLS (previously they existed only in the
-- standalone files — see the header note at the top of this file). Only the 4
-- LIVE tables + the resolution-failure log are folded; capability_artifacts and
-- the two learner_source_progress_* tables are RETIRED (dropped later in this
-- file at the #102 / source-progress retirements) and deliberately NOT folded.
-- These CREATEs must precede the capability RPCs (commit_capability_answer_report
-- below) and the learning_capabilities ALTER (add lesson_id) further down.
-- ============================================================================

create table if not exists indonesian.learning_capabilities (
  id uuid primary key default gen_random_uuid(),
  canonical_key text unique not null,
  source_kind text not null check (source_kind in ('item','pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')),
  source_ref text not null,
  capability_type text not null,
  direction text not null,
  modality text not null,
  learner_language text not null,
  projection_version text not null,
  readiness_status text not null check (readiness_status in ('ready','blocked','exposure_only','deprecated','unknown')),
  publication_status text not null check (publication_status in ('draft','published','retired')),
  source_fingerprint text,
  artifact_fingerprint text,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_capabilities_source_idx
  on indonesian.learning_capabilities(source_kind, source_ref);
create index if not exists learning_capabilities_readiness_publication_idx
  on indonesian.learning_capabilities(readiness_status, publication_status);

-- cap-v2 Slice 1 §2 guardrail 2: semantic identity = (source_ref, capability_type).
-- The UNIQUE(canonical_key) above is the FSRS/dedup guard; this is the
-- writer-bug guard a malformed canonical_key can't slip past.
create unique index if not exists learning_capabilities_source_ref_type_uidx
  on indonesian.learning_capabilities(source_ref, capability_type);

create table if not exists indonesian.capability_aliases (
  id uuid primary key default gen_random_uuid(),
  old_canonical_key text not null,
  new_canonical_key text not null,
  new_capability_id uuid references indonesian.learning_capabilities(id),
  alias_reason text not null,
  mapping_kind text not null check (mapping_kind in ('rename','split','merge','grammar_inference','manual')),
  migration_confidence text not null check (migration_confidence in ('exact','high','medium','low','inferred','manual_required')),
  split_group_id text,
  weight numeric,
  created_at timestamptz not null default now(),
  unique(old_canonical_key, new_canonical_key, mapping_kind)
);

create table if not exists indonesian.learner_capability_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_id uuid not null references indonesian.learning_capabilities(id),
  canonical_key_snapshot text not null,
  activation_state text not null check (activation_state in ('dormant','active','suspended','retired')),
  activation_source text check (activation_source in ('review_processor','admin_backfill','legacy_migration')),
  activation_event_id uuid,
  fsrs_state_json jsonb,
  stability double precision,
  difficulty double precision,
  next_due_at timestamptz,
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  lapse_count integer not null default 0,
  consecutive_failure_count integer not null default 0,
  state_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, capability_id)
);

create index if not exists learner_capability_state_due_idx
  on indonesian.learner_capability_state(user_id, activation_state, next_due_at);
create index if not exists learner_capability_state_capability_idx
  on indonesian.learner_capability_state(capability_id);

create table if not exists indonesian.capability_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_id uuid not null references indonesian.learning_capabilities(id),
  learner_capability_state_id uuid not null references indonesian.learner_capability_state(id),
  idempotency_key text not null,
  session_id text not null,
  session_item_id text not null,
  attempt_number integer not null,
  rating integer not null check (rating between 1 and 4),
  answer_report_json jsonb not null,
  scheduler_snapshot_json jsonb not null,
  state_before_json jsonb not null,
  state_after_json jsonb not null,
  artifact_version_snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key),
  unique(session_id, session_item_id, attempt_number)
);

create table if not exists indonesian.capability_resolution_failure_events (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  capability_key text not null,
  reason_code text not null,
  exercise_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  block_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crfe_capability_reason
  on indonesian.capability_resolution_failure_events (capability_id, reason_code);
create index if not exists idx_crfe_created_at
  on indonesian.capability_resolution_failure_events (created_at desc);

-- RLS
alter table indonesian.learning_capabilities enable row level security;
alter table indonesian.capability_aliases enable row level security;
alter table indonesian.learner_capability_state enable row level security;
alter table indonesian.capability_review_events enable row level security;
alter table indonesian.capability_resolution_failure_events enable row level security;

drop policy if exists "capability catalog authenticated read" on indonesian.learning_capabilities;
create policy "capability catalog authenticated read"
  on indonesian.learning_capabilities for select to authenticated using (true);

drop policy if exists "capability aliases authenticated read" on indonesian.capability_aliases;
create policy "capability aliases authenticated read"
  on indonesian.capability_aliases for select to authenticated using (true);

drop policy if exists "learner capability state owner read" on indonesian.learner_capability_state;
create policy "learner capability state owner read"
  on indonesian.learner_capability_state for select to authenticated using (user_id = auth.uid());

drop policy if exists "capability review events owner read" on indonesian.capability_review_events;
create policy "capability review events owner read"
  on indonesian.capability_review_events for select to authenticated using (user_id = auth.uid());

-- Authenticated users write their own resolution-failure rows (write-only side).
drop policy if exists "crfe_insert_own" on indonesian.capability_resolution_failure_events;
create policy "crfe_insert_own" on indonesian.capability_resolution_failure_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "crfe_admin_read" on indonesian.capability_resolution_failure_events;
create policy "crfe_admin_read" on indonesian.capability_resolution_failure_events
  for select to authenticated using (
    exists (select 1 from indonesian.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Grants. Writes to learner state + review events + capability rows happen via
-- the service_role-backed RPCs / pipeline only — authenticated is read-only
-- (resolution-failure events are the one authenticated INSERT).
grant usage on schema indonesian to service_role;
grant select on indonesian.learning_capabilities to authenticated;
grant select on indonesian.capability_aliases to authenticated;
grant select on indonesian.learner_capability_state to authenticated;
grant select on indonesian.capability_review_events to authenticated;
grant select, insert on indonesian.capability_resolution_failure_events to authenticated;
revoke insert, update, delete on indonesian.learner_capability_state from authenticated;
revoke insert, update, delete on indonesian.capability_review_events from authenticated;
grant all on indonesian.learning_capabilities to service_role;
grant all on indonesian.capability_aliases to service_role;
grant all on indonesian.learner_capability_state to service_role;
grant all on indonesian.capability_review_events to service_role;
grant all on indonesian.capability_resolution_failure_events to service_role;

-- Aggregated failure view (security_invoker so the admin-read RLS applies to
-- the querying user; without it the view would bypass crfe_admin_read).
create or replace view indonesian.capability_resolution_issues
with (security_invoker = true) as
select
  capability_id,
  capability_key,
  reason_code,
  exercise_type,
  count(*)            as occurrence_count,
  min(created_at)     as first_seen_at,
  max(created_at)     as last_seen_at,
  (array_agg(user_id    order by created_at desc))[1] as last_user_id,
  (array_agg(session_id order by created_at desc))[1] as last_session_id
from indonesian.capability_resolution_failure_events
group by capability_id, capability_key, reason_code, exercise_type;

grant select on indonesian.capability_resolution_issues to authenticated;

-- ============================================================================
-- cap-v2 Slice 1 — embeddings + curated distractors (issue #161; §4a/§6)
-- ----------------------------------------------------------------------------
-- item_embeddings caches one local-model embedding per learning item (meaning
-- distractors only); distractors stores curated WRONG-option pointers to items.
-- Created here; item_embeddings + distractors are POPULATED by the
-- select-distractors writer (#163) and READ by the runtime fetcher (#164).
-- ============================================================================

create extension if not exists vector with schema extensions;

-- The vector type lives in the `extensions` schema; the API roles need USAGE on
-- that schema to reference `extensions.vector` when reading/writing the column,
-- else inserts fail with "permission denied for schema extensions" (caught at
-- the cap-v2 populate pass — the self-hosted instance doesn't pre-grant this the
-- way hosted Supabase does). Idempotent.
grant usage on schema extensions to service_role, authenticated, anon;

create table if not exists indonesian.item_embeddings (
  learning_item_id uuid primary key references indonesian.learning_items(id) on delete cascade,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);

alter table indonesian.item_embeddings enable row level security;
drop policy if exists "item_embeddings_authenticated_read" on indonesian.item_embeddings;
create policy "item_embeddings_authenticated_read"
  on indonesian.item_embeddings for select to authenticated using (true);
grant select on indonesian.item_embeddings to authenticated;
revoke insert, update, delete on indonesian.item_embeddings from authenticated;
grant all on indonesian.item_embeddings to service_role;
comment on table indonesian.item_embeddings is
  'Local-model (paraphrase-multilingual-MiniLM-L12-v2, 384d) embedding of each item''s translation_nl gloss; cached once per item, used for meaning-distractor ranking. cap-v2 Slice 1.';

create table if not exists indonesian.distractors (
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  item_id       uuid not null references indonesian.learning_items(id)        on delete restrict,
  primary key (capability_id, item_id)
);

create index if not exists distractors_item_id_idx on indonesian.distractors(item_id);

alter table indonesian.distractors enable row level security;
drop policy if exists "distractors_authenticated_read" on indonesian.distractors;
create policy "distractors_authenticated_read"
  on indonesian.distractors for select to authenticated using (true);
grant select on indonesian.distractors to authenticated;
revoke insert, update, delete on indonesian.distractors from authenticated;
grant all on indonesian.distractors to service_role;
comment on table indonesian.distractors is
  'Curated MCQ wrong-option pointers, one row per (capability, wrong-option item). cap-v2 Slice 1; populated by select-distractors (#163), read by the runtime distractor fetcher (#164).';
comment on column indonesian.distractors.item_id is
  'A WRONG-option pointer (never the answer item). on delete restrict so a deduped item used as a distractor can''t be silently deleted out from under a capability.';

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

-- ============================================================================
-- RETIREMENT #6 — Source-progress state machine → lesson-activation checkbox
-- ============================================================================
-- See docs/plans/2026-05-07-retire-source-progress.md for the spec.
-- Idempotent. Safe to re-run.
--
-- This entire block is the end-state appended to master scripts/migration.sql.
-- For deploy ordering (per §6), the block is split into two physical files:
--   forward.sql  → steps 1-5 (FORWARD-ONLY; applied via psql -f BEFORE code deploy)
--   cleanup.sql  → steps 6-10 (CLEANUP-ONLY; applied via make migrate AFTER code deploy)
-- The same block runs end-to-end on a fresh DB via make migrate (idempotent).

-- ============================================================================
-- FORWARD-ONLY (applied in forward.sql BEFORE code deploy; mirrored in master)
-- ============================================================================

-- 1. NEW TABLE: learner_lesson_activation
create table if not exists indonesian.learner_lesson_activation (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  lesson_id    uuid        not null references indonesian.lessons(id) on delete cascade,
  activated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists learner_lesson_activation_user_idx
  on indonesian.learner_lesson_activation(user_id);

alter table indonesian.learner_lesson_activation enable row level security;

drop policy if exists "lesson activation owner read" on indonesian.learner_lesson_activation;
create policy "lesson activation owner read"
  on indonesian.learner_lesson_activation for select
  to authenticated
  using (user_id = auth.uid());

grant select on indonesian.learner_lesson_activation to authenticated;
revoke insert, update, delete on indonesian.learner_lesson_activation from authenticated;
grant all on indonesian.learner_lesson_activation to service_role;

-- 2. NEW RPC: set_lesson_activation
create or replace function indonesian.set_lesson_activation(
  p_user_id   uuid,
  p_lesson_id uuid,
  p_activated boolean
)
returns void
language plpgsql
security definer
set search_path = indonesian, public
as $$
begin
  if p_user_id is null or p_lesson_id is null or p_activated is null then
    raise exception 'set_lesson_activation requires p_user_id, p_lesson_id, p_activated';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'set_lesson_activation user mismatch';
  end if;

  if not exists (select 1 from indonesian.lessons where id = p_lesson_id) then
    raise exception 'set_lesson_activation lesson not found: %', p_lesson_id;
  end if;

  if p_activated then
    insert into indonesian.learner_lesson_activation (user_id, lesson_id)
    values (p_user_id, p_lesson_id)
    on conflict (user_id, lesson_id) do nothing;
  else
    delete from indonesian.learner_lesson_activation
    where user_id = p_user_id and lesson_id = p_lesson_id;
  end if;
end;
$$;

revoke all on function indonesian.set_lesson_activation(uuid, uuid, boolean) from public;
grant execute on function indonesian.set_lesson_activation(uuid, uuid, boolean) to authenticated, service_role;

-- 3. (REMOVED in R1 v3.) The _capability_lesson_activated helper was dropped
-- because it had zero callers — its only intended consumer (compute_todays_plan_raw)
-- was a phantom retired in retirement #4. Eligibility filtering happens in TS
-- (planner reads activatedLessons set; capability.lessonId is the gate).

-- 4. NEW COLUMN: learning_capabilities.lesson_id (with backfill)
alter table indonesian.learning_capabilities
  add column if not exists lesson_id uuid references indonesian.lessons(id) on delete set null;

create index if not exists learning_capabilities_lesson_idx
  on indonesian.learning_capabilities(lesson_id) where lesson_id is not null;

-- (Historical lesson_id backfill from lesson_page_blocks.capability_key_refs[]
--  removed in PR 5 when lesson_page_blocks was dropped. lesson_id is now
--  populated by the capability-stage pipeline on every publish per ADR 0006;
--  the live DB was backfilled before the table was retired.)

-- 5. BACKFILL — Step 1: auto-activate legacy lessons (1, 2, 3) for every existing user.
-- Idempotent — safe to re-run.
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select u.id, l.id, now()
from auth.users u
cross join indonesian.lessons l
where l.order_index in (1, 2, 3)
on conflict (user_id, lesson_id) do nothing;

-- 5. BACKFILL — Step 2: promote legacy lesson_progress rows to activation.
-- Preserves "started" state for users who clicked through any lesson via the
-- pre-retirement reader. After this commit lesson_progress becomes orphan data
-- (no future writes, no future reads); follow-up retirement to drop it.
-- R1 v2 fix: lesson_progress has no last_accessed_at column (master line 198-206).
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select lp.user_id, lp.lesson_id, coalesce(lp.completed_at, now())
from indonesian.lesson_progress lp
on conflict (user_id, lesson_id) do nothing;

-- ============================================================================
-- CLEANUP-ONLY (applied in cleanup.sql AFTER code deploy; mirrored in master)
-- ============================================================================
--
-- get_lessons_overview rewrite is in cleanup, NOT forward, per R1 v2 C10:
-- rewriting in forward.sql breaks the old client's has_meaningful_exposure
-- field read during the deploy window between forward and code deploy.

-- ============================================================================
-- get_lessons_overview — capability-scoped (ADR 0006)
-- ============================================================================
--
-- Reads capability counts from learning_capabilities.lesson_id (ADR 0006).
-- The legacy has_page_blocks signal was removed in PR 5 when lesson_page_blocks
-- was dropped: a lesson is "openable" iff it has a bespoke page, which is a
-- client-side fact (the bespoke-page registry), not a DB one. Lessons.tsx now
-- derives preparedLessonIds from the registry.
--
-- 2026-06-09 (lesson-status two-sources): the per-lesson learner status is now
-- `% mastered = mastered_capability_count / ready_capability_count`. The two
-- surfaced facts are `is_activated` (Status-1, pure activation EXISTS) and that
-- percentage. Retired: `practiced_eligible_capability_count`, the
-- `has_started_lesson` lesson_progress union. The `mastered` filter mirrors
-- masteryModel.ts (ADR 0015), guarded by a TS<->SQL parity test.
--
-- Idempotent. DROP FUNCTION first because CREATE OR REPLACE cannot change
-- a function's RETURNS TABLE shape (even when it doesn't, drop+create is
-- a strictly safer idiom).
drop function if exists indonesian.get_lessons_overview(uuid);
create or replace function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
  lesson_id uuid,
  order_index int,
  title text,
  level text,
  description text,
  audio_path text,
  duration_seconds int,
  primary_voice text,
  publication_status text,
  is_published boolean,
  lesson_sections jsonb,
  is_activated boolean,
  ready_capability_count int,
  mastered_capability_count int,
  practiced_capability_count int
)
language sql stable security invoker as $$
  with lesson_capabilities as (
    -- Re-anchored 2026-05-20 (Phase 1 of retiring lesson_page_blocks):
    -- joins learning_capabilities directly on lesson_id (ADR 0006) instead
    -- of unnesting lesson_page_blocks.source_refs[]. Excludes podcast caps
    -- (lesson_id is null) which were never in scope of this RPC.
    -- 2026-06-09 (lesson-status two-sources): projects the 5 columns the
    -- `mastered` predicate needs (was activation_state, review_count); adds
    -- `retired_at is null` so the introducible denominator excludes retired caps.
    select c.lesson_id, c.id as capability_id,
           c.readiness_status, c.publication_status,
           s.review_count, s.stability, s.last_reviewed_at,
           s.consecutive_failure_count
    from indonesian.learning_capabilities c
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    where c.lesson_id is not null
      and c.retired_at is null
  ),
  capability_counts as (
    select lesson_id,
           -- introducible denominator
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
           )::int as ready_count,
           -- mastered numerator: SQL mirror of labelForCapability
           -- (src/lib/analytics/mastery/masteryModel.ts:174-182). review_count>=4
           -- subsumes the TS reviewCount===0 short-circuit; coalesce mirrors TS
           -- `?? 0` (load-bearing — stability is nullable); a NULL last_reviewed_at
           -- yields a NULL predicate so the row is not counted, matching isRecent's
           -- `if (!iso) return false`; lapse=0 ∧ consec=0 mirrors the at_risk
           -- override. Kept in lockstep by the TS<->SQL parity test
           -- (scripts/__tests__/lessons-overview-mastery-parity.test.ts).
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and review_count >= 4
               and coalesce(stability, 0) >= 14
               and last_reviewed_at >= now() - interval '30 days'
               and coalesce(consecutive_failure_count, 0) = 0
           )::int as mastered_count,
           -- practiced numerator: any review at all (review_count >= 1), over the
           -- SAME introducible filter as the denominator and the mastered numerator.
           -- TS canonical: PRACTICED_MIN_REVIEWS in src/lib/lessons/overview.ts
           -- (kept in lockstep by lessons-overview-mastery-parity.test.ts).
           -- mastered (review_count>=4) ⊆ practiced (>=1); coalesce mirrors the
           -- mastered filter's NULL-handling so a NULL review_count is excluded.
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and coalesce(review_count, 0) >= 1
           )::int as practiced_count
    from lesson_capabilities group by lesson_id
  ),
  lesson_sections_json as (
    select ls.lesson_id, jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls group by ls.lesson_id
  )
  select
    l.id,
    l.order_index,
    l.title,
    l.level,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text as publication_status,
    true as is_published,
    coalesce(lsj.sections, '[]'::jsonb) as lesson_sections,
    -- 2026-06-09: Status-1 single source = pure activation EXISTS. The legacy
    -- lesson_progress union was dropped (its write path is dead-but-compiled —
    -- progressService.markLessonComplete has no production caller; see
    -- docs/current-system/data-model.md:186).
    exists (
      select 1 from indonesian.learner_lesson_activation lla
      where lla.user_id = p_user_id and lla.lesson_id = l.id
    ) as is_activated,
    coalesce(cc.ready_count, 0) as ready_capability_count,
    coalesce(cc.mastered_count, 0) as mastered_capability_count,
    coalesce(cc.practiced_count, 0) as practiced_capability_count
  from indonesian.lessons l
  left join capability_counts cc on cc.lesson_id = l.id
  left join lesson_sections_json lsj on lsj.lesson_id = l.id
  order by l.order_index;
$$;

grant execute on function indonesian.get_lessons_overview(uuid) to authenticated;

-- ============================================================
-- Practice Time (#206/#207) — Learner Progress Axis 1, analytics.engagement
-- ============================================================
-- Exercises-only practice time (CONTEXT.md → Practice Time): only the
-- capability/review path writes learning_sessions, so reading/podcast time is
-- excluded by construction. duration_seconds = first→last answer elapsed
-- (single-answer session = 0s). Calendar week resets Monday (date_trunc('week')
-- is Monday-based). Returns json so the shape can grow without a signature
-- change. SECURITY INVOKER + RLS owner-scoping, matching the existing learner
-- analytics functions.
--
-- get_current_streak_days is promoted here from the paper-trail file
-- scripts/migrations/2026-05-01-learner-progress-functions.sql (#207 folds the
-- streak read into analytics.engagement): get_practice_time depends on it, so
-- the canonical migration.sql must define it for a fresh provision.
create or replace function indonesian.get_current_streak_days(
  p_user_id uuid,
  p_timezone text
)
returns int language plpgsql stable security invoker as $$
declare
  v_today date := (now() at time zone p_timezone)::date;
  v_check_date date;
  v_streak int := 0;
  v_done boolean;
begin
  -- A day counts only if the learner COMPLETED at least one session that day
  -- (finished their full session — completed_at set by mark_session_complete),
  -- not merely answered a card. Grace: if today isn't finished yet, the streak is
  -- still alive from yesterday, so begin the walk one day back rather than reading
  -- 0 until the day's session is done.
  select exists (
    select 1 from indonesian.learning_sessions
    where user_id = p_user_id and completed_at is not null
      and (completed_at at time zone p_timezone)::date = v_today
  ) into v_done;
  v_check_date := case when v_done then v_today else v_today - 1 end;
  loop
    select exists (
      select 1 from indonesian.learning_sessions
      where user_id = p_user_id and completed_at is not null
        and (completed_at at time zone p_timezone)::date = v_check_date
    ) into v_done;
    if not v_done then exit; end if;
    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
    if v_streak >= 365 then exit; end if;
  end loop;
  return v_streak;
end;
$$;

grant execute on function indonesian.get_current_streak_days(uuid, text) to authenticated;

create or replace function indonesian.get_practice_time(
  p_user_id uuid,
  p_timezone text
)
returns json language sql stable security invoker as $$
  with sess as (
    select
      ls.duration_seconds as dur,
      (ls.started_at at time zone p_timezone)::date as local_date
    from indonesian.learning_sessions ls
    where ls.user_id = p_user_id
  ),
  b as (
    select
      (now() at time zone p_timezone)::date as today,
      date_trunc('week', now() at time zone p_timezone)::date as week_start,
      (date_trunc('week', now() at time zone p_timezone)::date - 7) as prev_week_start,
      date_trunc('month', now() at time zone p_timezone)::date as month_start,
      (date_trunc('month', now() at time zone p_timezone) - interval '1 month')::date as prev_month_start
  )
  select json_build_object(
    'streak_days', indonesian.get_current_streak_days(p_user_id, p_timezone),
    'minutes_today', coalesce(round(
      sum(s.dur) filter (where s.dur is not null and s.local_date = b.today) / 60.0
    ), 0)::int,
    'minutes_this_week', coalesce(round(
      sum(s.dur) filter (where s.dur is not null and s.local_date >= b.week_start) / 60.0
    ), 0)::int,
    'minutes_last_week', coalesce(round(
      sum(s.dur) filter (where s.dur is not null and s.local_date >= b.prev_week_start and s.local_date < b.week_start) / 60.0
    ), 0)::int,
    'minutes_this_month', coalesce(round(
      sum(s.dur) filter (where s.dur is not null and s.local_date >= b.month_start) / 60.0
    ), 0)::int,
    'minutes_last_month', coalesce(round(
      sum(s.dur) filter (where s.dur is not null and s.local_date >= b.prev_month_start and s.local_date < b.month_start) / 60.0
    ), 0)::int,
    'avg_session_minutes', coalesce(round(
      avg(s.dur) filter (where s.dur is not null) / 60.0
    ), 0)::int,
    'active_days_this_week', count(distinct s.local_date)
      filter (where s.local_date >= b.week_start)::int,
    'last_practice_age_days', (b.today - max(s.local_date))::int
  )
  from b left join sess s on true
  group by b.today, b.week_start, b.prev_week_start, b.month_start, b.prev_month_start;
$$;

grant execute on function indonesian.get_practice_time(uuid, text) to authenticated;

-- ============================================================
-- Weekly movement (#210) — the fast pulse on the slow Mastery axis
-- ============================================================
-- Rung transitions recomputed from the FSRS state snapshots already stored on
-- each review event (ADR 0016 — no label_history table). _mastery_label mirrors
-- labelForCapability (src/lib/analytics/mastery/masteryModel.ts); the two are
-- kept in lockstep by an ADR-0015 parity check in check-supabase-deep.ts.
-- A review event's capability is by definition lesson-activated, so reviewCount=0
-- maps to 'introduced' (the activation distinction is irrelevant here).
-- Indexes promoted from the paper-trail file so migration.sql is self-contained.
CREATE INDEX IF NOT EXISTS cre_user_created_idx
  ON indonesian.capability_review_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cre_user_capability_created_idx
  ON indonesian.capability_review_events(user_id, capability_id, created_at);

create or replace function indonesian._mastery_label(
  p_review_count int,
  p_lapse int,
  p_consec int,
  p_stability double precision,
  p_last_reviewed timestamptz,
  p_now timestamptz
)
returns text language sql immutable as $$
  -- Mirrors TS labelForCapability (masteryModel.ts), same clause order (2026-06-12).
  -- at_risk = currently failing AND a genuine lapse (p_lapse > 0 — learned, then
  -- forgotten); a never-lapsed failing word is still 'introduced' (still acquiring),
  -- not 'at_risk'. The two early branches (p_consec > 0, review_count = 0) are
  -- mutually exclusive on live data (the commit RPC increments review_count on every
  -- review, so a failing cap has review_count >= 1); order pinned for parity.
  select case
    when p_consec > 0 and p_lapse > 0 then 'at_risk'
    when p_consec > 0 then 'introduced'
    when coalesce(p_review_count, 0) = 0 then 'introduced'
    when p_review_count >= 4 and coalesce(p_stability, 0) >= 14
         and p_last_reviewed is not null and p_last_reviewed > p_now - interval '30 days' then 'mastered'
    when p_review_count >= 3 or coalesce(p_stability, 0) >= 5 then 'strengthening'
    else 'learning'
  end;
$$;

create or replace function indonesian.get_weekly_movement(
  p_user_id uuid,
  p_timezone text
)
returns json language sql stable security invoker as $$
  -- Counts distinct SOURCE_REF (the learnable unit — a word / grammar topic) that
  -- advanced a rung this week, SPLIT into vocab (source_kind 'item') and grammar
  -- (pattern + affixed_form_pair) — the SAME two buckets and scope as the mastery
  -- funnel, so the home pulse and the funnel speak one unit ("woorden" /
  -- "grammatica"). dialogue_line / podcast source kinds are excluded (the funnel
  -- excludes them too). Distinct source_ref (NOT capability_id): one word has
  -- several caps, so per-cap counts overstate. A unit counts once if any of its
  -- caps advanced.
  with ev as (
    select
      c.source_ref,
      case
        when c.source_kind = 'item' then 'vocab'
        when c.source_kind in ('pattern', 'affixed_form_pair') then 'grammar'
        else null
      end as bucket,
      indonesian._mastery_label(
        coalesce((state_before_json->>'reviewCount')::int, 0),
        coalesce((state_before_json->>'lapseCount')::int, 0),
        coalesce((state_before_json->>'consecutiveFailureCount')::int, 0),
        nullif(state_before_json->>'stability', '')::double precision,
        nullif(state_before_json->>'lastReviewedAt', '')::timestamptz,
        now()
      ) as before_label,
      indonesian._mastery_label(
        coalesce((state_after_json->>'reviewCount')::int, 0),
        coalesce((state_after_json->>'lapseCount')::int, 0),
        coalesce((state_after_json->>'consecutiveFailureCount')::int, 0),
        nullif(state_after_json->>'stability', '')::double precision,
        nullif(state_after_json->>'lastReviewedAt', '')::timestamptz,
        now()
      ) as after_label
    from indonesian.capability_review_events e
    join indonesian.learning_capabilities c on c.id = e.capability_id
    where e.user_id = p_user_id
      and e.created_at >= (date_trunc('week', now() at time zone p_timezone) at time zone p_timezone)
  ),
  ranked as (
    select
      source_ref, bucket, before_label, after_label,
      (case before_label when 'not_assessed' then 0 when 'introduced' then 1 when 'learning' then 2 when 'at_risk' then 2 when 'strengthening' then 3 when 'mastered' then 4 end) as rb,
      (case after_label  when 'not_assessed' then 0 when 'introduced' then 1 when 'learning' then 2 when 'at_risk' then 2 when 'strengthening' then 3 when 'mastered' then 4 end) as ra
    from ev
    where bucket is not null
  )
  select json_build_object(
    'advanced_vocab',   count(distinct source_ref) filter (where ra > rb and bucket = 'vocab'),
    'advanced_grammar', count(distinct source_ref) filter (where ra > rb and bucket = 'grammar'),
    'reached_mastered', count(distinct source_ref) filter (where after_label = 'mastered' and before_label <> 'mastered'),
    'slipped',          count(distinct source_ref) filter (where after_label = 'at_risk' and before_label <> 'at_risk')
  ) from ranked;
$$;

-- Daily activity strip for the home streak bar: per-day COMPLETED-session counts
-- for the last p_days timezone-local days, chronological, zero-filled. Mirrors
-- get_practice_time's tz/day math; counts only completed sessions (completed_at)
-- so the bar agrees with the streak rule. The streak number comes from
-- get_current_streak_days (via get_practice_time).
create or replace function indonesian.get_daily_activity(
  p_user_id uuid,
  p_timezone text,
  p_days int
)
returns json language sql stable security invoker as $$
  with days as (
    select ((now() at time zone p_timezone)::date - g) as d
    from generate_series(0, p_days - 1) as g
  ),
  sess as (
    -- COMPLETED sessions only (completed_at), bucketed by completion day — matches
    -- the streak rule so the bar and the flame agree.
    select (ls.completed_at at time zone p_timezone)::date as d, count(*)::int as n
    from indonesian.learning_sessions ls
    where ls.user_id = p_user_id
      and ls.completed_at is not null
      and (ls.completed_at at time zone p_timezone)::date > ((now() at time zone p_timezone)::date - p_days)
    group by 1
  )
  select coalesce(json_agg(
    json_build_object('date', to_char(days.d, 'YYYY-MM-DD'), 'sessions', coalesce(sess.n, 0))
    order by days.d
  ), '[]'::json)
  from days left join sess on sess.d = days.d;
$$;

grant execute on function indonesian._mastery_label(int, int, int, double precision, timestamptz, timestamptz) to authenticated;
grant execute on function indonesian.get_weekly_movement(uuid, text) to authenticated;
grant execute on function indonesian.get_daily_activity(uuid, text, int) to authenticated;

-- Mark a session complete — the learner finished their full session (all served
-- cards; ExperiencePlayer.onComplete). The streak + streak bar count COMPLETED
-- sessions, so finishing a 10-card session counts and finishing a 25-card one
-- counts, but a single answer does not. Idempotent (keeps the first completion
-- time). security definer because authenticated has no write policy on
-- learning_sessions under retirement #5 — scoped to the caller's own row via
-- auth.uid(), so a learner can only complete their own session.
create or replace function indonesian.mark_session_complete(p_session_id uuid)
returns void
language sql
security definer
set search_path = indonesian, pg_temp
as $$
  update indonesian.learning_sessions
     set completed_at = coalesce(completed_at, now())
   where id = p_session_id and user_id = auth.uid();
$$;
revoke all on function indonesian.mark_session_complete(uuid) from public;
grant execute on function indonesian.mark_session_complete(uuid) to authenticated;

-- (PR 5: the lesson_page_blocks column-drop DO blocks — source_progress_event
--  and capability_key_refs — were removed; the whole table is dropped below.)

-- 8. D-R-O-P dead SQL functions
drop function if exists indonesian._capability_source_progress_met(uuid, jsonb, text, text) cascade;
drop function if exists indonesian.record_source_progress_event(jsonb) cascade;

-- 9. D-R-O-P source-progress RLS policies (defensive — harmless if already gone)
drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
drop policy if exists "source progress events owner insert" on indonesian.learner_source_progress_events;
drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner update" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner insert" on indonesian.learner_source_progress_state;

-- 10. D-R-O-P source-progress tables (CASCADE picks up index learner_source_progress_state(user_id, source_ref))
drop table if exists indonesian.learner_source_progress_state cascade;
drop table if exists indonesian.learner_source_progress_events cascade;

-- ============================================================
-- Orphan cleanup — learner_lesson_engagement (2026-05-08)
-- ============================================================
-- Out-of-band table (created via Studio) — never had a CREATE TABLE in this
-- file, never referenced from src/, scripts/, or supabase/. Surfaced as one of
-- the two stragglers in docs/known-regressions.md §1 (RLS-on with zero
-- policies). Retiring rather than retrofitting policies onto an unused surface.
-- Tracked-history rollout: scripts/migrations/2026-05-08-drop-learner-lesson-engagement.sql
drop table if exists indonesian.learner_lesson_engagement cascade;

-- ============================================================
-- Lesson-stage Phase 1 (2026-05-09) — GT1 grammar_topics backfill
-- ============================================================
-- Mirrors the 5-step runtime extractor at src/services/lessonService.ts:102–125
-- (explicit topics → categories[].title → content.title → section.title) so
-- legacy rows match what the runtime would have produced. Idempotent via the
-- `grammar_topics IS NULL OR empty` guard. Re-runnable.
do $$
declare
  rec record;
  derived text[];
begin
  for rec in
    select id, title as section_title, content
    from indonesian.lesson_sections
    where content->>'type' in ('grammar','reference_table')
      and (content->'grammar_topics' is null
           or jsonb_array_length(coalesce(content->'grammar_topics', '[]'::jsonb)) = 0)
  loop
    derived := null;

    -- Step 1: explicit topics (camelCase ∪ snake_case, per runtime spread).
    select array_agg(distinct trim(both ' ' from
        regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i')))
      filter (where t is not null
              and length(trim(both ' ' from regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0)
      into derived
      from (
        select jsonb_array_elements_text(rec.content->'grammarTopics') as t
        where jsonb_typeof(rec.content->'grammarTopics') = 'array'
        union all
        select jsonb_array_elements_text(rec.content->'grammar_topics') as t
        where jsonb_typeof(rec.content->'grammar_topics') = 'array'
      ) explicit_topics;

    -- Step 2: categories[].title (only if step 1 empty).
    if derived is null or array_length(derived, 1) is null then
      select array_agg(distinct trim(both ' ' from
          regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i')))
        filter (where t is not null
                and length(trim(both ' ' from regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0)
        into derived
        from (
          select cat->>'title' as t
          from jsonb_array_elements(coalesce(rec.content->'categories', '[]'::jsonb)) cat
        ) cat_titles;
    end if;

    -- Step 3: content.title (only if step 2 empty).
    if derived is null or array_length(derived, 1) is null then
      if rec.content->>'title' is not null
         and length(trim(both ' ' from regexp_replace(rec.content->>'title', '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0 then
        derived := array[trim(both ' ' from
          regexp_replace(rec.content->>'title', '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))];
      end if;
    end if;

    -- Step 4: section.title (only if step 3 empty).
    if derived is null or array_length(derived, 1) is null then
      if rec.section_title is not null
         and length(trim(both ' ' from regexp_replace(rec.section_title, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0 then
        derived := array[trim(both ' ' from
          regexp_replace(rec.section_title, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))];
      end if;
    end if;

    if derived is null or array_length(derived, 1) is null then
      raise warning 'Section % has no derivable grammar_topics; leaving as-is for manual fix', rec.id;
      continue;
    end if;

    update indonesian.lesson_sections
       set content = jsonb_set(content, '{grammar_topics}', to_jsonb(derived))
     where id = rec.id;
  end loop;
end $$;

-- ============================================================
-- PR 5 (2026-05-25) — drop lesson_page_blocks
-- ============================================================
-- The generic page-block render path is retired: bespoke per-lesson pages
-- (content.json) are the sole lesson renderer, and DB lesson content lives in
-- lesson_sections (+ PR 6 typed children) as the capability contract only. All
-- readers/writers were removed in the same PR (the runtime reader stack, the
-- Stage A writer, get_lessons_overview's lesson_block_presence probe, HC2).
-- The block_kind widen-then-narrow migration and the source_refs GIN index that
-- lived in this file are gone with the table. CASCADE is a no-op (no FK points
-- into this table).
drop table if exists indonesian.lesson_page_blocks cascade;

-- ============================================================
-- Slice 4a (#102, 2026-06-04) — capability-layer safe-set teardown
-- ============================================================
-- Drops the retired content/capability-layer tables (data-model-target Decisions
-- A/B/K). All readers were retired code-first: coverageService now sources
-- hasMeanings from learning_items.translation_nl and grammar coverage from
-- grammar_patterns.introduced_by_lesson_id (Path C), so item_meanings and
-- item_context_grammar_patterns are unread; the textbook_* + generated_exercise_*
-- tables are empty authoring-pipeline relics; lesson_blocks/_reading_section are
-- orphan empties from the dead Decision-C path.
--
-- The CREATE blocks for these tables are intentionally RETAINED above and dropped
-- here with CASCADE: two KEPT tables carry FKs INTO this set
-- (grammar_patterns.introduced_by_source_id -> textbook_sources;
-- exercise_variants.source_candidate_id -> generated_exercise_candidates), so
-- deleting the CREATEs would make the kept tables' own definitions reference
-- missing tables on a fresh rebuild. CASCADE removes those two FK constraints
-- cleanly (the columns remain, unconstrained). Removing the now-dead CREATE blocks
-- + those orphaned columns is a deferred follow-up cleanup (larger, separately
-- reviewable; exercise_variants.source_candidate_id retires with the table in 4c).
--
-- content_review_queue is a dead view (zero consumers) over generated_exercise_candidates.
-- lesson_blocks / lesson_block_reading_section have no other migration.sql blocks
-- (DDL lives only in a standalone paper-trail file); these drops are their teardown.
drop view if exists indonesian.content_review_queue;
drop table if exists indonesian.generated_exercise_candidates cascade;
drop table if exists indonesian.textbook_pages cascade;
drop table if exists indonesian.textbook_sources cascade;
drop table if exists indonesian.item_context_grammar_patterns cascade;
drop table if exists indonesian.item_meanings cascade;
drop table if exists indonesian.lesson_block_reading_section cascade;
drop table if exists indonesian.lesson_blocks cascade;

-- ============================================================
-- Slice 4b (#102, 2026-06-04) — drop capability_artifacts (Decision A)
-- ============================================================
-- The generic capability_artifacts bag is retired: per-content-concept structure
-- now lives in the typed satellite tables (dialogue_clozes / affixed_form_pairs /
-- the 4 grammar-exercise tables / capability_audio_refs), and readiness derives
-- from RENDER_CONTRACTS routing instead of an artifact bag. All readers/writers
-- were retired code-first (PR #152 first commit); deploy ordering is code-first
-- (recreate container BEFORE `make migrate`) — the live session-builder path read
-- this table until the new code ships.
--
-- W1 wrinkle: capability_artifacts' CREATE TABLE lives only in the standalone
-- paper-trail file scripts/migrations/2026-04-25-capability-core.sql (not applied
-- by `make migrate`); migration.sql held only the FK ALTER (block "3b" below,
-- removed in this PR). The DROP is authored here; CASCADE is belt-and-braces (the
-- only FK was capability_artifacts.capability_id -> learning_capabilities; the
-- exercise_review_comments FK was already resolved in Slice 2).
drop table if exists indonesian.capability_artifacts cascade;

-- learning_capabilities.required_artifacts: the readiness dependency is retired
-- (validateCapability is now artifact-free). The additive add-column block (PR 0
-- §3.2-extension) is removed in this PR; this drop clears the column from the
-- live DB. Idempotent: drop-if-exists no-ops on rerun / fresh rebuild.
alter table indonesian.learning_capabilities
  drop column if exists required_artifacts;

-- ============================================================
-- Lesson-stage Phase 1 (2026-05-09) — content.type CHECK constraint (GT5)
-- ============================================================
-- Source-of-truth column for lesson_sections.content.type. Validator GT5
-- (scripts/lib/pipeline/lesson-stage/validators/sectionType.ts) enforces this
-- at publish time; the CHECK constraint enforces it at write time so out-of-
-- band UPDATEs (Studio, ad-hoc SQL) cannot land an unknown type. Idempotent
-- via the do $$ if not exists guard.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_sections_content_type_check'
  ) then
    alter table indonesian.lesson_sections
      add constraint lesson_sections_content_type_check
      check (
        content->>'type' is null
        or content->>'type' in (
          'text','grammar','reference_table','vocabulary','expressions',
          'numbers','dialogue','pronunciation','culture','exercises'
        )
      );
  end if;
end $$;

-- ============================================================
-- Retirement #8 — orphan tables (2026-05-14)
-- ============================================================
-- Seven out-of-band tables that exist in the live DB but:
--   * have zero rows
--   * have zero references in src/, scripts/, supabase/ (TS + SQL)
--   * have no CREATE TABLE in this file or scripts/migrations/*.sql
--   * have no RLS enabled
-- They predate the rule that this file is authoritative (inversion of
-- 2026-04-02) and were never adopted into the canonical schema. Per
-- target-architecture.md rule #10 ("Don't keep dead infrastructure on
-- speculation"), they retire here.
-- Tracked-history rollout: scripts/migrations/2026-05-14-retirement-8-orphan-tables.sql
drop table if exists indonesian.anki_cards       cascade;
drop table if exists indonesian.card_reviews     cascade;
drop table if exists indonesian.card_set_shares  cascade;
drop table if exists indonesian.card_sets        cascade;
drop table if exists indonesian.user_progress    cascade;
drop table if exists indonesian.user_vocabulary  cascade;
drop table if exists indonesian.vocabulary       cascade;

-- ============================================================
-- Decision 3b (PR-4 of docs/plans/2026-05-17-extend-decision-3-lesson-id.md)
-- ADR 0006: every lesson-derived capability has an introducing lesson.
-- ============================================================
-- Schema lockdown that makes "no non-podcast NULL lesson_id" a DB-enforced
-- invariant. Adds a CHECK constraint admitting podcasts as the documented
-- carve-out, tightens the lesson_id FK from ON DELETE SET NULL to
-- ON DELETE RESTRICT, converts the four child-table FKs from NO ACTION to
-- CASCADE so future orphan-cap cleanup is a single DELETE on
-- learning_capabilities (replacing the explicit child enumeration in
-- scripts/triage-residual-capabilities.ts).
--
-- Prereq: PR-3 leaves zero non-podcast rows with NULL lesson_id. The CHECK
-- constraint refuses to apply otherwise. Verified 2026-05-17: 0 NULL rows.

-- 1. CHECK constraint: non-podcast caps must have a non-null lesson_id.
alter table indonesian.learning_capabilities
  drop constraint if exists learning_capabilities_lesson_id_required_for_lessons;
alter table indonesian.learning_capabilities
  add constraint learning_capabilities_lesson_id_required_for_lessons
    check (
      source_kind in ('podcast_segment', 'podcast_phrase')
      or lesson_id is not null
    );

-- 2. lesson_id FK: tighten ON DELETE SET NULL -> ON DELETE RESTRICT.
--    The original FK was created at the `add column ... references ...
--    on delete set null` above (see "NEW COLUMN: learning_capabilities.lesson_id").
--    PostgreSQL auto-named it learning_capabilities_lesson_id_fkey.
alter table indonesian.learning_capabilities
  drop constraint if exists learning_capabilities_lesson_id_fkey;
alter table indonesian.learning_capabilities
  add constraint learning_capabilities_lesson_id_fkey
    foreign key (lesson_id) references indonesian.lessons(id) on delete restrict;

-- 3. Convert four child-table FKs from NO ACTION to CASCADE. Original
--    constraint names auto-generated by the inline FK in
--    scripts/migrations/2026-04-25-capability-core.sql:33,45,59,86.
--    NOTE: capability_aliases's FK lives on new_capability_id (not
--    capability_id) — the constraint is capability_aliases_new_capability_id_fkey.

-- 3a. capability_aliases.new_capability_id
alter table indonesian.capability_aliases
  drop constraint if exists capability_aliases_new_capability_id_fkey;
alter table indonesian.capability_aliases
  add constraint capability_aliases_new_capability_id_fkey
    foreign key (new_capability_id) references indonesian.learning_capabilities(id)
    on delete cascade;

-- 3b. capability_artifacts.capability_id — removed in Slice 4b (#102); the
--     table is dropped in the teardown section above.

-- 3c. learner_capability_state.capability_id
alter table indonesian.learner_capability_state
  drop constraint if exists learner_capability_state_capability_id_fkey;
alter table indonesian.learner_capability_state
  add constraint learner_capability_state_capability_id_fkey
    foreign key (capability_id) references indonesian.learning_capabilities(id)
    on delete cascade;

-- 3d. capability_review_events.capability_id
alter table indonesian.capability_review_events
  drop constraint if exists capability_review_events_capability_id_fkey;
alter table indonesian.capability_review_events
  add constraint capability_review_events_capability_id_fkey
    foreign key (capability_id) references indonesian.learning_capabilities(id)
    on delete cascade;

-- ============================================================================
-- PR 0 (2026-05-22) — Data-model migration pre-work
-- ============================================================================
-- Spec: docs/plans/2026-05-22-data-model-migration.md §3
-- This block lands the ADDITIVE half of PR 0 (Steps 3 + 5 in the work order).
-- The destructive half (column drops, table drops, RPC body co-edits) lands in
-- a separate transactional block in Step 6 of the same PR. Splitting forward
-- (additive) from cleanup (drops) keeps the writer/reader/DB transition safe:
-- writers can switch to new columns before old columns are removed.

-- §3.2 — Add learning_capabilities.prerequisite_keys (additive).
-- The DROP of metadata_json + source_fingerprint + artifact_fingerprint lands
-- in the Step 6 destructive block AFTER all writers have switched (per plan
-- §3.2 line 329-340 ordering rule).
alter table indonesian.learning_capabilities
  add column if not exists prerequisite_keys text[] not null default '{}';

-- Backfill from metadata_json.prerequisiteKeys. Idempotent — only updates rows
-- where the new column is still empty AND the old JSON shape carries data.
-- Wrapped in a column-existence guard so the file remains valid after Step 6
-- drops metadata_json (a re-run of the file then no-ops the backfill).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'learning_capabilities'
      and column_name = 'metadata_json'
  ) then
    update indonesian.learning_capabilities
       set prerequisite_keys = coalesce(
         array(select jsonb_array_elements_text(metadata_json->'prerequisiteKeys')),
         '{}'::text[]
       )
     where prerequisite_keys = '{}'
       and metadata_json is not null
       and metadata_json ? 'prerequisiteKeys';
  end if;
end $$;

comment on column indonesian.learning_capabilities.prerequisite_keys is
  'Canonical-key array of capabilities that must be active before this one can be introduced. Replaces metadata_json.prerequisiteKeys (decision A).';

-- §3.2-extension — learning_capabilities.required_artifacts was added here in
-- PR 0 (Decision F revised), then RETIRED in Slice 4b (#102): readiness no longer
-- reads an artifact bag. The add-column + backfill blocks are removed; the column
-- is dropped in the Slice 4b teardown section above.

-- §3.5 — lesson_speakers table (replaces lessons.dialogue_voices jsonb).
-- Decision J: per-lesson speaker→voice mapping, flattened from the bag-of-keys
-- jsonb into a typed (lesson_id, speaker) PK. Additive in PR 0; the column
-- drops on lessons (dialogue_voices + transcript_* + duration_seconds) happen
-- in Step 6 of the same PR.
create table if not exists indonesian.lesson_speakers (
  lesson_id  uuid        not null references indonesian.lessons(id) on delete cascade,
  speaker    text        not null,
  voice_id   text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, speaker)
);

create index if not exists lesson_speakers_lesson_idx
  on indonesian.lesson_speakers(lesson_id);

alter table indonesian.lesson_speakers enable row level security;
drop policy if exists "lesson_speakers_authenticated_read" on indonesian.lesson_speakers;
create policy "lesson_speakers_authenticated_read"
  on indonesian.lesson_speakers for select to authenticated using (true);
grant select on indonesian.lesson_speakers to authenticated;
revoke insert, update, delete on indonesian.lesson_speakers from authenticated;
grant all on indonesian.lesson_speakers to service_role;
comment on table indonesian.lesson_speakers is
  'Per-lesson speaker→voice mapping. Replaces lessons.dialogue_voices jsonb (decision J). PK guarantees one voice per (lesson, speaker); jsonb_each_text order during the backfill does not affect determinism for that reason.';

-- Backfill from lessons.dialogue_voices. Idempotent on re-run via the PK
-- conflict. Guarded by column-existence so the file remains valid after
-- Step 6's drop of dialogue_voices.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'lessons'
      and column_name = 'dialogue_voices'
  ) then
    insert into indonesian.lesson_speakers (lesson_id, speaker, voice_id)
    select l.id, kv.key, kv.value
    from   indonesian.lessons l,
           jsonb_each_text(coalesce(l.dialogue_voices, '{}'::jsonb)) kv
    on conflict (lesson_id, speaker) do nothing;
  end if;
end $$;

-- ============================================================================
-- PR 1 — item source kind end-to-end migration (Decision R + Decision G2 + Decision Q)
-- ============================================================================

-- §PR1.1 — Add translation columns to learning_items (Decision R).
-- Collapses item_meanings into two typed columns. item_meanings table stays
-- until the final cleanup PR (PR 7) — the writer stops emitting rows, the
-- reader switches to inline columns in the same deploy. Re-publish from
-- staging populates the new columns via the updated pipeline writer.
alter table indonesian.learning_items
  add column if not exists translation_nl text,
  add column if not exists translation_en text,
  add column if not exists usage_note text;

comment on column indonesian.learning_items.translation_nl is
  'Primary Dutch translation. Replaces item_meanings WHERE translation_language=''nl'' AND is_primary=true. Decision R.';
comment on column indonesian.learning_items.translation_en is
  'Primary English translation. Replaces item_meanings WHERE translation_language=''en'' AND is_primary=true. Decision R.';
comment on column indonesian.learning_items.usage_note is
  'Optional usage note. Replaces item_meanings.usage_note. Decision R.';

-- §PR1.2 — capability_audio_refs (Decision Q).
-- Replaces capability_artifacts(artifact_kind=audio_clip) as the binding
-- between caps and their TTS audio. One row per (capability_id, audio_clip_id)
-- pair; voice_id is denormalised from audio_clips for query simplicity.
create table if not exists indonesian.capability_audio_refs (
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  audio_clip_id uuid not null references indonesian.audio_clips(id) on delete restrict,
  voice_id      text not null,
  created_at    timestamptz not null default now(),
  primary key (capability_id, audio_clip_id)
);

create index if not exists capability_audio_refs_clip_idx
  on indonesian.capability_audio_refs(audio_clip_id);

alter table indonesian.capability_audio_refs enable row level security;
drop policy if exists "capability_audio_refs_authenticated_read" on indonesian.capability_audio_refs;
create policy "capability_audio_refs_authenticated_read"
  on indonesian.capability_audio_refs for select to authenticated using (true);
grant select on indonesian.capability_audio_refs to authenticated;
revoke insert, update, delete on indonesian.capability_audio_refs from authenticated;
grant all on indonesian.capability_audio_refs to service_role;

comment on table indonesian.capability_audio_refs is
  'Capability to audio_clip binding. Replaces capability_artifacts(kind=audio_clip). Decision Q.';

-- §PR1.3 — Curated distractor tables — RETIRED (cap-v2 vocabulary cutover #161).
-- Replaced by the `distractors` pointer table (curated MCQ wrong-option pointers
-- resolved at runtime in byKind/item.ts → resolveDistractorMaps). The runner's
-- distractor writers were removed in the same change, so these text-array tables
-- have no remaining writer or reader. Dropped here: safe because the new runtime
-- reader no longer reads them and the publish path no longer writes them
-- (runtime-before-or-with the drop; the write-amputation makes it PGRST205-safe).
drop table if exists indonesian.recognition_mcq_distractors cascade;
drop table if exists indonesian.cued_recall_distractors cascade;
drop table if exists indonesian.cloze_mcq_item_distractors cascade;
-- ============================================================================
-- PR 1 addendum — 7 typed satellite tables for PRs 2–4 (Decision A + B §3.9)
-- These tables are empty until the per-PR re-publish populates them.
-- See docs/plans/2026-05-22-data-model-migration.md §3.1 and
--     docs/plans/2026-05-21-data-model-target.md Decision A + Decision B.
-- ============================================================================

-- ── Decision D: lesson_dialogue_lines ─────────────────────────────────────────────
-- Per-dialogue-line typed rows. Child table of lesson_sections (section_kind='dialogue').
-- lesson_id denormalised per user preference §1.3 (query uniformity).
-- source_line_ref is the stable canonical identifier used by capabilities.source_ref
-- for dialogue_line caps (format: 'lesson-N/section-M/line-K').
-- Spec: docs/plans/2026-05-21-data-model-target.md Decision D lines 324-337.
-- Must precede dialogue_clozes DDL (FK dialogue_clozes.dialogue_line_id → this table).
create table if not exists indonesian.lesson_dialogue_lines (
  id              uuid        primary key default gen_random_uuid(),
  section_id      uuid        not null references indonesian.lesson_sections(id) on delete cascade,
  lesson_id       uuid        not null references indonesian.lessons(id) on delete cascade,
  line_index      integer     not null,
  source_line_ref text        not null,
  text            text        not null,
  speaker         text,
  translation     text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(section_id, line_index),
  unique(source_line_ref)
);

create index if not exists lesson_dialogue_lines_section_idx
  on indonesian.lesson_dialogue_lines(section_id);
create index if not exists lesson_dialogue_lines_lesson_idx
  on indonesian.lesson_dialogue_lines(lesson_id);

alter table indonesian.lesson_dialogue_lines enable row level security;
drop policy if exists "lesson_dialogue_lines_authenticated_read" on indonesian.lesson_dialogue_lines;
create policy "lesson_dialogue_lines_authenticated_read"
  on indonesian.lesson_dialogue_lines for select to authenticated using (true);
grant select on indonesian.lesson_dialogue_lines to authenticated;
revoke insert, update, delete on indonesian.lesson_dialogue_lines from authenticated;
grant all on indonesian.lesson_dialogue_lines to service_role;

comment on table indonesian.lesson_dialogue_lines is
  'Per-line typed rows for dialogue sections. Child of lesson_sections (section_kind=''dialogue''). lesson_id denormalised for query uniformity. source_line_ref (lesson-N/section-M/line-K) is the stable identifier used by dialogue_line capability source_ref. Decision D; spec at 2026-05-21-data-model-target.md lines 324-337. Populated by PR 2 (lesson-stage writer).';

-- ── Decision A: dialogue_clozes ──────────────────────────────────────────────
-- One row per dialogue_line capability; replaces 3 capability_artifacts rows
-- (cloze_context, cloze_answer, translation:l1). capability_id is 1:1 (UNIQUE).
-- dialogue_line_id FK to lesson_dialogue_lines for structural cohesion.
-- Populated by PR 2 (projectors/dialogueArtifacts.ts).
create table if not exists indonesian.dialogue_clozes (
  id                  uuid primary key default gen_random_uuid(),
  capability_id       uuid not null unique references indonesian.learning_capabilities(id) on delete cascade,
  dialogue_line_id    uuid not null references indonesian.lesson_dialogue_lines(id) on delete cascade,
  sentence_with_blank text not null,
  answer_text         text not null,
  translation_text    text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists dialogue_clozes_cap_idx
  on indonesian.dialogue_clozes(capability_id);
create index if not exists dialogue_clozes_line_idx
  on indonesian.dialogue_clozes(dialogue_line_id);

alter table indonesian.dialogue_clozes enable row level security;
drop policy if exists "dialogue_clozes_authenticated_read" on indonesian.dialogue_clozes;
create policy "dialogue_clozes_authenticated_read"
  on indonesian.dialogue_clozes for select to authenticated using (true);
grant select on indonesian.dialogue_clozes to authenticated;
revoke insert, update, delete on indonesian.dialogue_clozes from authenticated;
grant all on indonesian.dialogue_clozes to service_role;

comment on table indonesian.dialogue_clozes is
  'One row per dialogue_line capability. Replaces capability_artifacts(cloze_context/cloze_answer/translation:l1). Decision A. Populated by PR 2.';

-- ── Decision A: affixed_form_pairs ───────────────────────────────────────────
-- One row per capability (2 per linguistic pair — recognition + production).
-- Replaces capability_artifacts(root_derived_pair, allomorph_rule).
-- UNIQUE(source_ref, capability_id) per validator contract (migration plan §6.5).
-- lesson_id denormalised for uniform per-lesson joins (user preference §1.3).
-- Populated by PR 3 (projectors/morphology.ts).
create table if not exists indonesian.affixed_form_pairs (
  id               uuid primary key default gen_random_uuid(),
  capability_id    uuid not null unique references indonesian.learning_capabilities(id) on delete cascade,
  source_ref       text not null,
  lesson_id        uuid not null references indonesian.lessons(id) on delete restrict,
  root_text        text not null,
  derived_text     text not null,
  allomorph_rule   text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_ref, capability_id)
);

create index if not exists affixed_form_pairs_cap_idx
  on indonesian.affixed_form_pairs(capability_id);
create index if not exists affixed_form_pairs_lesson_idx
  on indonesian.affixed_form_pairs(lesson_id);

alter table indonesian.affixed_form_pairs enable row level security;
drop policy if exists "affixed_form_pairs_authenticated_read" on indonesian.affixed_form_pairs;
create policy "affixed_form_pairs_authenticated_read"
  on indonesian.affixed_form_pairs for select to authenticated using (true);
grant select on indonesian.affixed_form_pairs to authenticated;
revoke insert, update, delete on indonesian.affixed_form_pairs from authenticated;
grant all on indonesian.affixed_form_pairs to service_role;

comment on table indonesian.affixed_form_pairs is
  'One row per affixed_form_pair capability (2 per linguistic pair). Replaces capability_artifacts(root_derived_pair/allomorph_rule). Decision A. Populated by PR 3.';

-- ── Decision A: grammar_pattern_examples ─────────────────────────────────────
-- Per-pattern example sentences; replaces capability_artifacts(pattern_example).
-- Multiple examples per pattern via display_order; today exactly 1 per pattern.
-- FK to grammar_patterns; no capability_id (pattern-level, not cap-level).
-- Populated by PR 4 (projectors/grammar.ts).
create table if not exists indonesian.grammar_pattern_examples (
  id            uuid primary key default gen_random_uuid(),
  pattern_id    uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  example_text  text not null,
  display_order integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pattern_id, display_order)
);

create index if not exists grammar_pattern_examples_pattern_idx
  on indonesian.grammar_pattern_examples(pattern_id);

alter table indonesian.grammar_pattern_examples enable row level security;
drop policy if exists "grammar_pattern_examples_authenticated_read" on indonesian.grammar_pattern_examples;
create policy "grammar_pattern_examples_authenticated_read"
  on indonesian.grammar_pattern_examples for select to authenticated using (true);
grant select on indonesian.grammar_pattern_examples to authenticated;
revoke insert, update, delete on indonesian.grammar_pattern_examples from authenticated;
grant all on indonesian.grammar_pattern_examples to service_role;

comment on table indonesian.grammar_pattern_examples is
  'Typed example sentences per grammar pattern. Replaces capability_artifacts(pattern_example). Decision A. Populated by PR 4.';

-- ── Decision B Group A: contrast_pair_exercises ──────────────────────────────
-- Full authored payload for contrast_pair exercise type. FK to grammar_patterns;
-- lesson_id denormalised for uniform per-lesson queries (user preference §1.3).
-- options jsonb shape: [{id:string, text:string}, ...] (small bounded array).
-- Populated by PR 4 (scripts/publish-grammar-candidates.ts).
create table if not exists indonesian.contrast_pair_exercises (
  id                  uuid primary key default gen_random_uuid(),
  grammar_pattern_id  uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id           uuid not null references indonesian.lessons(id) on delete restrict,
  prompt_text         text not null,
  target_meaning      text not null,
  options             jsonb not null,
  correct_option_id   text not null,
  explanation_text    text not null,
  is_active           boolean not null default true,
  source_candidate_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists contrast_pair_exercises_pattern_idx
  on indonesian.contrast_pair_exercises(grammar_pattern_id);
create index if not exists contrast_pair_exercises_lesson_idx
  on indonesian.contrast_pair_exercises(lesson_id);

alter table indonesian.contrast_pair_exercises enable row level security;
drop policy if exists "contrast_pair_exercises_authenticated_read" on indonesian.contrast_pair_exercises;
create policy "contrast_pair_exercises_authenticated_read"
  on indonesian.contrast_pair_exercises for select to authenticated using (true);
grant select on indonesian.contrast_pair_exercises to authenticated;
revoke insert, update, delete on indonesian.contrast_pair_exercises from authenticated;
grant all on indonesian.contrast_pair_exercises to service_role;

comment on table indonesian.contrast_pair_exercises is
  'Full authored payload for contrast_pair exercise type. options jsonb: [{id,text},...]. Decision B Group A. Populated by PR 4.';

-- ── Decision B Group A: sentence_transformation_exercises ────────────────────
-- Full authored payload for sentence_transformation exercise type.
-- acceptable_answers text[]: multiple accepted answer forms.
-- hint_text is optional (nullable).
create table if not exists indonesian.sentence_transformation_exercises (
  id                         uuid primary key default gen_random_uuid(),
  grammar_pattern_id         uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id                  uuid not null references indonesian.lessons(id) on delete restrict,
  source_sentence            text not null,
  transformation_instruction text not null,
  hint_text                  text,
  acceptable_answers         text[] not null,
  explanation_text           text not null,
  is_active                  boolean not null default true,
  source_candidate_id        uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists sentence_transformation_exercises_pattern_idx
  on indonesian.sentence_transformation_exercises(grammar_pattern_id);
create index if not exists sentence_transformation_exercises_lesson_idx
  on indonesian.sentence_transformation_exercises(lesson_id);

alter table indonesian.sentence_transformation_exercises enable row level security;
drop policy if exists "sentence_transformation_exercises_authenticated_read" on indonesian.sentence_transformation_exercises;
create policy "sentence_transformation_exercises_authenticated_read"
  on indonesian.sentence_transformation_exercises for select to authenticated using (true);
grant select on indonesian.sentence_transformation_exercises to authenticated;
revoke insert, update, delete on indonesian.sentence_transformation_exercises from authenticated;
grant all on indonesian.sentence_transformation_exercises to service_role;

comment on table indonesian.sentence_transformation_exercises is
  'Full authored payload for sentence_transformation exercise type. acceptable_answers text[]. Decision B Group A. Populated by PR 4.';

-- ── Decision B Group A: constrained_translation_exercises ────────────────────
-- Full authored payload for constrained_translation exercise type.
-- disallowed_shortcut_forms text[]: forbidden shortcut phrasings (default empty).
create table if not exists indonesian.constrained_translation_exercises (
  id                        uuid primary key default gen_random_uuid(),
  grammar_pattern_id        uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id                 uuid not null references indonesian.lessons(id) on delete restrict,
  source_language_sentence  text not null,
  required_target_pattern   text not null,
  disallowed_shortcut_forms text[] not null default '{}',
  acceptable_answers        text[] not null,
  explanation_text          text not null,
  is_active                 boolean not null default true,
  source_candidate_id       uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists constrained_translation_exercises_pattern_idx
  on indonesian.constrained_translation_exercises(grammar_pattern_id);
create index if not exists constrained_translation_exercises_lesson_idx
  on indonesian.constrained_translation_exercises(lesson_id);

alter table indonesian.constrained_translation_exercises enable row level security;
drop policy if exists "constrained_translation_exercises_authenticated_read" on indonesian.constrained_translation_exercises;
create policy "constrained_translation_exercises_authenticated_read"
  on indonesian.constrained_translation_exercises for select to authenticated using (true);
grant select on indonesian.constrained_translation_exercises to authenticated;
revoke insert, update, delete on indonesian.constrained_translation_exercises from authenticated;
grant all on indonesian.constrained_translation_exercises to service_role;

comment on table indonesian.constrained_translation_exercises is
  'Full authored payload for constrained_translation exercise type. disallowed_shortcut_forms text[] default empty. Decision B Group A. Populated by PR 4.';

-- ── Decision B Group A: cloze_mcq_exercises ──────────────────────────────────
-- Full authored payload for cloze_mcq exercise type (pattern-source variant).
-- options jsonb shape: string[] (option strings only; no id field).
-- Serves pattern_recognition / contextual_cloze capability_types with source_kind='pattern'.
create table if not exists indonesian.cloze_mcq_exercises (
  id                  uuid primary key default gen_random_uuid(),
  grammar_pattern_id  uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id           uuid not null references indonesian.lessons(id) on delete restrict,
  sentence            text not null,
  translation         text not null,
  options             jsonb not null,
  correct_option_id   text not null,
  explanation_text    text not null,
  is_active           boolean not null default true,
  source_candidate_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cloze_mcq_exercises_pattern_idx
  on indonesian.cloze_mcq_exercises(grammar_pattern_id);
create index if not exists cloze_mcq_exercises_lesson_idx
  on indonesian.cloze_mcq_exercises(lesson_id);

alter table indonesian.cloze_mcq_exercises enable row level security;
drop policy if exists "cloze_mcq_exercises_authenticated_read" on indonesian.cloze_mcq_exercises;
create policy "cloze_mcq_exercises_authenticated_read"
  on indonesian.cloze_mcq_exercises for select to authenticated using (true);
grant select on indonesian.cloze_mcq_exercises to authenticated;
revoke insert, update, delete on indonesian.cloze_mcq_exercises from authenticated;
grant all on indonesian.cloze_mcq_exercises to service_role;

comment on table indonesian.cloze_mcq_exercises is
  'Full authored payload for cloze_mcq exercise type (pattern-source variant). options jsonb is string[]. Decision B Group A. Populated by PR 4.';

-- ============================================================================
-- PR 1.5 (2026-05-22) — Soft retirement for orphaned capabilities
-- ============================================================================
-- Spec: docs/plans/2026-05-21-data-model-migration.md (PR 1.5 — small foundation
--       PR before per-source-kind PRs 2-5).
--
-- Adds `retired_at` to learning_capabilities so re-publish can soft-retire any
-- cap whose canonical_key falls out of the new emit set for its lesson. Readers
-- filter `retired_at IS NULL`; retired caps keep their child rows
-- (learner_capability_state FSRS, capability_review_events history) so a future
-- re-emission of the same canonical_key — handled by upsertCapabilities setting
-- retired_at = NULL on conflict — restores the cap to active with state intact.
--
-- Writer pair:
--   1. scripts/lib/pipeline/capability-stage/adapter.ts:upsertCapabilities
--      sets retired_at = NULL on every upsert (un-retire on re-emission).
--   2. scripts/lib/pipeline/capability-stage/adapter.ts:retireOrphanedCapabilities
--      runs after upsertCapabilities in the runner; sets retired_at = now()
--      for caps WHERE lesson_id = current lesson AND canonical_key NOT IN
--      emit set.
-- Validator (HC14 in scripts/check-supabase-deep.ts): no learner_capability_state
-- row references a retired cap with next_due_at <= now() (scheduler-leak tripwire).

alter table indonesian.learning_capabilities
  add column if not exists retired_at timestamptz;

-- Partial index: virtually every runtime query filters retired_at IS NULL;
-- the index covers (lesson_id, source_kind) for the read patterns in
-- src/lib/session-builder/adapter.ts and src/lib/lessons/adapter.ts.
create index if not exists learning_capabilities_active_idx
  on indonesian.learning_capabilities(lesson_id, source_kind)
  where retired_at is null;

comment on column indonesian.learning_capabilities.retired_at is
  'Soft-retirement timestamp. NULL = active (rendered + scheduled); non-null = orphaned by a re-publish whose new emit set did not include this canonical_key. Readers filter retired_at IS NULL. upsertCapabilities sets back to NULL on re-emission so FSRS state survives. PR 1.5 (2026-05-22).';

-- ============================================================================
-- PR 6 (2026-05-25) — Typed lesson-section capability contract (ADR 0011 + 0012)
-- ============================================================================
-- Spec: docs/plans/2026-05-25-lesson-pipeline-adr-0011-0012-alignment.md (§3, §6)
--       docs/plans/2026-05-22-data-model-migration.md §9
--       docs/plans/2026-05-21-data-model-target.md Decision D
--
-- Establishes the lesson-stage WRITER tables that the redesigned Capability
-- Stage (#98/#99) will read as structured input instead of staging files.
-- Every new table is WRITE-ONLY at merge — there is no runtime reader yet
-- (G4 gate is "rows populated", not "a reader returns them").
-- All lesson-content tables follow the pipeline-is-writer regime (ADR 0011):
-- new columns/rows are populated by re-publish, never SQL-backfilled.

-- ── PR 6: lesson_section_item_rows ───────────────────────────────────────────
-- Per vocab/expression/named-number item row written by the Lesson Stage.
-- The parent section_kind (vocabulary/expressions/numbers) tells the Capability
-- Stage which item class this feeds. item_type ('word'|'phrase'): harvest rule
-- — memorised primitives only. Named numbers (0-20 + place-value landmarks) are
-- words/phrases; composed numbers ('dua puluh satu') are NOT items (formed by
-- the belas-numbers pattern). Whole dialogue lines are NOT items (those are
-- lesson_dialogue_lines). source_item_ref ('lesson-N/section-M/item-K') is the
-- per-occurrence lesson-side identity — NOT the item cap source_ref (item caps
-- dedup globally by normalized_text; 758 items -> 3,884 caps). The Capability
-- Stage reduces these rows via indonesian_text -> learning_items.normalized_text.
-- l2_translation nullable at DB level (additive); the lesson-stage validator
-- sectionShape.ts asserts non-null before write (mirrors PR 1 translation_en).
-- lesson_id denormalised for uniform per-lesson queries (user preference §1.3).
-- Populated by PR 6 (lesson-stage/runner.ts + lesson-stage/enrichEnTranslations.ts).
create table if not exists indonesian.lesson_section_item_rows (
  id               uuid        primary key default gen_random_uuid(),
  section_id       uuid        not null references indonesian.lesson_sections(id) on delete cascade,
  lesson_id        uuid        not null references indonesian.lessons(id) on delete cascade,
  display_order    integer     not null,
  source_item_ref  text        not null,
  item_type        text        not null check (item_type in ('word', 'phrase')),
  indonesian_text  text        not null,
  l1_translation   text        not null,
  l2_translation   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (section_id, display_order),
  unique (lesson_id, source_item_ref)
);

create index if not exists lesson_section_item_rows_section_idx
  on indonesian.lesson_section_item_rows(section_id);
create index if not exists lesson_section_item_rows_lesson_idx
  on indonesian.lesson_section_item_rows(lesson_id);

alter table indonesian.lesson_section_item_rows enable row level security;
drop policy if exists "lesson_section_item_rows_authenticated_read" on indonesian.lesson_section_item_rows;
create policy "lesson_section_item_rows_authenticated_read"
  on indonesian.lesson_section_item_rows for select to authenticated using (true);
grant select on indonesian.lesson_section_item_rows to authenticated;
revoke insert, update, delete on indonesian.lesson_section_item_rows from authenticated;
grant all on indonesian.lesson_section_item_rows to service_role;

comment on table indonesian.lesson_section_item_rows is
  'Per-item typed rows for vocabulary/expressions/numbers sections. Child of lesson_sections (section_kind in (''vocabulary'',''expressions'',''numbers'')). lesson_id denormalised for query uniformity. source_item_ref (lesson-N/section-M/item-K) is the per-occurrence lesson-side identity — NOT the item cap source_ref (item caps dedup by normalized_text). Capability Stage input for item cap generation. Decision D; spec at 2026-05-25-lesson-pipeline-adr-0011-0012-alignment.md §3.1. Populated by PR 6 (lesson-stage writer).';

-- ── PR 6: lesson_section_grammar_categories ──────────────────────────────────
-- Per-category rows for grammar sections (one grammar section can have several
-- categories; L6 has 8). title/rules carry NL; title_en/rules_en carry EN
-- (ADR 0012 — Lesson Stage owns all learner-facing translations). examples jsonb
-- shape: [{indonesian, dutch, english}]. Table-only categories (reference grids,
-- no rules) are SKIPPED by the writer — they carry no pattern-cap input and stay
-- in the retained content blob. lesson_id denormalised for query uniformity.
-- Populated by PR 6 (lesson-stage/runner.ts).
create table if not exists indonesian.lesson_section_grammar_categories (
  id             uuid        primary key default gen_random_uuid(),
  section_id     uuid        not null references indonesian.lesson_sections(id) on delete cascade,
  lesson_id      uuid        not null references indonesian.lessons(id) on delete cascade,
  display_order  integer     not null,
  title          text        not null,
  title_en       text,
  rules          text[]      not null default '{}',
  rules_en       text[]      not null default '{}',
  examples       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (section_id, display_order)
);

create index if not exists lesson_section_grammar_categories_section_idx
  on indonesian.lesson_section_grammar_categories(section_id);
create index if not exists lesson_section_grammar_categories_lesson_idx
  on indonesian.lesson_section_grammar_categories(lesson_id);

alter table indonesian.lesson_section_grammar_categories enable row level security;
drop policy if exists "lesson_section_grammar_categories_authenticated_read" on indonesian.lesson_section_grammar_categories;
create policy "lesson_section_grammar_categories_authenticated_read"
  on indonesian.lesson_section_grammar_categories for select to authenticated using (true);
grant select on indonesian.lesson_section_grammar_categories to authenticated;
revoke insert, update, delete on indonesian.lesson_section_grammar_categories from authenticated;
grant all on indonesian.lesson_section_grammar_categories to service_role;

comment on table indonesian.lesson_section_grammar_categories is
  'Per-category typed rows for grammar sections. Capability Stage input for pattern cap generation. title/rules carry NL; title_en/rules_en carry EN (ADR 0012). Table-only categories (reference grids, no rules) are excluded — they stay in the retained content blob. examples jsonb shape: [{indonesian, dutch, english}]. Decision D §3.3; spec at 2026-05-25-lesson-pipeline-adr-0011-0012-alignment.md §3.3. Populated by PR 6 (lesson-stage writer).';

comment on column indonesian.lesson_section_grammar_categories.examples is
  'Nullable jsonb array of bilingual examples: [{indonesian: text, dutch: text, english: text}]. Null for categories with rules but no authored examples.';

-- ── PR 6: lesson_section_grammar_topics ──────────────────────────────────────
-- Topic-label rows per grammar section (content.grammar_topics[] string array).
-- One row per label. Used by extractLessonGrammarTopics (overview chips) and by
-- the Capability Stage to associate pattern caps with lesson grammar topics.
-- lesson_id denormalised for query uniformity. Populated by PR 6 (runner.ts).
create table if not exists indonesian.lesson_section_grammar_topics (
  id           uuid        primary key default gen_random_uuid(),
  section_id   uuid        not null references indonesian.lesson_sections(id) on delete cascade,
  lesson_id    uuid        not null references indonesian.lessons(id) on delete cascade,
  topic_label  text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (section_id, topic_label)
);

create index if not exists lesson_section_grammar_topics_section_idx
  on indonesian.lesson_section_grammar_topics(section_id);
create index if not exists lesson_section_grammar_topics_lesson_idx
  on indonesian.lesson_section_grammar_topics(lesson_id);

alter table indonesian.lesson_section_grammar_topics enable row level security;
drop policy if exists "lesson_section_grammar_topics_authenticated_read" on indonesian.lesson_section_grammar_topics;
create policy "lesson_section_grammar_topics_authenticated_read"
  on indonesian.lesson_section_grammar_topics for select to authenticated using (true);
grant select on indonesian.lesson_section_grammar_topics to authenticated;
revoke insert, update, delete on indonesian.lesson_section_grammar_topics from authenticated;
grant all on indonesian.lesson_section_grammar_topics to service_role;

comment on table indonesian.lesson_section_grammar_topics is
  'Topic-label rows per grammar section (content.grammar_topics[] strings). One row per label. Used by extractLessonGrammarTopics (overview chips) and Capability Stage pattern-cap association. lesson_id denormalised for query uniformity. Populated by PR 6 (lesson-stage writer).';

-- ── PR 6: lesson_section_affixed_pairs ───────────────────────────────────────
-- DB form of scripts/data/staging/lesson-N/morphology-patterns.ts (only L9 today,
-- 2 pairs). Lesson-side typed rows for root->derived morphology pairs; the
-- Capability Stage reads these to mint affixed_form_pair caps. section_id is
-- NULLABLE because morphology-patterns.ts is a sibling staging file with no
-- corresponding lesson.ts section (its patternSourceRef maps to a grammar_patterns
-- record, not a lesson_sections row). lesson_id NOT NULL — morphology is authored
-- per lesson. DISTINCT from the capability-side `affixed_form_pairs` table (PR 3):
-- that is keyed by capability_id; this is keyed by lesson_id + source_ref and is
-- the Capability Stage INPUT. affix ('meN-','di-','ber-',...) derived by the
-- writer from the sourceRef pattern. pattern_source_ref (nullable) is the grammar
-- pattern the pair elaborates ('lesson-9/pattern-men-active').
-- Populated by PR 6 (lesson-stage/runner.ts, reads morphology-patterns.ts).
create table if not exists indonesian.lesson_section_affixed_pairs (
  id                  uuid        primary key default gen_random_uuid(),
  lesson_id           uuid        not null references indonesian.lessons(id) on delete cascade,
  section_id          uuid        references indonesian.lesson_sections(id) on delete cascade,
  source_ref          text        not null,
  pattern_source_ref  text,
  affix               text        not null,
  root_text           text        not null,
  derived_text        text        not null,
  allomorph_rule      text        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (lesson_id, source_ref)
);

create index if not exists lesson_section_affixed_pairs_lesson_idx
  on indonesian.lesson_section_affixed_pairs(lesson_id);
create index if not exists lesson_section_affixed_pairs_section_idx
  on indonesian.lesson_section_affixed_pairs(section_id)
  where section_id is not null;

alter table indonesian.lesson_section_affixed_pairs enable row level security;
drop policy if exists "lesson_section_affixed_pairs_authenticated_read" on indonesian.lesson_section_affixed_pairs;
create policy "lesson_section_affixed_pairs_authenticated_read"
  on indonesian.lesson_section_affixed_pairs for select to authenticated using (true);
grant select on indonesian.lesson_section_affixed_pairs to authenticated;
revoke insert, update, delete on indonesian.lesson_section_affixed_pairs from authenticated;
grant all on indonesian.lesson_section_affixed_pairs to service_role;

comment on table indonesian.lesson_section_affixed_pairs is
  'Lesson-side typed rows for root->derived morphology pairs. DB form of scripts/data/staging/lesson-N/morphology-patterns.ts. DISTINCT from capability-side affixed_form_pairs (PR 3) — that table is keyed by capability_id; this one is keyed by lesson_id + source_ref and is the Capability Stage INPUT for affixed_form_pair cap generation. section_id nullable: morphology-patterns.ts has no corresponding lesson.ts section. affix derived by the writer from sourceRef. Populated by PR 6 (lesson-stage writer).';

-- ── PR 6: ALTER lesson_sections — section_kind + source_section_ref ──────────
-- section_kind: the canonical content.type value (scripts/lib/pipeline/lesson-stage/
-- model.ts SECTION_CONTENT_TYPES). Nullable at DDL (pipeline-is-writer: existing
-- rows stay NULL until re-publish; GT5 validateSectionType already errors on
-- non-canonical values at write time). source_section_ref: 'lesson-N/section-M'.
-- content jsonb is RETAINED (Decision D amendment / §10.2). Both columns are
-- write-only in PR 6 — no runtime reader switches.
alter table indonesian.lesson_sections
  add column if not exists section_kind       text,
  add column if not exists source_section_ref text;

-- section_kind CHECK (null-tolerant so existing pre-republish NULL rows pass).
-- DO block catches duplicate_object on the second migrate-idempotent-check apply.
do $$
begin
  alter table indonesian.lesson_sections
    add constraint lesson_sections_section_kind_check
    check (
      section_kind is null
      or section_kind in (
        'text', 'grammar', 'reference_table', 'vocabulary',
        'expressions', 'numbers', 'dialogue', 'pronunciation',
        'culture', 'exercises'
      )
    ) not valid;
exception
  when duplicate_object then null;
end
$$;

-- Partial unique index on source_section_ref: enforces uniqueness only on
-- non-null rows (safe on existing NULL rows; idempotent via IF NOT EXISTS).
create unique index if not exists lesson_sections_source_section_ref_idx
  on indonesian.lesson_sections(lesson_id, source_section_ref)
  where source_section_ref is not null;

comment on column indonesian.lesson_sections.section_kind is
  'Discriminator matching SECTION_CONTENT_TYPES in scripts/lib/pipeline/lesson-stage/model.ts. Nullable until re-publish. CHECK tolerates NULL. PR 6.';
comment on column indonesian.lesson_sections.source_section_ref is
  'Stable lesson-side identifier: ''lesson-N/section-M'' (order_index-based). Nullable until re-publish; partial unique index enforces uniqueness per lesson on non-null rows. PR 6.';

-- ── PR 6: ALTER lesson_dialogue_lines — add NL + EN translation columns ──────
-- Additive alongside the existing NOT NULL `translation` (Dutch). The writer sets
-- translation_nl = Dutch (mirrors `translation`) and translation_en = English.
-- Legacy `translation` kept (rename-retire is a standalone PR). Both nullable at
-- DDL (populated by re-publish; pipeline-is-writer).
alter table indonesian.lesson_dialogue_lines
  add column if not exists translation_nl text,
  add column if not exists translation_en text;

comment on column indonesian.lesson_dialogue_lines.translation_nl is
  'Dutch translation (NL). Added PR 6 (ADR 0012). Mirrors the legacy `translation`; both written by the lesson-stage writer. Nullable until re-publish.';
comment on column indonesian.lesson_dialogue_lines.translation_en is
  'English translation (EN). Added PR 6 (ADR 0012). Generated by the lesson-stage EN enricher (relocated from capability-stage/enrichEnTranslations.ts). Nullable until re-publish; lesson-stage validator asserts non-null before write.';

-- ── PR 6: ALTER dialogue_clozes — add NL + EN translation columns ────────────
-- Additive alongside the existing NOT NULL `translation_text` (Dutch). These stay
-- NULL in PR 6 — dialogue_clozes is written by the Capability Stage, which is out
-- of scope here. Columns added now so the shape is settled before the
-- capability-stage redesign (#98/#99) populates them.
alter table indonesian.dialogue_clozes
  add column if not exists translation_nl text,
  add column if not exists translation_en text;

comment on column indonesian.dialogue_clozes.translation_nl is
  'Dutch translation (NL). Added PR 6 (shape settled here). Populated by the Capability Stage in the capability-stage redesign (#98/#99), not PR 6. NULL until then.';
comment on column indonesian.dialogue_clozes.translation_en is
  'English translation (EN). Added PR 6 (shape settled here). Populated by the Capability Stage in the capability-stage redesign (#98/#99). NULL until then.';

-- ============================================================
-- Analytics redesign teardown (#212) — retire legacy item-state + leaderboard
-- ============================================================
-- learner_item_state (the legacy 5-stage item model) and the leaderboard view
-- are retired by the two-axis learner-progress analytics redesign (#206-#212).
-- Data-architect verified the drop is safe: no trigger/scheduler/pipeline writes
-- the table; its only app writer (learnerStateService.upsertItemState) is removed
-- in the same change. Build-stage: disposable data (CLAUDE.md Operating Context).
-- The leaderboard view reads learner_item_state, so it drops first (CASCADE on the
-- table covers its index/grant/RLS/policy). The CREATE blocks above are left as
-- create-then-dropped here rather than excised inline — a follow-up can remove
-- them; the end state (both gone) is idempotent.
drop view if exists indonesian.leaderboard;
drop table if exists indonesian.learner_item_state cascade;
