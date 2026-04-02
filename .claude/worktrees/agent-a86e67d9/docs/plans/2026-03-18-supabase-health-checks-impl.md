# Supabase Health Checks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two runnable scripts — `check-supabase.ts` (anon key, CI-safe) and `check-supabase-deep.ts` (service key, manual) — that catch Supabase infrastructure issues before runtime, plus Makefile targets to run them.

**Architecture:** Tier 1 uses native `fetch` + the existing `@supabase/ssr` client with the anon key to test real HTTP behaviour (CORS, schema exposure, auth, storage, table reads). Tier 2 calls a `schema_health()` RPC function added to `migration.sql` — this function queries `pg_catalog` and `information_schema` and returns JSON, callable via the service-role client which bypasses RLS.

**Tech Stack:** Bun, TypeScript, `@supabase/supabase-js` (createClient for scripts — same pattern as seed scripts), native fetch, `NODE_TLS_REJECT_UNAUTHORIZED=0` (self-signed cert on homelab)

---

## Task 1: Add `schema_health()` RPC to migration

The deep check calls this function via service key. It returns a JSON report of table existence, RLS status, and grants — all from `pg_catalog` / `information_schema`.

**Files:**
- Modify: `scripts/migrate.ts` (append to SQL template)
- Modify: `scripts/migration.sql` (regenerate via `bun scripts/migrate.ts`)

**Step 1: Append the function to the SQL in `migrate.ts`**

Find the end of the SQL template (after the last `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` lines, before the closing backtick) and add:

```sql

-- Health check RPC — callable by service role to inspect schema state
-- Returns JSON with tables, RLS status, and grants for the indonesian schema
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
    )
  )
$$;

GRANT EXECUTE ON FUNCTION indonesian.schema_health() TO authenticated;
```

**Step 2: Regenerate `migration.sql`**

```bash
bun scripts/migrate.ts
```

Expected output: `Migration SQL written to scripts/migration.sql`

Verify the function appears at the end of `scripts/migration.sql`.

**Step 3: Commit**

```bash
git add scripts/migrate.ts scripts/migration.sql
git commit -m "feat: add schema_health() RPC for deep health checks"
```

---

## Task 2: `scripts/check-supabase.ts` (Tier 1 — anon key)

Functional checks using native fetch and the anon key. Catches the most common runtime issues. CI-safe — only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`.

**Files:**
- Create: `scripts/check-supabase.ts`

**Step 1: Write the script**

```typescript
#!/usr/bin/env bun
// scripts/check-supabase.ts
// Run with: make check-supabase (or: NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts)
// Requires: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment (or .env.local)
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (check .env.local)')
  process.exit(1)
}

// Local dev origin — this is what the browser sends in CORS preflight
const DEV_ORIGIN = 'http://localhost:5173'

const results: { label: string; ok: boolean; detail?: string }[] = []

function pass(label: string) {
  results.push({ label, ok: true })
}

function fail(label: string, detail: string) {
  results.push({ label, ok: false, detail })
}

// ── Check 1: API reachability ─────────────────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: ANON_KEY },
  })
  if (res.ok || res.status === 200) {
    pass('API reachable')
  } else {
    fail('API reachable', `HTTP ${res.status} — check Traefik routing and Supabase stack status`)
  }
} catch (err) {
  fail('API reachable', `Connection failed: ${(err as Error).message} — check DNS and Traefik`)
}

// ── Check 2: CORS headers ─────────────────────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'OPTIONS',
    headers: {
      Origin: DEV_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'apikey,authorization,content-type,accept-profile,content-profile',
      apikey: ANON_KEY,
    },
  })
  const allowOrigin = res.headers.get('access-control-allow-origin')
  const allowHeaders = res.headers.get('access-control-allow-headers') ?? ''
  const missingHeaders: string[] = []
  for (const h of ['accept-profile', 'content-profile']) {
    if (!allowHeaders.toLowerCase().includes(h)) missingHeaders.push(h)
  }
  if (!allowOrigin) {
    fail('CORS headers', `access-control-allow-origin missing — add ${DEV_ORIGIN} to Kong CORS origins in homelab-configs/services/supabase/kong/kong.yml and rebuild Kong image`)
  } else if (missingHeaders.length > 0) {
    fail('CORS headers', `Missing headers in access-control-allow-headers: ${missingHeaders.join(', ')} — edit Kong CORS config in homelab-configs`)
  } else {
    pass('CORS headers (Accept-Profile, Content-Profile present)')
  }
} catch (err) {
  fail('CORS headers', `Request failed: ${(err as Error).message}`)
}

