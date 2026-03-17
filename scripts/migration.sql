
-- Create schema
CREATE SCHEMA IF NOT EXISTS indonesian;

-- User profiles (readable by all — used by leaderboard and sharing UI)
-- Do NOT join auth.users in views — PostgREST cannot access the auth schema
CREATE TABLE IF NOT EXISTS indonesian.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

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
  created_at timestamptz DEFAULT now(),
  -- Natural key for seed upserts — avoids needing explicit UUIDs in data files
  UNIQUE(module_id, order_index)
);

CREATE TABLE IF NOT EXISTS indonesian.lesson_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES indonesian.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  -- Natural key for seed upserts
  UNIQUE(lesson_id, order_index)
);

-- Vocabulary (admin-managed, public read)
CREATE TABLE IF NOT EXISTS indonesian.vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL,
  indonesian text NOT NULL,
  english text NOT NULL,
  dutch text,
  example_sentence text,
  module_id text,
  level text,
  tags text[] DEFAULT '{}',
  -- Natural key for seed upserts
  UNIQUE(indonesian, lesson_id)
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
  -- Natural key for seed upserts
  UNIQUE(title)
);

-- User progress (per-user write, all-user read for leaderboard)
CREATE TABLE IF NOT EXISTS indonesian.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level text NOT NULL DEFAULT 'A1',
  current_module_id text,
  grammar_mastery numeric DEFAULT 0,
  last_active_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
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

CREATE TABLE IF NOT EXISTS indonesian.user_vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id uuid REFERENCES indonesian.vocabulary(id) ON DELETE SET NULL,
  custom_indonesian text,
  custom_english text,
  custom_key text GENERATED ALWAYS AS (
    COALESCE(vocabulary_id::text, lower(trim(custom_indonesian || '|' || custom_english)))
  ) STORED,
  learned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, vocabulary_id),
  UNIQUE(user_id, custom_key)
);

CREATE TABLE IF NOT EXISTS indonesian.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('lesson','review','podcast','practice')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (ended_at - started_at))::integer
  ) STORED
);

-- Flashcards (user-created, with sharing)
CREATE TABLE IF NOT EXISTS indonesian.card_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared','public')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS indonesian.card_set_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_set_id uuid NOT NULL REFERENCES indonesian.card_sets(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(card_set_id, shared_with_user_id)
);

CREATE TABLE IF NOT EXISTS indonesian.anki_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_set_id uuid NOT NULL REFERENCES indonesian.card_sets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  notes text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Per-user SM-2 review state — one row per (card, user) pair
CREATE TABLE IF NOT EXISTS indonesian.card_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES indonesian.anki_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  easiness_factor numeric NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 1,
  repetitions integer NOT NULL DEFAULT 0,
  next_review_at timestamptz DEFAULT now(),
  last_reviewed_at timestamptz,
  UNIQUE(card_id, user_id)
);

-- Leaderboard view
CREATE OR REPLACE VIEW indonesian.leaderboard AS
SELECT
  p.id AS user_id,
  p.display_name,
  COALESCE(up.current_level, 'A1') AS current_level,
  COUNT(DISTINCT uv.id) AS vocabulary_count,
  COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL) AS lessons_completed,
  COALESCE(SUM(ls.duration_seconds) FILTER (WHERE ls.duration_seconds IS NOT NULL), 0) AS total_seconds_spent,
  COUNT(DISTINCT DATE(ls.started_at)) FILTER (WHERE ls.duration_seconds IS NOT NULL OR ls.started_at > now() - interval '2 hours') AS days_active
FROM indonesian.profiles p
LEFT JOIN indonesian.user_progress up ON up.user_id = p.id
LEFT JOIN indonesian.user_vocabulary uv ON uv.user_id = p.id
LEFT JOIN indonesian.lesson_progress lp ON lp.user_id = p.id
LEFT JOIN indonesian.learning_sessions ls ON ls.user_id = p.id
  AND (ls.ended_at IS NOT NULL OR ls.started_at > now() - interval '2 hours')
GROUP BY p.id, p.display_name, up.current_level;

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

-- Explicit grants
GRANT USAGE ON SCHEMA indonesian TO authenticated, anon;
GRANT SELECT ON indonesian.lessons TO authenticated;
GRANT SELECT ON indonesian.lesson_sections TO authenticated;
GRANT SELECT ON indonesian.vocabulary TO authenticated;
GRANT SELECT ON indonesian.podcasts TO authenticated;
GRANT SELECT ON indonesian.leaderboard TO authenticated;
GRANT SELECT ON indonesian.profiles TO authenticated;
GRANT INSERT, UPDATE ON indonesian.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.user_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.lesson_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.user_vocabulary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learning_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.card_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.card_set_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.anki_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.card_reviews TO authenticated;
GRANT INSERT ON indonesian.error_logs TO authenticated;

-- RLS Policy: user_roles (self-read only)
CREATE POLICY "user_roles_read" ON indonesian.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON indonesian.user_roles TO authenticated;

-- Enable RLS
ALTER TABLE indonesian.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lesson_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.card_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.card_set_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.anki_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.card_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "profiles_read" ON indonesian.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write" ON indonesian.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "lessons_read" ON indonesian.lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY "lessons_admin_write" ON indonesian.lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "lesson_sections_read" ON indonesian.lesson_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "lesson_sections_admin_write" ON indonesian.lesson_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "vocabulary_read" ON indonesian.vocabulary FOR SELECT TO authenticated USING (true);
CREATE POLICY "vocabulary_admin_write" ON indonesian.vocabulary FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "podcasts_read" ON indonesian.podcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "podcasts_admin_write" ON indonesian.podcasts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "user_progress_read" ON indonesian.user_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_progress_write" ON indonesian.user_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "lesson_progress_read" ON indonesian.lesson_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "lesson_progress_write" ON indonesian.lesson_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_vocabulary_read" ON indonesian.user_vocabulary FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_vocabulary_write" ON indonesian.user_vocabulary FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "learning_sessions_read" ON indonesian.learning_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning_sessions_write" ON indonesian.learning_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "card_sets_read" ON indonesian.card_sets FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'shared' AND EXISTS (
      SELECT 1 FROM indonesian.card_set_shares
      WHERE card_set_id = id AND shared_with_user_id = auth.uid()
    ))
  );
CREATE POLICY "card_sets_write" ON indonesian.card_sets FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "card_set_shares_read" ON indonesian.card_set_shares FOR SELECT TO authenticated
  USING (shared_with_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM indonesian.card_sets WHERE id = card_set_id AND owner_id = auth.uid()
  ));
CREATE POLICY "card_set_shares_write" ON indonesian.card_set_shares FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM indonesian.card_sets WHERE id = card_set_id AND owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM indonesian.card_sets WHERE id = card_set_id AND owner_id = auth.uid()
  ));

CREATE POLICY "anki_cards_read" ON indonesian.anki_cards FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM indonesian.card_sets cs
      WHERE cs.id = card_set_id AND (
        cs.visibility = 'public'
        OR (cs.visibility = 'shared' AND EXISTS (
          SELECT 1 FROM indonesian.card_set_shares
          WHERE card_set_id = cs.id AND shared_with_user_id = auth.uid()
        ))
      )
    )
  );
CREATE POLICY "anki_cards_write" ON indonesian.anki_cards FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "card_reviews_read" ON indonesian.card_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "card_reviews_write" ON indonesian.card_reviews FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "error_logs_insert" ON indonesian.error_logs FOR INSERT TO authenticated WITH CHECK (true);
