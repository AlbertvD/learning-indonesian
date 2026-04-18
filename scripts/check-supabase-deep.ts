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
  'audio_clips',
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
  audio_clips:          { authenticated: ['SELECT'] },
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

// ── Check: no orphaned grammar patterns (introduced_by_lesson_id IS NULL) ──
{
  const { data, error } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .select('slug')
    .is('introduced_by_lesson_id', null)
  if (error) {
    fail('Grammar patterns: no orphaned rows', error.message)
  } else if (data && data.length > 0) {
    fail(
      'Grammar patterns: no orphaned rows',
      `${data.length} pattern(s) have introduced_by_lesson_id = null: ${data.map((p: any) => p.slug).join(', ')} — re-publish the owning lesson`
    )
  } else {
    pass('Grammar patterns: no orphaned rows')
  }
}

// ── Check: exercise_variants exist for every lesson that has candidates ────
{
  const { data: lessons, error: lessonErr } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, title, order_index')
    .order('order_index')
  if (lessonErr) {
    fail('Exercise variants seeded per lesson', lessonErr.message)
  } else {
    for (const lesson of lessons ?? []) {
      const { count, error } = await supabase
        .schema('indonesian')
        .from('exercise_variants')
        .select('*', { count: 'exact', head: true })
        .eq('lesson_id', lesson.id)
      if (error) {
        fail(`Exercise variants: lesson ${lesson.order_index}`, error.message)
      } else if ((count ?? 0) === 0) {
        fail(
          `Exercise variants: lesson ${lesson.order_index}`,
          `0 exercise_variants for "${lesson.title}" — run: bun scripts/publish-approved-content.ts ${lesson.order_index}`
        )
      } else {
        pass(`Exercise variants: lesson ${lesson.order_index} (${count} variants)`)
      }
    }
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

// ── Check: get_audio_clips RPC function exists ────────────────────────────
{
  const { error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clips', { p_slugs: [] })
  // An error about missing function arg types or "does not exist" means the function is absent.
  // A successful call (empty result) or a type-mismatch error both indicate the function exists.
  if (error && error.message.includes('does not exist')) {
    fail(
      'RPC function exists: get_audio_clips',
      'Function indonesian.get_audio_clips not found — run: make migrate SUPABASE_SERVICE_KEY=<key>'
    )
  } else {
    pass('RPC function exists: get_audio_clips')
  }
}

// ── Check: listening_mcq registered in exercise_type_availability ────────
{
  const { data: availRow, error: availErr } = await supabase
    .schema('indonesian')
    .from('exercise_type_availability')
    .select('exercise_type, session_enabled')
    .eq('exercise_type', 'listening_mcq')
    .maybeSingle()

  if (availErr) {
    fail('listening_mcq registered', availErr.message)
  } else if (!availRow) {
    fail('listening_mcq registered', 'Row missing from exercise_type_availability — run: make migrate')
  } else if (!availRow.session_enabled) {
    fail('listening_mcq registered', 'Row exists but session_enabled=false')
  } else {
    pass('listening_mcq registered and session_enabled')
  }
}

// ── Check: audio coverage ────────────────────────────────────────────────
{
  const { data: coverage, error: covErr } = await supabase
    .schema('indonesian')
    .rpc('audio_coverage_report')
  if (covErr) {
    fail('Audio coverage RPC', covErr.message)
  } else if (coverage && coverage[0]) {
    const { total_word_phrase, with_audio, without_audio } = coverage[0]
    pass(`Audio coverage: ${with_audio}/${total_word_phrase} word/phrase items (${without_audio} missing)`)
  } else {
    fail('Audio coverage RPC', 'Empty result')
  }
}

// ── Check: learning_items.pos column exists (read-only introspection) ──────
{
  // Query via information_schema — safe, no side effects. If the column
  // is missing, the sample row below will lack `pos` in its keys.
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, pos')
    .limit(1)
  if (error) {
    if (error.message.includes('column') && error.message.includes('pos')) {
      fail(
        'learning_items.pos column exists',
        'Column learning_items.pos not found — run: make migrate SUPABASE_SERVICE_KEY=<key>'
      )
    } else {
      fail('learning_items.pos column exists', error.message)
    }
  } else {
    pass('learning_items.pos column exists')
    // Informational: per-POS distribution for word/phrase items
    const { data: distRows, error: distErr } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('pos, item_type')
      .in('item_type', ['word', 'phrase'])
    if (!distErr && distRows) {
      const counts: Record<string, number> = {}
      for (const r of distRows as { pos: string | null; item_type: string }[]) {
        counts[r.pos ?? 'null'] = (counts[r.pos ?? 'null'] ?? 0) + 1
      }
      console.log('  POS distribution (word/phrase):')
      for (const [pos, count] of Object.entries(counts).sort()) {
        console.log(`    ${pos}: ${count}`)
      }
      // suppress unused-var
      void data
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
