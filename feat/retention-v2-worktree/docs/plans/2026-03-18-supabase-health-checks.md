# Supabase Health Checks & Feature Design Checklist

**Date:** 2026-03-18
**Status:** Validated

## Overview

Two complementary improvements to prevent Supabase infrastructure issues from being discovered at runtime:

1. **Health check scripts** — runnable before any deploy to verify the Supabase stack is correctly configured for this app
2. **Mandatory design doc section** — ensures every new feature explicitly identifies required homelab-configs changes upfront

---

## Part 1: Health Check Scripts

### Two tiers

**`make check-supabase`** (anon key, runs in CI and locally)
Uses `VITE_SUPABASE_ANON_KEY` from `.env.local`. Makes real HTTP requests to the live Supabase instance. Catches issues the app itself would hit.

**`make check-supabase-deep SUPABASE_SERVICE_KEY=<key>`** (service key, manual only)
Uses the service role key to inspect `information_schema` directly. Catches structural issues before they cause runtime failures. Run after migrations or before designing a new feature.

---

### Tier 1: Functional checks (`scripts/check-supabase.ts`)

Each check prints `✓` or `✗` with a plain-language failure reason.

| # | Check | Method | What it catches |
|---|-------|--------|-----------------|
| 1 | API reachability | `GET /rest/v1/` | Instance down, DNS failure, Traefik misconfiguration |
| 2 | CORS headers | `OPTIONS` request from `localhost:5173` origin | Kong not returning `Access-Control-Allow-Origin`, `Accept-Profile`, `Content-Profile` |
| 3 | Schema exposure | `GET /rest/v1/lessons` with `Accept-Profile: indonesian` | `indonesian` not in `PGRST_DB_SCHEMAS` |
| 4 | Auth endpoint | `GET /auth/v1/health` | GoTrue not responding |
| 5 | Storage buckets | `GET /storage/v1/bucket/indonesian-lessons` | Bucket missing or not public |
| 6 | Storage buckets | `GET /storage/v1/bucket/indonesian-podcasts` | Bucket missing or not public |
| 7 | Lessons readable | `supabase.schema('indonesian').from('lessons').select('id').limit(1)` | RLS blocking anon, table missing, grants missing |
| 8 | Vocabulary readable | same pattern | same |
| 9 | Podcasts readable | same pattern | same |

Exit code 0 if all pass, 1 if any fail (enables CI gating).

---

### Tier 2: Structural checks (`scripts/check-supabase-deep.ts`)

Uses `information_schema` and `pg_catalog` via the service key. Catches issues before they manifest at runtime.

| # | Check | What it catches |
|---|-------|-----------------|
| 1 | All expected tables exist | Migration not run, typo in table name |
| 2 | Expected columns on each table | Schema drift — column renamed or dropped |
| 3 | RLS enabled on user-owned tables | RLS accidentally disabled, data exposure risk |
| 4 | Anon role has SELECT on public tables | Grant missing after migration |
| 5 | Authenticated role has INSERT/UPDATE on user tables | Grant missing, users can't write |
| 6 | `user_roles` table has expected admin entries | Admin user not seeded |

Expected tables checked:
- `profiles`, `user_roles`
- `lessons`, `lesson_sections`, `vocabulary`
- `podcasts`
- `user_progress`, `lesson_progress`, `learning_sessions`
- `card_sets`, `anki_cards`, `card_set_shares`
- `error_logs`

---

### Makefile targets

```makefile
check-supabase: ## Check Supabase connectivity, CORS, schema, auth, storage (uses .env.local)
    NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts

check-supabase-deep: ## Deep structural check: tables, columns, RLS, grants (requires SUPABASE_SERVICE_KEY)
    @test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
    NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/check-supabase-deep.ts
```

---

### Output format

```
Supabase health check — https://api.supabase.duin.home

  ✓ API reachable
  ✓ CORS headers correct (Accept-Profile, Content-Profile present)
  ✗ Schema exposure: indonesian schema not accessible — add 'indonesian' to PGRST_DB_SCHEMAS in homelab-configs and restart PostgREST
  ✓ Auth endpoint healthy
  ✓ Storage bucket: indonesian-lessons (public)
  ✗ Storage bucket: indonesian-podcasts — bucket not found, run: make seed-podcasts
  ✓ lessons readable (anon)
  ✓ vocabulary readable (anon)
  ✓ podcasts readable (anon)

2 checks failed. Fix the issues above before deploying.
```

Failure messages always reference the specific fix (homelab-configs file to edit, or make target to run).

---

## Part 2: Mandatory Design Doc Section

Added to `CLAUDE.md` as a rule: every design document must include a **"Supabase Requirements"** section. No feature design is complete without it.

### Template

```markdown
## Supabase Requirements

### Schema changes
- New tables / columns (add to `scripts/migration.sql` and `scripts/migrate.ts`)
- RLS policies needed — who can read/write each table (anon, authenticated, owner-only)
- Grants needed (anon SELECT, authenticated INSERT/UPDATE/DELETE)

### homelab-configs changes
- [ ] PostgREST: new schema exposure needed? (edit `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`)
- [ ] Kong: new CORS headers or origins needed? (edit `services/supabase/kong/kong.yml`, rebuild image)
- [ ] GoTrue: auth config changes? (edit `services/supabase/docker-compose.yml`)
- [ ] Storage: new buckets needed? Public or private? (create via Studio or seed script)

### Health check additions
- New checks to add to `scripts/check-supabase.ts` (functional, anon key)
- New checks to add to `scripts/check-supabase-deep.ts` (structural, service key)
```

If a checkbox does not apply, mark it `N/A` with a one-line reason. The section must always be present — empty or skipped sections mean it wasn't considered.

---

## Implementation

### Files to create
- `scripts/check-supabase.ts` — tier 1 functional checks
- `scripts/check-supabase-deep.ts` — tier 2 structural checks

### Files to modify
- `Makefile` — add `check-supabase` and `check-supabase-deep` targets
- `CLAUDE.md` — add the mandatory design doc section rule and template

### No new dependencies
Both scripts use `@supabase/ssr` (already installed) and the native `fetch` API. No new packages needed.
