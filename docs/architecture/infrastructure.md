# Infrastructure

---

## Overview

The app is **frontend-only**. There is no custom backend. All data flows directly between the React app and a self-hosted Supabase instance via the Supabase JS client. The app is deployed as a static Nginx container behind Traefik on a homelab server.

---

## Supabase (self-hosted)

**Instance:** `https://api.supabase.duin.home`

Shared with `family-hub`. This means:
- One PostgREST, one GoTrue, one Kong gateway for both apps.
- App data is isolated in the `indonesian` schema — invisible to family-hub.
- Auth is shared: one login works across both apps.

### Services

| Service | Internal URL | Role |
|---|---|---|
| Kong | External gateway | API gateway — routes to PostgREST, GoTrue, Storage |
| PostgREST | `rest:3000` | REST API for `indonesian` schema tables |
| GoTrue | `auth:9999` | Auth (signup, login, JWT issuance) |
| Storage | Internal | Manages `indonesian-lessons` and `indonesian-podcasts` buckets |
| Postgres | `db:5432` | Stores all data |

### Schema exposure

PostgREST must be configured to expose the `indonesian` schema:

```yaml
# services/supabase/docker-compose.yml (homelab-configs)
PGRST_DB_SCHEMAS: public,storage,graphql_public,indonesian
```

Without this, PostgREST returns 404 for all `indonesian` schema queries.

### CORS

Kong CORS must include the app's domains:

```yaml
# services/supabase/kong/kong.yml (homelab-configs)
origins:
  - https://indonesian.duin.home
  - http://indonesian.duin.home
```

Kong also requires `Accept-Profile` and `Content-Profile` in the `Access-Control-Allow-Headers` list — supabase-js sends these on every request. Missing them causes Chrome to silently drop requests after a successful OPTIONS preflight (Safari is more lenient and does not fail in this case).

### Storage buckets

| Bucket | Visibility | Content |
|---|---|---|
| `indonesian-lessons` | Public read | Lesson audio MP3s |
| `indonesian-podcasts` | Public read | NotebookLM-generated podcast audio |

---

## Supabase JS client

The app uses `@supabase/ssr` (`createBrowserClient`) instead of the standard `@supabase/supabase-js` `createClient`:

```ts
// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { storageKey: 'sb-supabase-auth-token' },
    cookieOptions: import.meta.env.DEV ? undefined : {
      domain: '.duin.home',
      path: '/',
      sameSite: 'lax',
      secure: true,
    },
  }
)
```

`cookieOptions` is `undefined` in dev (`import.meta.env.DEV`). Browsers silently drop cookies with `domain=.duin.home` when the page is at `localhost`, so the dev build falls back to default cookie handling. In production the session cookie is scoped to `.duin.home` to enable future SSO with other apps on the same domain. The API is otherwise identical to standard supabase-js.

All queries use `.schema('indonesian')`:
```ts
supabase.schema('indonesian').from('learning_items').select(...)
```

---

## Auth

GoTrue configuration in `homelab-configs`:
- `GOTRUE_MAILER_AUTOCONFIRM: true` — users are auto-confirmed; no email verification.
- `GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated` and `GOTRUE_JWT_AUD: authenticated` — required for PostgREST to recognize the `authenticated` role in JWTs.

Email is not configured. Password resets are handled by an admin via Supabase Studio.

**Auth deadlock prevention:** When fetching user data immediately after sign-in, wrap the fetch in `setTimeout(0)` to avoid a Supabase auth deadlock:

```ts
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    setTimeout(() => fetchUserProgress(session.user.id), 0)
  }
})
```

---

## Deployment

### Stack

- **Container:** Multi-stage Docker build → Nginx serving static files
- **Reverse proxy:** Traefik on homelab
- **TLS:** Step-CA (internal CA); cert resolver `stepca` in Traefik labels
- **Docker network:** All services join the external `proxy` network — Traefik discovers via container labels
- **Homelab URL:** `https://indonesian.duin.home`
- **Docker Compose:** Lives in `homelab-configs/services/learning-indonesian/`

### Build

Vite bakes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into the bundle at build time:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.supabase.duin.home \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon_key> \
  -t learning-indonesian .