// ── Check 3: indonesian schema exposure ──────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/lessons?limit=0`, {
    headers: {
      apikey: ANON_KEY,
      'Accept-Profile': 'indonesian',
    },
  })
  if (res.status === 406) {
    fail('Schema exposure (indonesian)', `HTTP 406 — add 'indonesian' to PGRST_DB_SCHEMAS in homelab-configs/services/supabase/docker-compose.yml and restart PostgREST`)
  } else if (res.status === 404) {
    fail('Schema exposure (indonesian)', `HTTP 404 — schema exposed but 'lessons' table missing, run: make migrate SUPABASE_SERVICE_KEY=<key>`)
  } else if (res.ok || res.status === 200) {
    pass('Schema exposure (indonesian)')
  } else {
    fail('Schema exposure (indonesian)', `HTTP ${res.status}: ${await res.text()}`)
  }
} catch (err) {
  fail('Schema exposure (indonesian)', `Request failed: ${(err as Error).message}`)
}

// ── Check 4: Auth endpoint ────────────────────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/health`)
  const body = await res.json().catch(() => ({}))
  if (res.ok && (body as any).healthy !== false) {
    pass('Auth endpoint (GoTrue healthy)')
  } else {
    fail('Auth endpoint', `GoTrue unhealthy (HTTP ${res.status}) — check GoTrue container`)
  }
} catch (err) {
  fail('Auth endpoint', `Request failed: ${(err as Error).message}`)
}

// ── Checks 5–6: Storage buckets ───────────────────────────────────────────
for (const bucket of ['indonesian-lessons', 'indonesian-podcasts']) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    })
    if (res.ok) {
      const data = await res.json()
      if ((data as any).public) {
        pass(`Storage bucket: ${bucket} (public)`)
      } else {
        fail(`Storage bucket: ${bucket}`, `Bucket exists but is not public — make it public in Supabase Studio > Storage`)
      }
    } else if (res.status === 404) {
      fail(`Storage bucket: ${bucket}`, `Bucket not found — create it in Supabase Studio > Storage, or check seed script`)
    } else {
      fail(`Storage bucket: ${bucket}`, `HTTP ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    fail(`Storage bucket: ${bucket}`, `Request failed: ${(err as Error).message}`)
  }
}

// ── Checks 7–9: Table reads (anon key via authenticated session) ──────────
// These use an authenticated supabase client because tables require `authenticated` role.
// We sign in anonymously — GoTrue auto-confirms with GOTRUE_MAILER_AUTOCONFIRM=true.
// If there's no test user, these checks are skipped with a warning.
const TEST_EMAIL = process.env.CHECK_TEST_EMAIL
const TEST_PASSWORD = process.env.CHECK_TEST_PASSWORD

const supabase = createClient(SUPABASE_URL, ANON_KEY)

let authed = false
if (TEST_EMAIL && TEST_PASSWORD) {
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error) {
    fail('Auth sign-in (for table reads)', `Sign-in failed: ${error.message} — check CHECK_TEST_EMAIL / CHECK_TEST_PASSWORD`)
  } else {
    authed = true
  }
} else {
  results.push({ label: 'Table reads (skipped — no CHECK_TEST_EMAIL/CHECK_TEST_PASSWORD set)', ok: true })
}

if (authed) {
  for (const table of ['lessons', 'vocabulary', 'podcasts']) {
    const { error } = await supabase.schema('indonesian').from(table).select('id').limit(1)
    if (error) {
      fail(`${table} readable (authenticated)`, `${error.message} — check RLS policies and grants in migration.sql, run: make migrate SUPABASE_SERVICE_KEY=<key>`)
    } else {
      pass(`${table} readable (authenticated)`)
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────────
console.log(`\nSupabase health check — ${SUPABASE_URL}\n`)
let failures = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  ✓ ${r.label}`)
  } else {
    console.log(`  ✗ ${r.label}`)
    console.log(`    → ${r.detail}`)
    failures++
  }
}

if (failures === 0) {
  console.log('\nAll checks passed.\n')
  process.exit(0)
} else {
  console.log(`\n${failures} check${failures > 1 ? 's' : ''} failed. Fix the issues above before deploying.\n`)
  process.exit(1)
}
```

**Step 2: Run it locally**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts
```

