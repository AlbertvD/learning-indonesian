# Scaling Check Report — learning-indonesian

**Scale target:** Tier 1 — personal homelab, 1–5 concurrent users
**Date:** 2026-03-20
**Scope:** All files under `src/` — stores, services, pages, queries, schema

---

## Summary

At Tier 1 personal scale, this app is in good shape. There are no patterns that will break at 1–5 users. The findings below are minor friction points or low-priority improvements worth noting, not blockers.

---

## [LOW] Redundant `getCardSets()` call in `Set.tsx`

- **What:** When navigating to a single card set page (`/sets/:setId`), the page calls `cardService.getCardSets()` (fetches all sets for all users) just to `find()` the one matching `setId`. It doesn't call a dedicated `getCardSet(id)` endpoint.
- **Where:** `src/pages/Set.tsx:31–36`
- **Breaks at:** Does not break at Tier 1. At current scale (a handful of sets) this is a trivially small payload. At Tier 3+ with thousands of shared/public card sets this would over-fetch unnecessarily.
- **Fix:** Add `cardService.getCardSet(setId)` using `.eq('id', setId).single()` and call it directly instead of fetching all sets and filtering client-side.

---

## [LOW] `getLessons()` fetches all lesson sections in a single unbounded query

- **What:** `lessonService.getLessons()` selects `*, lesson_sections(*)` — all lessons with all their sections eagerly joined. The lessons list page renders cards that only need `title`, `order_index`, and section count, but the full section `content` (JSONB blobs with dialogue, grammar, exercises) is fetched and discarded.
- **Where:** `src/services/lessonService.ts:29–38`, used by `src/pages/Lessons.tsx:24`
- **Breaks at:** Does not break at Tier 1. Current content is 3 lessons with ~5 sections each; the payload is small. At Tier 2–3 with 30+ lessons this becomes wasteful.
- **Fix:** Add a lightweight `getLessonsList()` that selects only `id, title, order_index, lesson_sections(id)` (to get section count without content). Reserve the full `select('*, lesson_sections(*)')` for `getLesson(id)` on the detail page.

---

## [LOW] No indexes on `card_reviews(user_id)` or `card_reviews(next_review_at)`

- **What:** The `getDueCards` query filters by `user_id = $1` and `next_review_at <= now()`, which are the two most frequent predicates on `card_reviews`. The migration creates a `UNIQUE(card_id, user_id)` constraint (which creates a btree index on `(card_id, user_id)`) but there is no standalone index on `user_id` alone, and no index on `next_review_at`.
- **Where:** `scripts/migration.sql:162–172`, `src/services/cardService.ts:53–63`
- **Breaks at:** Does not break at Tier 1 with a few hundred cards. At Tier 2+ with thousands of review rows per user, sequential scans on these columns will cause noticeable latency.
- **Fix:** Add to `migration.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS card_reviews_user_id_idx ON indonesian.card_reviews(user_id);
  CREATE INDEX IF NOT EXISTS card_reviews_next_review_idx ON indonesian.card_reviews(next_review_at);
  ```

---

## [LOW] Leaderboard view is an unbounded aggregation query with no index support

- **What:** `getLeaderboard()` queries the `leaderboard` view, which is a full-table aggregation joining `profiles`, `user_progress`, `user_vocabulary`, `lesson_progress`, and `learning_sessions`. Every tab switch on the Leaderboard page re-runs this aggregation. There is a `LIMIT 20` applied by the service, but it applies after the view materializes.
- **Where:** `src/services/leaderboardService.ts:17–26`, `scripts/migration.sql:175–190`
- **Breaks at:** Fine at Tier 1 with 5 users. At Tier 2 (50 users, thousands of session rows) each tab click will run a full aggregate over `learning_sessions`. At Tier 3 this becomes a clear bottleneck.
- **Fix:** At Tier 1, no action needed. Future options: add `CREATE INDEX` on `learning_sessions(user_id)`, cache the leaderboard result client-side across tab switches (currently re-fetches on every `activeTab` change), or materialize the view on a schedule.

---

## [LOW] `learning_sessions` table will grow without bound

- **What:** Every page visit that starts a session (`Lesson`, `Review`, `Podcast`, `Practice`) inserts a row into `learning_sessions`. There is no archival, TTL, or cleanup mechanism. Over years of daily use a single user generates thousands of rows.
- **Where:** `src/lib/session.ts`, `scripts/migration.sql:120–129`
- **Breaks at:** Does not break at Tier 1 — PostgreSQL handles millions of rows fine, and the leaderboard view only aggregates `duration_seconds`. Only a concern if disk space on the homelab becomes tight over a multi-year horizon.
- **Fix:** No action needed at Tier 1. A future `DELETE FROM learning_sessions WHERE started_at < now() - interval '2 years'` maintenance job would be sufficient.

---

## [LOW] `logError` makes a `supabase.auth.getUser()` call inside every error handler

- **What:** `logger.ts` calls `await supabase.auth.getUser()` to get the current user's ID on every invocation. This is a network round-trip to the Supabase Auth API on every error log write, even though the user ID is already available in `authStore.user.id`.
- **Where:** `src/lib/logger.ts:23`
- **Breaks at:** Does not break at any scale — it is fire-and-forget. But during error storms (e.g. network outage) it multiplies Supabase Auth API calls unnecessarily.
- **Fix:** Low priority at Tier 1. Consider accepting an optional `userId` parameter so callers that already have the user ID in scope (most of them) can pass it directly, avoiding the extra Auth API call.

---

## [INFO] No health endpoint — expected for a static frontend

- **What:** There is no `/health` HTTP endpoint. The app is a static Nginx container — health is inferred from Traefik's TCP probe or Docker's container status.
- **Where:** N/A
- **Breaks at:** Does not break. Standard for static frontends behind Traefik.
- **Fix:** No action needed. If health checking is ever desired, add a static `health.json` file served by Nginx.

---

## [INFO] Hardcoded Supabase URL pattern in `supabase.ts` — expected

- **What:** `VITE_SUPABASE_URL` is injected at Docker build time as a build arg. No runtime config file.
- **Where:** `src/lib/supabase.ts`, `Dockerfile`
- **Breaks at:** Does not break. This is the correct Vite/static deployment pattern.
- **Fix:** No action needed.

---

## [INFO] Dashboard fetches due cards and lesson progress separately — two queries that are also triggered independently on other pages

- **What:** `Dashboard.tsx` calls `cardService.getDueCards(user.id)` and `lessonService.getUserLessonProgress(user.id)` in parallel. Each of these queries is also made independently on `Review.tsx` and `Lessons.tsx` respectively — no shared cache layer between pages.
- **Where:** `src/pages/Dashboard.tsx:35–43`
- **Breaks at:** Does not break at Tier 1 — each query is fast and user-scoped. At higher scale or if latency becomes noticeable, a simple Zustand cache for these results (similar to `cardStore`) would help.
- **Fix:** No action needed at Tier 1.

---

## Overall verdict

The app is well-suited for Tier 1 personal scale. All queries are user-scoped and most use appropriate `.eq('user_id', ...)` filters. There are no N+1 loops, no polling loops, no unbounded in-memory arrays, and no synchronous operations in request handlers. The one genuine improvement worth making before the content library grows is adding explicit indexes on `card_reviews(user_id)` and `card_reviews(next_review_at)` — everything else can wait.
