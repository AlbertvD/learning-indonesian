# Learning Indonesian — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the Indonesian language tutor from homelab-configs into a standalone `learning-indonesian` repo, replacing the custom Express/Prisma backend with the shared self-hosted Supabase instance.

**Architecture:** Frontend-only React app (no custom backend). All data goes directly to Supabase using the JS client. The `indonesian` Postgres schema isolates tables from other apps. Auth is shared with family-hub (same Supabase instance, same user accounts).

**Tech Stack:** Bun, React 19, Vite, TypeScript, Mantine UI v8, Zustand 5, @supabase/ssr (cookie-based auth), vite-plugin-pwa, Tabler Icons

---

## Prerequisites (homelab-configs changes — do before Task 2)

Two changes are required in the `homelab-configs` repo before the app can talk to Supabase. Both cause a brief restart of the Supabase stack — safe to do, family-hub recovers instantly.

**1. Add `indonesian` schema to PostgREST**

File: `services/supabase/docker-compose.yml`

```yaml
# Change:
PGRST_DB_SCHEMAS: public,storage,graphql_public
# To:
PGRST_DB_SCHEMAS: public,storage,graphql_public,indonesian
```

Commit and push → Portainer restarts PostgREST automatically.

**2. Add CORS origins for the Indonesian app to Kong**

File: `services/supabase/kong/kong.yml` — add to the `origins` list:

```yaml
- https://indonesian.duin.home
- http://indonesian.duin.home
```

Also add `http://localhost:5173` if not already present (for local dev).

Commit and push → GitHub Actions rebuilds the Kong image → Portainer redeploys Kong.

**3. Allow redirect URIs for all duin.home subdomains in GoTrue**

File: `services/supabase/docker-compose.yml` — add/update in the `supabase-auth` environment:

```yaml
GOTRUE_URI_ALLOW_LIST: "https://*.duin.home"
```

This allows auth redirects to land on any `*.duin.home` subdomain — required for the cookie-based SSO pattern. Reference: splinterlabs uses `GOTRUE_URI_ALLOW_LIST=https://*.ntry.home` for the same reason.

Commit and push → Portainer restarts GoTrue.

---

## Reference

- Supabase URL: `https://api.supabase.duin.home`
- Anon key: see `/Users/albert/home/family-hub/.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`)
- Family-hub Dockerfile pattern: `/Users/albert/home/family-hub/Dockerfile`
- Family-hub Supabase client: `/Users/albert/home/family-hub/src/integrations/supabase/client.ts`
- Current app source: `/Users/albert/home/homelab-configs/Indonesian app/`
- Homelab docker-compose pattern: `/Users/albert/home/homelab-configs/services/family-hub/docker-compose.yml`

---

## Task 1: Create GitHub Repo + Scaffold Project

**Files:**
- Create: `~/learning-indonesian/` (new repo root)
- Create: `~/learning-indonesian/package.json`
- Create: `~/learning-indonesian/vite.config.ts`
- Create: `~/learning-indonesian/tsconfig.json`
- Create: `~/learning-indonesian/index.html`
- Create: `~/learning-indonesian/.gitignore`
- Create: `~/learning-indonesian/.env.local`

**Step 1: Create GitHub repo**

```bash
gh repo create learning-indonesian --public --description "Indonesian language tutor — React + Supabase"
```

**Step 2: Scaffold with Vite**

```bash
cd ~
bun create vite learning-indonesian --template react-ts
cd learning-indonesian
bun install
```

**Step 3: Install dependencies**

```bash
# Frontend dependencies (supabase/ssr for cookie-based auth, NOT supabase-js)
bun add @supabase/ssr @mantine/core @mantine/hooks @mantine/form @mantine/notifications @mantine/modals @tabler/icons-react zustand react-router-dom
bun add -d @types/node vite-plugin-pwa

# Scripts-only dependency (service role, no cookie management needed)
bun add @supabase/supabase-js
```