Expected: script runs and prints results. Some may fail if not fully set up — that's fine. The script itself should not crash or throw.

**Step 3: Commit**

```bash
git add scripts/check-supabase.ts
git commit -m "feat: add check-supabase script (anon key functional checks)"
```

---

## Task 3: `scripts/check-supabase-deep.ts` (Tier 2 — service key)

Structural checks via the `schema_health()` RPC (added in Task 1). Verifies all expected tables exist, RLS is enabled on each, and grants are in place for `anon` and `authenticated` roles.

**Files:**
- Create: `scripts/check-supabase-deep.ts`

**Step 1: Write the script**

```typescript
#!/usr/bin/env bun
// scripts/check-supabase-deep.ts
// Run with: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
// Requires: SUPABASE_SERVICE_KEY env var; VITE_SUPABASE_URL from .env.local
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required')
  console.error('Run: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const results: { label: string; ok: boolean; detail?: string }[] = []

function pass(label: string) { results.push({ label, ok: true }) }
function fail(label: string, detail: string) { results.push({ label, ok: false, detail }) }

// Expected tables — must match migration.sql
const EXPECTED_TABLES = [
  'profiles',
  'user_roles',
  'lessons',
  'lesson_sections',
  'vocabulary',
  'podcasts',
  'user_progress',
  'lesson_progress',
  'user_vocabulary',
  'learning_sessions',
  'card_sets',
  'card_set_shares',
  'anki_cards',
  'card_reviews',
  'error_logs',
]

// Tables that anon role should NOT be able to read (RLS + no anon grant)
// All user tables require `authenticated` role — no anon access
const ANON_READABLE: string[] = []  // none — all tables require auth

// Expected grants: table → { role → privileges[] }
const EXPECTED_GRANTS: Record<string, Record<string, string[]>> = {
  lessons:          { authenticated: ['SELECT'] },
  lesson_sections:  { authenticated: ['SELECT'] },
  vocabulary:       { authenticated: ['SELECT'] },
  podcasts:         { authenticated: ['SELECT'] },
  profiles:         { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  user_progress:    { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  lesson_progress:  { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  user_vocabulary:  { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  learning_sessions:{ authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  card_sets:        { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  card_set_shares:  { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  anki_cards:       { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  card_reviews:     { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  error_logs:       { authenticated: ['INSERT'] },
  user_roles:       { authenticated: ['SELECT'] },
}

// ── Fetch schema health report ─────────────────────────────────────────────
const { data: health, error: healthError } = await supabase
  .schema('indonesian')
  .rpc('schema_health')

if (healthError) {
  console.error(`\nFailed to call schema_health() RPC: ${healthError.message}`)
  console.error('Run the migration first: make migrate SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

const report = health as {
  tables: { name: string; rls_enabled: boolean; rls_forced: boolean }[]
  grants: { table: string; grantee: string; privilege: string }[]
}

const existingTables = new Set(report.tables.map((t) => t.name))
const rlsStatus = Object.fromEntries(report.tables.map((t) => [t.name, t.rls_enabled]))

// ── Check: all expected tables exist ─────────────────────────────────────
for (const table of EXPECTED_TABLES) {
  if (existingTables.has(table)) {
    pass(`Table exists: ${table}`)
  } else {
    fail(`Table exists: ${table}`, `Table 'indonesian.${table}' not found — run: make migrate SUPABASE_SERVICE_KEY=<key>`)
  }
}

// ── Check: RLS enabled on all tables ─────────────────────────────────────
for (const table of EXPECTED_TABLES) {
  if (!existingTables.has(table)) continue  // already reported missing
  if (rlsStatus[table]) {
    pass(`RLS enabled: ${table}`)
  } else {
    fail(`RLS enabled: ${table}`, `RLS is OFF on 'indonesian.${table}' — data exposure risk. Run: make migrate SUPABASE_SERVICE_KEY=<key>`)
  }
}

// ── Check: grants ─────────────────────────────────────────────────────────
// Build a lookup: table → grantee → Set<privilege>
const grantLookup: Record<string, Record<string, Set<string>>> = {}
for (const g of report.grants) {
  if (!grantLookup[g.table]) grantLookup[g.table] = {}
  if (!grantLookup[g.table][g.grantee]) grantLookup[g.table][g.grantee] = new Set()
  grantLookup[g.table][g.grantee].add(g.privilege)
}

for (const [table, roleGrants] of Object.entries(EXPECTED_GRANTS)) {
  if (!existingTables.has(table)) continue
  for (const [role, privileges] of Object.entries(roleGrants)) {
    const actual = grantLookup[table]?.[role] ?? new Set()
    const missing = privileges.filter((p) => !actual.has(p))
    if (missing.length === 0) {
      pass(`Grants: ${table} → ${role} (${privileges.join(', ')})`)
    } else {
      fail(
        `Grants: ${table} → ${role}`,
        `Missing privileges: ${missing.join(', ')} — run: make migrate SUPABASE_SERVICE_KEY=<key>`
      )
    }
  }
}

// ── Check: service key can read all tables functionally ───────────────────
for (const table of EXPECTED_TABLES) {
  if (!existingTables.has(table)) continue
  const { error } = await supabase.schema('indonesian').from(table).select('id').limit(0)
  if (error) {
    fail(`Service key read: ${table}`, error.message)
  } else {
    pass(`Service key read: ${table}`)
  }
}

// ── Output ─────────────────────────────────────────────────────────────────
console.log(`\nSupabase deep structural check — ${SUPABASE_URL}\n`)
let failures = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  ✓ ${r.label}`)
  } else {
    console.log(`  ✗ ${r.label}`)
    console.log(`    → ${r.detail}`)
    failures++
  }
}

