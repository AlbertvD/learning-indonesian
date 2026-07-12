
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
--   Some predated the inversion of 2026-04-02 (when migrate.ts stopped
--   regenerating migration.sql) and held load-bearing schema that lived only
--   in a standalone file. That backlog is now closed: the capability
--   subsystem was folded in cap-v2 Slice 1 (issue #161, see "Capability
--   subsystem — base tables" below), and content_units / capability_content_units
--   — the last two outstanding tables — were folded in the 2026-07-12 drift
--   reconciliation (near the end of this file), which also folded the
--   stable_slug/immutable_unaccent helper functions and their expression
--   index. A fresh `make migrate` run against an empty DB now needs ONLY this
--   file — no standalone scripts/migrations/*.sql application. New schema
--   must land here, not in a new standalone file.
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

-- User profiles (readable by all — used by the sharing UI)
CREATE TABLE IF NOT EXISTS indonesian.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  language text NOT NULL DEFAULT 'nl' CHECK (language IN ('nl', 'en')),
  preferred_session_size integer NOT NULL DEFAULT 20,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure preferred_session_size exists if table was already there
ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS preferred_session_size integer NOT NULL DEFAULT 20;
-- Default bumped 15 -> 20 (2026-07-11, grounded in measured session timings: ~3–5 min
-- for 20 items). Metadata-only; existing rows keep their stored value.
ALTER TABLE indonesian.profiles ALTER COLUMN preferred_session_size SET DEFAULT 20;

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

-- ── Collections feature (2026-06-13 spec §4.4) — hidden lessons ──────────────
-- is_hidden: a lesson that exists as a capability home but never renders as a
-- lesson card and is never auto-activated. The synthetic "Common Words" lesson
-- (the gap-word ingestion vehicle) is the first such row. Added here (before the
-- get_lessons_overview definition below) because that function's body filters on
-- it and `language sql` bodies are validated at CREATE time.
ALTER TABLE indonesian.lessons
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- ── Grammar podcast: per-lesson English grammar-audio path (2026-06-26 plan) ──
-- The existing `audio_path` is the Dutch grammar-podcast path; `audio_path_en` is
-- the English counterpart. Both resolve against the indonesian-lessons bucket and
-- are baked into each lesson's content.json by fetch-lesson-content.ts. Nullable:
-- NL episodes are generated before EN, so a lesson can carry NL audio with EN
-- still null.
ALTER TABLE indonesian.lessons
  ADD COLUMN IF NOT EXISTS audio_path_en text;

CREATE TABLE IF NOT EXISTS indonesian.lesson_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES indonesian.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE(lesson_id, order_index)
);

-- Podcasts (admin-managed, public read)
-- ── Reading content: the `texts` entity ("Text with N faces", ADR 0023) ──────────
-- A Text is a story + its ID/NL/EN-aligned transcript + level + attribution. Audio is
-- OPTIONAL: a row WITH audio is the Listen face (Podcasts page); the same row is the
-- Read face (Lezen); any row is a Study face (harvest). A "podcast" = a Text with audio.
-- Idempotent rename of the former `podcasts` table (build-stage): ALTER … RENAME is a
-- no-op once renamed; CREATE IF NOT EXISTS handles a fresh DB; the ALTER drops the old
-- NOT NULL on audio_path. This preserves story-podcast data (vs DROP CASCADE, which
-- would wipe it every `make migrate`) while addressing stale policy names below.
ALTER TABLE IF EXISTS indonesian.podcasts RENAME TO texts;
CREATE TABLE IF NOT EXISTS indonesian.texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  audio_path text,                 -- nullable: read-only texts have no Listen face
  transcript_indonesian text,
  transcript_english text,
  transcript_dutch text,
  level text CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  duration_seconds integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(title)
);
ALTER TABLE indonesian.texts ALTER COLUMN audio_path DROP NOT NULL;

-- Read-along: sentence-aligned transcript (ADR 0022). Idempotent additive column;
-- nullable. JSONB, not a child table — segments are read whole with the row, never
-- queried individually (data-architect, ADR 0009 trigger does not fire).
ALTER TABLE indonesian.texts ADD COLUMN IF NOT EXISTS transcript_segments jsonb;
COMMENT ON COLUMN indonesian.texts.transcript_segments IS
  'Ordered sentence-aligned array [{idx,id,nl,en}]: idx=0-based ordinal, id=Indonesian sentence, nl=Dutch, en=English. The transcript_indonesian/dutch/english columns are these segments joined (denormalized for the 3-tab reader); HC asserts consistency.';

-- Attribution: CC-BY/CC-BY-SA legal credit for openly-licensed source content.
-- Nullable: LLM-invented texts are original work and carry no attribution obligation.
-- Read whole with the row and displayed as one unit (ADR 0009 trigger does not fire).
-- Inherits texts_read/texts_admin_write + the authenticated SELECT grant.
ALTER TABLE indonesian.texts ADD COLUMN IF NOT EXISTS attribution jsonb;
COMMENT ON COLUMN indonesian.texts.attribution IS
  'CC attribution for openly-licensed source texts: {source_title, source_url, author, license, license_url}. NULL for LLM-original content.';

-- Pronunciation podcast: L1-specific English audio (twin of audio_path, which carries
-- the NL episode), mirroring the grammar-podcast lessons.audio_path/audio_path_en pattern
-- (ADR 0025). Nullable: only pronunciation-podcast rows set this; story podcasts and
-- read-only texts leave it NULL — so the Listen face L1-routes off its presence
-- (lang==='en' && audio_path_en ? audio_path_en : audio_path), no kind discriminator.
ALTER TABLE indonesian.texts ADD COLUMN IF NOT EXISTS audio_path_en text;
COMMENT ON COLUMN indonesian.texts.audio_path_en IS
  'English-L1 audio path (indonesian-podcasts bucket). Set only on pronunciation podcasts; NULL on story podcasts and read-only texts. Twin of audio_path (NL).';

-- ── Morphology gloss pre-compute (reader exploratory glossing, ADR 0024) ─────────
-- For every affixed corpus word, its {root, affix} decomposition, so the Lezen reader
-- shows an EXPLORATORY gloss on tap (affix function + root meaning + word family) by a
-- pure RETRIEVE — no runtime morphological parsing. GLOSS-ONLY: mints no capabilities;
-- the DRILLED set stays the curated `affixed_form_pairs` (ADR 0020/0021), untouched.
-- Keyed by `normalized_text` (the surface form), NOT a learning_item_id FK: a derived
-- corpus word is not necessarily a learning_item (it becomes one only via the slice-3
-- harvest pre-seed), and the reader looks words up by token text anyway. The glosses
-- themselves are DERIVED at read time (affix function from the static AFFIX_CATALOG,
-- root meaning from learning_items, family = items sharing the root) — not stored here,
-- so this table cannot drift from the catalog/items. Publish-time projection
-- (regenerable): built from `affixed_form_pairs` (attested) + the affixDecomposition
-- engine over the reading corpus.
CREATE TABLE IF NOT EXISTS indonesian.item_morphology (
  normalized_text text PRIMARY KEY,        -- the surface (derived) word, lowercased
  root            text NOT NULL,           -- verified base form (a learning_item / catalog root)
  affix           text NOT NULL,           -- catalog affix label, e.g. 'meN-', '-kan'
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- The EXACT meaning of the derived combination (e.g. pembaca = 'lezer'), so the reader
-- shows the word's translation, not just the affix's rule. Nullable: a decomposed corpus
-- word with no curated derived gloss and no learning_item has none (reader falls back to
-- the root meaning). Projected from affixed_form_pairs.derived_gloss_nl/_en +
-- learning_items.translation_nl/_en. The affix *function* still comes from AFFIX_CATALOG.
ALTER TABLE indonesian.item_morphology ADD COLUMN IF NOT EXISTS gloss_nl text;
ALTER TABLE indonesian.item_morphology ADD COLUMN IF NOT EXISTS gloss_en text;
COMMENT ON TABLE indonesian.item_morphology IS
  'Build-time morphological decomposition + exact derived-form gloss for reading-corpus words (ADR 0024). Gloss-only / exploratory; mints no capabilities. family = join over shared root. Distinct from the drilled affixed_form_pairs.';
ALTER TABLE indonesian.item_morphology ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "item_morphology_read" ON indonesian.item_morphology;
CREATE POLICY "item_morphology_read" ON indonesian.item_morphology FOR SELECT TO authenticated USING (true);
GRANT SELECT ON indonesian.item_morphology TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON indonesian.item_morphology FROM authenticated;

-- Learning items (canonical teachable unit)
CREATE TABLE IF NOT EXISTS indonesian.learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('word', 'phrase', 'sentence', 'dialogue_chunk')),
  base_text text NOT NULL,
  normalized_text text NOT NULL,
  language text NOT NULL DEFAULT 'id',
  level text NOT NULL DEFAULT 'A1',
  source_type text NOT NULL DEFAULT 'lesson' CHECK (source_type IN ('lesson', 'podcast', 'flashcard', 'manual', 'collection')),
  source_vocabulary_id uuid,
  source_card_id uuid,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(normalized_text)
);

-- ── Collections feature (2026-06-13 spec) — learning_items additions ─────────
-- frequency_rank: canonical "how common is this word" signal. NULL = unranked.
-- It is the canonical input the frequency-band collection membership is projected
-- from (collections.rank_cutoff). Item-level, not capability-level: frequency is a
-- property of the word. NOT wired into session ordering (out of scope, per spec §4.1).
ALTER TABLE indonesian.learning_items
  ADD COLUMN IF NOT EXISTS frequency_rank int;

-- Extend source_type CHECK with 'collection' (gap words that belong to no
-- coursebook lesson). The inline CHECK above already carries 'collection' for a
-- fresh DB; this drop+add makes the change converge on an EXISTING DB too (the
-- CREATE TABLE IF NOT EXISTS above is a no-op there). Idempotent: the constraint
-- name is the inline column-CHECK default `learning_items_source_type_check`.
ALTER TABLE indonesian.learning_items
  DROP CONSTRAINT IF EXISTS learning_items_source_type_check;
ALTER TABLE indonesian.learning_items
  ADD CONSTRAINT learning_items_source_type_check
  CHECK (source_type IN ('lesson', 'podcast', 'flashcard', 'manual', 'collection'));

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

-- Answer-variant coverage (docs/plans/2026-07-06-answer-variant-coverage.md):
-- the natively-idempotent unique-index the enrich-answer-variants.ts apply step
-- upserts against via ON CONFLICT (learning_item_id, variant_text, language)
-- DO NOTHING. is_accepted is deliberately OUT of the key so a no-op against a
-- pre-existing row never resurrects a DB-authored rejection as accepted.
-- Pre-flight (2026-07-06, live DB): zero collisions — GROUP BY
-- (learning_item_id, variant_text, language) HAVING count(*) > 1 returned 0 rows,
-- so the ~262 pre-existing out-of-band rows do not block this index.
CREATE UNIQUE INDEX IF NOT EXISTS item_answer_variants_item_text_lang_key
  ON indonesian.item_answer_variants (learning_item_id, variant_text, language);

-- SM-2 / learner-state tables (learner_item_state, learner_skill_state,
-- review_events, lesson_progress) were removed 2026-07-01 (#150, epic #98) — the
-- capability model (ADR 0001-0004) + two-axis analytics (#206-229) replaced them.
-- Their drops live in the SM-2 teardown block near the end of this file.

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

-- (Leaderboard view removed 2026-07-01 (#150): decommissioned in the two-axis
-- analytics redesign (#206-229); it read learner_item_state + lesson_progress,
-- both dropped. No replacement — analytics is learner-aligned, not comparative.)

-- Indexes
CREATE INDEX IF NOT EXISTS idx_item_contexts_lesson ON indonesian.item_contexts(source_lesson_id);
CREATE INDEX IF NOT EXISTS idx_item_contexts_item_anchor ON indonesian.item_contexts(learning_item_id, is_anchor_context);

-- (Weekly goal system tables retired in 2026-05-07 retirement #4 — see end of file)

-- RLS and Grants
GRANT USAGE ON SCHEMA indonesian TO authenticated, anon;
GRANT SELECT ON indonesian.profiles TO authenticated;
GRANT INSERT, UPDATE ON indonesian.profiles TO authenticated;
GRANT SELECT ON indonesian.lessons TO authenticated;
GRANT SELECT ON indonesian.lesson_sections TO authenticated;
GRANT SELECT ON indonesian.texts TO authenticated;
GRANT SELECT ON indonesian.learning_items TO authenticated;
GRANT SELECT ON indonesian.item_meanings TO authenticated;
GRANT SELECT ON indonesian.item_contexts TO authenticated;
GRANT SELECT ON indonesian.item_answer_variants TO authenticated;
GRANT SELECT ON indonesian.learning_sessions TO authenticated;
-- Retirement #5 (2026-05-07): INSERT/UPDATE/DELETE retired. Only the
-- commit_capability_answer_report RPC writes (service_role bypass). Browsers
-- never write directly. (SELECT retained for client-side session reads; the
-- leaderboard view that once justified the open SELECT was decommissioned — #150.)
-- 2026-06-26 security audit: the retirement #5 comment above promised SELECT-only
-- but never REVOKEd — the live DB still held authenticated INSERT/UPDATE/DELETE
-- (inert today since there is no write policy, but a landmine if a permissive
-- write policy is ever added). Apply the REVOKE the comment always intended.
REVOKE INSERT, UPDATE, DELETE ON indonesian.learning_sessions FROM authenticated;
GRANT INSERT ON indonesian.error_logs TO authenticated;
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
ALTER TABLE indonesian.texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_meanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_answer_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.error_logs ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: each CREATE is paired with DROP IF EXISTS so the file
-- can be re-applied against an existing DB without "policy already exists").
-- The previous bulk-drop loop was removed in 2026-05-08 because it silently
-- wiped policies declared in scripts/migrations/*.sql files; per-policy
-- `drop if exists; create` only touches policies this file owns.
DROP POLICY IF EXISTS "profiles_read" ON indonesian.profiles;
-- Owner-scoped (2026-06-26 security audit): was USING(true), which let any
-- authenticated user read every learner's display_name + study prefs. The
-- leaderboard that justified the open read is decommissioned; the live readers
-- (authStore, get_lessons_overview) only ever read the caller's own profile.
CREATE POLICY "profiles_read" ON indonesian.profiles FOR SELECT TO authenticated USING (id = auth.uid());
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

-- Drop BOTH the old (podcasts_*) names — carried over on the renamed table — and the
-- new names, then recreate, so the rename leaves no stale policy (data-architect m1).
DROP POLICY IF EXISTS "podcasts_read" ON indonesian.texts;
DROP POLICY IF EXISTS "podcasts_admin_write" ON indonesian.texts;
DROP POLICY IF EXISTS "texts_read" ON indonesian.texts;
CREATE POLICY "texts_read" ON indonesian.texts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "texts_admin_write" ON indonesian.texts;
CREATE POLICY "texts_admin_write" ON indonesian.texts FOR ALL TO authenticated
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

-- (Owner RLS policies for learner_item_state / learner_skill_state / review_events /
-- lesson_progress removed 2026-07-01 with those tables — #150.)

DROP POLICY IF EXISTS "learning_sessions_read" ON indonesian.learning_sessions;
-- Owner-scoped (2026-06-26 security audit): was USING(true). Read only by the
-- SECURITY INVOKER analytics RPCs (get_practice_time/get_current_streak_days/
-- get_daily_activity), all of which filter `where user_id = p_user_id` — this
-- matches their documented "SECURITY INVOKER + RLS owner-scoping" intent and
-- closes the leak where passing another user's p_user_id returned their stats.
CREATE POLICY "learning_sessions_read" ON indonesian.learning_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "learning_sessions_write" ON indonesian.learning_sessions;
CREATE POLICY "learning_sessions_write" ON indonesian.learning_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "error_logs_insert" ON indonesian.error_logs;
-- Caller-scoped + bounded (2026-07-02 security hardening): was WITH CHECK(true),
-- which let any authenticated user forge another user's user_id or insert
-- unbounded text. user_id must match the caller (or be null — logger.ts logs
-- without a user_id when auth is unavailable); message/page/action are capped
-- to match the truncation logger.ts performs before insert.
CREATE POLICY "error_logs_insert" ON indonesian.error_logs FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR user_id IS NULL)
    AND char_length(error_message) <= 4000
    AND char_length(coalesce(page, '')) <= 200
    AND char_length(coalesce(action, '')) <= 200
  );

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
    ),
    -- Bet-1 slice 2 placement probe (ADR 0026) — two targeted structural
    -- probes read by check-supabase-deep.ts. Purely additive keys; existing
    -- consumers reading only tables/grants/policies are unaffected.
    'placement_activation_source_check_ok', (
      SELECT coalesce(pg_get_constraintdef(oid) LIKE '%placement%', false)
      FROM pg_constraint
      WHERE conrelid = 'indonesian.learner_capability_state'::regclass
        AND conname = 'learner_capability_state_activation_source_check'
    ),
    'apply_placement_result_anon_execute', has_function_privilege(
      'anon', 'indonesian.apply_placement_result(text[],text[])', 'execute'
    )
  )
$$;

-- 2026-06-26 security audit: revoke the default PUBLIC EXECUTE (never revoked,
-- unlike the other SECURITY DEFINER functions) so anon cannot dump the full
-- security topology (tables, grants, every policy predicate) with the public key.
-- 2026-07-12 drift reconciliation (audit medium #9): narrowed further to
-- service_role only. Callers were re-verified: check-supabase-deep.ts (the only
-- caller) creates its client with SUPABASE_SERVICE_KEY -- it never calls this as
-- authenticated -- and check-supabase.ts (tier 1, anon key) does not call it at
-- all. `authenticated` never needed schema_health(): it exists purely to feed
-- the service-key health-check gate, and its payload (every table/policy/grant
-- in the schema) is exactly the topology-dump surface the 2026-06-26 audit was
-- narrowing in the first place -- granting it to every logged-in learner was an
-- oversight the audit didn't fully close.
REVOKE ALL ON FUNCTION indonesian.schema_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION indonesian.schema_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION indonesian.schema_health() TO service_role;

-- Goal System Scheduled Jobs (pg_cron)
-- These jobs maintain the weekly goal system consistency and generate reports.

-- pg_cron extension stays available for non-goal jobs (currently none scheduled,
-- but learner_capability_state mastery refresh + future telemetry may use it).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- (Goal-system functions, cron schedules, and learner_analytics_events table
-- retired in 2026-05-07 retirement #4 — see end of file.)

-- (Skill-facet 'recall'→'form_recall' constraint migration on learner_skill_state
-- + review_events removed 2026-07-01 with those tables — #150.)

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

-- exercise_variants: retired (Slice 4c, #102). The legacy grammar-exercise blob
-- was replaced by the 4 typed grammar-exercise tables (Decision B); the writer went
-- in #147 and the table is dropped in the teardown section below. No CREATE here.

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
-- §8 rename Phase B: exercise_type is the PRIMARY KEY, so a rename changes the
-- key value — no ON CONFLICT can migrate it. DELETE the old-named PK rows first,
-- then INSERT the new _ex names (the INSERT keeps ON CONFLICT DO UPDATE so a 2nd
-- run is idempotent; on a 2nd run the DELETE is a no-op since the old names are gone).
DELETE FROM indonesian.exercise_type_availability
  WHERE exercise_type IN ('recognition_mcq','cued_recall','typed_recall','cloze','contrast_pair',
    'sentence_transformation','constrained_translation','meaning_recall','cloze_mcq');
INSERT INTO indonesian.exercise_type_availability (
  exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes
) VALUES
  ('choose_meaning_ex', true, true, false, 'full', 'Core exercise type'),
  ('choose_form_ex', true, true, false, 'full', 'Core exercise type'),
  ('type_form_ex', true, true, false, 'full', 'Core exercise type'),
  ('type_missing_word_ex', true, true, false, 'full', 'Core exercise type'),
  ('choose_correct_form_ex', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('transform_sentence_ex', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('translate_sentence_ex', true, true, true, 'beta', 'Grammar-aware, requires published content'),
  ('speaking', false, true, true, 'alpha', 'Not yet enabled in sessions'),
  -- PR 0 §3.6: backfill rows for exercise types that route through the
  -- registry but had no availability row. choose_meaning_ex and choose_form_ex
  -- already had rows; type_meaning_ex + choose_missing_word_ex were missing.
  ('type_meaning_ex', true, true, false, 'full', 'Item meaning recall — derived from learning_items + variants'),
  ('choose_missing_word_ex', true, true, true, 'full', 'Cloze MCQ — item + pattern source kinds')
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
-- exercise_variants RLS retired with the table (Slice 4c #102).

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

-- exercise_variants policies retired with the table (Slice 4c #102).

GRANT SELECT ON indonesian.textbook_sources TO authenticated;
GRANT SELECT ON indonesian.textbook_pages TO authenticated;
GRANT SELECT ON indonesian.grammar_patterns TO authenticated;
GRANT SELECT ON indonesian.item_context_grammar_patterns TO authenticated;
GRANT SELECT ON indonesian.exercise_type_availability TO authenticated;
-- exercise_variants grant retired with the table (Slice 4c #102).
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
  -- exercise_variant_id: holds a typed grammar-exercise row id. The FK to
  -- exercise_variants was dropped when that table was retired (Slice 4c #102);
  -- bare uuid now (the live FK is dropped in the teardown section below).
  exercise_variant_id uuid,
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

-- exercise_variants nullable/anchor ALTERs + lesson_id column + the two indexes
-- were retired with the table (Slice 4c #102). (They ALTER/INDEX a table whose
-- CREATE is gone; on a fresh apply the ADD COLUMN / ::regclass cast / CREATE INDEX
-- would error, so they must be removed alongside the CREATE.)

-- ============================================================
-- Grammar Pattern Scheduling — RETIRED 2026-05-07
-- ============================================================
-- learner_grammar_state retired per docs/target-architecture.md §#5.
-- The capability system handles per-pattern FSRS via learner_capability_state.
-- Tracked-history rollout: scripts/migrations/2026-05-07-drop-learner-grammar-state.sql
-- Rollback: scripts/migrations/2026-05-07-drop-learner-grammar-state.rollback.sql
drop table if exists indonesian.learner_grammar_state cascade;

-- Content review comments: admin-only per-variant annotations
CREATE TABLE IF NOT EXISTS indonesian.exercise_review_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- exercise_variant_id: holds a TYPED grammar-exercise row id (one of the 4 typed
  -- tables). The FK to exercise_variants was dropped in Slice 2 and the table
  -- retired in Slice 4c (#102); bare uuid now. Integrity is app-side + HC23.
  exercise_variant_id uuid NOT NULL,
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

-- ── Slice 2 Task 8 (OQ2-3, architect-APPROVED 2026-06-01): exercise_review_comments
-- is decoupled from exercise_variants. The review UI keys comments by the TYPED
-- grammar-exercise row id (one of the 4 typed exercise tables). The old FK to
-- exercise_variants was dropped in Slice 2; Slice 4c (#102) retires the CREATE-block
-- FK (above) and drops the exercise_variants table entirely, so the name-agnostic
-- FK-drop DO block that used to live here is gone (its 'indonesian.exercise_variants'
-- ::regclass cast would error on a fresh apply now that the table is dropped).
-- Integrity is app-side (exerciseReviewService resolves the id across the 4 typed
-- tables) + HC23 (check-supabase-deep.ts counts orphans).

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

-- content_flags: migrate to a single uniform capability_id anchor.
-- The two-anchor model (learning_item_id / grammar_pattern_id) left two live
-- exercise families — dialogue-line cloze and affixed-form-pair — unflaggable,
-- because they map to a capability but neither a learning_item nor a
-- grammar_pattern. Every exercise block already carries a capability_id, so it
-- is the universal exercise identity; the two old anchors were redundant
-- projections of it. The flag→review loop reads only flag.id + comment +
-- exercise_type, so nothing dereferences the old anchor FKs.
-- The old columns stay (nullable, unused) — dropping them is irreversible and
-- buys nothing. Pre-migration rows have capability_id IS NULL and would violate
-- the new CHECK, so they are deleted (admin-only, disposable). DELETE (not
-- TRUNCATE) preserves valid post-migration flags across future migrate runs.
ALTER TABLE indonesian.content_flags
  ADD COLUMN IF NOT EXISTS capability_id uuid
    REFERENCES indonesian.learning_capabilities(id) ON DELETE CASCADE;

-- Drop the old two-anchor CHECK and per-anchor UNIQUE constraints.
ALTER TABLE indonesian.content_flags
  DROP CONSTRAINT IF EXISTS content_flags_entity_check;
ALTER TABLE indonesian.content_flags
  DROP CONSTRAINT IF EXISTS content_flags_user_id_learning_item_id_exercise_type_key;
ALTER TABLE indonesian.content_flags
  DROP CONSTRAINT IF EXISTS content_flags_user_id_grammar_pattern_id_exercise_type_key;

-- Clear anchorless pre-migration rows so the NOT-NULL CHECK can be added.
DELETE FROM indonesian.content_flags WHERE capability_id IS NULL;

-- Uniform anchor: capability_id must always be set.
DO $$ BEGIN
  ALTER TABLE indonesian.content_flags ADD CONSTRAINT content_flags_entity_check
    CHECK (capability_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One open flag per (user, capability, exercise_type).
-- Guarded via information_schema (not EXCEPTION WHEN duplicate_object): adding an
-- existing UNIQUE constraint raises duplicate_table (42P07, the backing index
-- relation collides), which a duplicate_object handler does not catch.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'indonesian'
    AND table_name = 'content_flags'
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'content_flags_user_capability_exercise_key'
  ) THEN
    ALTER TABLE indonesian.content_flags
      ADD CONSTRAINT content_flags_user_capability_exercise_key
      UNIQUE (user_id, capability_id, exercise_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_flags_capability
  ON indonesian.content_flags(capability_id);

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
-- §8 rename Phase B: DELETE old PK row, INSERT new _ex name (PK value changes).
DELETE FROM indonesian.exercise_type_availability WHERE exercise_type = 'listening_mcq';
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('choose_meaning_from_audio_ex', true, false, false, 'alpha',
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
-- §8 rename Phase B: DELETE old PK row, INSERT new _ex name (PK value changes).
DELETE FROM indonesian.exercise_type_availability WHERE exercise_type = 'dictation';
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('type_form_from_audio_ex', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, typed Indonesian answer. Runtime-built. Free text with fuzzy grading.')
ON CONFLICT (exercise_type) DO NOTHING;

-- RETIRED (2026-06-26 security audit): apply_review_to_skill_state was the legacy
-- SM-2 per-item write path, superseded by commit_capability_answer_report (ADR 0004,
-- writes learner_capability_state). It was dead — the only caller, learnerStateService,
-- was imported by nothing but its own test. As a SECURITY DEFINER function it bypassed
-- learner_skill_state's owner RLS, took a caller-supplied p_user_id with NO ownership
-- guard, and — unlike every sibling write RPC — was never REVOKEd from PUBLIC, so the
-- default anon EXECUTE grant let any holder of the public anon key overwrite ANY user's
-- skill-state rows (unauthenticated cross-tenant write). Dropped rather than guarded:
-- cutting dead mechanism beats hardening it. (The learner_skill_state table it wrote
-- was dropped 2026-07-01 in the SM-2 teardown — #150, epic #98.) The DROP FUNCTION
-- below stays as an idempotent guard against a stale live definition.
DROP FUNCTION IF EXISTS indonesian.apply_review_to_skill_state(
  uuid, uuid, text, boolean, numeric, numeric, numeric, timestamptz, timestamptz, integer
);

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
  source_kind text not null check (source_kind in ('vocabulary_src','grammar_pattern_src','dialogue_line_src','podcast_segment_src','podcast_phrase_src','word_form_pair_src')),
  source_ref text not null,
  capability_type text not null,
  direction text not null,
  modality text not null,
  learner_language text not null,
  projection_version text not null,
  readiness_status text not null check (readiness_status in ('ready','blocked','exposure_only','deprecated','unknown')),
  publication_status text not null check (publication_status in ('draft','published','retired')),
  source_fingerprint text,
  -- artifact_fingerprint retired (Slice 4c #102, Decision A tail): dead readiness
  -- column, 0 readers; dropped in the teardown section below. No column here.
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

-- §8 capability-naming rename (docs/plans/2026-06-15-capability-naming-rename-plan.md):
-- the inline source_kind CHECK above is created with the new _src names on a
-- fresh install, but an existing DB still carries the auto-named constraint with
-- the old values ('item','pattern',…). Guarded drop+recreate rewrites it to the
-- renamed values. (capability_type stays bare text — no CHECK. Build-stage
-- truncate-and-regen re-emits every cap under the new canonical_key.)
alter table indonesian.learning_capabilities
  drop constraint if exists learning_capabilities_source_kind_check;
alter table indonesian.learning_capabilities
  add constraint learning_capabilities_source_kind_check
    check (source_kind in ('vocabulary_src','grammar_pattern_src','dialogue_line_src','podcast_segment_src','podcast_phrase_src','word_form_pair_src'));

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
     -- 'placement' added (ADR 0026): a placement-seeded row's activation_source
     -- is sticky (never overwritten by the coalesce below), so the edge
     -- function carries it straight through into stateAfter.activationSource
     -- on the row's first REAL review. Without this, that first review would
     -- be rejected as invalid — breaking the exact "engine continuation"
     -- guarantee the placement design depends on. Additive-only: no behavior
     -- change for the three pre-existing values.
     or coalesce(v_state_after->>'activationSource', 'review_processor') not in ('review_processor', 'admin_backfill', 'legacy_migration', 'placement')
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
  -- sessionId is client-supplied; a forged/colliding id belonging to another
  -- user must be a no-op here, never a cross-user write to their session row.
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
     )
     where indonesian.learning_sessions.user_id = v_user_id;

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

-- (BACKFILL Step 2 — the one-time lesson_progress→activation promotion — removed
-- 2026-07-01 with the lesson_progress table (#150). It was already applied live.)

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
-- 2026-07-08/09 (Slice 3, docs/plans/2026-07-08-vocab-mode-set-reduction-and-
-- graduation.md §5, ADR 0027 Analytics note): graduation (Slice 2) retires the
-- #1 scaffold from due scheduling once its #6 sibling reaches mastery strength.
-- Two coupled fixes keep this numerator honest as words graduate:
--   (a) stability-scaled recency window — `greatest(30 days, 2x stability)`
--       instead of a fixed 30 days, so a mature card (long FSRS interval) does
--       not age out of "recently reviewed" between its own reviews. Mirrors the
--       same fix in isRecent (src/lib/analytics/mastery/mastered.ts).
--   (b) numerator subsumption — a #1 (`recognise_meaning_from_text_cap`) row
--       ALSO counts as mastered when its same-`source_ref`, same-lesson,
--       non-retired #6 (`produce_form_from_meaning_cap`) sibling meets the
--       RECENCY-FREE strength predicate (mirrors `hasMasteryStrength` in
--       mastered.ts — a recency term here would reintroduce the flicker
--       graduation is designed to avoid). #1 and #6 always share a lesson_id
--       (stamped in the same projector iteration, vocab.ts), so the sibling
--       lookup is scoped within the per-lesson CTE below — no global self-join;
--       `learning_capabilities_source_idx` covers it. Deliberately scoped to
--       THIS rpc (Minimum Mechanism, spec §5 "Open question"): `_mastery_label`
--       (get_weekly_movement / get_collections_overview) is untouched — those
--       are a fast weekly pulse and a "known words" reading list, neither of
--       which regresses the way a persistent % on the lesson tile would.
--
-- 2026-07-09 (PR-C, docs/plans/2026-07-09-vocab-four-card-ladder.md §2.5): the
-- four-card ladder generalized graduation.ts's single rule to BOTH
-- scaffold→successor pairs — `#1 ← (#3′ ∨ #6)` and `#2 ← #6` (mirrors
-- `GRADUATION_RULES` in src/lib/session-builder/graduation.ts). The numerator
-- subsumption clause below now has one OR-branch per scaffold:
--   - #1 (`recognise_meaning_from_text_cap`) subsumes via a sibling whose
--     `capability_type` is #3′ (`recognise_meaning_from_audio_cap`, now itself
--     a typed recall card per PR-B §2.3) OR #6 (`produce_form_from_meaning_cap`)
--     — the OR is load-bearing for listening-disabled users (§2.6: their #3′ is
--     stripped from the snapshot, so only the #6 leg ever fires for them).
--   - #2 (`recognise_form_from_meaning_cap`) subsumes via a #6 sibling only.
-- Both sibling predicates stay RECENCY-FREE (same `hasMasteryStrength` mirror);
-- the stability-scaled recency window on the direct (own-strength) clause is
-- unchanged. `RETURNS TABLE` shape unchanged — numerator logic only.
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
    -- 2026-07-08/09 (Slice 3): adds source_ref/source_kind/capability_type so
    -- the mastered-numerator subsumption clause below can find a capability's
    -- successor sibling(s) WITHIN this same CTE (no global self-join). PR-C
    -- (2026-07-09, four-card-ladder spec §2.5) extended the successor set to
    -- #3′/#6 for #1 and #6 for #2 (same CTE, same shape).
    select c.lesson_id, c.id as capability_id,
           c.readiness_status, c.publication_status,
           c.source_ref, c.source_kind, c.capability_type,
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
           -- Slice 3 (2026-07-08/09, ADR 0027 Analytics note): the recency term
           -- is now stability-scaled (mirrors isRecent's `Math.max(30, 2 *
           -- stability)` window) — `greatest('30 days', 2x stability)` — so a
           -- mature card's long FSRS interval no longer ages it out of
           -- "recently reviewed". PR-C (2026-07-09, four-card-ladder spec §2.5)
           -- generalized the OR branches to BOTH scaffold→successor pairs
           -- (mirrors GRADUATION_RULES, graduation.ts): a #1
           -- (recognise_meaning_from_text_cap) row also counts when its
           -- same-source_ref, same-lesson #3′ (recognise_meaning_from_audio_cap)
           -- OR #6 (produce_form_from_meaning_cap) sibling meets the
           -- RECENCY-FREE strength predicate; a #2
           -- (recognise_form_from_meaning_cap) row also counts via a #6 sibling
           -- (mirrors hasMasteryStrength in mastered.ts — recency here would
           -- reintroduce the flicker graduation exists to prevent). The
           -- scaffold row itself still needs the ready/published filter; the
           -- successor sibling does not (it can be due-suppressed and still count).
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and (
                 (
                   review_count >= 4
                   and coalesce(stability, 0) >= 14
                   and last_reviewed_at >= now() - greatest(
                     interval '30 days',
                     make_interval(days => (coalesce(stability, 0) * 2)::int)
                   )
                   and coalesce(consecutive_failure_count, 0) = 0
                 )
                 -- #1 ← (#3′ ∨ #6): sibling capability_type IN the successor set
                 -- mirrors GRADUATION_RULES's array value for #1 (graduation.ts).
                 or (
                   source_kind = 'vocabulary_src'
                   and capability_type = 'recognise_meaning_from_text_cap'
                   and exists (
                     select 1 from lesson_capabilities sib
                     where sib.lesson_id = lesson_capabilities.lesson_id
                       and sib.source_ref = lesson_capabilities.source_ref
                       and sib.source_kind = 'vocabulary_src'
                       and sib.capability_type in (
                         'recognise_meaning_from_audio_cap', 'produce_form_from_meaning_cap'
                       )
                       and coalesce(sib.review_count, 0) >= 4
                       and coalesce(sib.stability, 0) >= 14
                       and coalesce(sib.consecutive_failure_count, 0) = 0
                   )
                 )
                 -- #2 ← #6: mirrors GRADUATION_RULES's single-successor value for #2.
                 or (
                   source_kind = 'vocabulary_src'
                   and capability_type = 'recognise_form_from_meaning_cap'
                   and exists (
                     select 1 from lesson_capabilities sib
                     where sib.lesson_id = lesson_capabilities.lesson_id
                       and sib.source_ref = lesson_capabilities.source_ref
                       and sib.source_kind = 'vocabulary_src'
                       and sib.capability_type = 'produce_form_from_meaning_cap'
                       and coalesce(sib.review_count, 0) >= 4
                       and coalesce(sib.stability, 0) >= 14
                       and coalesce(sib.consecutive_failure_count, 0) = 0
                   )
                 )
               )
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
  -- Collections feature (2026-06-13 spec §4.4): hidden lessons (the synthetic
  -- "Common Words" gap-word home) never render as a lesson card.
  where not l.is_hidden
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
  -- Counts distinct SOURCE_REF (the learnable unit — a word / grammar topic /
  -- morphology derivation) that advanced a rung this week, SPLIT into vocab
  -- (vocabulary_src), grammar (grammar_pattern_src) and morphology
  -- (word_form_pair_src) — the SAME three buckets + scope as the mastery funnel
  -- (capstone item C). dialogue_line / podcast source kinds are excluded (the
  -- funnel excludes them too). Distinct source_ref (NOT capability_id): one word
  -- has several caps, so per-cap counts overstate. A unit counts once if any of
  -- its caps advanced. TS mirror: funnelBucket
  -- (src/lib/analytics/mastery/masteryModel.ts), held in lockstep by HC28 (ADR 0015).
  with ev as (
    select
      c.source_ref,
      case
        when c.source_kind = 'vocabulary_src' then 'vocab'
        when c.source_kind = 'grammar_pattern_src' then 'grammar'
        when c.source_kind = 'word_form_pair_src' then 'morphology'
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
    'advanced_vocab',      count(distinct source_ref) filter (where ra > rb and bucket = 'vocab'),
    'advanced_grammar',    count(distinct source_ref) filter (where ra > rb and bucket = 'grammar'),
    'advanced_morphology', count(distinct source_ref) filter (where ra > rb and bucket = 'morphology'),
    'reached_mastered',    count(distinct source_ref) filter (where after_label = 'mastered' and before_label <> 'mastered'),
    'slipped',             count(distinct source_ref) filter (where after_label = 'at_risk' and before_label <> 'at_risk')
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

-- Durability curve (Voortgang "Groei" tab, docs/plans/2026-06-30-voortgang-groei-
-- dimension-design.md §3.3): average FSRS stability (memory strength, days)
-- reconstructed per week-end from the append-only capability_review_events log —
-- the over-time twin of the current-snapshot get_memory_health. For each of the
-- last p_weeks timezone-local weeks, take each capability's LAST-KNOWN state as of
-- that week-end (distinct on capability_id, latest event <= cutoff) and average its
-- stability. Cutoff = end of that week, clamped to now() for the in-progress week
-- (n=0). Null/zero-filled for weeks before the first review. SECURITY INVOKER +
-- user_id filter (the invoker-RPC safety idiom); reads owner-RLS'd rows only.
create or replace function indonesian.get_stability_series(
  p_user_id uuid,
  p_timezone text,
  p_weeks int
)
returns json language sql stable security invoker as $$
  with bounds as (
    select
      (date_trunc('week', now() at time zone p_timezone) - make_interval(weeks => n))::date as week_start,
      -- End of this local week as a UTC instant, clamped to now() for the current
      -- (in-progress) week so today's reviews are included at the newest point.
      least(
        now(),
        (date_trunc('week', now() at time zone p_timezone) - make_interval(weeks => n) + interval '1 week') at time zone p_timezone
      ) as cutoff
    from generate_series(0, p_weeks - 1) as n
  ),
  per_week as (
    select
      b.week_start,
      agg.avg_stability_days,
      agg.sample_size
    from bounds b
    cross join lateral (
      select
        avg(s.stability) as avg_stability_days,
        count(s.stability)::int as sample_size
      from (
        select distinct on (e.capability_id)
               nullif(e.state_after_json->>'stability', '')::double precision as stability
        from indonesian.capability_review_events e
        where e.user_id = p_user_id
          and e.created_at <= b.cutoff
        order by e.capability_id, e.created_at desc
      ) s
    ) agg
  )
  select coalesce(json_agg(
    json_build_object(
      'week_start', to_char(week_start, 'YYYY-MM-DD'),
      'avg_stability_days', avg_stability_days,
      'sample_size', sample_size
    )
    order by week_start
  ), '[]'::json)
  from per_week;
$$;

grant execute on function indonesian._mastery_label(int, int, int, double precision, timestamptz, timestamptz) to authenticated;
grant execute on function indonesian.get_weekly_movement(uuid, text) to authenticated;
grant execute on function indonesian.get_daily_activity(uuid, text, int) to authenticated;
grant execute on function indonesian.get_stability_series(uuid, text, int) to authenticated;

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
-- here with CASCADE: a KEPT table carries an FK INTO this set
-- (grammar_patterns.introduced_by_source_id -> textbook_sources), so deleting its
-- CREATE would make the kept table's own definition reference a missing table on a
-- fresh rebuild. CASCADE removes that FK constraint cleanly (the column remains,
-- unconstrained). (The other former inbound FK, exercise_variants.source_candidate_id
-- -> generated_exercise_candidates, is gone: exercise_variants was dropped in Slice
-- 4c #102, CREATE and all.) Removing the now-dead CREATE blocks + the orphaned column
-- is a deferred follow-up cleanup (larger, separately reviewable).
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
-- Slice 4c (#102, 2026-07-01) — drop exercise_variants (Decision B)
-- ============================================================
-- The legacy grammar-exercise blob is retired: grammar exercises live in the 4
-- typed grammar-exercise tables (contrast_pair_exercises / sentence_transformation_
-- exercises / constrained_translation_exercises / cloze_mcq_exercises). #147 5b.2
-- (commit aeb620e4) removed the last writer → 716 frozen rows, 0 writers, and
-- (verified live 2026-07-01) 0 views / 0 functions / 0 runtime readers depend on it.
-- The CREATE / RLS / policy / GRANT / nullable-anchor / index / FK blocks were all
-- removed above, so a fresh apply never creates it. Deploy ordering is moot (no app
-- reader), but the container is still recreated before `make migrate` for hygiene.
--
-- First: delete the 4 legacy exercise_review_comments whose annotated exercise
-- exists ONLY as an exercise_variants row (never bridged to a typed table — verified
-- live 2026-07-01). They would orphan on the drop; there is no typed equivalent to
-- repoint to. Operating Context: disposable single-learner test data (user-approved
-- 2026-07-01). This resolves the June-4 B7 CASCADE-fate question (delete, not migrate).
-- Guarded by to_regclass so a rerun / fresh rebuild (where exercise_variants is
-- already gone) no-ops instead of erroring on the subquery — keeps migrate-idempotent-check green.
do $$ begin
  if to_regclass('indonesian.exercise_variants') is not null then
    delete from indonesian.exercise_review_comments c
      where exists (select 1 from indonesian.exercise_variants ev where ev.id = c.exercise_variant_id);
  end if;
end $$;

-- Then drop the live content_flags FK explicitly (idempotent) — belt to the
-- cascade braces of the table drop below, so the constraint goes deterministically.
alter table indonesian.content_flags
  drop constraint if exists content_flags_exercise_variant_id_fkey;

drop table if exists indonesian.exercise_variants cascade;

-- learning_capabilities.artifact_fingerprint (Decision A tail): dead readiness
-- column, 0 readers; 4b missed it. The CREATE-block column was removed above; this
-- drop clears it from the live DB. Idempotent: no-ops on rerun / fresh rebuild.
alter table indonesian.learning_capabilities
  drop column if exists artifact_fingerprint;

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
      source_kind in ('podcast_segment_src', 'podcast_phrase_src')
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
-- artifact_fingerprint was dropped in Slice 4c (#102) above (dead, 0 readers).
-- The DROP of the remaining metadata_json + source_fingerprint lands in the Step 6
-- destructive block AFTER all writers have switched (per plan §3.2 line 329-340
-- ordering rule) — both still have live readers today.
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

-- §Bet1.1 — loan_source_nl (loanword bridge, docs/plans/2026-07-06-loanword-bridge-*).
-- The Dutch source/cognate word (kantoor for kantor). A property of the WORD, not
-- of collection membership, so it lives on learning_items. Read by the /welkom
-- "je kent dit al" reveal. Pipeline-written, staging-canonical, rewritten every
-- publish (no flag→review loop for etymology) — the endpoint of the two-stage
-- carrier path: staging vocab loanSourceNl → lesson_section_item_rows.loan_source_nl
-- → TypedItemRow → vocab projector → upsertLearningItemIdempotent (§3.2).
alter table indonesian.learning_items
  add column if not exists loan_source_nl text;

comment on column indonesian.learning_items.loan_source_nl is
  'Dutch source/cognate of a loanword (e.g. kantoor for kantor). NULL for non-loanwords. Pipeline-written per Bet-1 §3.2; the /welkom reveal reads it.';

-- §PR1.2 — capability_audio_refs — RETIRED (pre-cloud hardening, 2026-07-02).
-- Created in PR 1 (Decision Q) as the intended cap-to-audio binding table
-- (replacing capability_artifacts(artifact_kind=audio_clip)), but the writer
-- was never wired (runner.ts explicitly skipped it) and the actual runtime
-- audio path uses get_audio_clips RPC keyed by (text, voice_id) via
-- audioService.fetchSessionAudioMap, bypassing this table entirely. 0 rows,
-- 0 writers, 0 readers at retirement (confirmed docs/audits/2026-05-25-pr7-pre-drop-audit.md
-- Check 12 + a full repo re-grep). No FK points into it; no view references it.
drop table if exists indonesian.capability_audio_refs cascade;

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

-- §Bet1.1 carrier — loan_source_nl (loanword bridge). Additive nullable column on
-- an existing table (NOT inside the create-table above, which is a no-op once the
-- table exists). The lesson stage writes it here from staging; the Capability Stage
-- reads it via TypedItemRow and forwards it to learning_items.loan_source_nl (§3.2).
-- Without this carrier the endpoint writer's value never arrives (ADR 0012: the
-- Capability Stage reads item data only from the DB, never from staging).
alter table indonesian.lesson_section_item_rows
  add column if not exists loan_source_nl text;

comment on column indonesian.lesson_section_item_rows.loan_source_nl is
  'Carrier for learning_items.loan_source_nl across the lesson→capability DB boundary (Bet-1 §3.2). Lesson-stage-written from staging; capability-stage-read.';

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

-- ── Morphology phase-b: affix application-tier payload ───────────────────────
-- docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md §1 + §4
-- (corrected 2026-06-16 by a data-architect re-ruling — see ADR-context note below).
-- Adds the discriminator + payload columns the generative application tier
-- (decompose / build-confix / pick-affix / pick-allomorph drills) reads, on BOTH
-- the lesson-side SOURCE table (lesson_section_affixed_pairs) and the capability-
-- side PROJECTION table (affixed_form_pairs).
--
-- WHERE grammar_pattern_id IS RESOLVED (corrected): the CAPABILITY stage, NOT the
-- lesson stage. grammar_patterns rows are written by the Capability Stage
-- (patternPath.ts:138), so they do NOT exist when the Lesson Stage writes
-- lesson_section_affixed_pairs. The Capability-Stage projector
-- (projectAffixedFormPairs) has patternResult.patternIdsBySlug in scope
-- (runner.ts:396) and resolves the pair's authored grammar-pattern slug
-- (carried by lesson_section_affixed_pairs.pattern_source_ref) -> grammar_pattern_id.
-- Therefore:
--   * affixed_form_pairs (PROJECTION) gets grammar_pattern_id FK + NOT NULL.
--   * lesson_section_affixed_pairs (SOURCE) KEEPS its pattern_source_ref text slug
--     (NOT dropped) and gets NO grammar_pattern_id column — the lesson stage has
--     no id to write. (This reverses the earlier M1 ruling; M1 assumed the lesson
--     stage had the slug->id map, which the code disproves.)
--
-- PRECONDITION for the SET NOT NULL tail: affixed_form_pairs must be EMPTY or
-- fully repopulated. The build-stage cutover truncates learning_capabilities
-- CASCADE, which empties affixed_form_pairs (capability_id FK is ON DELETE
-- CASCADE), then re-publishes. lesson_section_affixed_pairs needs NO truncation —
-- it has no SET NOT NULL here and its CHECKs pass on NULL; re-publish repopulates
-- its new columns. Purely additive DDL (no data UPDATE) → `make
-- migrate-idempotent-check` stays green once affixed_form_pairs is empty/correct.

-- 1. Additive columns (nullable). PROJECTION table — full payload incl. the FK
--    (`affix` added only here; the source table already has `affix text not null`).
alter table indonesian.affixed_form_pairs
  add column if not exists affix             text,
  add column if not exists affix_type        text,
  add column if not exists affix_gloss       text,
  add column if not exists allomorph_class   text,
  add column if not exists circumfix_left    text,
  add column if not exists circumfix_right   text,
  add column if not exists productive        boolean,
  add column if not exists carrier_text       text,  -- ADR 0019: harvested example sentence containing derived_text (option B in-context production)
  add column if not exists derived_gloss_nl   text,  -- Dutch meaning of derived_text (bilingual; LLM-authored at authoring time, projected from source)
  add column if not exists derived_gloss_en   text,  -- English meaning of derived_text
  add column if not exists grammar_pattern_id uuid references indonesian.grammar_patterns(id) on delete restrict;

--    SOURCE table — authored payload only; NO grammar_pattern_id (resolved later,
--    in the cap stage), and pattern_source_ref is RETAINED to carry the authored
--    grammar-pattern slug the cap stage resolves against.
alter table indonesian.lesson_section_affixed_pairs
  add column if not exists affix_type        text,
  add column if not exists affix_gloss       text,
  add column if not exists allomorph_class   text,
  add column if not exists circumfix_left    text,
  add column if not exists circumfix_right   text,
  add column if not exists productive        boolean,
  add column if not exists carrier_text       text,  -- ADR 0019: harvested carrier sentence (option B)
  add column if not exists derived_gloss_nl   text,  -- Dutch meaning of derived_text (bilingual; LLM-authored at authoring time)
  add column if not exists derived_gloss_en   text;  -- English meaning of derived_text

-- 2. Guarded CHECK constraints on BOTH tables (drop-if-exists + add = idempotent;
--    each passes on NULL columns, so they hold during the nullable-add phase too).
--    The CHECK lives on the source table as well so a Lesson-Stage bug writing a
--    bad non-null value fails one stage earlier (data-architect m2).
alter table indonesian.affixed_form_pairs
  drop constraint if exists affixed_form_pairs_affix_type_check;
alter table indonesian.affixed_form_pairs
  add constraint affixed_form_pairs_affix_type_check
    check (affix_type in ('prefix', 'suffix', 'confix', 'reduplication'));
alter table indonesian.affixed_form_pairs
  drop constraint if exists affixed_form_pairs_confix_boundary_check;
alter table indonesian.affixed_form_pairs
  add constraint affixed_form_pairs_confix_boundary_check
    check (affix_type <> 'confix' or (circumfix_left is not null and circumfix_right is not null));

alter table indonesian.lesson_section_affixed_pairs
  drop constraint if exists lesson_section_affixed_pairs_affix_type_check;
alter table indonesian.lesson_section_affixed_pairs
  add constraint lesson_section_affixed_pairs_affix_type_check
    check (affix_type in ('prefix', 'suffix', 'confix', 'reduplication'));
alter table indonesian.lesson_section_affixed_pairs
  drop constraint if exists lesson_section_affixed_pairs_confix_boundary_check;
alter table indonesian.lesson_section_affixed_pairs
  add constraint lesson_section_affixed_pairs_confix_boundary_check
    check (affix_type <> 'confix' or (circumfix_left is not null and circumfix_right is not null));

-- 3. Mandatory-field NOT NULL — PROJECTION table only (the cap stage populates all
--    three; the source-table equivalents are enforced by the Layer-2 pre-write
--    validator, §6, not the DDL). SET NOT NULL is idempotent on non-null / empty
--    tables, so re-applying is a no-op (idempotent-check green).
alter table indonesian.affixed_form_pairs
  alter column grammar_pattern_id set not null,
  alter column affix_type         set not null,
  alter column productive         set not null;

comment on column indonesian.affixed_form_pairs.affix_type is
  'Discriminator: prefix | suffix | confix | reduplication. Drives renderability of decompose/build-confix drills (data-architect M1).';
comment on column indonesian.affixed_form_pairs.allomorph_class is
  'Nasalization/allomorph class; non-null only for meN-/peN-. Seeds the rule note shown on link/produce exercises. Nasalization is drilled at the rule tier (grammar_pattern_src, ADR 0017); this column spawns no per-pair capability (the recognise_allomorph_from_root_cap was retired 2026-06-17).';
comment on column indonesian.affixed_form_pairs.grammar_pattern_id is
  'FK to the affix RULE pattern. Resolved by the CAPABILITY stage (projectAffixedFormPairs) from the authored slug in lesson_section_affixed_pairs.pattern_source_ref via patternIdsBySlug. The rule->application prerequisite (ADR 0018) is built from this.';

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
-- SM-2 / learner-state teardown (#150, 2026-07-01) — epic #98 final teardown.
-- ============================================================
-- The capability model (ADR 0001-0004) + the two-axis analytics redesign
-- (#206-229) replaced the pre-capability SM-2 / learner-state tables. Census
-- 2026-07-01: 0 live app readers, 0 live app writers (the review_events pre-clear
-- in capability-stage/adapter.ts was retired in the same PR), and NO foreign key
-- points INTO any of them (all their FKs are outbound), so CASCADE loses no data
-- in a surviving table. Build-stage disposable data (CLAUDE.md Operating Context);
-- pg_dump archived before drop. CASCADE covers each table's own index/grant/
-- RLS/policy + its outbound FKs.
--
-- learner_item_state + the leaderboard view were already dropped live by #212;
-- their CREATE blocks are now excised above (never create-then-dropped), so this
-- file no longer mentions them — nothing to drop here for those two.
drop table if exists indonesian.learner_skill_state cascade;
drop table if exists indonesian.review_events cascade;
drop table if exists indonesian.lesson_progress cascade;

-- ============================================================
-- Collections: selectable word-lists (2026-06-13 spec, slice 1 — additive schema)
-- ============================================================
-- One mechanism for frequency bands ('top-1000') and thematic packs ('holiday').
-- A collection word schedules identically to a lesson word (FSRS is source-agnostic,
-- ADR 0003/0006); word identity is already global (learning_items.UNIQUE(normalized_text)),
-- so overlap is shared, not duplicated. This is selection + activation + grouping,
-- not a scheduling change. See docs/plans/2026-06-13-collections-and-frequency-bands.md.

create table if not exists indonesian.collections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                 -- 'top-1000', 'holiday'
  name         text not null,
  kind         text not null check (kind in ('frequency', 'theme')),
  rank_cutoff  int,                                  -- set iff kind='frequency'; INCLUSIVE (rank <= cutoff)
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  check (kind <> 'frequency' or rank_cutoff is not null)
);
comment on column indonesian.collections.rank_cutoff is
  'Frequency-band threshold, INCLUSIVE: an item is a member iff learning_items.frequency_rank <= rank_cutoff. NULL for kind=theme.';

-- Reciprocal of the inline `check (kind <> 'frequency' or rank_cutoff is not null)`:
-- a theme collection must NOT carry a rank_cutoff (the comment promises NULL for
-- kind=theme). Added as a standalone idempotent constraint (data-architect m1).
alter table indonesian.collections
  drop constraint if exists collections_rank_cutoff_theme_null;
alter table indonesian.collections
  add constraint collections_rank_cutoff_theme_null
  check (kind <> 'theme' or rank_cutoff is null);

-- ONE membership table for ALL collections.
--   frequency: rows GENERATED by the pipeline from frequency_rank <= rank_cutoff (a projection)
--   theme:     rows AUTHORED directly
create table if not exists indonesian.collection_items (
  collection_id    uuid not null references indonesian.collections(id) on delete cascade,
  learning_item_id uuid not null references indonesian.learning_items(id) on delete cascade,
  primary key (collection_id, learning_item_id)
);
create index if not exists collection_items_item_idx
  on indonesian.collection_items(learning_item_id);

create table if not exists indonesian.learner_collection_activation (
  user_id       uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references indonesian.collections(id) on delete cascade,
  activated_at  timestamptz not null default now(),
  primary key (user_id, collection_id)
);
create index if not exists learner_collection_activation_user_idx
  on indonesian.learner_collection_activation(user_id);

-- RLS + grants. Content tables: world-readable to authenticated, pipeline (service_role) writes.
grant select on indonesian.collections, indonesian.collection_items to authenticated;
alter table indonesian.collections enable row level security;
alter table indonesian.collection_items enable row level security;
drop policy if exists "collections read" on indonesian.collections;
create policy "collections read" on indonesian.collections for select to authenticated using (true);
drop policy if exists "collection_items read" on indonesian.collection_items;
create policy "collection_items read" on indonesian.collection_items for select to authenticated using (true);
grant all on indonesian.collections, indonesian.collection_items to service_role;

-- Per-learner selection: owner-read, writes only via the set_collection_activation RPC.
alter table indonesian.learner_collection_activation enable row level security;
drop policy if exists "collection activation owner read" on indonesian.learner_collection_activation;
create policy "collection activation owner read"
  on indonesian.learner_collection_activation for select to authenticated using (user_id = auth.uid());
grant select on indonesian.learner_collection_activation to authenticated;
revoke insert, update, delete on indonesian.learner_collection_activation from authenticated;
grant all on indonesian.learner_collection_activation to service_role;

-- Selection write path — mirrors set_lesson_activation. This RPC is the future
-- entitlement chokepoint (monetization paywall lands here); keep it clean.
create or replace function indonesian.set_collection_activation(
  p_user_id uuid, p_collection_id uuid, p_activated boolean
) returns void language plpgsql security definer
set search_path = indonesian, public as $$
begin
  if p_user_id is null or p_collection_id is null or p_activated is null then
    raise exception 'set_collection_activation requires p_user_id, p_collection_id, p_activated';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from indonesian.collections where id = p_collection_id) then
    raise exception 'set_collection_activation collection not found: %', p_collection_id;
  end if;
  if p_activated then
    insert into indonesian.learner_collection_activation(user_id, collection_id)
    values (p_user_id, p_collection_id) on conflict do nothing;
  else
    delete from indonesian.learner_collection_activation
    where user_id = p_user_id and collection_id = p_collection_id;
  end if;
end $$;
revoke all on function indonesian.set_collection_activation(uuid, uuid, boolean) from public;
grant execute on function indonesian.set_collection_activation(uuid, uuid, boolean) to authenticated, service_role;

-- ── Reading harvest: words a learner tapped "+ leren" in the Lezen reader ─────
-- Reader Phase 2 Slice 3 (ADR 0023/0024 plan §4). A plain per-learner MEMBERSHIP
-- row — NOT learner_capability_state — so it needs no security-definer RPC and
-- raises no ADR-0004 concern. Distinct from learner_collection_activation: that
-- activates whole collections (no per-item grain), this is one tapped word.
--
-- Eligibility: lib/collections/membership.resolveActivatedMemberRefs UNIONs each
-- harvested item's source_ref ('learning_items/' || normalized_text) into the set
-- that feeds the session-builder activatedCollectionRefs gate-OR (pedagogy.ts:410).
-- FSRS state is then minted by the EXISTING review-commit path on first review
-- (activation_source='review_processor', already within the CHECK) — no new RPC,
-- no activation_source widening, no direct learner_capability_state write.
--
-- Owner-RLS, learner-WRITABLE DIRECTLY (membership only): owner SELECT + INSERT.
-- No UPDATE/DELETE for authenticated (un-harvest is out of scope; re-tap is an
-- idempotent ON CONFLICT DO NOTHING).
create table if not exists indonesian.learner_reading_harvest (
  user_id          uuid not null references auth.users(id) on delete cascade,
  learning_item_id uuid not null references indonesian.learning_items(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (user_id, learning_item_id)
);
create index if not exists learner_reading_harvest_user_idx
  on indonesian.learner_reading_harvest(user_id);

alter table indonesian.learner_reading_harvest enable row level security;
drop policy if exists "reading harvest owner read" on indonesian.learner_reading_harvest;
create policy "reading harvest owner read"
  on indonesian.learner_reading_harvest for select to authenticated using (user_id = auth.uid());
drop policy if exists "reading harvest owner insert" on indonesian.learner_reading_harvest;
create policy "reading harvest owner insert"
  on indonesian.learner_reading_harvest for insert to authenticated with check (user_id = auth.uid());
grant select, insert on indonesian.learner_reading_harvest to authenticated;
revoke update, delete on indonesian.learner_reading_harvest from authenticated;
grant all on indonesian.learner_reading_harvest to service_role;

-- ── Word mnemonics: the stubborn-word memory-hook workshop ───────────────────
-- docs/plans/2026-07-05-stubborn-word-mnemonic-workshop.md §5. One free-text
-- association per (learner, source_ref) — word-level, shared across every
-- capability of that word. Keyed by source_ref (not a learning_items uuid): it
-- covers vocab/grammar/affix with one shape and is stable across content
-- republishes (learning_items uuids are rewritten from staging on publish).
create table if not exists indonesian.learner_word_mnemonics (
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_ref  text not null,          -- the stubborn item's identity (e.g. 'learning_items/pintar',
                                       -- 'lesson-6/pattern/...') — the SAME key deriveStubbornWords emits
  note        text not null check (char_length(note) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, source_ref)
);
-- No separate (user_id) index: the PK (user_id, source_ref) is a leftmost-prefix
-- btree that already serves every `where user_id = auth.uid()` filter + the batch fetch.

comment on column indonesian.learner_word_mnemonics.note is
  'Learner-authored memory hook. May contain personal facts by design (self-reference prompt); cascade-deleted with the account.';

alter table indonesian.learner_word_mnemonics enable row level security;

drop policy if exists "word mnemonics owner all" on indonesian.learner_word_mnemonics;
create policy "word mnemonics owner all"
  on indonesian.learner_word_mnemonics for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on indonesian.learner_word_mnemonics to authenticated;
grant all on indonesian.learner_word_mnemonics to service_role;

-- ── Common Words: the hidden gap-word home lesson (spec §4.4) ────────────────
-- Frequency words not in any coursebook lesson need a lesson home (ADR 0006:
-- learning_capabilities.lesson_id is NOT NULL for non-podcast caps). A single
-- hidden lesson in a dedicated 'common-words' module at a sentinel order_index
-- keeps the invariant intact while staying clear of the sign-in backfill
-- (auto-activates order_index in (1,2,3) only) and the UNIQUE(module_id, order_index)
-- constraint. is_hidden keeps it out of get_lessons_overview. Its caps surface
-- ONLY via collection activation (the intended gating). Idempotent.
insert into indonesian.lessons (module_id, level, title, description, order_index, is_hidden)
values ('common-words', 'A1', 'Common Words', 'Hidden home for frequency-band gap words (collections feature).', 999, true)
on conflict (module_id, order_index) do nothing;

-- ── Collections coverage read-model (foundation doc §4, ADR 0015) ────────────
-- One row per published collection with the learner's per-collection progress:
-- total member words + how many are "known". Server-side aggregation (small
-- result) — feeds the Woordenlijsten checklist + the Home goal widget, and is why
-- lib/collections needs no analytics import.
--
-- "Known word" = the word's RECEPTIVE RECOGNITION capability (text_recognition)
-- is mastered. Rationale: receptive recognition is the floor of "I know this
-- word" (ADR 0007 receptive-before-productive) and the most intuitive basis for
-- a coverage number ("you know 72/100"). To make it STRICTER (all caps mastered)
-- change the join + bool_or below. The mastered test reuses _mastery_label — the
-- SAME parity-guarded predicate as get_lessons_overview (foundation doc M1) — so
-- no second mastery definition is introduced (no new parity test needed).
--
-- The item-cap join uses the §5 resolution path: source_ref = 'learning_items/' ||
-- normalized_text (the HC9 invariant). SECURITY INVOKER over RLS-protected tables.
drop function if exists indonesian.get_collections_overview(uuid);
create or replace function indonesian.get_collections_overview(p_user_id uuid)
returns table (
  collection_id uuid,
  slug text,
  name text,
  kind text,
  rank_cutoff int,
  is_activated boolean,
  total_words int,
  known_words int,
  eligible_words int
)
language sql stable security invoker as $$
  with member_recognition as (
    select ci.collection_id,
           ci.learning_item_id,
           bool_or(
             -- args: (p_review_count, p_lapse, p_consec, p_stability, p_last_reviewed, p_now)
             indonesian._mastery_label(
               s.review_count, s.lapse_count, s.consecutive_failure_count,
               s.stability, s.last_reviewed_at, now()
             ) = 'mastered'
           ) as is_known,
           -- eligible-now = the §5 pedagogy gate-OR, per member word: it is already
           -- schedulable iff it has a ready/published item cap whose introducing
           -- lesson is activated, OR the word is a member of ANY activated collection
           -- (so an activated list's own members all count as eligible → gain=0).
           -- "Gain" (computed by the reader) = total_words − eligible_words.
           bool_or(
             exists (
               select 1
               from indonesian.learning_capabilities c2
               join indonesian.learner_lesson_activation lla
                 on lla.lesson_id = c2.lesson_id and lla.user_id = p_user_id
               where c2.source_kind = 'vocabulary_src'
                 and c2.source_ref = 'learning_items/' || li.normalized_text
                 and c2.readiness_status = 'ready'
                 and c2.publication_status = 'published'
                 and c2.retired_at is null
             )
             or exists (
               select 1
               from indonesian.collection_items ci2
               join indonesian.learner_collection_activation lca
                 on lca.collection_id = ci2.collection_id and lca.user_id = p_user_id
               where ci2.learning_item_id = ci.learning_item_id
             )
           ) as is_eligible
    from indonesian.collection_items ci
    join indonesian.learning_items li on li.id = ci.learning_item_id
    left join indonesian.learning_capabilities c
      on c.source_kind = 'vocabulary_src'
      and c.capability_type = 'recognise_meaning_from_text_cap'
      and c.source_ref = 'learning_items/' || li.normalized_text
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    group by ci.collection_id, ci.learning_item_id, li.normalized_text
  ),
  coverage as (
    select collection_id,
           count(*)::int as total_words,
           count(*) filter (where is_known)::int as known_words,
           count(*) filter (where is_eligible)::int as eligible_words
    from member_recognition
    group by collection_id
  )
  select
    col.id,
    col.slug,
    col.name,
    col.kind,
    col.rank_cutoff,
    exists (
      select 1 from indonesian.learner_collection_activation lca
      where lca.user_id = p_user_id and lca.collection_id = col.id
    ) as is_activated,
    coalesce(cov.total_words, 0) as total_words,
    coalesce(cov.known_words, 0) as known_words,
    coalesce(cov.eligible_words, 0) as eligible_words
  from indonesian.collections col
  left join coverage cov on cov.collection_id = col.id
  where col.is_published
  order by col.rank_cutoff nulls last, col.slug;
$$;
grant execute on function indonesian.get_collections_overview(uuid) to authenticated;

-- get_text_coverage — per-learner reading coverage for the Lezen reader (PRD #299).
-- Given a text's distinct content tokens (client-normalised via itemSlug), returns
-- the subset the learner already "knows", so lib/reading can order texts most-
-- comprehensible-first. The "known" predicate is a COMPOSITE of two REUSED rules
-- (ADR 0015 — parity-guarded by TWO assertions in
-- scripts/__tests__/lessons-overview-mastery-parity.test.ts):
--   (i)  practiced threshold: coalesce(review_count, 0) >= 1
--        — PRACTICED_MIN_REVIEWS, canonical at src/lib/lessons/overview.ts:16.
--   (ii) recognition-cap scoping: capability_type = 'recognise_meaning_from_text_cap'
--        — the LIVE literal, shared with get_collections_overview (§8 _cap rename
--        is in flight; this is the un-renamed live value).
-- Reading deliberately uses the SOFTER 'practiced' bar (a word reviewed >=1x counts
-- as recognisable for reading), NOT collections' 'mastered'. See CONTEXT.md
-- "Reading-coverage known (recognisable)".
-- SECURITY INVOKER: the learner_capability_state join runs under the caller's RLS,
-- so only the caller's own state rows are visible (passing another user's p_user_id
-- yields all-unknown, never a leak) — same pattern as get_collections_overview.
create or replace function indonesian.get_text_coverage(p_user_id uuid, p_tokens text[])
returns json
language sql stable security invoker as $$
  with toks as (
    select distinct lower(btrim(t)) as token
    from unnest(p_tokens) as t
    where btrim(t) <> ''
  ),
  known as (
    select tk.token
    from toks tk
    join indonesian.learning_items li on li.normalized_text = tk.token
    join indonesian.learning_capabilities c
      on c.source_kind = 'vocabulary_src'
      and c.capability_type = 'recognise_meaning_from_text_cap'
      and c.source_ref = 'learning_items/' || li.normalized_text
    join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    where coalesce(s.review_count, 0) >= 1
    group by tk.token
  )
  select json_build_object(
    'known_tokens', coalesce((select json_agg(token) from known), '[]'::json)
  );
$$;
grant execute on function indonesian.get_text_coverage(uuid, text[]) to authenticated;

-- ============================================================================
-- Pre-cloud-preview hardening item 1: invite-gated signup
-- ============================================================================
-- Self-signup via `supabase.auth.signUp` is gated behind a one-time-use invite
-- code, consumed by the `signup-with-invite` edge function (which creates the
-- user via the GoTrue admin API, not the public signup endpoint). This table
-- is a SERVICE-ROLE-ONLY surface: no RLS policies, no anon/authenticated
-- grants — the edge function is the only caller, using the service key.
create table if not exists indonesian.signup_invite_codes (
  code           text primary key,
  uses_remaining int not null default 1 check (uses_remaining >= 0),
  note           text,
  created_at     timestamptz not null default now()
);

alter table indonesian.signup_invite_codes enable row level security;
-- No policies — service_role bypasses RLS; anon/authenticated have zero grants.
grant all on indonesian.signup_invite_codes to service_role;

-- redeem_invite_code: atomically decrements uses_remaining if > 0, returning
-- whether a code was found and had capacity. Called by the signup-with-invite
-- edge function BEFORE creating the GoTrue user — redeem-first means a code
-- can never be spent twice by two concurrent signups, and an invalid/exhausted
-- code fails fast with no GoTrue call. On a subsequent user-creation failure
-- the edge function calls restore_invite_code to give the code back.
create or replace function indonesian.redeem_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_found boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'redeem_invite_code requires a trusted service role caller';
  end if;

  update indonesian.signup_invite_codes
  set uses_remaining = uses_remaining - 1
  where code = p_code and uses_remaining > 0
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;

revoke all on function indonesian.redeem_invite_code(text) from public;
grant execute on function indonesian.redeem_invite_code(text) to service_role;

-- restore_invite_code: increments uses_remaining back after a redeem whose
-- follow-up GoTrue user creation failed (e.g. a typo'd, already-registered
-- email) — so the invite code isn't burned for nothing.
create or replace function indonesian.restore_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_found boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'restore_invite_code requires a trusted service role caller';
  end if;

  update indonesian.signup_invite_codes
  set uses_remaining = uses_remaining + 1
  where code = p_code
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;

revoke all on function indonesian.restore_invite_code(text) from public;
grant execute on function indonesian.restore_invite_code(text) to service_role;

-- ============================================================================
-- Pre-cloud-preview hardening item 7: session-data narrowing RPC
-- (docs/plans/2026-07-02-session-data-narrowing-rpc.md)
-- ============================================================================
-- get_session_build_data — narrowed session-build snapshot. Replaces the
--   six-query client-side fan-out in
--   src/lib/session-builder/adapter.ts loadCapabilitySessionData.
--
-- Returns ONE jsonb object (scalar → immune to PGRST_DB_MAX_ROWS row truncation,
--   the failure mode HC39 was added to catch — HC39 is repointed below).
-- SECURITY INVOKER: RLS on the owner-scoped tables keeps every read scoped to
--   auth.uid(); a spoofed p_user_id yields an empty snapshot, not a leak.
--
-- Candidate-set sufficiency predicate (the ADR-0015 mirrored predicate; canonical
--   definition in CONTEXT.md → "Session-build candidate sufficiency"):
--     a ready+published+live cap is returned iff ANY of
--       (A) it has a learner_capability_state row for p_user_id          [all modes]
--       (B) standard mode AND its lesson_id is activated by the learner
--       (C) standard mode AND its source_ref is in the learner's activated
--           collection ∪ reading-harvest member refs
--       (D) standard mode AND its lesson_id IS NULL (podcast carve-out, ADR 0006)
--       (E) scoped mode  AND its source_ref = ANY(p_selected_source_refs)
--   Proof that this is sufficient for every downstream consumer: see the spec's
--   consumer→fields table. Key facts: (1) due caps come from ANY lesson (dueFilter
--   ignores activation) → clause (A) returns ALL state rows unconditionally;
--   (2) prerequisite/unlock satisfaction reads learner STATE rows only, and a
--   prereq is satisfiable only if the learner already has a state for it — which
--   (A) always returns — so no prerequisite cap needs importing into the catalog.
--
-- p_day_start: the browser-local midnight boundary (adapter.ts computes it via
--   `new Date(request.now); .setHours(0,0,0,0)`, then `.toISOString()`) so the
--   seed for sibling-burying matches the learner's wall-clock day exactly. Defaults
--   to server-day (date_trunc('day', now())) for callers that don't pass it.
--
-- Idempotent. DROP FUNCTION first (safe idiom; also required if the return
-- signature ever changes — CREATE OR REPLACE cannot alter it).
-- ============================================================================
drop function if exists indonesian.get_session_build_data(uuid, text, text[], timestamptz);
create or replace function indonesian.get_session_build_data(
  p_user_id             uuid,
  p_mode                text,
  p_selected_source_refs text[]      default '{}',
  p_day_start           timestamptz  default date_trunc('day', now())
)
returns jsonb
language sql stable security invoker
set search_path = indonesian, public
as $$
  with
  activated_lessons as (
    select lla.lesson_id
    from indonesian.learner_lesson_activation lla
    where lla.user_id = p_user_id
  ),
  -- Collections ∪ reading harvest, resolved to the item source_ref form
  -- 'learning_items/<normalized_text>' (HC9 invariant). Mirrors
  -- lib/collections/membership.resolveActivatedMemberRefs — NO is_published
  -- filter (that function does not filter it either).
  activated_member_refs as (
    select 'learning_items/' || li.normalized_text as source_ref
    from indonesian.collection_items ci
    join indonesian.learner_collection_activation lca
      on lca.collection_id = ci.collection_id and lca.user_id = p_user_id
    join indonesian.learning_items li on li.id = ci.learning_item_id
    union
    select 'learning_items/' || li.normalized_text
    from indonesian.learner_reading_harvest lrh
    join indonesian.learning_items li on li.id = lrh.learning_item_id
    where lrh.user_id = p_user_id
  ),
  user_states as (
    select s.*
    from indonesian.learner_capability_state s
    where s.user_id = p_user_id
  ),
  candidate_caps as (
    select c.*
    from indonesian.learning_capabilities c
    where c.readiness_status = 'ready'
      and c.publication_status = 'published'
      and c.retired_at is null
      and (
        exists (select 1 from user_states us where us.capability_id = c.id)      -- (A)
        or (p_mode = 'standard' and (
             c.lesson_id in (select lesson_id from activated_lessons)            -- (B)
             or c.source_ref in (select source_ref from activated_member_refs)   -- (C)
             or c.lesson_id is null                                              -- (D)
           ))
        or (p_mode <> 'standard' and c.source_ref = any(p_selected_source_refs)) -- (E)
      )
  ),
  reviewed_today as (
    -- Local-midnight boundary supplied by the client (p_day_start) so the seed
    -- for sibling-burying matches the learner's wall-clock day exactly, as the
    -- current adapter does (adapter.ts:277-278). now() here would be UTC-midnight
    -- and drift from the browser-local day.
    select distinct e.capability_id
    from indonesian.capability_review_events e
    where e.user_id = p_user_id
      and e.created_at >= p_day_start
  )
  select jsonb_build_object(
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'canonical_key', c.canonical_key,
        'source_kind', c.source_kind,
        'source_ref', c.source_ref,
        'capability_type', c.capability_type,
        'direction', c.direction,
        'modality', c.modality,
        'learner_language', c.learner_language,
        'projection_version', c.projection_version,
        'readiness_status', c.readiness_status,
        'publication_status', c.publication_status,
        'lesson_id', c.lesson_id,
        'prerequisite_keys', coalesce(c.prerequisite_keys, array[]::text[])
      )) from candidate_caps c
    ), '[]'::jsonb),
    'learner_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', us.id,
        'user_id', us.user_id,
        'capability_id', us.capability_id,
        'canonical_key_snapshot', us.canonical_key_snapshot,
        'activation_state', us.activation_state,
        'stability', us.stability,
        'difficulty', us.difficulty,
        'last_reviewed_at', us.last_reviewed_at,
        'next_due_at', us.next_due_at,
        'review_count', us.review_count,
        'lapse_count', us.lapse_count,
        'consecutive_failure_count', us.consecutive_failure_count,
        'state_version', us.state_version
      )) from user_states us
    ), '[]'::jsonb),
    'activated_lesson_ids', coalesce((
      select jsonb_agg(lesson_id) from activated_lessons
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'order_index', l.order_index))
      from indonesian.lessons l
    ), '[]'::jsonb),
    'reviewed_today_capability_ids', coalesce((
      select jsonb_agg(capability_id) from reviewed_today
    ), '[]'::jsonb),
    'activated_member_refs', coalesce((
      select jsonb_agg(source_ref) from activated_member_refs
    ), '[]'::jsonb)
  );
$$;

revoke all on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) from public;
grant execute on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) to authenticated, service_role;

-- ============================================================================
-- GDPR retention (Art. 5(1)(e) storage limitation) — 2026-07-02
-- Daily purge of the two diagnostic tables that survive account deletion via
-- ON DELETE SET NULL (error_logs :315, capability_resolution_failure_events
-- :1266). 90-day rolling window for both. pg_cron extension already installed
-- (:524). Idempotent: unschedule-if-exists (swallow the "job not found" error)
-- then schedule under a fixed jobname.
-- ============================================================================

do $$ begin perform cron.unschedule('gdpr-retention-purge'); exception when others then null; end $$;

select cron.schedule(
  'gdpr-retention-purge',
  '0 3 * * *',                         -- 03:00 daily (server tz), low-traffic
  $job$
    delete from indonesian.error_logs
      where created_at < now() - interval '90 days';
    delete from indonesian.capability_resolution_failure_events
      where created_at < now() - interval '90 days';
  $job$
);

-- Retention-job health probe. SECURITY DEFINER because cron.* is owned by the
-- superuser and not exposed to PostgREST; mirrors schema_health() (:511-517).
create or replace function indonesian.retention_cron_health()
returns table (jobname text, active boolean, last_status text, last_run_at timestamptz)
language sql
security definer
set search_path = pg_catalog, cron
as $$
  select j.jobname,
         j.active,
         d.status,
         d.start_time
  from cron.job j
  left join lateral (
    select status, start_time
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'gdpr-retention-purge';
$$;

revoke all on function indonesian.retention_cron_health() from public;
-- service_role ONLY (data-architect G3): check-supabase-deep (service key) is
-- the sole caller in the repo; an authenticated grant would expose cron-job
-- telemetry to every browser session for no consumer.
grant execute on function indonesian.retention_cron_health() to service_role;

-- ============================================================================
-- Bet-1 slice 2 — placement probe FSRS seeding (ADR 0026)
-- ============================================================================
-- docs/plans/2026-07-06-loanword-bridge-placement-onboarding.md §4.2-§4.5.
-- ADR 0026 (docs/adr/0026-placement-seeding-is-a-permitted-second-learner-
-- state-writer.md): placement is a permitted SECOND writer of
-- learner_capability_state, scoped to exactly: CREATE-only (insert-only-if-
-- absent, NEVER update), NEVER writes capability_review_events, auth.uid()-
-- scoped. The Review Processor (commit_capability_answer_report above)
-- remains the sole MUTATOR of any row that already exists — placement can
-- only bring a (learner, capability) pair from no-row to one clean seeded row.

-- activation_source='placement' is STICKY FOREVER (the commit RPC's
-- `activation_source = coalesce(activation_source, ...)` above never
-- overwrites a non-null activation_source) — it must NOT be read as "still
-- unreviewed"; last_reviewed_at IS NULL is the unreviewed signal (ADR 0026's
-- load-bearing invariant).
alter table indonesian.learner_capability_state
  drop constraint if exists learner_capability_state_activation_source_check;
alter table indonesian.learner_capability_state
  add constraint learner_capability_state_activation_source_check
    check (activation_source in ('review_processor','admin_backfill','legacy_migration','placement'));

-- apply_placement_result: auth.uid()-scoped (no user_id argument), SECURITY
-- DEFINER, one transaction, two effects.
--
-- Effect 1 (activations): resolve band slugs -> collection ids, then call the
--   EXISTING set_collection_activation RPC (above, ~:3595) once per band —
--   never a second hand-rolled learner_collection_activation writer. Without
--   this effect, seeded state is invisible to the session-builder eligibility
--   gate — seeding alone schedules nothing.
--
-- Effect 2 (FSRS seed): judged-known words = p_known_texts (the items the
--   learner directly answered correctly) UNION every learning_item that is a
--   member of a fully-cleared band collection. For every ready/published/
--   live vocabulary_src capability of a judged-known word — UNIFORM across
--   all of that word's item capabilities, per spec §4.2 — INSERT a
--   learner_capability_state row ONLY IF ABSENT (ON CONFLICT DO NOTHING on
--   the (user_id, capability_id) unique key). NEVER an UPDATE: a learner who
--   already has real review history for a word keeps it completely untouched.
--
--   Seed shape is data-architect-specified (spec §4.3):
--     - review_count=3 lands in 'strengthening' in BOTH mastery readers
--       (:2167 here, masteryModel.ts:194) — never 'introduced' (needs
--       review_count=0), never 'mastered' (needs >=4) — mastery is EARNED by
--       real reviews, never claimed by a probe.
--     - stability/difficulty are the FROZEN constants derived once from the
--       real FSRS engine — src/lib/placement/seedConstants.ts is the SINGLE
--       SOURCE OF TRUTH; scripts/__tests__/placement-seed-parity.test.ts
--       asserts these literals match it. Never re-implement FSRS math here.
--     - last_reviewed_at=NULL is the reversibility + honesty key: exactly the
--       rows `delete from learner_capability_state where
--       activation_source='placement' and last_reviewed_at is null` would
--       remove (ADR 0026's reversibility predicate — no placement_runs audit
--       table needed). It flips exactly once, irreversibly, on the row's
--       first real commit.
--     - next_due_at is jittered 1..7 days out so a probe (or a retake) can't
--       spike the review queue onto a single day.
--     - fsrs_state_json mirrors the flattened columns (camelCase, the same
--       shape commit_capability_answer_report writes to this column on a real
--       commit) carrying every key that RPC's required-keys check enforces —
--       so the existing generic read-and-resubmit path round-trips with zero
--       placement-specific client code. (Nothing currently reads this column
--       back — session-builder/adapter.ts:55 and the edge function both read
--       the flattened columns directly — but the mirror keeps this row
--       internally consistent with every other write to this table.)
--
-- Idempotent + additive: re-running (e.g. a probe retake) can only ADD rows.
create or replace function indonesian.apply_placement_result(
  p_band_slugs text[],
  p_known_texts text[]
) returns void
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_user uuid;
  v_band record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'apply_placement_result requires an authenticated caller';
  end if;

  -- Effect 1: activations — one call to the existing RPC per resolved band.
  for v_band in
    select id from indonesian.collections where slug = any(coalesce(p_band_slugs, '{}'))
  loop
    perform indonesian.set_collection_activation(v_user, v_band.id, true);
  end loop;

  -- Effect 2: FSRS seed.
  with judged_known_texts as (
    select unnest(coalesce(p_known_texts, '{}'::text[])) as normalized_text
    union
    select li.normalized_text
    from indonesian.collection_items ci
    join indonesian.collections col on col.id = ci.collection_id
    join indonesian.learning_items li on li.id = ci.learning_item_id
    where col.slug = any(coalesce(p_band_slugs, '{}'))
  ),
  judged_known_caps as (
    select distinct c.id as capability_id, c.canonical_key
    from indonesian.learning_capabilities c
    join judged_known_texts jkt
      on c.source_ref = 'learning_items/' || jkt.normalized_text
    where c.source_kind = 'vocabulary_src'
      and c.readiness_status = 'ready'
      and c.publication_status = 'published'
      and c.retired_at is null
  )
  insert into indonesian.learner_capability_state (
    user_id,
    capability_id,
    canonical_key_snapshot,
    activation_state,
    activation_source,
    review_count,
    lapse_count,
    consecutive_failure_count,
    state_version,
    stability,
    difficulty,
    last_reviewed_at,
    next_due_at,
    fsrs_state_json
  )
  select
    v_user,
    jkc.capability_id,
    jkc.canonical_key,
    'active',
    'placement',
    3,
    0,
    0,
    0,
    63.14846207,
    5.33894278,
    null,
    now() + (1 + floor(random() * 7)) * interval '1 day',
    jsonb_build_object(
      'stateVersion', 0,
      'activationState', 'active',
      'activationSource', 'placement',
      'reviewCount', 3,
      'lapseCount', 0,
      'consecutiveFailureCount', 0,
      'stability', 63.14846207,
      'difficulty', 5.33894278,
      'lastReviewedAt', null,
      'nextDueAt', null,
      'fsrsAlgorithmVersion', 'ts-fsrs:language-learning-v1'
    )
  from judged_known_caps jkc
  on conflict (user_id, capability_id) do nothing;
end;
$$;

revoke all on function indonesian.apply_placement_result(text[], text[]) from public;
grant execute on function indonesian.apply_placement_result(text[], text[]) to authenticated, service_role;

-- ============================================================================
-- Spreektaal slice 1+2 — register-pair carrier (docs/plans/2026-07-09-spreektaal
-- -lesson-woven-core.md §3.2, §8). Build order step 1 of 6.
-- ============================================================================
-- Two nullable columns, each on a carrier table and its destination table,
-- riding the loan_source_nl groove exactly (ADR 0012: the Capability Stage
-- reads item data only from the DB, never from staging):
--   staging item register/registerCounterpart fields
--     -> lesson_section_item_rows.register / register_counterpart (carrier)
--     -> TypedItemRow (capability-stage/loadFromDb.ts)
--     -> vocab projector generation carve-out + prerequisite wiring (§4)
--     -> upsertLearningItemIdempotent -> learning_items.register / register_counterpart
-- The CHECK is deliberately single-valued today (NOT a finished taxonomy) —
-- widening it (e.g. adding 'gaul') is a cheap additive migration when
-- Jakarta-register content arrives (§3.2).
alter table indonesian.lesson_section_item_rows
  add column if not exists register text null check (register in ('informal')),
  add column if not exists register_counterpart text null;

comment on column indonesian.lesson_section_item_rows.register is
  'NULL = formal/default; ''informal'' marks a spreektaal item. Carrier for learning_items.register across the lesson->capability DB boundary (spec §3.2). Lesson-stage-written from staging; capability-stage-read.';
comment on column indonesian.lesson_section_item_rows.register_counterpart is
  'base_text of the formal twin (e.g. ''tidak'' on the nggak row); NULL otherwise. Carrier for learning_items.register_counterpart (spec §3.2).';

alter table indonesian.learning_items
  add column if not exists register text null check (register in ('informal')),
  add column if not exists register_counterpart text null;

comment on column indonesian.learning_items.register is
  'NULL = formal/default; ''informal'' marks a spreektaal item (spec §3.2). Pipeline-written from staging every publish, like loan_source_nl -- a direct DB edit is silently clobbered next publish.';
comment on column indonesian.learning_items.register_counterpart is
  'base_text of the formal twin for an informal item; NULL otherwise (spec §3.2). Resolved to a learning_items row via the canonical itemSlug() mint, never a bespoke lowercase/trim.';

-- ============================================================================
-- Mastery evidence RPC narrowing
-- (docs/plans/2026-07-11-mastery-evidence-rpc-narrowing.md)
-- ============================================================================
-- Fixes C1 (silent truncation): masteryModel.ts's allLearnerEvidence and
--   getFunnelSeries fetched ALL learner_capability_state rows and the
--   learner's LIFETIME capability_review_events via plain client-side
--   .select().eq('user_id') reads -- no limit, no pagination, no RPC. Past
--   PGRST_DB_MAX_ROWS (~1000 default) the result silently truncates and every
--   mastery surface computes wrong numbers. Same bug class already fixed for
--   the session-builder by get_session_build_data (above, :4083-4198) -- both
--   new functions copy its idiom verbatim: scalar jsonb (immune to row
--   truncation), `language sql stable security invoker`,
--   `set search_path = indonesian, public`, DROP-first, revoke-from-public +
--   grant-to-authenticated,service_role.
-- ============================================================================

-- get_mastery_evidence -- replaces allLearnerEvidence's four client reads
--   (learner_capability_state -> capabilityRowsByIds -> listActivatedLessons ->
--   lessonOrderMap) with one scalar snapshot.
--
-- PARITY IS SACRED (do not "improve" these clauses without re-deriving the
-- plan's parity argument):
--   - `states` is unfiltered beyond user_id -- every learner_capability_state
--     row for p_user_id, matching allLearnerEvidence's pre-cutover select.
--   - `capabilities` filters ONLY retired_at is null -- NOT readiness or
--     publication status. The pre-cutover capabilityRowsByIds includes
--     reviewed-but-since-unpublished caps in evidence; matching this keeps
--     mastery counts stable across the cutover.
--
-- SECURITY INVOKER: RLS on the owner-scoped tables (learner_capability_state,
-- learner_lesson_activation) keeps every read scoped to auth.uid(); a spoofed
-- p_user_id yields an empty snapshot, not a leak (get_session_build_data
-- precedent, :4055-4056). `lessons` is authenticated-readable (lessons_read
-- policy).
drop function if exists indonesian.get_mastery_evidence(uuid);
create or replace function indonesian.get_mastery_evidence(
  p_user_id uuid
)
returns jsonb
language sql stable security invoker
set search_path = indonesian, public
as $$
  with
  user_states as (
    select s.capability_id, s.review_count, s.lapse_count,
           s.consecutive_failure_count, s.stability, s.last_reviewed_at
    from indonesian.learner_capability_state s
    where s.user_id = p_user_id
  ),
  evidence_caps as (
    select c.id, c.canonical_key, c.source_kind, c.source_ref, c.capability_type,
           c.modality, c.readiness_status, c.publication_status, c.lesson_id
    from indonesian.learning_capabilities c
    where c.retired_at is null
      and exists (select 1 from user_states us where us.capability_id = c.id)
  ),
  activated_lessons as (
    select lla.lesson_id
    from indonesian.learner_lesson_activation lla
    where lla.user_id = p_user_id
  )
  select jsonb_build_object(
    'states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'capability_id', us.capability_id,
        'review_count', us.review_count,
        'lapse_count', us.lapse_count,
        'consecutive_failure_count', us.consecutive_failure_count,
        'stability', us.stability,
        'last_reviewed_at', us.last_reviewed_at
      )) from user_states us
    ), '[]'::jsonb),
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'canonical_key', c.canonical_key,
        'source_kind', c.source_kind,
        'source_ref', c.source_ref,
        'capability_type', c.capability_type,
        'modality', c.modality,
        'readiness_status', c.readiness_status,
        'publication_status', c.publication_status,
        'lesson_id', c.lesson_id
      )) from evidence_caps c
    ), '[]'::jsonb),
    'activated_lesson_ids', coalesce((
      select jsonb_agg(lesson_id) from activated_lessons
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'order_index', l.order_index))
      from indonesian.lessons l
    ), '[]'::jsonb)
  );
$$;

revoke all on function indonesian.get_mastery_evidence(uuid) from public;
grant execute on function indonesian.get_mastery_evidence(uuid) to authenticated, service_role;

-- get_funnel_series_events -- replaces getFunnelSeries' lifetime
-- capability_review_events fetch with a BOUNDED baseline + window pair.
-- baseline union window_events is EXACT for deriveFunnelSeries (which only
-- ever needs the latest event per capability <= some cutoff >= p_window_start)
-- -- see the plan §2 for the equivalence proof. Do NOT parse state_after_json
-- in SQL -- it is a raw passthrough; the camelCase unpack stays entirely in
-- masteryModel.ts.
--
-- Tiebreak: "latest event per capability" orders created_at desc, id desc --
-- mirrored by the TS-side sort (masteryModel.ts deriveFunnelSeries) so
-- same-instant events resolve identically on both sides (the one ADR-0015
-- mirrored predicate this plan introduces).
drop function if exists indonesian.get_funnel_series_events(uuid, timestamptz);
create or replace function indonesian.get_funnel_series_events(
  p_user_id       uuid,
  p_window_start  timestamptz
)
returns jsonb
language sql stable security invoker
set search_path = indonesian, public
as $$
  with
  baseline_events as (
    select distinct on (e.capability_id)
      e.id, e.capability_id, e.created_at, e.state_after_json
    from indonesian.capability_review_events e
    where e.user_id = p_user_id
      and e.created_at < p_window_start
    order by e.capability_id, e.created_at desc, e.id desc
  ),
  window_events as (
    select e.id, e.capability_id, e.created_at, e.state_after_json
    from indonesian.capability_review_events e
    where e.user_id = p_user_id
      and e.created_at >= p_window_start
  )
  select jsonb_build_object(
    'baseline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'capability_id', b.capability_id,
        'created_at', b.created_at,
        'state_after_json', b.state_after_json
      )) from baseline_events b
    ), '[]'::jsonb),
    'window_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'capability_id', w.capability_id,
        'created_at', w.created_at,
        'state_after_json', w.state_after_json
      )) from window_events w
    ), '[]'::jsonb)
  );
$$;

revoke all on function indonesian.get_funnel_series_events(uuid, timestamptz) from public;
grant execute on function indonesian.get_funnel_series_events(uuid, timestamptz) to authenticated, service_role;

-- ============================================================================
-- 2026-07-12 drift reconciliation
-- ============================================================================
-- The 2026-07-11 live-vs-repo audit found objects that exist in the live DB
-- but were never folded into this file (they predate the 2026-05-08
-- "scripts/migrations/*.sql is paper-trail only" rule). A fresh-DB replay of
-- this file -- the planned cloud migration -- would silently omit them and
-- diverge from what the homelab instance actually runs. Two independent
-- pieces, landed together under one date (a third piece, the schema_health()
-- grant narrowing per audit medium #9, is an in-place edit on the existing
-- schema_health() block above, not repeated here):
--   A. FOLD content_units + capability_content_units (alive, pipeline-written;
--      capability_content_units is read by masteryModel.ts:1200) plus the
--      stable_slug/immutable_unaccent helpers and the expression index built
--      on them (learning_items_slug_idx) -- load-bearing, never folded.
--   B. RETIRE seven dead pre-redesign analytics RPCs (zero consumers).
-- ============================================================================

-- ── A1. content_units + capability_content_units. Source DDL taken from
-- scripts/migrations/2026-04-25-content-units-lesson-blocks.sql and verified
-- against the live schema (openbrain live-object audit, 2026-07-11); the
-- table/index/policy shapes matched exactly, so no live-vs-paper-trail
-- disagreement was found for these two objects. lesson_page_blocks, the third
-- table in that same paper-trail file, is deliberately NOT folded here -- it
-- was already retired via `drop table if exists indonesian.lesson_page_blocks
-- cascade;` in the PR 5 (2026-05-25) block above and stays dropped.
create table if not exists indonesian.content_units (
  id uuid primary key default gen_random_uuid(),
  content_unit_key text not null unique,
  source_ref text not null,
  source_section_ref text not null,
  unit_kind text not null check (unit_kind in ('lesson_section','learning_item','grammar_pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')),
  unit_slug text not null,
  display_order integer not null,
  payload_json jsonb not null default '{}',
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_ref, source_section_ref, unit_slug)
);

create index if not exists content_units_source_idx
  on indonesian.content_units(source_ref, source_section_ref);

create table if not exists indonesian.capability_content_units (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  content_unit_id uuid not null references indonesian.content_units(id) on delete cascade,
  relationship_kind text not null check (relationship_kind in ('introduced_by','practiced_by','assessed_by','referenced_by')),
  created_at timestamptz not null default now(),
  unique(capability_id, content_unit_id, relationship_kind)
);

create index if not exists capability_content_units_content_unit_idx
  on indonesian.capability_content_units(content_unit_id);

alter table indonesian.content_units enable row level security;
alter table indonesian.capability_content_units enable row level security;

drop policy if exists "content units authenticated read" on indonesian.content_units;
create policy "content units authenticated read"
  on indonesian.content_units for select
  to authenticated
  using (true);

drop policy if exists "capability content units authenticated read" on indonesian.capability_content_units;
create policy "capability content units authenticated read"
  on indonesian.capability_content_units for select
  to authenticated
  using (true);

-- schema usage for authenticated/service_role is already granted earlier in
-- this file -- not repeated here. Content tables: world-readable to
-- authenticated (matches the `collections`/`collection_items` idiom above);
-- pipeline (service_role) writes. No INSERT/UPDATE/DELETE was ever granted to
-- authenticated on either table, so there is nothing to revoke.
grant select on indonesian.content_units to authenticated;
grant select on indonesian.capability_content_units to authenticated;
grant all on indonesian.content_units to service_role;
grant all on indonesian.capability_content_units to service_role;

-- ── A2. stable_slug / immutable_unaccent + the expression index built on them
-- (learning_items_slug_idx). Function bodies folded verbatim from the live
-- pg_get_functiondef() output (openbrain live-object audit, 2026-07-11).
-- Order matters: CREATE EXTENSION -> immutable_unaccent -> stable_slug -> the
-- index; learning_items itself already exists far earlier in this file.
--
-- The CREATE EXTENSION line below is NOT part of the brief's live-DDL dump
-- (pg_get_functiondef only dumps function bodies) but is a genuine
-- prerequisite found while folding: immutable_unaccent's body casts the
-- literal 'unaccent' to regdictionary, which Postgres resolves against
-- pg_ts_dict AT FUNCTION-CREATE TIME for `language sql` bodies
-- (check_function_bodies=on by default) -- on a fresh DB without the
-- extension, `CREATE FUNCTION indonesian.immutable_unaccent` itself fails
-- with "text search dictionary unaccent does not exist", not just a later
-- call. WITH SCHEMA storage is load-bearing for a fresh replay: the function
-- body calls storage.unaccent() schema-qualified, and the live DB has the
-- extension installed in the storage schema (verified via pg_extension,
-- 2026-07-12) -- an unqualified CREATE EXTENSION would land it in public on
-- a fresh DB and the function body would still fail to validate. Idempotent:
-- IF NOT EXISTS no-ops on the live homelab install regardless of schema.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA storage;

CREATE OR REPLACE FUNCTION indonesian.immutable_unaccent(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'storage', 'public', 'pg_catalog'
AS $function$
  SELECT storage.unaccent('unaccent'::regdictionary, p_text);
$function$;

CREATE OR REPLACE FUNCTION indonesian.stable_slug(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
    regexp_replace(
      lower(indonesian.immutable_unaccent(p_text)),
      '[^a-z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  );
$function$;

create index if not exists learning_items_slug_idx
  on indonesian.learning_items using btree (indonesian.stable_slug(base_text));

create index if not exists idx_item_answer_variants_learning_item_id
  on indonesian.item_answer_variants using btree (learning_item_id);

-- ── B. Retire seven dead pre-redesign analytics RPCs (grep-verified zero
-- consumers across src/ pages+components, supabase/functions, and scripts/;
-- the only references left anywhere in the repo were the
-- src/services/learnerProgressService.ts methods that called them -- deleted
-- in this same change, along with the now-empty service file and its test --
-- and the standalone paper-trail file
-- scripts/migrations/2026-05-01-learner-progress-functions.sql they were
-- never folded out of). They are relics of the pre-redesign analytics surface
-- (Dashboard / Voortgang / lapsing-card / weekly-goal reads); the two-axis
-- analytics redesign (PRs #213-234) replaced their functionality with
-- lib/analytics/* and the get_mastery_evidence / get_funnel_series_events
-- RPCs above. Two are provably broken on the live DB today, not just unused:
-- get_vulnerable_capabilities references the DROPPED item_meanings table
-- (Slice 4a teardown above) and errors at runtime; get_memory_health and
-- get_recall_accuracy_by_direction filter on extinct capability_type names
-- ('text_recognition' / 'form_recall') that no live capability carries.
-- Mirrors the table-retirement style used elsewhere in this file (drop-if-
-- exists with the exact live signature, one why-comment block per group).
drop function if exists indonesian.get_lapse_prevention(uuid);
drop function if exists indonesian.get_lapsing_count(uuid);
drop function if exists indonesian.get_memory_health(uuid);
drop function if exists indonesian.get_recall_accuracy_by_direction(uuid);
drop function if exists indonesian.get_review_forecast(uuid, integer, text);
drop function if exists indonesian.get_review_latency_stats(uuid);
drop function if exists indonesian.get_vulnerable_capabilities(uuid, integer);