Note: `@supabase/supabase-js` is only used by scripts in `scripts/`. The frontend client uses `@supabase/ssr` (`createBrowserClient`). Both packages will be installed — this is intentional.

**Step 4: Configure `.gitignore`**

```
node_modules/
dist/
.env.local
.env
```

**Step 5: Create `.env.local`**

```
VITE_SUPABASE_URL=https://api.supabase.duin.home
VITE_SUPABASE_ANON_KEY=<anon key from family-hub .env>
```

**Step 6: Replace `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Learning Indonesian',
        short_name: 'Indonesian',
        theme_color: '#1a1b1e',
        background_color: '#1a1b1e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

**Step 7: Init git and push**

```bash
git init
git add .
git commit -m "feat: initial project scaffold"
git remote add origin git@github.com:<username>/learning-indonesian.git
git push -u origin main
```

Expected: repo visible on GitHub with initial scaffold.

---

## Task 2: Supabase Client + Schema Migration Script

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `scripts/migrate.ts`

**Step 1: Install @supabase/ssr**

```bash
bun add @supabase/ssr
```

Uses cookie-based session storage scoped to `.duin.home`, enabling future SSO with family-hub when it migrates to the same pattern. Reference: `/Users/albert/home/splinterlabs/homelab-ai/openbrain/ui/src/lib/supabase/client.ts`

**Step 2: Create Supabase client**

```typescript
// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    // In dev (localhost), omit cookieOptions entirely — browsers reject cookies
    // with domain=.duin.home when the page is at localhost, silently dropping auth.
    cookieOptions: import.meta.env.DEV ? undefined : {
      domain: '.duin.home',
      path: '/',
      sameSite: 'lax' as const,
      secure: true,
    },
  }
)
```

**Step 3: Create migration script**

The migration script writes `scripts/migration.sql` and prints instructions. There is no `exec_sql` built-in RPC — the script is just a SQL writer.

```typescript
// scripts/migrate.ts
// Run with: bun scripts/migrate.ts
// Then execute scripts/migration.sql via psql or Supabase dashboard SQL editor

const sql = `
-- Create schema
CREATE SCHEMA IF NOT EXISTS indonesian;

-- User profiles (readable by all — used by leaderboard and sharing UI)
-- Do NOT join auth.users in views — PostgREST cannot access the auth schema
CREATE TABLE IF NOT EXISTS indonesian.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
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
  order_index integer NOT NULL DEFAULT 0
);

-- Vocabulary (admin-managed, public read)
CREATE TABLE IF NOT EXISTS indonesian.vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indonesian text NOT NULL,
  english text NOT NULL,
  dutch text,
  example_sentence text,
  module_id text,
  level text,
  tags text[] DEFAULT '{}'
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
  created_at timestamptz DEFAULT now()
);

-- User progress (per-user write, all-user read for leaderboard)
-- vocabulary_count and streak_days are NOT stored here — they are computed in the
-- leaderboard view from user_vocabulary and learning_sessions to avoid staleness.
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
  -- custom_key prevents duplicate custom words (vocabulary_id is nullable,
  -- and NULLs are never considered equal in UNIQUE constraints)
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
  -- Note: duration_seconds is a generated column — cannot be set manually.
  -- Sessions with no ended_at after 2+ hours are treated as abandoned and
  -- excluded from leaderboard totals.
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

-- anki_cards stores card content only. SM-2 review state lives in card_reviews
-- so that shared cards work correctly — each user has their own review state.
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

-- Leaderboard view (anchored to profiles, not auth.users)
-- Excludes abandoned sessions (ended_at IS NULL AND started_at < now() - interval '2 hours')
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

-- Error logs (write-only for authenticated users)
CREATE TABLE IF NOT EXISTS indonesian.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page text,
  action text,
  error_message text,
  error_code text,
  created_at timestamptz DEFAULT now()
);

-- Explicit grants — no GRANT ALL (would override selective grants and hide misconfigured RLS)
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

-- RLS Policies: profiles (all read, own write)
CREATE POLICY "profiles_read" ON indonesian.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write" ON indonesian.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- RLS Policies: admin content (public read, admin write)
-- USING restricts SELECT/UPDATE/DELETE. WITH CHECK restricts INSERT. Both needed for FOR ALL.
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

-- RLS Policies: user progress (own write, all read)
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

-- RLS Policies: card sets (owner + shared visibility)
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

-- card_reviews: own row only
CREATE POLICY "card_reviews_read" ON indonesian.card_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "card_reviews_write" ON indonesian.card_reviews FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- error_logs: insert-only
CREATE POLICY "error_logs_insert" ON indonesian.error_logs FOR INSERT TO authenticated WITH CHECK (true);
`

