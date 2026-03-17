# Learning Indonesian App — New Repository Design

**Date:** 2026-03-16
**Status:** Validated

## Overview

Extract the Indonesian language tutor app from `homelab-configs` into a new standalone repository `learning-indonesian`. Migrate from a custom Express/Prisma/PostgreSQL backend to the shared self-hosted Supabase instance already used by the family-hub app. The new iteration is a frontend-only app — no custom backend.

---

## Goals

- Separate repository: `learning-indonesian` on GitHub
- Frontend-only: React + Vite + TypeScript + Mantine UI + Zustand
- Shared Supabase backend (same instance as family-hub)
- Shared user accounts across apps (one login works everywhere)
- All lesson/podcast/audio content deployed via seed scripts, no admin UI
- Leaderboard with multiple metrics visible to all users
- User-created card sets with visibility controls (private / shared with specific users / public)

---

## Repository Structure

```
learning-indonesian/
├── src/
│   ├── pages/           — same routes as current app
│   ├── components/
│   ├── stores/          — Zustand stores
│   ├── services/        — Supabase queries (replaces Axios services)
│   ├── types/
│   ├── lib/
│   │   └── supabase.ts  — shared Supabase client (mirrors family-hub pattern)
│   └── data/            — curriculum.ts (static, unchanged)
├── scripts/
│   ├── migrate.ts       — creates indonesian schema + all tables in Supabase (run once)
│   ├── seed-lessons.ts  — insert/update lesson content + audio to storage
│   ├── seed-vocabulary.ts
│   └── seed-podcasts.ts — register podcast metadata + upload audio files
├── docs/
│   └── plans/
├── public/              — PWA manifest, icons
├── Dockerfile           — multi-stage: Vite build → Nginx
├── docker-compose.yml   — production homelab deploy via Traefik
├── nginx.conf           — static file serving
├── .env.local           — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (local dev)
├── index.html
├── vite.config.ts
└── package.json
```

---

## Supabase Schema (`indonesian` schema)

### Admin-managed content (public read for all authenticated users)

```sql
lessons           — standardized lesson content
lesson_sections   — sections within a lesson
vocabulary        — standard vocabulary list
podcasts          — podcast metadata, transcript, audio_path (Supabase Storage URL)
```

### User profiles (readable by all authenticated users)

```sql
profiles         — display_name per user, created on signup via auth store
                   used by leaderboard and sharing UI instead of auth.users
                   (auth.users is not accessible to PostgREST)
```

### User progress (readable by all users for leaderboard)

```sql
user_progress       — module/grammar mastery per user
lesson_progress     — which lessons completed, when
user_vocabulary     — words learned per user
learning_sessions   — start_time, end_time, session_type (lesson/review/podcast)
                      total time spent is derived from this table
```

`vocabulary_count` and `streak_days` are **computed in the leaderboard view** from `user_vocabulary` and `learning_sessions` — not stored in `user_progress`. Storing them as denormalized counts would require a maintenance mechanism and drift immediately.

### User-created content (with sharing controls)

```sql
card_sets        — name, owner_id, visibility: 'private' | 'public' | 'shared'
card_set_shares  — card_set_id, shared_with_user_id  (for 'shared' visibility)
anki_cards       — belongs to a card_set; stores card content only (front/back/notes/tags)
card_reviews     — per-user SM-2 state (easiness_factor, interval_days, repetitions,
                   next_review_at); separate from anki_cards so shared sets work correctly —
                   each user has their own review state for the same card
```

### Admin roles

```sql
user_roles       — user_id, role ('admin')  — controls who can run admin operations
```

### Supabase Storage buckets

```
indonesian-lessons   — admin lesson audio files (public read)
indonesian-podcasts  — admin podcast audio files (public read)
```

---

## Leaderboard

No separate table needed. A Supabase **view** over `profiles`, `user_progress`, `lesson_progress`, `user_vocabulary`, and `learning_sessions` exposes public stats per user:

- Display name (from `profiles`, not `auth.users` — PostgREST cannot access `auth.users`)
- Lessons completed (count from `lesson_progress`)
- Words learned (count from `user_vocabulary` — computed in view, not stored)
- Total time spent (sum of `duration_seconds` from completed sessions)
- Current module/level (from `user_progress`)
- Days active (count distinct dates from `learning_sessions`)
- Streak days (computed from `learning_sessions` — consecutive days active)

Sessions with no `ended_at` after 2+ hours are treated as abandoned and excluded from totals.

Multiple leaderboards can be derived from the same data (most time this week, most words, most consistent, etc.) without schema changes.

---

## Auth

- Supabase Auth replaces custom JWT/bcrypt setup entirely
- Same credentials work across family-hub and learning-indonesian
- Supabase JS client manages sessions automatically
- Admin access controlled via `user_roles` table + RLS policies

### RLS Policy Summary

| Table | Read | Write |
|-------|------|-------|
| lessons, podcasts, vocabulary | Any authenticated user | Admin only |
| user_progress, lesson_progress, learning_sessions | Any authenticated user | Row owner only |
| card_sets (public/shared) | Any authenticated user | Owner only |
| card_sets (private) | Owner only | Owner only |
| card_set_shares | Owner + shared user | Owner only |
| anki_cards | Follows card_set visibility | Owner only |
| card_reviews | Owner only (own review state) | Owner only |
| profiles | Any authenticated user | Row owner only |

---

## Content Deployment

All lesson, vocabulary, and podcast content (including audio files) is managed through scripts — no frontend admin UI required.

Scripts use the Supabase **service role key** to bypass RLS:

```bash
npx tsx scripts/migrate.ts        # one-time schema setup
npx tsx scripts/seed-lessons.ts   # deploy lesson content
npx tsx scripts/seed-vocabulary.ts
npx tsx scripts/seed-podcasts.ts  # uploads audio to storage + registers metadata
```

Content data lives as structured TypeScript/JSON files in the repo — version-controlled alongside the app.

Claude Code can assist with writing content data files and running deployment scripts.

---

## Dev Environment

**Local development (no Docker needed):**
```bash
npm run dev    # Vite dev server at localhost:5173
```
`.env.local` points to homelab Supabase instance.

**Homelab deployment:**
- Multi-stage Dockerfile: Node build stage → Nginx serving static files
- Traefik handles TLS and routes `indonesian.duin.home` to the Nginx container
- No database container — Supabase runs separately on homelab
- Same deployment pattern as family-hub

---

## Frontend Changes from Current App

| Current | New |
|---------|-----|
| Axios + custom API calls | Supabase JS client |
| Custom JWT cookie auth | Supabase Auth |
| Auth store wraps custom logic | Auth store wraps `supabase.auth` |
| Multipart file upload to Express | Not needed (scripts handle uploads) |
| No sharing on card sets | Visibility controls (private/shared/public) |
| No leaderboard | Leaderboard page with multiple metrics |

SM-2 spaced repetition algorithm stays client-side (pure math, no backend needed).

---

## Implementation Order

1. Create `learning-indonesian` repo on GitHub
2. Scaffold frontend project (Vite + React + TypeScript + Mantine + Zustand)
3. Write `scripts/migrate.ts` — create `indonesian` schema + tables + RLS policies
4. Migrate auth (Supabase Auth replacing custom JWT)
5. Migrate services one by one (cards, progress, podcasts)
6. Write seed scripts + deploy content
7. Add leaderboard
8. Add card set sharing
9. Docker + Traefik deployment config
10. Test end-to-end on homelab
