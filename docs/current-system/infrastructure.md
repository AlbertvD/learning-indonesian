---
doc_type: current-system-reference
surface: homelab — Supabase, Traefik, Step-CA, Docker
last_verified_against_code: 2026-05-14
status: stable
---

# Infrastructure

Operational reference for the homelab setup the app runs on. CLAUDE.md covers the architecture invariants ("Architecture", "Supabase Connection", "Homelab Infrastructure", "Supabase Infrastructure Fixes" sections); this doc covers the concrete service map, CORS / schema gotchas, and TLS specifics that an operator needs when debugging.

For deployment workflow see `docs/process/deploy.md`. For the content publishing pipeline see `docs/process/content-pipeline.md`.

---

## 1. Service map

The app talks to one external endpoint: `https://api.supabase.duin.home` (Kong, the API gateway). Behind Kong on the homelab, the Supabase stack runs as 8 containers — all internal, all on the `proxy` Docker network alongside Traefik. Container names verified at `homelab-configs/services/supabase/docker-compose.yml`.

| Service (container) | Internal endpoint | Role |
|---|---|---|
| Kong (`supabase-kong`) | external `:443` via Traefik | API gateway — routes to PostgREST, GoTrue, Storage, edge-functions |
| PostgREST (`supabase-rest`) | `rest:3000` | REST API for `indonesian` schema (and `public`, `storage`, `graphql_public`, `openbrain`) |
| GoTrue (`supabase-auth`) | `auth:9999` | Auth — signup, login, JWT issuance |
| Storage (`supabase-storage`) | `storage:5000` | Manages the storage buckets below |
| Edge functions (`supabase-edge-functions`) | `functions:9000` | Runs `supabase/functions/commit-capability-answer-report` — the capability review processor (sole writer of `capability_review_events`) |
| Postgres (`supabase-db`) | `db:5432` | All app data; `indonesian` schema |
| Studio (`supabase-studio`) | internal | Admin UI; reached via separate `db.supabase.duin.home` host |
| pg-meta (`supabase-pg-meta`) | internal | Schema-inspection API consumed by Studio |

**Three apps share this Supabase instance** — `family-hub`, `learning-indonesian`, and `openbrain`. Each owns its own Postgres schema (`public` / `indonesian` / `openbrain`); cross-app data is invisible. Auth is shared — one login works across all three.

Storage buckets (all public read):

| Bucket | Content |
|---|---|
| `indonesian-lessons` | Lesson audio MP3s (per-section TTS output) |
| `indonesian-podcasts` | NotebookLM-generated podcast audio |
| `indonesian-tts` | TTS audio cache (created 2026-04-16) |

---

## 2. Two homelab-configs gates the app depends on

Both live in the `homelab-configs` repo, both must be in place before the app works.

**PostgREST schema exposure** — `services/supabase/docker-compose.yml`:

```yaml
PGRST_DB_SCHEMAS: public,storage,graphql_public,indonesian,openbrain
```

Without this the API returns 404 for every `indonesian.*` query. PostgREST container restart required when this changes (brief blip for the shared apps). The `openbrain` schema is on the same exposure list (its app shares this instance) — touching this var affects all three apps.

**Kong CORS** — `services/supabase/kong/kong.yml`:

The actual origins list is shared with the other apps (`family.duin.home`, `brain.duin.home`) and includes a dev subdomain (`indonesian-dev.duin.home`) plus `localhost:5173`. The full list at the time of verification:

```yaml
origins:
  - http(s)://family.duin.home
  - http(s)://api.supabase.duin.home
  - http(s)://db.supabase.duin.home
  - http://localhost:5173
  - http(s)://indonesian-dev.duin.home
  - http(s)://indonesian.duin.home
  - http(s)://brain.duin.home
  - http(s)://auth.duin.home
```

If you spin up the app under a new hostname, add it here. `Access-Control-Allow-Headers` must include **`Accept-Profile` and `Content-Profile`** — `supabase-js` sends these on every request. If they're missing, Chrome silently drops requests after a successful OPTIONS preflight (Safari is more lenient and may still work, masking the issue). Kong image rebuild required when this changes (the Kong image bakes in the ANON_KEY).

---

## 3. TLS — Step-CA chain detail

Certificates are issued by Step-CA (internal CA). Traefik cert resolver is named `stepca`.

**The fullchain must contain leaf cert + Root CA (2 certs total).** Safari / WebKit fails with "load failed" if only the leaf cert is sent. Chrome is more lenient and will sometimes succeed with a leaf-only chain, masking the issue.

Reference: `certs_nextcloud_specific/fullchain.pem` in `homelab-configs`.

---

## 4. Supabase JS client cookie scope

`src/lib/supabase.ts` uses `@supabase/ssr`'s `createBrowserClient` with `domain: '.duin.home'` cookie scope in production (omitted in dev because browsers reject `.duin.home` cookies at `localhost`):

```ts
cookieOptions: import.meta.env.DEV ? undefined : {
  domain: '.duin.home',
  path: '/',
  sameSite: 'lax',
  secure: true,
}
```

The `.duin.home` scope makes the session cookie reusable across other apps on the same domain (e.g. future SSO with family-hub). The exact pattern is in CLAUDE.md "Supabase Connection".

---

## 5. Build-time secret bake-in

Vite bakes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into the bundle at build time:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.supabase.duin.home \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon_key> \
  -t learning-indonesian .
```

**Failure mode to watch for:** renaming a build-arg secret reference without creating the new secret causes a silent empty-key build — the app loads but every API call fails (white screen / empty data). GitHub Actions does this build; the build secret names live in the workflow file.

---

## 6. Reading further

- **CLAUDE.md** — auth deadlock pattern, error-handling rules, supabase-js usage patterns, homelab-configs fix rule, migration.sql source-of-truth rule.
- **`docs/process/deploy.md`** — the homelab container recreate procedure (Portainer MCP + SSH fallback).
- **`docs/current-system/data-model.md`** — schema reference, which tables live where, retired tables list.
- **`/Users/albert/home/homelab-configs/`** — the actual config repo; PostgREST/Kong/GoTrue/Postgres Docker setup.