await Bun.write('scripts/migration.sql', sql)
console.log('Migration SQL written to scripts/migration.sql')
console.log('')
console.log('To run the migration, use one of:')
console.log('  Option A (psql): PGPASSWORD=<pw> psql -h api.supabase.duin.home -U postgres -f scripts/migration.sql')
console.log('  Option B: Paste scripts/migration.sql into Supabase dashboard > SQL Editor > Run')
```

**Step 4: Run the migration**

```bash
# Generate migration.sql
bun scripts/migrate.ts

# Then run it — Option A (psql, recommended):
PGPASSWORD=<postgres_password> psql -h api.supabase.duin.home -U postgres -f scripts/migration.sql

# Option B: paste scripts/migration.sql into Supabase dashboard > SQL Editor
```

Expected: `indonesian` schema with all tables visible in Supabase dashboard.

**Step 5: Commit**

```bash
git add src/lib/supabase.ts scripts/migrate.ts
git commit -m "feat: supabase client and database schema migration"
```

---

## Task 2b: Logger Utility

**Files:**
- Create: `src/lib/logger.ts`

**Step 1: Create logger**

```typescript
// src/lib/logger.ts
import { supabase } from '@/lib/supabase'

interface LogErrorParams {
  page: string
  action: string
  error: unknown
}

export async function logError({ page, action, error }: LogErrorParams): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code ?? null

  // Fire-and-forget — never throws
  supabase
    .schema('indonesian')
    .from('error_logs')
    .insert({
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      page,
      action,
      error_message: message,
      error_code: code,
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error('[logger] Failed to write error log:', dbErr.message)
    })
}
```

**Step 2: Write a unit test**

```typescript
// src/__tests__/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logError } from '@/lib/logger'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnValue({ then: vi.fn() }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

describe('logError', () => {
  it('does not throw even if insert fails', async () => {
    await expect(logError({ page: 'test', action: 'test', error: new Error('oops') })).resolves.not.toThrow()
  })
})
```

**Step 3: Run test**

```bash
bun run test
```
Expected: 1 test passing.

**Step 4: Commit**

```bash
git add src/lib/logger.ts src/__tests__/logger.test.ts
git commit -m "feat: add error logging utility to Supabase error_logs table"
```

---

## Task 3: Auth Store

**Files:**
- Create: `src/stores/authStore.ts`
- Create: `src/types/auth.ts`

**Step 1: Create auth types**

```typescript
// src/types/auth.ts
export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  isAdmin: boolean
}
```

**Step 2: Create auth store**

```typescript
// src/stores/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/auth'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const isAdmin = await checkAdmin(session.user.id)
      set({
        user: session.user,
        profile: toProfile(session.user, isAdmin),
        loading: false,
      })
    } else {
      set({ loading: false })
    }

    // Don't store or return the subscription — the interface declares Promise<void>
    // and returning a cleanup function causes a TypeScript error. The HMR listener
    // accumulation is a dev-only edge case and acceptable.
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // Use setTimeout(0) to avoid Supabase auth deadlock when fetching
        // user data immediately after sign-in inside onAuthStateChange.
        setTimeout(async () => {
          // Upsert profile on every sign-in, not just sign-up. Users migrated
          // from the old app sign in but never sign up — without this they have
          // no profiles row and are invisible on the leaderboard.
          await supabase
            .schema('indonesian')
            .from('profiles')
            .upsert(
              { id: session.user!.id, display_name: session.user!.user_metadata?.full_name ?? null },
              { onConflict: 'id', ignoreDuplicates: true }
            )
          const isAdmin = await checkAdmin(session.user!.id)
          set({ user: session.user, profile: toProfile(session.user!, isAdmin) })
        }, 0)
      } else {
        set({ user: null, profile: null })
      }
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    // Profile row is created in onAuthStateChange (which fires after signUp),
    // so no separate insert needed here.
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))

