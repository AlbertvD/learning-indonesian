#!/usr/bin/env bun
// scripts/check-supabase-deep.ts
// Run with: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
// Requires: SUPABASE_SERVICE_KEY env var; VITE_SUPABASE_URL from .env.local
import { createClient } from '@supabase/supabase-js'
import { classifyDutchSeparator, classifyIndonesianSeparator } from '@/lib/capabilities'
import { isCapabilityMastered } from '@/lib/analytics/mastery/mastered'

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
  'item_contexts',
  'item_answer_variants',
  'learner_item_state',
  'learner_skill_state',
  'review_events',
  'lesson_progress',
  'learning_sessions',
  'error_logs',
  'audio_clips',
  'learner_lesson_activation',  // retirement #6
]

// Expected grants: table → { role → privileges[] }
const EXPECTED_GRANTS: Record<string, Record<string, string[]>> = {
  lessons:              { authenticated: ['SELECT'] },
  lesson_sections:      { authenticated: ['SELECT'] },
  podcasts:             { authenticated: ['SELECT'] },
  profiles:             { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  learning_items:       { authenticated: ['SELECT'] },
  item_contexts:        { authenticated: ['SELECT'] },
  item_answer_variants: { authenticated: ['SELECT'] },
  learner_item_state:   { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  learner_skill_state:  { authenticated: ['SELECT', 'INSERT', 'UPDATE'] },
  review_events:        { authenticated: ['SELECT', 'INSERT'] },
  lesson_progress:      { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  learning_sessions:    { authenticated: ['SELECT'] },
  error_logs:           { authenticated: ['INSERT'] },
  user_roles:           { authenticated: ['SELECT'] },
  audio_clips:          { authenticated: ['SELECT'] },
  learner_lesson_activation: { authenticated: ['SELECT'] },  // retirement #6 — writes via RPC only
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
  policies?: { table: string; policy: string; cmd: string; roles: string[] }[]
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

// ── Check: every RLS-enabled table has at least one policy ───────────────
// Caught a real production outage 2026-05-02 where 10 tables had RLS enabled
// but zero policies → every SELECT denied for the authenticated role. This
// guards against partial migrations or post-create policy drops.
const policyCount: Record<string, number> = {}
for (const p of report.policies ?? []) {
  policyCount[p.table] = (policyCount[p.table] ?? 0) + 1
}
for (const t of report.tables) {
  if (!t.rls_enabled) continue
  if ((policyCount[t.name] ?? 0) === 0) {
    fail(
      `Policies exist: ${t.name}`,
      `'indonesian.${t.name}' has RLS enabled with ZERO policies. Every SELECT/INSERT will be denied for non-superusers. ` +
      `Re-run the migration that declares the policies or apply scripts/migrations/2026-05-02-lesson-content-rls-policies.sql.`,
    )
  } else {
    pass(`Policies exist: ${t.name} (${policyCount[t.name]})`)
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

// ── Check: listening_mcq + dictation registered in exercise_type_availability ──
for (const exerciseType of ['listening_mcq', 'dictation']) {
  const { data: availRow, error: availErr } = await supabase
    .schema('indonesian')
    .from('exercise_type_availability')
    .select('exercise_type, session_enabled')
    .eq('exercise_type', exerciseType)
    .maybeSingle()

  if (availErr) {
    fail(`${exerciseType} registered`, availErr.message)
  } else if (!availRow) {
    fail(`${exerciseType} registered`, `Row missing from exercise_type_availability — run: make migrate`)
  } else if (!availRow.session_enabled) {
    fail(`${exerciseType} registered`, 'Row exists but session_enabled=false')
  } else {
    pass(`${exerciseType} registered and session_enabled`)
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

// ── HC4 (lesson-stage GT4 + §5 audio orchestrator): zero lesson-page texts
//      without an audio_clips row at the appropriate voice. Walks dialogue
//      lines (voiced via lesson_speakers[lesson_id,speaker]) and vocabulary/
//      expressions/numbers items (voiced via primary_voice). Reading-section
//      paragraphs use separate long-form lesson audio, out of scope for HC4.
{
  function normalizeForKey(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ')
  }

  const { data: lessonRows, error: lessonsErr } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index, primary_voice')
  const { data: sectionRows, error: sectionsErr } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('lesson_id, content')
  const { data: speakerRows, error: speakersErr } = await supabase
    .schema('indonesian')
    .from('lesson_speakers')
    .select('lesson_id, speaker, voice_id')

  if (lessonsErr || sectionsErr || speakersErr) {
    fail('HC4 audio coverage parity for dialogue + vocab', (lessonsErr ?? sectionsErr ?? speakersErr)!.message)
  } else {
    interface Required { normalized: string; voiceId: string; lessonId: string; sourceLabel: string }
    const required: Required[] = []
    const lessonsById = new Map<string, { primary_voice: string | null }>()
    for (const l of (lessonRows ?? []) as Array<{ id: string; primary_voice: string | null }>) {
      lessonsById.set(l.id, { primary_voice: l.primary_voice })
    }
    const voicesBy = new Map<string, string>()
    for (const r of (speakerRows ?? []) as Array<{ lesson_id: string; speaker: string; voice_id: string }>) {
      voicesBy.set(`${r.lesson_id}:${r.speaker.trim()}`, r.voice_id)
    }

    for (const sec of (sectionRows ?? []) as Array<{ lesson_id: string; content: Record<string, unknown> }>) {
      const lesson = lessonsById.get(sec.lesson_id)
      if (!lesson) continue
      const type = sec.content?.type
      if (type === 'dialogue') {
        const lines = sec.content.lines
        if (!Array.isArray(lines)) continue
        for (const line of lines as Array<{ text?: unknown; speaker?: unknown }>) {
          if (typeof line.text !== 'string' || !line.text.trim()) continue
          if (typeof line.speaker !== 'string' || !line.speaker.trim()) continue
          const voice = voicesBy.get(`${sec.lesson_id}:${line.speaker.trim()}`)
          if (!voice) continue // GT4 covers missing-voice; HC4 skips lines without resolvable voice
          required.push({
            normalized: normalizeForKey(line.text),
            voiceId: voice,
            lessonId: sec.lesson_id,
            sourceLabel: `dialogue line "${line.text.slice(0, 30)}…"`,
          })
        }
      } else if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
        const items = sec.content.items
        if (!Array.isArray(items) || !lesson.primary_voice) continue
        for (const item of items as Array<{ indonesian?: unknown }>) {
          if (typeof item.indonesian !== 'string' || !item.indonesian.trim()) continue
          required.push({
            normalized: normalizeForKey(item.indonesian),
            voiceId: lesson.primary_voice,
            lessonId: sec.lesson_id,
            sourceLabel: `${type} item "${item.indonesian}"`,
          })
        }
      }
    }

    if (required.length === 0) {
      pass('HC4 audio coverage parity (dialogue + vocab) — nothing to check')
    } else {
      const allTexts = [...new Set(required.map((r) => r.normalized))]
      const allVoices = [...new Set(required.map((r) => r.voiceId))]
      const { data: clips, error: clipsErr } = await supabase
        .schema('indonesian')
        .rpc('get_audio_clips', { p_texts: allTexts, p_voice_ids: allVoices })
      if (clipsErr) {
        fail('HC4 audio coverage parity', clipsErr.message)
      } else {
        const present = new Set<string>()
        for (const row of (clips ?? []) as Array<{ normalized_text: string; voice_id: string }>) {
          present.add(`${row.normalized_text}|${row.voice_id}`)
        }
        const gaps = required.filter((r) => !present.has(`${r.normalized}|${r.voiceId}`))
        if (gaps.length === 0) {
          pass(`HC4 audio coverage parity: ${required.length} (text, voice) pair(s) all present`)
        } else {
          const sample = gaps.slice(0, 3).map((g) => `${g.sourceLabel} (voice=${g.voiceId})`).join('; ')
          fail(
            'HC4 audio coverage parity',
            `${gaps.length}/${required.length} (text, voice) pair(s) missing audio_clips rows. ` +
            `Sample: ${sample}${gaps.length > 3 ? ' …' : ''}\n` +
            `   → Re-run bun scripts/publish-approved-content.ts <N> for affected lesson(s) — ` +
            `the audio orchestrator will fill gaps.`,
          )
        }
      }
    }
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

// ── HC1 (lesson-stage GT1): zero grammar/reference_table sections with NULL or
//      empty content.grammar_topics. Failure routes to linguist-structurer +
//      re-publish (per spec §11.4).
{
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, content')
    .in('content->>type', ['grammar', 'reference_table'])
  if (error) {
    fail('HC1 lesson_sections.content.grammar_topics non-empty', error.message)
  } else {
    const offenders: string[] = []
    for (const row of (data ?? []) as Array<{ id: string; content: Record<string, unknown> }>) {
      const topics = row.content?.grammar_topics
      const ok =
        Array.isArray(topics)
        && (topics as unknown[]).some((t) => typeof t === 'string' && t.trim().length > 0)
      if (!ok) offenders.push(row.id)
    }
    if (offenders.length === 0) {
      pass('HC1 lesson_sections.content.grammar_topics non-empty for grammar/reference_table')
    } else {
      fail(
        'HC1 lesson_sections.content.grammar_topics non-empty for grammar/reference_table',
        `${offenders.length} section(s) with NULL/empty grammar_topics: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-run linguist-structurer for affected lesson(s) and re-publish via bun scripts/publish-approved-content.ts <N>.`,
      )
    }
  }
}

// HC2 (lesson_page_blocks block_kind canonical-set check) was retired in PR 5
// when the lesson_page_blocks table was dropped. The generic page-block render
// path no longer exists; bespoke pages are the sole lesson renderer.

// ── HC5 (lesson-stage GT5): zero lesson_sections rows with content->>'type'
//      outside the 10-value canonical set. Failure routes to GT5 validator
//      regression check (per spec §11.4).
{
  const CANONICAL = [
    'text', 'grammar', 'reference_table', 'vocabulary', 'expressions',
    'numbers', 'dialogue', 'pronunciation', 'culture', 'exercises',
  ]
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, content')
    .not('content->>type', 'is', null)
  if (error) {
    fail('HC5 lesson_sections.content.type ∈ canonical set', error.message)
  } else {
    const offenders: { id: string; type: string }[] = []
    for (const row of (data ?? []) as Array<{ id: string; content: Record<string, unknown> }>) {
      const type = row.content?.type
      if (typeof type === 'string' && !CANONICAL.includes(type)) {
        offenders.push({ id: row.id, type })
      }
    }
    if (offenders.length === 0) {
      pass('HC5 lesson_sections.content.type ∈ canonical 10-value set')
    } else {
      fail(
        'HC5 lesson_sections.content.type ∈ canonical 10-value set',
        `${offenders.length} section(s) with non-canonical type: ${offenders.slice(0, 5).map((o) => `${o.id}=${o.type}`).join(', ')}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Likely a pipeline regression — check GT5 validator's last release.`,
      )
    }
  }
}

// ── HC8 (Decision 3b / ADR 0006): zero non-podcast learning_capabilities
//      rows with NULL lesson_id. The CHECK constraint
//      learning_capabilities_lesson_id_required_for_lessons enforces this at
//      the DB layer; this check is the defence-in-depth assertion that fires
//      if the constraint was ever dropped or bypassed.
{
  // PR 1.5: filter retired_at IS NULL — retired caps may legitimately have
  // null lesson_id once we eventually relax the constraint, and they don't
  // affect runtime; ADR 0006 only constrains caps the runtime sees.
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, source_kind, canonical_key')
    .is('lesson_id', null)
    .is('retired_at', null)
    .not('source_kind', 'in', '("podcast_segment","podcast_phrase")')
  if (error) {
    fail('HC8 learning_capabilities.lesson_id non-null for non-podcast caps (ADR 0006)', error.message)
  } else {
    const offenders = (data ?? []) as Array<{ id: string; source_kind: string; canonical_key: string }>
    if (offenders.length === 0) {
      pass('HC8 learning_capabilities.lesson_id non-null for non-podcast caps (ADR 0006)')
    } else {
      fail(
        'HC8 learning_capabilities.lesson_id non-null for non-podcast caps (ADR 0006)',
        `${offenders.length} non-podcast cap(s) with NULL lesson_id: ` +
        `${offenders.slice(0, 5).map((o) => `${o.canonical_key} (${o.source_kind})`).join(', ')}` +
        `${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-run scripts/triage-residual-capabilities.ts and verify the CHECK constraint ` +
        `learning_capabilities_lesson_id_required_for_lessons is still present.`,
      )
    }
  }
}

// ── HC9 (issue #59): zero item-source-kind learning_capabilities rows
//      whose source_ref slug does not resolve against
//      learning_items.normalized_text. Sibling to HC8.
//
//      EXPECTED RED until issue #58 cleanup completes — that is the
//      SIGNAL that drives the cleanup. Once #58 runs the re-publish and
//      clears orphan rows, HC9 should turn green and stay green. Do not
//      treat as a regression in the interim.
//
//      Pagination: learning_capabilities holds ~2,649 rows; PostgREST's
//      default cap is 1,000, so fetch in chunks via .range() until a
//      page comes back short.
{
  type ItemCap = { canonical_key: string; source_ref: string }
  type ItemSlugRow = { normalized_text: string }

  async function fetchAllItemCaps(): Promise<ItemCap[]> {
    const pageSize = 1000
    const all: ItemCap[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .select('canonical_key, source_ref')
        .eq('source_kind', 'item')
        .like('source_ref', 'learning_items/%')
        .is('retired_at', null)
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemCap[]
      all.push(...rows)
      if (rows.length < pageSize) break
    }
    return all
  }

  async function fetchAllNormalizedTexts(): Promise<Set<string>> {
    const pageSize = 1000
    const slugs = new Set<string>()
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .select('normalized_text')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemSlugRow[]
      for (const row of rows) slugs.add(row.normalized_text)
      if (rows.length < pageSize) break
    }
    return slugs
  }

  try {
    const [caps, slugs] = await Promise.all([fetchAllItemCaps(), fetchAllNormalizedTexts()])
    const offenders = caps.filter((c) => !slugs.has(c.source_ref.replace(/^learning_items\//, '')))
    if (offenders.length === 0) {
      pass('HC9 item caps source_ref resolves to learning_items.normalized_text (#59)')
    } else {
      fail(
        'HC9 item caps source_ref resolves to learning_items.normalized_text (#59) — EXPECTED RED until issue #58 cleanup completes',
        `${offenders.length} item-cap(s) with unresolvable source_ref: ` +
        `${offenders.slice(0, 5).map((o) => `${o.source_ref} (${o.canonical_key})`).join(', ')}` +
        `${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Run issue #58 cleanup: re-publish affected lessons (the fix to the slug ` +
        `generator landed in #59; re-publishing rewrites existing source_refs in the ` +
        `space-preserving shape).`,
      )
    }
  } catch (err) {
    fail(
      'HC9 item caps source_ref resolves to learning_items.normalized_text (#59)',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ── HC10: zero item-source-kind learning_capabilities reference a
//        learning_item whose is_active=false. The runtime resolves item
//        caps by source_ref → normalized_text, then expects the item to
//        be active. The 2026-04-24 incident left dialogue_chunk rows at
//        is_active=false; the capability-stage runner's upsertLearningItem
//        now always writes is_active=true (adapter.ts), but lessons
//        published before that fix still carry inactive items referenced
//        by live caps. Re-publishing those lessons clears the violation.
//
//        EXPECTED RED for L7/L8 (and any other lesson whose dialogue
//        chunks were inactive at the time of the fix) until they are
//        re-published with the runner change.
{
  type ItemCap = { source_ref: string; capability_type: string; lesson_id: string | null }
  type ItemActivityRow = { normalized_text: string; is_active: boolean; item_type: string }

  async function fetchAllItemCapsWithLesson(): Promise<ItemCap[]> {
    const pageSize = 1000
    const all: ItemCap[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .select('source_ref, capability_type, lesson_id')
        .eq('source_kind', 'item')
        .like('source_ref', 'learning_items/%')
        .is('retired_at', null)
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemCap[]
      all.push(...rows)
      if (rows.length < pageSize) break
    }
    return all
  }

  async function fetchAllItemActivity(): Promise<Map<string, ItemActivityRow>> {
    const pageSize = 1000
    const byNorm = new Map<string, ItemActivityRow>()
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .select('normalized_text, is_active, item_type')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemActivityRow[]
      for (const row of rows) byNorm.set(row.normalized_text, row)
      if (rows.length < pageSize) break
    }
    return byNorm
  }

  try {
    const [caps, items] = await Promise.all([fetchAllItemCapsWithLesson(), fetchAllItemActivity()])
    const offenders: Array<{ slug: string; capability_type: string; lesson_id: string | null; item_type: string }> = []
    for (const c of caps) {
      const slug = c.source_ref.replace(/^learning_items\//, '')
      const it = items.get(slug)
      if (!it) continue   // HC9 already covers unresolved slugs
      if (!it.is_active) {
        offenders.push({ slug, capability_type: c.capability_type, lesson_id: c.lesson_id, item_type: it.item_type })
      }
    }
    if (offenders.length === 0) {
      pass('HC10 item caps reference active learning_items (dialogue is_active invariant)')
    } else {
      const lessonsAffected = new Set(offenders.map((o) => o.lesson_id ?? 'null'))
      offenders.sort((a, b) => a.slug.localeCompare(b.slug) || a.capability_type.localeCompare(b.capability_type))
      const sample = offenders.slice(0, 5).map((o) => `${o.capability_type} '${o.slug}' (${o.item_type})`).join(', ')
      fail(
        'HC10 item caps reference active learning_items (dialogue is_active invariant) — EXPECTED RED until affected lessons re-publish',
        `${offenders.length} cap(s) point at is_active=false items across ${lessonsAffected.size} lesson(s). ` +
        `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-publish the affected lessons: bun scripts/publish-approved-content.ts <N>. ` +
        `The runner's upsertLearningItem now always writes is_active=true, so re-publishing ` +
        `clears the violation.`,
      )
    }
  } catch (err) {
    fail(
      'HC10 item caps reference active learning_items (dialogue is_active invariant)',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ── HC11 retired (PR 2 slice): dialogue_line readiness no longer depends on
//        capability_artifacts. The legacy three-artifact check (cloze_context /
//        cloze_answer / translation:l1) was removed when dialogue_line moved
//        fully onto the typed `dialogue_clozes` table. HC15 below ("every
//        dialogue_line cap has a dialogue_clozes row") is the live-DB invariant
//        now; structural well-formedness is the table's NOT NULL columns +
//        the pre-write validateDialogueClozes gate.

// ── HC12 retired (PR 3 slice): affixed_form_pair readiness no longer depends
//        on capability_artifacts. The legacy two-artifact check (root_derived_pair
//        / allomorph_rule) was removed when affixed_form_pair moved fully onto the
//        typed `affixed_form_pairs` table. HC17 below ("every active
//        affixed_form_pair cap has an affixed_form_pairs row") is the live-DB
//        invariant now; structural well-formedness is the table's NOT NULL
//        columns + the pre-write validateAffixedFormPairs gate.

// ── HC13 (PR 1 of 2026-05-22-data-model-migration.md): every item source_kind
//        cap references a learning_item whose translation_nl is non-null. PR 1
//        switched src/lib/exercise-content/byKind/item.ts to read translation
//        directly from learning_items (Decision R), and the reader throws
//        CapabilityDataMissingError on null. This check makes the broken state
//        visible at the health-check layer so it cannot slip past CI.
//
//        EXPECTED RED for lessons not yet re-published after the migration
//        (lessons 5, 7, 8 as of 2026-05-22 — blocked by pre-existing
//        dialogue-cloze-missing CRIT lint errors). Resolves on re-publish.
{
  type ItemCap = { canonical_key: string; source_ref: string; lesson_id: string | null }
  type ItemNlRow = { normalized_text: string; translation_nl: string | null }

  async function fetchAllItemCaps(): Promise<ItemCap[]> {
    const pageSize = 1000
    const all: ItemCap[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .select('canonical_key, source_ref, lesson_id')
        .eq('source_kind', 'item')
        .like('source_ref', 'learning_items/%')
        .is('retired_at', null)
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemCap[]
      all.push(...rows)
      if (rows.length < pageSize) break
    }
    return all
  }

  async function fetchItemTranslations(): Promise<Map<string, ItemNlRow>> {
    const pageSize = 1000
    const byNorm = new Map<string, ItemNlRow>()
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .select('normalized_text, translation_nl')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as ItemNlRow[]
      for (const row of rows) byNorm.set(row.normalized_text, row)
      if (rows.length < pageSize) break
    }
    return byNorm
  }

  try {
    const [caps, items] = await Promise.all([fetchAllItemCaps(), fetchItemTranslations()])
    const offenders: Array<{ slug: string; canonical_key: string; lesson_id: string | null }> = []
    for (const c of caps) {
      const slug = c.source_ref.replace(/^learning_items\//, '')
      const it = items.get(slug)
      if (!it) continue   // HC9 already covers unresolvable slugs
      if (it.translation_nl === null) {
        offenders.push({ slug, canonical_key: c.canonical_key, lesson_id: c.lesson_id })
      }
    }
    if (offenders.length === 0) {
      pass(`HC13 item caps reference learning_items with translation_nl populated (${caps.length} cap(s) checked)`)
    } else {
      const lessonsAffected = new Set(offenders.map(o => o.lesson_id ?? 'null'))
      offenders.sort((a, b) => a.slug.localeCompare(b.slug))
      const sample = offenders.slice(0, 5).map(o => `'${o.slug}'`).join(', ')
      fail(
        'HC13 item caps reference learning_items with translation_nl populated (Decision R) — EXPECTED RED until affected lessons re-publish',
        `${offenders.length} cap(s) point at learning_items with translation_nl=null across ${lessonsAffected.size} lesson(s). ` +
        `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-publish the affected lessons: bun scripts/publish-approved-content.ts <N>. ` +
        `Stage B's vocab projector populates translation_nl/en on every learning_item.`,
      )
    }
  } catch (err) {
    fail(
      'HC13 item caps reference learning_items with translation_nl populated (Decision R)',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ── HC14 (PR 1.5 of 2026-05-21-data-model-migration.md): no learner is
//        currently scheduled to review a retired capability. Retired caps
//        (learning_capabilities.retired_at IS NOT NULL) must be invisible to
//        the session-builder; if a learner_capability_state row with
//        next_due_at <= now() exists for a retired cap, either:
//          (a) a reader is missing the .is('retired_at', null) filter
//              (writer/reader/validator triangle gap), OR
//          (b) the retire writer accidentally retired an in-use cap.
//        Both are bugs the user would feel as "the session offered a card
//        for content that no longer exists in the lesson." Pure-DB tripwire.
{
  type RetiredDueRow = {
    capability_id: string
    next_due_at: string
    learning_capabilities: { canonical_key: string; retired_at: string | null } | null
  }
  const nowIso = new Date().toISOString()
  // PostgREST embed: pull the parent row inline. PostgREST returns the inner
  // object as `learning_capabilities`. Filtering on the embed via
  // `learning_capabilities.retired_at` requires the !inner hint so the embed
  // is treated as a join filter, not a post-fetch nullable.
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_capability_state')
    .select('capability_id, next_due_at, learning_capabilities!inner(canonical_key, retired_at)')
    .lte('next_due_at', nowIso)
    .not('learning_capabilities.retired_at', 'is', null)
    .limit(20)
  if (error) {
    fail('HC14 no scheduler row references a retired capability (PR 1.5 soft-retire invariant)', error.message)
  } else {
    const offenders = (data ?? []) as unknown as RetiredDueRow[]
    if (offenders.length === 0) {
      pass('HC14 no scheduler row references a retired capability (PR 1.5 soft-retire invariant)')
    } else {
      const sample = offenders.slice(0, 5)
        .map((o) => `${o.learning_capabilities?.canonical_key ?? o.capability_id} (due ${o.next_due_at})`)
        .join(', ')
      fail(
        'HC14 no scheduler row references a retired capability (PR 1.5 soft-retire invariant)',
        `${offenders.length}+ scheduler rows pointing at retired caps with next_due_at <= now(). ` +
        `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Either a reader is missing .is('retired_at', null) (check session-builder/lessons/` +
        `mastery adapters), or a cap was incorrectly retired (check the re-publish that produced ` +
        `the retire_at timestamp).`,
      )
    }
  }
}

// ── HC15 (PR 2 of 2026-05-22-data-model-migration.md): every active
//        dialogue_line capability has exactly one `dialogue_clozes` row.
//        The fail-loud reader at src/lib/exercise-content/byKind/dialogueLine.ts
//        surfaces `dialogue_line_typed_row_missing` for any cap that fails this
//        invariant — HC15 is the structural mirror so the regression is
//        caught at health-check time rather than at session-render time.
//        Lesson learned from PR 1: ship the live-DB HC in the SAME PR as
//        the typed-table reader.
//
//        Implementation note: PostgREST cannot directly express "left join
//        and filter parent on embed.col IS NULL" — the embed-side `.is()`
//        filters the embedded row, not the parent's visibility. We instead
//        fetch the two id sets and difference them in code.
{
  const { data: capRows, error: capsError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_ref')
    .eq('source_kind', 'dialogue_line')
    .is('retired_at', null)
  if (capsError) {
    fail('HC15 every active dialogue_line cap has a dialogue_clozes row (PR 2)', capsError.message)
  } else {
    const activeCaps = (capRows ?? []) as Array<{ id: string; canonical_key: string; source_ref: string }>
    if (activeCaps.length === 0) {
      pass('HC15 every active dialogue_line cap has a dialogue_clozes row (PR 2) (no dialogue_line caps in DB; vacuously green)')
    } else {
      const { data: dcRows, error: dcError } = await supabase
        .schema('indonesian')
        .from('dialogue_clozes')
        .select('capability_id')
        .in('capability_id', activeCaps.map((c) => c.id))
      if (dcError) {
        fail('HC15 every active dialogue_line cap has a dialogue_clozes row (PR 2)', dcError.message)
      } else {
        const haveClozes = new Set(((dcRows ?? []) as Array<{ capability_id: string }>).map((r) => r.capability_id))
        const offenders = activeCaps.filter((c) => !haveClozes.has(c.id))
        if (offenders.length === 0) {
          pass(`HC15 every active dialogue_line cap has a dialogue_clozes row (PR 2) (${activeCaps.length} cap(s) checked)`)
        } else {
          const sample = offenders.slice(0, 5).map((o) => `${o.canonical_key} (${o.source_ref})`).join(', ')
          fail(
            'HC15 every active dialogue_line cap has a dialogue_clozes row (PR 2)',
            `${offenders.length}+ active dialogue_line caps with no dialogue_clozes row. ` +
            `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
            `   → Either re-publish the affected lessons (Stage B writes dialogue_clozes via the ` +
            `dialogueArtifacts projector) or run scripts/migrate-typed-tables-pr2-dialogue.ts to ` +
            `bridge from the legacy capability_artifacts rows.`,
          )
        }
      }
    }
  }
}

// ── HC16 (PR 2 of 2026-05-22-data-model-migration.md): every dialogue_clozes
//        row points at a real `lesson_dialogue_lines` row. The DB FK enforces
//        this on write, but HC16 catches:
//          - a manual DELETE on lesson_dialogue_lines that bypasses cascade
//            (unlikely — FK is `on delete cascade`),
//          - a Postgres-side referential integrity drift,
//          - a race where the typed-row reader fetched a dialogue_clozes
//            row but the JOIN returned null (which the reader surfaces as
//            `dialogue_line_typed_row_missing` per byKind/dialogueLine.ts).
//        Strict zero on this query is the structural invariant the reader
//        relies on.
{
  const { count, error } = await supabase
    .schema('indonesian')
    .from('dialogue_clozes')
    .select('id', { count: 'exact', head: true })
    .is('dialogue_line_id', null)
  if (error) {
    fail('HC16 dialogue_clozes.dialogue_line_id is never null (PR 2)', error.message)
  } else if ((count ?? 0) === 0) {
    pass('HC16 dialogue_clozes.dialogue_line_id is never null (PR 2)')
  } else {
    fail(
      'HC16 dialogue_clozes.dialogue_line_id is never null (PR 2)',
      `${count} dialogue_clozes row(s) have NULL dialogue_line_id. The DB FK is NOT NULL — this means data drift or a writer regression. Investigate replaceDialogueClozes in capability-stage/adapter.ts.`,
    )
  }
}

// ── HC17 (PR 3 of 2026-05-22-data-model-migration.md): every active
//        affixed_form_pair capability has exactly one `affixed_form_pairs` row.
//        The fail-loud reader at src/lib/exercise-content/byKind/affixedFormPair.ts
//        surfaces `affixed_form_pair_typed_row_missing` for any cap that fails
//        this invariant — HC17 is the structural mirror (replacing the retired
//        HC12 artifact check) so the regression is caught at health-check time
//        rather than at session-render time.
//
//        No HC18 (pattern link resolution): the shipped affixed_form_pairs DDL
//        (scripts/migration.sql:2420-2431) has no pattern_source_ref column —
//        the §6.5 plan named one, but PR 0 did not add it (staging's
//        patternSourceRef is a source_ref, not a grammar_patterns.slug). There
//        is no nullable FK on affixed_form_pairs to assert, so the no-orphan
//        HC17 is the sole live invariant for this source kind.
//
//        Implementation note (same as HC15): PostgREST can't express "left join
//        and filter parent on embed IS NULL", so we fetch the two id sets and
//        difference them in code.
{
  const { data: capRows, error: capsError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_ref')
    .eq('source_kind', 'affixed_form_pair')
    .is('retired_at', null)
  if (capsError) {
    fail('HC17 every active affixed_form_pair cap has an affixed_form_pairs row (PR 3)', capsError.message)
  } else {
    const activeCaps = (capRows ?? []) as Array<{ id: string; canonical_key: string; source_ref: string }>
    if (activeCaps.length === 0) {
      pass('HC17 every active affixed_form_pair cap has an affixed_form_pairs row (PR 3) (no affixed_form_pair caps in DB; vacuously green)')
    } else {
      const { data: afpRows, error: afpError } = await supabase
        .schema('indonesian')
        .from('affixed_form_pairs')
        .select('capability_id')
        .in('capability_id', activeCaps.map((c) => c.id))
      if (afpError) {
        fail('HC17 every active affixed_form_pair cap has an affixed_form_pairs row (PR 3)', afpError.message)
      } else {
        const havePairs = new Set(((afpRows ?? []) as Array<{ capability_id: string }>).map((r) => r.capability_id))
        const offenders = activeCaps.filter((c) => !havePairs.has(c.id))
        if (offenders.length === 0) {
          pass(`HC17 every active affixed_form_pair cap has an affixed_form_pairs row (PR 3) (${activeCaps.length} cap(s) checked)`)
        } else {
          const sample = offenders.slice(0, 5).map((o) => `${o.canonical_key} (${o.source_ref})`).join(', ')
          fail(
            'HC17 every active affixed_form_pair cap has an affixed_form_pairs row (PR 3)',
            `${offenders.length}+ active affixed_form_pair caps with no affixed_form_pairs row. ` +
            `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
            `   → Either re-publish the affected lessons (Stage B writes affixed_form_pairs via the ` +
            `morphology projector) or run scripts/migrate-typed-tables-pr3-affixed-form-pair.ts to ` +
            `bridge from the legacy capability_artifacts rows.`,
          )
        }
      }
    }
  }
}

// ── HC19 + HC20 (PR 4 of 2026-05-22-data-model-migration.md): every active
//        pattern capability resolves to typed grammar-exercise rows.
//
//        These tables are keyed by grammar_pattern_id (NOT capability_id), with
//        many rows per pattern. The cap → exercise link is:
//          source_ref (lesson-N/pattern-<slug>) → strip prefix → grammar_patterns.slug
//          → grammar_pattern_id → <typed table>.grammar_pattern_id
//        (verified 94/94 resolve, 2026-05-24). The fail-loud reader
//        (byKind/pattern.ts) surfaces `pattern_typed_row_missing` for any cap
//        whose chosen exercise_type has no row for its pattern — HC19/HC20 are
//        the structural no-orphan mirrors.
//
//        HC19: every pattern_contrast cap's pattern has ≥1 contrast_pair row.
//        HC20: every pattern_recognition cap's pattern has ≥1 row in at least
//              ONE of (sentence_transformation / constrained_translation /
//              cloze_mcq). Per-type coverage gaps remain possible (readiness is
//              structural, not data-existence — Decision R) and surface as a
//              fail-loud reader diagnostic if the resolver picks an empty type.
//
//        Implementation note (same as HC15/HC17): PostgREST can't express the
//        anti-join, so we fetch id sets and difference in code.
{
  const slugOf = (sourceRef: string) => sourceRef.replace(/^lesson-\d+\/pattern-/u, '')

  const { data: capRows, error: capsError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_ref, capability_type')
    .eq('source_kind', 'pattern')
    .is('retired_at', null)
  if (capsError) {
    fail('HC19 every active pattern_contrast cap resolves to a contrast_pair row (PR 4)', capsError.message)
    fail('HC20 every active pattern_recognition cap resolves to a recognition grammar row (PR 4)', capsError.message)
  } else {
    const caps = (capRows ?? []) as Array<{ id: string; canonical_key: string; source_ref: string; capability_type: string }>
    if (caps.length === 0) {
      pass('HC19 every active pattern_contrast cap resolves to a contrast_pair row (PR 4) (no pattern caps in DB; vacuously green)')
      pass('HC20 every active pattern_recognition cap resolves to a recognition grammar row (PR 4) (no pattern caps in DB; vacuously green)')
    } else {
      // slug → grammar_pattern_id
      const slugs = [...new Set(caps.map((c) => slugOf(c.source_ref)))]
      const { data: patternRows, error: pErr } = await supabase
        .schema('indonesian')
        .from('grammar_patterns')
        .select('id, slug')
        .in('slug', slugs)
      // active grammar_pattern_id set per table
      const activePatternIds = async (table: string): Promise<Set<string> | { error: string }> => {
        const { data, error } = await supabase
          .schema('indonesian')
          .from(table)
          .select('grammar_pattern_id')
          .eq('is_active', true)
        if (error) return { error: error.message }
        return new Set(((data ?? []) as Array<{ grammar_pattern_id: string }>).map((r) => r.grammar_pattern_id))
      }
      const contrastIds = await activePatternIds('contrast_pair_exercises')
      const stIds = await activePatternIds('sentence_transformation_exercises')
      const ctIds = await activePatternIds('constrained_translation_exercises')
      const cmIds = await activePatternIds('cloze_mcq_exercises')
      const firstErr = [contrastIds, stIds, ctIds, cmIds].find((x) => 'error' in (x as object)) as { error: string } | undefined

      if (pErr || firstErr) {
        const msg = pErr?.message ?? firstErr?.error ?? 'unknown'
        fail('HC19 every active pattern_contrast cap resolves to a contrast_pair row (PR 4)', msg)
        fail('HC20 every active pattern_recognition cap resolves to a recognition grammar row (PR 4)', msg)
      } else {
        const patternIdBySlug = new Map(((patternRows ?? []) as Array<{ id: string; slug: string }>).map((p) => [p.slug, p.id]))
        const contrastSet = contrastIds as Set<string>
        const recognitionUnion = new Set<string>([...(stIds as Set<string>), ...(ctIds as Set<string>), ...(cmIds as Set<string>)])

        const describe = (c: { canonical_key: string; source_ref: string }) => `${c.canonical_key} (${c.source_ref})`
        const reportFmt = (offenders: Array<{ canonical_key: string; source_ref: string }>) => {
          const sample = offenders.slice(0, 5).map(describe).join(', ')
          return `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
            `   → Run scripts/migrate-typed-tables-pr4-grammar.ts to bridge the existing exercise_variants, ` +
            `or re-publish (Stage B dual-writes the typed rows for not-yet-published candidates).`
        }

        // HC19 — pattern_contrast
        const contrastCaps = caps.filter((c) => c.capability_type === 'pattern_contrast')
        const contrastOffenders = contrastCaps.filter((c) => {
          const pid = patternIdBySlug.get(slugOf(c.source_ref))
          return !pid || !contrastSet.has(pid)
        })
        if (contrastOffenders.length === 0) {
          pass(`HC19 every active pattern_contrast cap resolves to a contrast_pair row (PR 4) (${contrastCaps.length} cap(s) checked)`)
        } else {
          fail('HC19 every active pattern_contrast cap resolves to a contrast_pair row (PR 4)',
            `${contrastOffenders.length}+ pattern_contrast caps with no contrast_pair row for their pattern. ${reportFmt(contrastOffenders)}`)
        }

        // HC20 — pattern_recognition (union of the 3 recognition tables)
        const recognitionCaps = caps.filter((c) => c.capability_type === 'pattern_recognition')
        const recognitionOffenders = recognitionCaps.filter((c) => {
          const pid = patternIdBySlug.get(slugOf(c.source_ref))
          return !pid || !recognitionUnion.has(pid)
        })
        if (recognitionOffenders.length === 0) {
          pass(`HC20 every active pattern_recognition cap resolves to a recognition grammar row (PR 4) (${recognitionCaps.length} cap(s) checked)`)
        } else {
          fail('HC20 every active pattern_recognition cap resolves to a recognition grammar row (PR 4)',
            `${recognitionOffenders.length}+ pattern_recognition caps with no sentence_transformation/constrained_translation/cloze_mcq row for their pattern. ${reportFmt(recognitionOffenders)}`)
        }
      }
    }
  }
}

// ── HC21 (PR 6 of 2026-05-22-data-model-migration.md §9): the typed
//        lesson-section capability-contract rows are bilingual + non-orphan.
//        These tables are WRITE-ONLY at PR 6 merge (no capability reader yet —
//        #98/#99), so the invariant is lesson-side data integrity, not a
//        cap→row resolve: every item row carries EN (l2_translation), every
//        grammar category carries EN (title_en + rules_en parallel to rules).
//        FK CASCADE guarantees structural non-orphanhood; this gate adds the
//        EN-coverage assertion the DONE bar requires (spec §8). Mirrors the
//        lesson-stage sectionShape (GT9) validator at the DB layer. Lessons
//        blocked from re-publish by pre-existing lint CRITICALs (L5/7/8 cloze
//        gaps) simply have no rows yet — they cannot produce offenders here.
{
  const { count: itemEnMissing, error: itemErr } = await supabase
    .schema('indonesian')
    .from('lesson_section_item_rows')
    .select('id', { count: 'exact', head: true })
    .is('l2_translation', null)
  if (itemErr) {
    fail('HC21 typed lesson-section item rows carry EN (PR 6)', itemErr.message)
  } else if ((itemEnMissing ?? 0) > 0) {
    fail('HC21 typed lesson-section item rows carry EN (PR 6)',
      `${itemEnMissing} lesson_section_item_rows row(s) with l2_translation IS NULL. ` +
      `→ Re-publish the affected lesson; the lesson-stage EN enricher fills l2_translation and GT9 gates it.`)
  } else {
    pass('HC21 typed lesson-section item rows carry EN (PR 6) (0 rows missing l2_translation)')
  }

  // Grammar categories: title_en present + rules_en parallel to rules. Array
  // length can't be compared via PostgREST filters, so fetch + compare in code
  // (small N).
  const { data: gcatRows, error: gcatErr } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_categories')
    .select('id, title, title_en, rules, rules_en')
  if (gcatErr) {
    fail('HC22 typed grammar categories carry EN (PR 6)', gcatErr.message)
  } else {
    const cats = (gcatRows ?? []) as Array<{ id: string; title: string; title_en: string | null; rules: string[] | null; rules_en: string[] | null }>
    const offenders = cats.filter((c) =>
      !c.title_en || (c.rules ?? []).length !== (c.rules_en ?? []).length || (c.rules_en ?? []).some((r) => !r || !r.trim()),
    )
    if (offenders.length === 0) {
      pass(`HC22 typed grammar categories carry EN (PR 6) (${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} checked)`)
    } else {
      const sample = offenders.slice(0, 5).map((o) => o.title).join(', ')
      fail('HC22 typed grammar categories carry EN (PR 6)',
        `${offenders.length} grammar categor(y/ies) missing title_en or with rules_en not parallel to rules. ` +
        `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-publish the affected lesson; the lesson-stage EN enricher fills title_en/rules_en and GT9 gates it.`)
    }
  }
}

// ── HC23 (Slice 2 Task 8, OQ2-3): zero orphan exercise_review_comments ───────
//      The FK exercise_review_comments.exercise_variant_id → exercise_variants(id)
//      was DROPPED (the column now holds a TYPED grammar-exercise row id). This
//      health check replaces the dropped referential integrity: every comment's
//      exercise_variant_id must resolve in one of the 4 typed exercise tables
//      (or, for legacy bridged comments, exercise_variants). An orphan means a
//      --regenerate/cutover deleted the typed row out from under a comment —
//      surfaced here for admin cleanup (getOpenComments already filters it from
//      the UI, so it is invisible, not crashing). Expect 0.
{
  const RESOLVE_TABLES = [
    'contrast_pair_exercises',
    'sentence_transformation_exercises',
    'constrained_translation_exercises',
    'cloze_mcq_exercises',
    'exercise_variants', // legacy bridged comments still resolve here
  ]
  try {
    // 1. All comment exercise_variant_ids (paginate; small today).
    const commentIds: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('exercise_review_comments')
        .select('exercise_variant_id')
        .range(offset, offset + 999)
      if (error) throw error
      const rows = (data ?? []) as Array<{ exercise_variant_id: string }>
      for (const r of rows) commentIds.push(r.exercise_variant_id)
      if (rows.length < 1000) break
    }

    if (commentIds.length === 0) {
      pass('HC23 zero orphan exercise_review_comments (no comments)')
    } else {
      // 2. Resolve the comment ids across the 4 typed tables + exercise_variants.
      const resolved = new Set<string>()
      const chunk = 200
      for (const table of RESOLVE_TABLES) {
        for (let i = 0; i < commentIds.length; i += chunk) {
          const slice = commentIds.slice(i, i + chunk)
          const { data, error } = await supabase
            .schema('indonesian')
            .from(table)
            .select('id')
            .in('id', slice)
          if (error) throw error
          for (const r of (data ?? []) as Array<{ id: string }>) resolved.add(r.id)
        }
      }
      const offenders = [...new Set(commentIds)].filter((id) => !resolved.has(id))
      if (offenders.length === 0) {
        pass(`HC23 zero orphan exercise_review_comments (${commentIds.length} comment(s) all resolve)`)
      } else {
        fail('HC23 zero orphan exercise_review_comments',
          `${offenders.length} comment(s) whose exercise_variant_id resolves in no typed exercise table ` +
          `nor exercise_variants: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? ' …' : ''}\n` +
          `   → A --regenerate/cutover deleted the commented exercise. Admin: delete the stale comment(s).`)
      }
    }
  } catch (err) {
    fail('HC23 zero orphan exercise_review_comments', err instanceof Error ? err.message : String(err))
  }
}

// ── HC24 (PR #129, paraphrase acceptance §2d): no live answer-bearing surface
//      uses a non-canonical alternatives separator. The canonical separator is
//      "/" (CONTEXT.md → Typed Artifact). Scans the TWO live answer paths:
//        (1) learning_items.translation_nl (Dutch) — word/phrase items only; a
//            sentence/dialogue_chunk "translation" is a full clause whose
//            commas/semicolons are punctuation, not OR-separators (and after
//            ADR 0014 those kinds are not harvested). Flags ";" or comma-as-OR.
//        (2) item_answer_variants.variant_text (Indonesian, language='id') —
//            flags ";" only (a comma is never an OR there: verbless equatives).
//      Detection uses the SHARED classifiers from @/lib/capabilities — the same
//      definition the runtime grader (splitAlternatives) + the CS19 gate use, so
//      this audit can never drift from what the grader actually accepts.
//      Deploy-ordering gate (plan §Deploy ordering M2): this must report ZERO
//      offenders before the grader stops splitting on comma — otherwise a
//      still-comma-authored meaning becomes one unmatchable target. The
//      bapak-style legacy translation_nl values are the expected initial hits.
{
  try {
    // (1) learning_items.translation_nl — word/phrase only.
    const dutchOffenders: Array<{ base_text: string; translation_nl: string; kind: string }> = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .select('base_text, item_type, translation_nl')
        .in('item_type', ['word', 'phrase'])
        .not('translation_nl', 'is', null)
        .range(offset, offset + 999)
      if (error) throw error
      const rows = (data ?? []) as Array<{ base_text: string; item_type: string; translation_nl: string | null }>
      for (const r of rows) {
        const v = r.translation_nl
        if (!v || v.trim().length === 0) continue
        const violation = classifyDutchSeparator(v)
        if (violation) dutchOffenders.push({ base_text: r.base_text, translation_nl: v, kind: violation })
      }
      if (rows.length < 1000) break
    }

    // (2) item_answer_variants.variant_text — Indonesian; ";" only.
    const idOffenders: Array<{ variant_text: string }> = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('item_answer_variants')
        .select('variant_text, language')
        .eq('language', 'id')
        .range(offset, offset + 999)
      if (error) throw error
      const rows = (data ?? []) as Array<{ variant_text: string; language: string }>
      for (const r of rows) {
        if (classifyIndonesianSeparator(r.variant_text)) idOffenders.push({ variant_text: r.variant_text })
      }
      if (rows.length < 1000) break
    }

    const total = dutchOffenders.length + idOffenders.length
    if (total === 0) {
      pass('HC24 no live answer surface uses a non-canonical separator (translation_nl + item_answer_variants)')
    } else {
      const dSample = dutchOffenders.slice(0, 5).map((o) => `"${o.base_text}"→"${o.translation_nl}" (${o.kind})`).join('; ')
      const iSample = idOffenders.slice(0, 5).map((o) => `"${o.variant_text}"`).join('; ')
      fail('HC24 no live answer surface uses a non-canonical separator',
        `${dutchOffenders.length} learning_items.translation_nl (Dutch) ` +
        `+ ${idOffenders.length} item_answer_variants (id) offender(s). ` +
        `The grader no longer splits on comma — re-author these to "/" (plan §2e) ` +
        `BEFORE the grader change deploys.\n` +
        (dutchOffenders.length ? `   translation_nl: ${dSample}${dutchOffenders.length > 5 ? ' …' : ''}\n` : '') +
        (idOffenders.length ? `   item_answer_variants: ${iSample}${idOffenders.length > 5 ? ' …' : ''}` : ''))
    }
  } catch (err) {
    fail('HC24 no live answer surface uses a non-canonical separator', err instanceof Error ? err.message : String(err))
  }
}

// ── HC25 (Slice 4b, #102): capability_artifacts dropped + readiness survives.
//      Layer-3 of the inert-change parity guard (memory/project_three_layer_invariant_gates).
//      (1) The capability_artifacts table must NOT exist — confirms the drop landed
//      and catches an accidental re-creation. A real SELECT returns PGRST205 for a
//      dropped table; a head-count would misleadingly return null/no-error, so we
//      probe with .select('*').limit(1) (see the 4a false-scare note).
//      (2) learning_capabilities must still carry ready+published caps — readiness
//      no longer reads an artifact bag, so a collapse to zero would mean the
//      routing-only derivation regressed. The one-time "no decrease vs the 4,057
//      apply baseline" is the operator's apply-time pre/post probe; this is the
//      durable steady-state guard that runs on every deploy.
{
  try {
    const { error: artErr } = await supabase
      .schema('indonesian')
      .from('capability_artifacts')
      .select('*')
      .limit(1)
    const tableGone = !!artErr && /PGRST205|could not find the table|does not exist/i.test(artErr.message ?? '')

    const { count: readyCount, error: readyErr } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('*', { count: 'exact', head: true })
      .eq('readiness_status', 'ready')
      .eq('publication_status', 'published')
      .is('retired_at', null)
    if (readyErr) throw readyErr

    if (!tableGone) {
      fail('HC25 capability_artifacts dropped',
        artErr ? `unexpected error probing capability_artifacts: ${artErr.message}`
               : 'capability_artifacts still exists — the Slice 4b drop did not land (or the table was re-created)')
    } else if ((readyCount ?? 0) <= 0) {
      fail('HC25 readiness survives capability_artifacts drop',
        '0 ready+published capabilities — the routing-only readiness derivation regressed')
    } else {
      pass(`HC25 capability_artifacts dropped + readiness intact (${readyCount} ready+published caps)`)
    }
  } catch (err) {
    fail('HC25 capability_artifacts dropped + readiness intact', err instanceof Error ? err.message : String(err))
  }
}

// ── HC26 (cap-v2 F1): no MCQ capability renders a DUPLICATE distractor option,
//        nor a distractor equal to the answer. Distractors are item-id pointers
//        (distractors.item_id) RENDERED as the item's gloss (text/audio_recognition
//        → translation_nl) or form (l1_to_id_choice → base_text). Two DISTINCT
//        item_ids can share a rendered string (e.g. two items glossed "rood"), so
//        the deterministic dedup (selectDistractors.dedupeByRendered) is the
//        writer-side guarantee and HC26 is the independent live-DB backstop — the
//        C8 enforcement seam (no separate pre-write validator; that would be
//        vacuous given the single deterministic writer).
//        EXPECTED RED until affected lessons are re-seeded (F5): a routine
//        re-publish skips seeded distractors (ADR 0011 seed-once), so the
//        legacy duplicates (5/43 L7 text_recognition caps at build time) persist
//        until an explicit `--regenerate-distractors <lesson>`.
{
  type DeepItem = { id: string; normalized_text: string; base_text: string; translation_nl: string | null }
  type DeepCap = { id: string; capability_type: string; source_ref: string; retired_at: string | null }
  const MEANING_CAPS = new Set(['text_recognition', 'audio_recognition'])
  const FORM_CAPS = new Set(['l1_to_id_choice'])
  async function fetchAllDeep<T>(table: string, select: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.schema('indonesian').from(table).select(select).range(from, from + 999)
      if (error) throw new Error(`${table}: ${error.message}`)
      out.push(...((data ?? []) as T[]))
      if (!data || data.length < 1000) break
    }
    return out
  }
  try {
    const items = await fetchAllDeep<DeepItem>('learning_items', 'id, normalized_text, base_text, translation_nl')
    const itemById = new Map(items.map((i) => [i.id, i]))
    const itemByNt = new Map(items.map((i) => [i.normalized_text, i]))
    const caps = (await fetchAllDeep<DeepCap>('learning_capabilities', 'id, capability_type, source_ref, retired_at'))
      .filter((c) => !c.retired_at && (MEANING_CAPS.has(c.capability_type) || FORM_CAPS.has(c.capability_type)))
    const capById = new Map(caps.map((c) => [c.id, c]))
    const distractors = await fetchAllDeep<{ capability_id: string; item_id: string }>('distractors', 'capability_id, item_id')
    const byCap = new Map<string, string[]>()
    for (const d of distractors) {
      if (!capById.has(d.capability_id)) continue
      if (!byCap.has(d.capability_id)) byCap.set(d.capability_id, [])
      byCap.get(d.capability_id)!.push(d.item_id)
    }
    const renderItem = (cap: DeepCap, it: DeepItem): string =>
      (MEANING_CAPS.has(cap.capability_type) ? (it.translation_nl ?? '') : it.base_text).toLowerCase().trim()
    const offenders: { type: string; strs: string[]; hasAnswer: boolean }[] = []
    for (const [capId, itemIds] of byCap) {
      const cap = capById.get(capId)!
      const strs = itemIds
        .map((id) => itemById.get(id))
        .filter((it): it is DeepItem => it != null)
        .map((it) => renderItem(cap, it))
        .filter((s) => s.length > 0)
      const answerItem = itemByNt.get(cap.source_ref.replace('learning_items/', ''))
      const answerStr = answerItem ? renderItem(cap, answerItem) : null
      const hasDup = new Set(strs).size < strs.length
      const hasAnswer = answerStr != null && answerStr.length > 0 && strs.includes(answerStr)
      if (hasDup || hasAnswer) offenders.push({ type: cap.capability_type, strs, hasAnswer })
    }
    if (offenders.length === 0) {
      pass(`HC26 no MCQ cap renders duplicate/answer distractors (cap-v2 F1) (${byCap.size} distractor-bearing caps checked)`)
    } else {
      const sample = offenders.slice(0, 5).map((o) => `${o.type} [${o.strs.join(' | ')}]${o.hasAnswer ? ' (==answer)' : ''}`).join('; ')
      fail(
        'HC26 no MCQ cap renders duplicate/answer distractors (cap-v2 F1) — EXPECTED RED until lessons re-seeded (F5)',
        `${offenders.length} cap(s) with a duplicate rendered distractor or a distractor == the answer. ` +
        `Sample: ${sample}${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Re-seed distractors (--regenerate-distractors <lesson>); the selector now dedups by rendered string, so a fresh seed clears these.`,
      )
    }
  } catch (err) {
    fail('HC26 no MCQ cap renders duplicate/answer distractors (cap-v2 F1)', err instanceof Error ? err.message : String(err))
  }
}

// HC27 — % mastered parity (ADR 0015 layer b). get_lessons_overview's
// mastered_capability_count (SQL mirror) must equal an independent recompute via
// the canonical TS predicate (isCapabilityMastered) for the test user, per
// lesson. Both run under service_role (RLS bypassed) so they see the same rows —
// this validates the SQL predicate == the TS predicate on live data, catching
// any behavioural divergence the structural literal test (layer a) can't.
{
  const TEST_USER_ID = '55023eba-0885-4999-9e46-41274e6b21ff'
  try {
    async function pageAll<T>(table: string, select: string, apply?: (q: any) => any): Promise<T[]> {
      const out: T[] = []
      for (let from = 0; ; from += 1000) {
        let q: any = supabase.schema('indonesian').from(table).select(select).range(from, from + 999)
        if (apply) q = apply(q)
        const { data, error } = await q
        if (error) throw new Error(`${table}: ${error.message}`)
        out.push(...((data ?? []) as T[]))
        if (!data || data.length < 1000) break
      }
      return out
    }
    type CapRow = { id: string; lesson_id: string | null; readiness_status: string; publication_status: string; retired_at: string | null }
    type StateRow = { capability_id: string; review_count: number | null; stability: number | null; last_reviewed_at: string | null; lapse_count: number | null; consecutive_failure_count: number | null }
    const caps = await pageAll<CapRow>('learning_capabilities', 'id, lesson_id, readiness_status, publication_status, retired_at')
    const states = await pageAll<StateRow>(
      'learner_capability_state',
      'capability_id, review_count, stability, last_reviewed_at, lapse_count, consecutive_failure_count',
      (q) => q.eq('user_id', TEST_USER_ID),
    )
    const stateByCap = new Map(states.map((s) => [s.capability_id, s]))
    const now = new Date()
    const expected = new Map<string, number>()
    for (const c of caps) {
      if (!c.lesson_id || c.retired_at || c.readiness_status !== 'ready' || c.publication_status !== 'published') continue
      const s = stateByCap.get(c.id)
      if (!s) continue
      if (isCapabilityMastered({
        reviewCount: s.review_count ?? 0,
        stability: s.stability,
        lastReviewedAt: s.last_reviewed_at,
        lapseCount: s.lapse_count ?? 0,
        consecutiveFailureCount: s.consecutive_failure_count ?? 0,
      }, now)) {
        expected.set(c.lesson_id, (expected.get(c.lesson_id) ?? 0) + 1)
      }
    }
    const { data: rpcRows, error: rpcErr } = await supabase.schema('indonesian').rpc('get_lessons_overview', { p_user_id: TEST_USER_ID })
    if (rpcErr) throw new Error(rpcErr.message)
    const mism: string[] = []
    for (const r of (rpcRows ?? []) as Array<{ lesson_id: string; mastered_capability_count: number }>) {
      const exp = expected.get(r.lesson_id) ?? 0
      if (Number(r.mastered_capability_count) !== exp) {
        mism.push(`${r.lesson_id}: rpc=${r.mastered_capability_count} ts=${exp}`)
      }
    }
    if (mism.length === 0) {
      const total = [...expected.values()].reduce((a, b) => a + b, 0)
      pass(`HC27 % mastered parity (RPC == TS predicate) — ${total} mastered cap(s) across ${expected.size} lesson(s) (ADR 0015)`)
    } else {
      fail('HC27 % mastered parity (RPC vs TS predicate)', `SQL/TS mastered predicate diverged for: ${mism.slice(0, 5).join('; ')}${mism.length > 5 ? ' …' : ''}`)
    }
  } catch (err) {
    fail('HC27 % mastered parity (RPC vs TS predicate)', err instanceof Error ? err.message : String(err))
  }
}

// HC28 — weekly movement parity (ADR 0015 layer b, #210). get_weekly_movement's
// SQL _mastery_label mirror must agree with a TS recompute over the same events.
// The canonical `mastered` rung reuses isCapabilityMastered; the surrounding rungs
// mirror labelForCapability. Vacuously green when the test user has no events this
// week (both sides 0) — still proves the RPC runs + shape.
{
  type StateJson = {
    reviewCount?: number; lapseCount?: number; consecutiveFailureCount?: number
    stability?: number | null; lastReviewedAt?: string | null
  }
  const rankOf = (s: StateJson, now: Date): number => {
    if ((s.consecutiveFailureCount ?? 0) > 0 || (s.lapseCount ?? 0) > 0) return 2 // at_risk
    if ((s.reviewCount ?? 0) === 0) return 1 // introduced
    if (isCapabilityMastered({
      reviewCount: s.reviewCount ?? 0, stability: s.stability,
      lastReviewedAt: s.lastReviewedAt, lapseCount: s.lapseCount ?? 0,
      consecutiveFailureCount: s.consecutiveFailureCount ?? 0,
    }, now)) return 4 // mastered
    if ((s.reviewCount ?? 0) >= 3 || (s.stability ?? 0) >= 5) return 3 // strengthening
    return 2 // learning
  }
  const isMastered = (s: StateJson, now: Date) => rankOf(s, now) === 4 && (s.consecutiveFailureCount ?? 0) === 0 && (s.lapseCount ?? 0) === 0
  const isAtRisk = (s: StateJson) => (s.consecutiveFailureCount ?? 0) > 0 || (s.lapseCount ?? 0) > 0
  const TEST_USER_ID = '55023eba-0885-4999-9e46-41274e6b21ff'
  try {
    const now = new Date()
    const mondayOffset = (now.getUTCDay() + 6) % 7
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset))
    const { data: events, error: evErr } = await supabase.schema('indonesian')
      .from('capability_review_events')
      .select('capability_id, state_before_json, state_after_json')
      .eq('user_id', TEST_USER_ID)
      .gte('created_at', weekStart.toISOString())
    if (evErr) throw new Error(evErr.message)
    const adv = new Set<string>(), reached = new Set<string>(), slip = new Set<string>()
    for (const e of (events ?? []) as Array<{ capability_id: string; state_before_json: StateJson; state_after_json: StateJson }>) {
      const b = e.state_before_json, a = e.state_after_json
      if (rankOf(a, now) > rankOf(b, now)) adv.add(e.capability_id)
      if (isMastered(a, now) && !isMastered(b, now)) reached.add(e.capability_id)
      if (isAtRisk(a) && !isAtRisk(b)) slip.add(e.capability_id)
    }
    const { data: rpc, error: rpcErr } = await supabase.schema('indonesian')
      .rpc('get_weekly_movement', { p_user_id: TEST_USER_ID, p_timezone: 'UTC' })
    if (rpcErr) throw new Error(rpcErr.message)
    const r = (rpc ?? {}) as { advanced?: number; reached_mastered?: number; slipped?: number }
    const ok = (r.advanced ?? 0) === adv.size && (r.reached_mastered ?? 0) === reached.size && (r.slipped ?? 0) === slip.size
    if (ok) {
      pass(`HC28 weekly movement parity (RPC == TS) — advanced=${adv.size} mastered=${reached.size} slipped=${slip.size} (ADR 0015)`)
    } else {
      fail('HC28 weekly movement parity (RPC vs TS)', `RPC {${r.advanced},${r.reached_mastered},${r.slipped}} vs TS {${adv.size},${reached.size},${slip.size}} — _mastery_label diverged`)
    }
  } catch (err) {
    fail('HC28 weekly movement parity', err instanceof Error ? err.message : String(err))
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
