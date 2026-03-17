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

## Error Handling

Every error the user can encounter must have a meaningful, user-friendly message. Never show raw error strings, Supabase error codes, or technical details to the user.

**Rules:**
- All async operations (Supabase queries, auth, storage) must catch errors and display a notification via Mantine's `notifications.show()`
- Error messages explain what went wrong in plain language and, where possible, what the user can do next
- Use `notifications.show({ color: 'red', title: '...', message: '...' })` for errors
- Map known Supabase/auth error codes to friendly messages (e.g. `invalid_credentials` → "Incorrect email or password")
- Unknown errors fall back to: "Something went wrong. Please try again."
- Never `console.error` as the only error handling — always surface it to the user

**Example:**
```typescript
try {
  await authStore.signIn(email, password)
} catch (err) {
  const msg = err instanceof AuthApiError && err.code === 'invalid_credentials'
    ? 'Incorrect email or password.'
    : 'Something went wrong. Please try again.'
  notifications.show({ color: 'red', title: 'Login failed', message: msg })
  logError({ page: 'login', action: 'signIn', error: err })
}
```

## Logging

Errors are logged to `indonesian.error_logs` in Supabase. This keeps logs in the self-hosted stack with no extra infrastructure — queryable from the Supabase dashboard.

**Schema:**
```sql
indonesian.error_logs (
  id, user_id, page, action, error_message, error_code, created_at
)
```

**Usage:** Use the `logError` helper from `src/lib/logger.ts` whenever an error is caught. Always log the technical detail even when showing a friendly message to the user.

```typescript
import { logError } from '@/lib/logger'

catch (err) {
  notifications.show({ color: 'red', title: 'Failed', message: 'Something went wrong.' })
  logError({ page: 'review', action: 'submitCard', error: err })
}
```

The `logError` function is fire-and-forget — it never throws or blocks the UI. Logs are write-only for authenticated users (no user can read logs via the app — admin queries them directly in Supabase).

## Supabase Connection

The client is initialized in `src/lib/supabase.ts` with `localStorage`, `persistSession: true`, and `autoRefreshToken: true` — same pattern as family-hub.

**Auth store pattern (critical):** When fetching user data (e.g. `user_progress`) immediately after sign-in, always wrap the fetch in `setTimeout(0)` to avoid a Supabase auth deadlock:

```typescript
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    setTimeout(() => fetchUserProgress(session.user.id), 0)
  }
})
```

**Required homelab-configs changes before this app works:**

These two changes must be made in the `homelab-configs` repo before developing or deploying:

1. **PostgREST schema exposure** — add `indonesian` to `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`:
   ```
   PGRST_DB_SCHEMAS: public,storage,graphql_public,indonesian
   ```
   Requires PostgREST container restart (brief blip for family-hub).

2. **Kong CORS origins** — add the Indonesian app's domains to `services/supabase/kong/kong.yml`:
   ```yaml
   origins:
     - https://indonesian.duin.home
     - http://indonesian.duin.home
   ```
   Requires Kong image rebuild + restart (brief blip for family-hub). The Kong image bakes in the ANON_KEY — rebuild is triggered by pushing to `homelab-configs` main.

**Data isolation:** The `indonesian` schema is completely invisible to family-hub. Once the two changes above are live, developing against the shared Supabase instance carries no risk of affecting family-hub data.

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

## Testing

Write tests for every new feature where possible. The project uses **Vitest** + **@testing-library/react** + **@testing-library/user-event**.

```bash
bun run test         # run all tests
bun run test:watch   # watch mode
bun run test:ui      # Vitest UI
```

**Core principle: test from the user's perspective.** Tests should simulate what a real user does — clicking buttons, filling in forms, navigating — not call service functions directly. The Supabase client is mocked so tests run without a real database.

**Testing layers:**

| Layer | Tool | Example |
|-------|------|---------|
| Pure logic (SM-2, formatters) | Vitest unit tests | `calculateNextReview('good', 2.5, 1, 0)` |
| User interactions | RTL + userEvent | user types email, clicks login, sees dashboard |
| Store behaviour | Vitest + store actions | login updates auth state, error clears on retry |

**Example pattern:**
```typescript
it('lets a user log in and see the dashboard', async () => {
  vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: mockSession, error: null })
  render(<App />)
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'password')
  await userEvent.click(screen.getByRole('button', { name: /log in/i }))
  expect(await screen.findByText('Dashboard')).toBeInTheDocument()
})
```

**What not to test:**
- Simple presentational components with no logic
- The Supabase JS client itself

Tests live in `src/__tests__/` or colocated as `*.test.tsx`. Mock the Supabase client with `vi.mock('@/lib/supabase')`.

## Development

```bash
bun install          # install dependencies
bun run dev          # dev server at localhost:5173
bun run build        # production build
bun run test         # run tests
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

## Homelab Infrastructure

This app runs on a self-hosted homelab. For infrastructure details see `/Users/albert/home/homelab-configs/`.

Key facts relevant to this app:
- **Reverse proxy:** Traefik — handles routing and TLS termination for all services
- **TLS certificates:** Issued by Step-CA (internal CA); cert resolver name in Traefik labels is `stepca`. TLS fullchain must include leaf cert + Root CA (Safari fails with leaf-only)
- **Docker network:** All services join the external `proxy` network — Traefik discovers them via container labels
- **Supabase:** Self-hosted at `https://api.supabase.duin.home`. Kong is the API gateway in front of PostgREST, GoTrue, and Storage. CORS must include `Accept-Profile` and `Content-Profile` headers (required by supabase-js)
- **Data persistence:** App data lives in the Supabase PostgreSQL instance. No local storage volumes needed for this app
- **Internal networking:** Services communicate over internal Docker networks via HTTP. Only external-facing URLs use HTTPS via Traefik