async function checkAdmin(userId: string): Promise<boolean> {
  // Must use .schema('indonesian').from('user_roles') — NOT .from('indonesian.user_roles')
  // The dot-notation form queries a table literally named "indonesian.user_roles" in
  // the public schema, which doesn't exist and always returns null.
  const { data } = await supabase
    .schema('indonesian')
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  return !!data
}

function toProfile(user: User, isAdmin: boolean): UserProfile {
  return {
    id: user.id,
    email: user.email!,
    fullName: user.user_metadata?.full_name ?? null,
    isAdmin,
  }
}
```

**Step 3: Create login and register pages**

Copy from existing app at `/Users/albert/home/homelab-configs/Indonesian app/frontend/src/pages/Login.tsx` and `Register.tsx`, replacing:
- `authService.login()` → `useAuthStore().signIn()`
- `authService.register()` → `useAuthStore().signUp()`
- `authService.logout()` → `useAuthStore().signOut()`

**Step 4: Create `ProtectedRoute` component**

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <Center h="100vh"><Loader /></Center>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
// Import at top: import { Center, Loader } from '@mantine/core'
```

**Step 5: Commit**

```bash
git add src/stores/authStore.ts src/types/auth.ts src/components/ProtectedRoute.tsx src/pages/
git commit -m "feat: auth store and login/register pages via Supabase Auth"
```

---

## Task 4: App Shell (Router + Layout)

**Files:**
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `src/components/Layout.tsx`

**Step 1: Create App.tsx with all routes**

Mirror the current app's route structure. Copy `App.tsx` from the existing frontend and update imports to remove Axios-based auth guard.

Key routes to keep:
- `/` — Dashboard/Home
- `/login`, `/register`
- `/cards`, `/review`, `/practice`
- `/sets`, `/sets/:setId`
- `/lessons`, `/lesson/:lessonId`
- `/podcasts`, `/podcasts/:podcastId`
- `/leaderboard` ← new
- `/profile`

**Step 2: Initialize auth in main.tsx**

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

useAuthStore.getState().initialize()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MantineProvider defaultColorScheme="dark">
        <Notifications />
        <App />
      </MantineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

**Step 3: Copy Layout component from existing app, remove Axios auth header logic**

**Step 4: Commit**

```bash
git add src/App.tsx src/main.tsx src/components/Layout.tsx
git commit -m "feat: app shell with router and layout"
```

---

## Task 5: Card Sets + Flashcards Service

**Files:**
- Create: `src/services/cardService.ts`
- Create: `src/stores/cardStore.ts`
- Create: `src/types/cards.ts`

**Step 1: Create card types**

Copy `AnkiCard`, `CardSet` types from `/Users/albert/home/homelab-configs/Indonesian app/frontend/src/types/`. Remove any backend-specific fields.

**Step 2: Create card service**

