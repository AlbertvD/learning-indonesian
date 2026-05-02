#!/usr/bin/env bun
// scripts/check-supabase-rls.ts
//
// Tier-3 RLS health check. Verifies the security_invoker view + table-level
// RLS policies introduced by the capabilityContentService spec actually deny
// non-admin reads and that the per-user INSERT policy works.
//
// Run with: make check-supabase-rls
// Requires (in .env.local):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//   TEST_USER_EMAIL       — non-admin user (default: testuser@duin.home)
//   TEST_USER_PASSWORD
//   TEST_ADMIN_EMAIL      — admin user (must have indonesian.user_roles row with role='admin')
//   TEST_ADMIN_PASSWORD
//
// The homelab uses an internal Step-CA cert. Set NODE_TLS_REJECT_UNAUTHORIZED=0
// (the Makefile target does this).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'testuser@duin.home'
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (check .env.local)')
  process.exit(1)
}
if (!TEST_USER_PASSWORD) {
  console.error('Error: TEST_USER_PASSWORD must be set (check .env.local). Default email is testuser@duin.home; override with TEST_USER_EMAIL.')
  process.exit(1)
}
if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.error('Error: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set (check .env.local). Test admin user must have a row in indonesian.user_roles with role=\'admin\'.')
  process.exit(1)
}

const results: { label: string; ok: boolean; detail?: string }[] = []
const pass = (label: string) => results.push({ label, ok: true })
const fail = (label: string, detail: string) => results.push({ label, ok: false, detail })

function makeClient() {
  return createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
}

async function signIn(email: string, password: string): Promise<ReturnType<typeof makeClient>> {
  const client = makeClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return client
}

async function getMyUserId(client: ReturnType<typeof makeClient>): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error(`getUser failed: ${error?.message ?? 'no user'}`)
  return data.user.id
}

// ─── Phase 1: non-admin user ───

console.log(`Phase 1 — non-admin (${TEST_USER_EMAIL})`)
let userClient: ReturnType<typeof makeClient>
let userId: string
try {
  userClient = await signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD!)
  userId = await getMyUserId(userClient)
  pass(`non-admin sign-in succeeds`)
} catch (err) {
  fail(`non-admin sign-in succeeds`, (err as Error).message)
  // Can't continue without a user session.
  printAndExit()
}

// 1a. INSERT-allow: write a synthetic failure event with the user's auth.uid().
// Use a real capability_id from learning_capabilities so the FK is satisfied.
const { data: someCap, error: capErr } = await userClient!
  .schema('indonesian')
  .from('learning_capabilities')
  .select('id, canonical_key')
  .eq('publication_status', 'published')
  .limit(1)
  .maybeSingle()
if (capErr || !someCap) {
  fail('INSERT-allow path setup', `cannot find any published capability for FK target: ${capErr?.message ?? 'no rows'}`)
} else {
  const insertResult = await userClient!
    .schema('indonesian')
    .from('capability_resolution_failure_events')
    .insert({
      capability_id: someCap.id,
      capability_key: someCap.canonical_key,
      reason_code: 'rls_smoke_test',
      exercise_type: 'recognition_mcq',
      user_id: userId!,
      session_id: null,
      block_id: 'rls-smoke-test',
      payload_json: { source: 'check-supabase-rls.ts' },
    })
  if (insertResult.error) {
    fail('non-admin can INSERT own row', insertResult.error.message)
  } else {
    pass('non-admin can INSERT own row')
  }
}

// 1b. SELECT-deny on the table (admin-only policy).
const { data: tableRows, error: tableErr } = await userClient!
  .schema('indonesian')
  .from('capability_resolution_failure_events')
  .select('id')
if (tableErr) {
  fail('non-admin SELECT denied (table)', `unexpected error: ${tableErr.message}`)
} else if ((tableRows ?? []).length > 0) {
  fail('non-admin SELECT denied (table)', `expected 0 rows, got ${tableRows?.length} — RLS misconfigured`)
} else {
  pass('non-admin SELECT denied (table)')
}

// 1c. SELECT-deny on the view (security_invoker delegates to underlying RLS).
const { data: viewRows, error: viewErr } = await userClient!
  .schema('indonesian')
  .from('capability_resolution_issues')
  .select('capability_id')
if (viewErr) {
  fail('non-admin SELECT denied (view)', `unexpected error: ${viewErr.message}`)
} else if ((viewRows ?? []).length > 0) {
  fail('non-admin SELECT denied (view)', `expected 0 rows, got ${viewRows?.length} — view security_invoker likely missing`)
} else {
  pass('non-admin SELECT denied (view)')
}

// ─── Phase 2: admin user ───

console.log(`\nPhase 2 — admin (${TEST_ADMIN_EMAIL})`)
let adminClient: ReturnType<typeof makeClient>
try {
  adminClient = await signIn(TEST_ADMIN_EMAIL!, TEST_ADMIN_PASSWORD!)
  pass(`admin sign-in succeeds`)
} catch (err) {
  fail(`admin sign-in succeeds`, (err as Error).message)
  printAndExit()
}

// 2a. SELECT-allow on the table.
const { data: adminTableRows, error: adminTableErr } = await adminClient!
  .schema('indonesian')
  .from('capability_resolution_failure_events')
  .select('id')
if (adminTableErr) {
  fail('admin SELECT allowed (table)', adminTableErr.message)
} else if ((adminTableRows ?? []).length === 0) {
  fail('admin SELECT allowed (table)', 'expected ≥ 1 row (we just inserted one), got 0 — admin RLS policy may be wrong')
} else {
  pass('admin SELECT allowed (table)')
}

// 2b. SELECT-allow on the view.
const { data: adminViewRows, error: adminViewErr } = await adminClient!
  .schema('indonesian')
  .from('capability_resolution_issues')
  .select('capability_id, occurrence_count')
if (adminViewErr) {
  fail('admin SELECT allowed (view)', adminViewErr.message)
} else if ((adminViewRows ?? []).length === 0) {
  fail('admin SELECT allowed (view)', 'expected ≥ 1 row, got 0 — security_invoker may be denying admin too')
} else {
  pass('admin SELECT allowed (view)')
}

printAndExit()

function printAndExit(): never {
  console.log('\nResults:')
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const failed = results.filter(r => !r.ok)
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll RLS checks passed.')
  process.exit(0)
}