```

**Critical:** Renaming a build-arg secret reference without creating the new secret causes a silent empty-key build — the app loads but all API calls fail, resulting in a white screen or empty data.

### TLS

TLS fullchain.pem must contain the leaf cert **plus** the Root CA (2 certs total). Safari/WebKit fails with "load failed" if only the leaf cert is sent. Chrome is more lenient. Reference: `certs_nextcloud_specific/fullchain.pem` in `homelab-configs`.

---

## Make targets

### Development

```bash
make dev              # bun run dev — Vite dev server at localhost:5173
make build            # production build
make test             # bun run test (Vitest)
make test-watch       # watch mode
make lint             # ESLint
make typecheck        # TypeScript type check
```

### Schema and data

```bash
make migrate                                        # apply migration.sql via bun scripts/migrate.ts
make seed-lessons SUPABASE_SERVICE_KEY=<key>
make seed-vocabulary SUPABASE_SERVICE_KEY=<key>
make seed-learning-items SUPABASE_SERVICE_KEY=<key>
make seed-sentences SUPABASE_SERVICE_KEY=<key>      # cloze contexts
make seed-podcasts SUPABASE_SERVICE_KEY=<key>       # podcast metadata + audio upload
make seed-lesson-audio SUPABASE_SERVICE_KEY=<key>   # lesson audio upload
make seed-flashcards SUPABASE_SERVICE_KEY=<key>
make seed-all SUPABASE_SERVICE_KEY=<key>            # lessons + learning-items + sentences + podcasts
```

`make migrate` runs `bun scripts/migrate.ts` directly (with `NODE_TLS_REJECT_UNAUTHORIZED=0` to allow the self-signed cert). It connects to the remote Supabase Postgres over TCP/HTTPS — there is no SSH or `docker exec` involved. Requires `POSTGRES_PASSWORD` in `.env.local`. Safe to re-run after any container recreation.

Note: `seed-all` includes `seed-lessons`, `seed-learning-items`, `seed-sentences`, and `seed-podcasts`. It does **not** include `seed-vocabulary` (run that separately if needed).

### Content pipeline

```bash
make convert-heic LESSON=<N>   # convert HEIC photos to JPG (requires brew install heic-to-jpg or similar)
make ocr-pages LESSON=<N>      # OCR via tesseract (brew install tesseract tesseract-lang)
make parse-lesson LESSON=<N>   # AI-parse OCR text into staging files
make pipeline LESSON=<N>       # all three steps above
make review                    # start staging review UI (tools/review/ — bun run dev)
make publish-content LESSON=<N> SUPABASE_SERVICE_KEY=<key>  # publish approved candidates
```

### Health checks

```bash
make check-supabase            # tier 1: API, CORS, schema, auth, storage (uses .env.local)
make check-supabase-deep       # tier 2: tables, RLS, grants (requires SUPABASE_SERVICE_KEY)
```

Run `check-supabase` when suspecting infrastructure issues. Run `check-supabase-deep` after migrations to verify schema state. Both scripts print actionable fix instructions on failure.

### Docker

```bash
make docker-build VITE_SUPABASE_ANON_KEY=<key>   # build image
make docker-run                                    # run locally on port 8080
```

---

## Environment variables

`.env.local` (gitignored) — required for local development and script runs:

```
VITE_SUPABASE_URL=https://api.supabase.duin.home
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_KEY=<service role key>   # for make check-supabase-deep and seed scripts
POSTGRES_PASSWORD=<postgres password>     # for make migrate
```

Feature flags can be added here to override defaults:
```
VITE_FEATURE_SPEAKING=false
VITE_FEATURE_CUED_RECALL=false
```

---

## Fixing infrastructure issues

Infrastructure fixes must be made in `homelab-configs`, not applied directly to running containers. Changes applied directly are lost on container recreate or volume wipe.

| Problem | Fix location |
|---|---|
| Postgres auth errors (`pg_hba.conf`) | `services/supabase/postgres/Dockerfile` in `homelab-configs` |
| Kong CORS / routing | `services/supabase/kong/kong.yml` → rebuild Kong image |
| PostgREST schema exposure | `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml` |
| GoTrue auth settings | `services/supabase/docker-compose.yml` |

After committing the fix to `homelab-configs`, apply it immediately to the live container via `docker exec` + reload, or rebuild + redeploy.

---

## Error logging

Errors are logged to `indonesian.error_logs` via the `logError` helper in `src/lib/logger.ts`. Logs are write-only for authenticated users — admin queries them via Supabase Studio. `logError` is fire-and-forget and never throws or blocks the UI.

```ts
logError({ page: 'session', action: 'buildQueue', error: err })
```