```typescript
// src/services/cardService.ts
import { supabase } from '@/lib/supabase'
import type { AnkiCard, CardSet } from '@/types/cards'

export const cardService = {
  async getCardSets(): Promise<CardSet[]> {
    // No .or() filter — RLS already enforces all three visibility rules
    // (private=owner only, shared=owner+listed users, public=everyone).
    // An application-level filter here would be narrower than RLS and hide
    // shared sets from the users they were shared with.
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_sets')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async createCardSet(name: string, description: string, userId: string): Promise<CardSet> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_sets')
      .insert({ name, description, owner_id: userId, visibility: 'private' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getDueCards(userId: string): Promise<AnkiCard[]> {
    // SM-2 state is in card_reviews (not anki_cards) so shared cards work correctly.
    // Each user has their own review state row per card.
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_reviews')
      .select('*, anki_cards!inner(*, card_sets!inner(*))')
      .eq('user_id', userId)
      .lte('next_review_at', new Date().toISOString())
      .order('next_review_at')
    if (error) throw error
    return data
  },

  async updateCardReview(cardId: string, userId: string, sm2: {
    easiness_factor: number
    interval_days: number
    repetitions: number
    next_review_at: string
    last_reviewed_at: string
  }): Promise<void> {
    // Upsert into card_reviews — creates the row on first review
    const { error } = await supabase
      .schema('indonesian')
      .from('card_reviews')
      .upsert({ card_id: cardId, user_id: userId, ...sm2 }, { onConflict: 'card_id,user_id' })
    if (error) throw error
  },
}
```

**Step 3: Copy Zustand card store from existing app, replace Axios calls with `cardService.*`**

**Step 4: Copy Cards, Review, Practice, Sets pages from existing app, update service imports**

**Step 5: Commit**

```bash
git add src/services/cardService.ts src/stores/cardStore.ts src/types/cards.ts src/pages/
git commit -m "feat: flashcard and card set service with Supabase"
```

---

## Task 6: SM-2 Spaced Repetition (Client-Side)

**Files:**
- Create: `src/lib/sm2.ts`

**Step 1: Copy SM-2 logic from existing backend**

Source: `/Users/albert/home/homelab-configs/Indonesian app/backend/src/services/spacedRepetitionService.ts`

```typescript
// src/lib/sm2.ts
export interface SM2Result {
  easinessFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: Date
}

export function calculateNextReview(
  quality: 'again' | 'hard' | 'good' | 'easy',
  currentEF: number,
  currentInterval: number,
  currentRepetitions: number
): SM2Result {
  const qualityScore = { again: 0, hard: 1, good: 2, easy: 3 }[quality]

  let ef = currentEF + (0.1 - (3 - qualityScore) * (0.08 + (3 - qualityScore) * 0.02))
  ef = Math.max(1.3, ef)

  let interval: number
  let repetitions: number

  if (qualityScore === 0) {
    interval = 1
    repetitions = 0
  } else if (currentRepetitions === 0) {
    interval = 1
    repetitions = 1
  } else if (currentRepetitions === 1) {
    interval = 6
    repetitions = 2
  } else {
    interval = Math.round(currentInterval * ef)
    if (qualityScore === 3) interval = Math.round(interval * 1.3)
    repetitions = currentRepetitions + 1
  }

  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)

  return { easinessFactor: ef, intervalDays: interval, repetitions, nextReviewAt }
}
```

**Step 2: Wire into review page**

In the review page, after a card is graded, call `calculateNextReview()` client-side and then `cardService.updateCardReview()` with the result. SM-2 state lives in `card_reviews`, not `anki_cards` — this keeps shared card sets working correctly (each user has independent review progress).

**Step 3: Commit**

```bash
git add src/lib/sm2.ts
git commit -m "feat: SM-2 spaced repetition algorithm (client-side)"
```

---

## Task 7: Progress Tracking + Learning Sessions

**Files:**
- Create: `src/services/progressService.ts`
- Create: `src/stores/progressStore.ts`
- Create: `src/lib/session.ts`

**Step 1: Create progress service**

```typescript
// src/services/progressService.ts
import { supabase } from '@/lib/supabase'

export const progressService = {
  async getUserProgress(userId: string) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertProgress(userId: string, updates: Record<string, unknown>) {
    const { error } = await supabase
      .schema('indonesian')
      .from('user_progress')
      .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() })
    if (error) throw error
  },

  async markLessonComplete(userId: string, lessonId: string, sectionsCompleted: string[]) {
    const { error } = await supabase
      .schema('indonesian')
      .from('lesson_progress')
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        completed_at: new Date().toISOString(),
        sections_completed: sectionsCompleted,
      })
    if (error) throw error
  },
}
```

