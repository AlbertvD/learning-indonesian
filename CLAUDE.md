# Learning Indonesian

Indonesian language tutor app — React frontend connecting directly to a shared self-hosted Supabase instance.

## Architecture

**Frontend-only.** No custom backend. All data goes directly from the React app to Supabase via the JS client. The app is deployed as a static Nginx container behind Traefik on the homelab.

- **Supabase instance:** `https://api.supabase.duin.home` (shared with family-hub)
- **Database schema:** `indonesian` (all app tables live here, isolated from other apps)
- **Auth:** Shared with family-hub — one login works across both apps
- **Storage buckets:** `indonesian-lessons`, `indonesian-podcasts` (public read)
- **Homelab URL:** `indonesian.duin.home`

## Tech Stack

- React 19 + TypeScript + Vite (SWC)
- Mantine UI v8 + Tabler Icons
- Zustand 5 (state management)
- React Router 7
- Supabase JS v2
- vite-plugin-pwa (PWA / add to home screen)
- Bun (package manager + script runner)

## Key Conventions

- Path alias `@/` maps to `src/`
- Supabase client: `src/lib/supabase.ts`
- All Supabase queries use `.schema('indonesian')` — never query the public schema directly
- Auth store: `src/stores/authStore.ts` wraps `supabase.auth`
- Services in `src/services/` — one file per domain (cards, lessons, podcasts, progress, leaderboard)
- Zustand stores in `src/stores/` — one file per domain
- No Axios — all HTTP via Supabase JS client

## Content Management

All lesson, vocabulary, and podcast content (including audio files) is **deployed via scripts**, not through any UI. Scripts live in `scripts/` and use the Supabase service role key to bypass RLS.

```bash
SUPABASE_SERVICE_KEY=<key> bun scripts/migrate.ts       # one-time schema setup
SUPABASE_SERVICE_KEY=<key> bun scripts/seed-lessons.ts
SUPABASE_SERVICE_KEY=<key> bun scripts/seed-vocabulary.ts
SUPABASE_SERVICE_KEY=<key> bun scripts/seed-podcasts.ts
```

The service role key is NOT stored in the repo. Get it from the Supabase dashboard on the homelab.

## Development

```bash
bun install          # install dependencies
bun run dev          # dev server at localhost:5173
bun run build        # production build
bun run lint         # lint
```

`.env.local` (gitignored) must contain:
```
VITE_SUPABASE_URL=https://api.supabase.duin.home
VITE_SUPABASE_ANON_KEY=<anon key>
```

## Deployment

Multi-stage Docker build → Nginx container → Traefik on homelab.

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.supabase.duin.home \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon_key> \
  -t learning-indonesian .
```

The `docker-compose.yml` for homelab deployment lives in the `homelab-configs` repo under `services/learning-indonesian/`.

## Data Model Overview

| Table | Who writes | Who reads |
|-------|-----------|-----------|
| `lessons`, `podcasts`, `vocabulary` | Admin via scripts | All authenticated users |
| `user_progress`, `lesson_progress`, `learning_sessions` | Row owner | All (for leaderboard) |
| `card_sets`, `anki_cards` | Owner | Owner + shared users + public |
| `leaderboard` | View (read-only) | All authenticated users |

Admin access is controlled via `indonesian.user_roles` table — no separate auth role needed.

## Sharing Model (Card Sets)

Card sets have three visibility levels:
- `private` — owner only
- `shared` — owner + specific users listed in `card_set_shares`
- `public` — all authenticated users

## Docs

- Design: `docs/plans/2026-03-16-learning-indonesian-design.md`
- Implementation plan: `docs/plans/2026-03-16-learning-indonesian-implementation.md`

## Related Repos

- `homelab-configs` — Traefik config, docker-compose for deployment, original app source in `Indonesian app/`
- `family-hub` — shares the same Supabase instance; reference for Dockerfile pattern and Supabase client setup
