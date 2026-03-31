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
  'podcasts',
  'learning_items',
  'item_meanings',
  'item_contexts',
  'item_answer_variants',
  'learner_item_state',
  'learner_skill_state',
  'review_events',
  'lesson_progress',
  'learning_sessions',
  'error_logs',
]

// Expected grants: table → { role → privileges[] }
const EXPECTED_GRANTS: Record<string, Record<string, string[]>> = {
  lessons:              { authenticated: ['SELECT'] },
  lesson_sections:      { authenticated: ['SELECT'] },
  podcasts:             { authenticated: ['SELECT'] },
  profiles:             { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  learning_items:       { authenticated: ['SELECT'] },
  item_meanings:        { authenticated: ['SELECT'] },
  item_contexts:        { authenticated: ['SELECT'] },
  item_answer_variants: { authenticated: ['SELECT'] },
  learner_item_state:   { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  learner_skill_state:  { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  review_events:        { authenticated: ['SELECT', 'INSERT'] },
  lesson_progress:      { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  learning_sessions:    { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  error_logs:           { authenticated: ['INSERT'] },
  user_roles:           { authenticated: ['SELECT'] },
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
  const { error } = await supabase.schema('indonesian').from(table).select('*').limit(0)
  if (error) {
    fail(`Service key read: ${table}`, error.message)
  } else {
    pass(`Service key read: ${table}`)
  }
}

// ── Check: profiles have preferred_session_size ───────────────────────────
{
  const { error } = await supabase
    .schema('indonesian')
    .from('profiles')
    .select('preferred_session_size')
    .limit(1)
  if (error) {
    fail('Profile preferred_session_size column', error.message)
  } else {
    pass('Profile preferred_session_size column exists')
  }
}

// ── Check: lessons have audio_path populated ──────────────────────────────
{
  const { data: lessons, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('title, audio_path')
  if (error) {
    fail('Lesson audio_path seeded', error.message)
  } else if (!lessons || lessons.length === 0) {
    fail('Lesson audio_path seeded', 'No lessons found — run: make seed-lessons SUPABASE_SERVICE_KEY=<key>')
  } else {
    const missing = lessons.filter((l: any) => !l.audio_path).map((l: any) => l.title)
    if (missing.length > 0) {
      fail('Lesson audio_path seeded', `Missing audio_path on: ${missing.join(', ')} — run: make seed-lessons SUPABASE_SERVICE_KEY=<key>`)
    } else {
      pass(`Lesson audio_path seeded (${lessons.length} lesson${lessons.length > 1 ? 's' : ''})`)
    }
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