**Step 2: Create session tracker**

```typescript
// src/lib/session.ts
import { supabase } from '@/lib/supabase'

export async function startSession(userId: string, type: 'lesson' | 'review' | 'podcast' | 'practice'): Promise<string> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .insert({ user_id: userId, session_type: type, started_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}
```

**Step 3: Integrate session tracking into pages**

In the Review, Lesson, and Podcast pages: call `startSession()` on mount, `endSession()` on unmount (use `useEffect` cleanup).

**Important — session end reliability:** Tab close, browser crash, or hard navigation will not reliably trigger the `useEffect` cleanup, leaving `ended_at = NULL` for some sessions. The leaderboard view already handles this by excluding sessions where `ended_at IS NULL AND started_at < now() - interval '2 hours'`. Do not attempt to patch this with `beforeunload` — it is unreliable for async calls and the leaderboard exclusion is sufficient for a homelab app.

**Step 4: Commit**

```bash
git add src/services/progressService.ts src/stores/progressStore.ts src/lib/session.ts
git commit -m "feat: progress tracking and learning session recording"
```

---

## Task 8: Lessons Service + Pages

**Files:**
- Create: `src/services/lessonService.ts`
- Modify: `src/pages/Lessons.tsx`
- Modify: `src/pages/Lesson.tsx`

**Step 1: Create lesson service**

```typescript
// src/services/lessonService.ts
import { supabase } from '@/lib/supabase'

export const lessonService = {
  async getLessons() {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('*, lesson_sections(*)')
      .order('order_index')
    if (error) throw error
    return data
  },

  async getUserLessonProgress(userId: string) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data
  },
}
```

**Step 2: Copy Lessons and Lesson pages from existing app, replace Axios calls with `lessonService.*`**

**Step 3: Commit**

```bash
git add src/services/lessonService.ts src/pages/Lessons.tsx src/pages/Lesson.tsx
git commit -m "feat: lessons pages with Supabase"
```

---

## Task 9: Podcasts Service + Pages

**Files:**
- Create: `src/services/podcastService.ts`
- Modify: `src/pages/Podcasts.tsx`
- Modify: `src/pages/Podcast.tsx`

**Step 1: Create podcast service**

```typescript
// src/services/podcastService.ts
import { supabase } from '@/lib/supabase'

export const podcastService = {
  async getPodcasts() {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('podcasts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-podcasts')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },
}
```

**Step 2: Copy Podcasts and Podcast pages from existing app, replace Axios calls with `podcastService.*`**

Audio URLs now come from `supabase.storage.getPublicUrl()` instead of a backend endpoint.

**Step 3: Commit**

```bash
git add src/services/podcastService.ts src/pages/Podcasts.tsx src/pages/Podcast.tsx
git commit -m "feat: podcasts pages with Supabase storage"
```

---

## Task 10: Leaderboard Page

**Files:**
- Create: `src/services/leaderboardService.ts`
- Create: `src/pages/Leaderboard.tsx`

**Step 1: Create leaderboard service**

```typescript
// src/services/leaderboardService.ts
import { supabase } from '@/lib/supabase'

// streak_days is NOT a column in the leaderboard view — computing consecutive-day
// streaks requires a window function query and cannot be a simple aggregate.
// days_active is a reasonable proxy and is included instead.
export type LeaderboardMetric = 'total_seconds_spent' | 'lessons_completed' | 'vocabulary_count' | 'days_active'

export const leaderboardService = {
  async getLeaderboard(metric: LeaderboardMetric, limit = 20) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('leaderboard')
      .select('*')
      .order(metric, { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },
}
```

**Step 2: Create Leaderboard page**

Tabs for each metric: Most Time Spent, Most Lessons, Most Words, Longest Streak, Most Consistent. Each tab shows a ranked list using Mantine's `Table` component.