if (failures === 0) {
  console.log('\nAll structural checks passed.\n')
  process.exit(0)
} else {
  console.log(`\n${failures} check${failures > 1 ? 's' : ''} failed.\n`)
  process.exit(1)
}
```

**Step 2: Run it locally**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=<your-key> bun scripts/check-supabase-deep.ts
```

Expected: all checks pass (or informative failures if migration hasn't been re-run yet to add the RPC).

**Step 3: Commit**

```bash
git add scripts/check-supabase-deep.ts
git commit -m "feat: add check-supabase-deep script (service key structural checks)"
```

---

## Task 4: Makefile targets

**Files:**
- Modify: `Makefile`

**Step 1: Add targets after the `extract-lesson` target**

Find the `# DOCKER` section header in the Makefile and insert before it:

```makefile
# ============================================================================
# HEALTH CHECKS
# ============================================================================

.PHONY: check-supabase
check-supabase: ## Check Supabase connectivity, CORS, schema, auth, and storage (uses .env.local)
	NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts

.PHONY: check-supabase-deep
check-supabase-deep: ## Deep structural check: tables, RLS, grants (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required. Run: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/check-supabase-deep.ts

```

**Step 2: Verify `make help` shows both targets**

```bash
make help
```

Expected: `check-supabase` and `check-supabase-deep` appear in the output.

**Step 3: Run the tier 1 check end-to-end**

```bash
make check-supabase
```

Expected: runs without crashing, prints a results table.

**Step 4: Commit**

```bash
git add Makefile
git commit -m "feat: add check-supabase and check-supabase-deep Makefile targets"
```

---

## Task 5: Add `check-supabase` to CI (GitHub Actions)

**Note:** Only do this task if the project has a CI workflow file. Check first.

**Files:**
- Modify: `.github/workflows/*.yml` (whichever runs on push/PR)

**Step 1: Check if CI exists**

```bash
ls .github/workflows/ 2>/dev/null || echo "No CI workflows found"
```

If no CI exists, skip this task.

**Step 2: Add health check step**

In the workflow, after the `bun install` step and before the build/test steps, add:

```yaml
- name: Check Supabase connectivity
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    NODE_TLS_REJECT_UNAUTHORIZED: "0"
  run: bun scripts/check-supabase.ts
```

**Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add Supabase health check step"
```

---

## Notes

- `schema_health()` must be run after every migration that adds new tables — it queries the live schema state so it stays current automatically.
- To add checks for a new feature, update `EXPECTED_TABLES` and `EXPECTED_GRANTS` in `check-supabase-deep.ts` to match the new migration.
- The tier 1 check (`check-supabase`) skips table-read tests unless `CHECK_TEST_EMAIL` and `CHECK_TEST_PASSWORD` are set — safe to run in CI without real credentials, still catches CORS/schema/auth/storage issues.
