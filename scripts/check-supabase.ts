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