Display time as `Xh Ym` (format from seconds).

**Step 3: Commit**

```bash
git add src/services/leaderboardService.ts src/pages/Leaderboard.tsx
git commit -m "feat: leaderboard page with multiple metrics"
```

---

## Task 11: Card Set Sharing

**Files:**
- Modify: `src/pages/Sets.tsx`
- Modify: `src/pages/Set.tsx`
- Create: `src/components/ShareCardSetModal.tsx`

**Step 1: Add visibility controls to card set creation/edit form**

Add a `SegmentedControl` with `Private | Shared | Public` options.

**Step 2: Create sharing modal**

```typescript
// src/components/ShareCardSetModal.tsx
// Shows current shares, allows adding/removing users by email
// Queries auth.users via a Supabase function or admin-exposed view
```

Note: querying users to share with requires a way to find users by display name. Use the `profiles` table directly — it is already readable by all authenticated users and was created for exactly this purpose. No extra view needed.

```typescript
// Find users to share with by display_name (fuzzy search)
const { data } = await supabase
  .schema('indonesian')
  .from('profiles')
  .select('id, display_name')
  .ilike('display_name', `%${query}%`)
  .limit(10)
```

Email-based lookup is not possible via PostgREST — `auth.users` is not accessible. Users must be found by display name. This is acceptable for a homelab app where all users are known.

**Step 3: Wire share/unshare into card set service**

```typescript
// Add to cardService.ts
async shareCardSet(cardSetId: string, withUserId: string): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('card_set_shares')
    .insert({ card_set_id: cardSetId, shared_with_user_id: withUserId })
  if (error) throw error
},

async unshareCardSet(cardSetId: string, withUserId: string): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('card_set_shares')
    .delete()
    .eq('card_set_id', cardSetId)
    .eq('shared_with_user_id', withUserId)
  if (error) throw error
},
```

**Step 4: Commit**

```bash
git add src/components/ShareCardSetModal.tsx src/pages/Sets.tsx src/pages/Set.tsx src/services/cardService.ts
git commit -m "feat: card set sharing with visibility controls"
```

---

## Task 12: Seed Scripts

**Files:**
- Create: `scripts/seed-lessons.ts`
- Create: `scripts/seed-vocabulary.ts`
- Create: `scripts/seed-podcasts.ts`
- Create: `scripts/data/lessons.ts`
- Create: `scripts/data/vocabulary.ts`

**Step 1: Create data files from existing curriculum**

Port content from the existing seed scripts in `/Users/albert/home/homelab-configs/Indonesian app/backend/prisma/`:

| Source file | Target | Content |
|-------------|--------|---------|
| `seed-lesson1-cards.ts`, `seed-vocabulary.ts` | `scripts/data/vocabulary.ts` | ~199 vocabulary items across lessons 1-3 |
| `seed-lesson.ts` | `scripts/data/lessons.ts` | 56 translation exercises, lesson structure |
| `seed-lesson1-podcast.ts`, `seed-lesson3-podcast.ts`, `seed-podcast-hub.ts` | `scripts/data/podcasts.ts` | 3 podcast entries with transcripts |

Remove Prisma-specific fields (userId, cardSetId, etc.) and reshape to match the Supabase `indonesian` schema.

**Audio files:** The `.mp3` files are currently at `../course material source/` relative to the old backend. Copy them into `content/lessons/` and `content/podcasts/` in this repo (gitignored) before running `seed-podcasts.ts`.

**Step 2: Create seed-lessons.ts**

```typescript
// scripts/seed-lessons.ts
import { createClient } from '@supabase/supabase-js'
import { lessons } from './data/lessons'

const supabase = createClient(
  'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY!
)

for (const lesson of lessons) {
  // onConflict targets the natural key — data files don't need explicit UUIDs,
  // and re-running the seed won't create duplicates.
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .upsert(lesson, { onConflict: 'module_id,order_index' })
    .select('id')
    .single()
  if (error) { console.error('Failed:', lesson.title, error.message); continue }
  console.log('Upserted:', lesson.title, data.id)
}
```

**Step 3: Create seed-podcasts.ts with storage upload**

```typescript
// scripts/seed-podcasts.ts
// Reads audio files from a local directory, uploads to Supabase storage, then inserts metadata
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'fs'

const supabase = createClient(
  'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY!
)

const audioDir = process.env.AUDIO_DIR! // path to local podcast audio files

for (const file of readdirSync(audioDir)) {
  if (!file.endsWith('.mp3')) continue
  const buffer = readFileSync(`${audioDir}/${file}`)
  const storagePath = `podcasts/${file}`

  const { error: uploadError } = await supabase.storage
    .from('indonesian-podcasts')
    .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) { console.error('Upload failed:', file, uploadError.message); continue }
  console.log('Uploaded:', storagePath)
}
```

**Step 4: Add script to package.json**

```json
"scripts": {
  "migrate": "bun scripts/migrate.ts",
  "seed:lessons": "bun scripts/seed-lessons.ts",
  "seed:vocabulary": "bun scripts/seed-vocabulary.ts",
  "seed:podcasts": "bun scripts/seed-podcasts.ts"
}
```

**Step 5: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: seed scripts for lessons, vocabulary, and podcasts"
```

---

## Task 13: Docker + Homelab Deployment

**Files:**
- Create: `Dockerfile`
- Create: `nginx.conf`
- Create: `homelab-configs/services/learning-indonesian/docker-compose.yml` (in the homelab-configs repo)

**Step 1: Create Dockerfile** (mirrors family-hub exactly)

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
# Bun 1.2+ generates bun.lock (text). Older versions generate bun.lockb (binary).
# Verify which exists in the repo before building: ls bun.lock* in the project root.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN bun run build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Create nginx.conf**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

**Step 3: Create docker-compose.yml in homelab-configs**

```yaml
# homelab-configs/services/learning-indonesian/docker-compose.yml
version: "3.8"

services:
  learning-indonesian:
    image: ghcr.io/<username>/learning-indonesian:latest
    container_name: learning-indonesian
    restart: unless-stopped
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.learning-indonesian.rule=Host(`indonesian.duin.home`)"
      - "traefik.http.routers.learning-indonesian.entrypoints=websecure"
      - "traefik.http.routers.learning-indonesian.tls.certresolver=stepca"
      - "traefik.http.services.learning-indonesian.loadbalancer.server.port=80"

networks:
  proxy:
    external: true
```

**Step 4: Test local Docker build**

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.supabase.duin.home \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon_key> \
  -t learning-indonesian .
docker run -p 8080:80 learning-indonesian
```

Open `http://localhost:8080` — app should load.

**Step 5: Commit**

```bash
git add Dockerfile nginx.conf
git commit -m "feat: docker build for homelab deployment"

# In homelab-configs repo:
git add services/learning-indonesian/
git commit -m "feat: add learning-indonesian service"
```

---

## Storage Bucket Setup (one-time, manual)

Create buckets in Supabase dashboard > Storage:
- `indonesian-lessons` — public bucket
- `indonesian-podcasts` — public bucket

Or via SQL:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('indonesian-lessons', 'indonesian-lessons', true),
  ('indonesian-podcasts', 'indonesian-podcasts', true);
```

---

## Implementation Order Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Repo + scaffold | — |
| 2 | Supabase client + schema | 1 |
| 2b | Logger utility | 2 |
| 3 | Auth store | 2b |
| 4 | App shell | 3 |
| 5 | Cards + sets | 4 |
| 6 | SM-2 algorithm | 5 |
| 7 | Progress + sessions | 4 |
| 8 | Lessons | 7 |
| 9 | Podcasts | 4 |
| 10 | Leaderboard | 7 |
| 11 | Card set sharing | 5 |
| 12 | Seed scripts | 2 |
| 13 | Docker + deployment | all |
