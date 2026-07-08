#!/usr/bin/env bun
/**
 * retire-dropped-vocab-modes.ts — one-off Slice 1 content correction
 * (docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md §3.2,
 * ADR 0027: docs/adr/0027-vocabulary-mode-set-bounded.md).
 *
 * Two steps, run in order against the LIVE `learning_capabilities` table:
 *
 *   1. RETIRE — every `vocabulary_src` capability whose `capability_type` is
 *      in DROPPED_VOCAB_CAP_TYPES (#2 recognise_form_from_meaning_cap,
 *      #4 recall_meaning_from_text_cap, #5 produce_form_from_audio_cap) and
 *      is not already retired. Written via the exported, chunked
 *      `softRetireCapabilities` seam (capability-stage/adapter.ts) — the
 *      HC14-compliant write that sets `retired_at` AND clears the companion
 *      `learner_capability_state.next_due_at` for every user, reused rather
 *      than reimplemented.
 *
 *   2. REWRITE #6 PREREQS — every `vocabulary_src` /
 *      `produce_form_from_meaning_cap` (#6) row's `prerequisite_keys` is
 *      rewritten to `[#1's canonical key for the same source_ref]`. Before
 *      this script, #6 prereqs the now-retired #2; without the rewrite every
 *      not-yet-introduced #6 becomes permanently unintroducible
 *      (`missing_prerequisite`, `src/lib/session-builder/pedagogy.ts:320`).
 *      Idempotent: a #6 row already pointing at the #1 key is skipped.
 *
 * Dry-run by DEFAULT (no writes, prints a report). Pass --apply to execute.
 * Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL in .env.local.
 *
 * ⛔ LIVE-RUN GATE (spec §3.2): the --apply run writes
 * `learner_capability_state.next_due_at` across ALL users — a precious-table
 * write, one-way in practice. This is NOT part of autonomous PR execution:
 * Sonnet builds + tests this script with dry-run evidence only. The owner
 * (or main thread with the owner's explicit go-ahead) executes --apply as a
 * separate gated step, immediately after confirming the nightly backup
 * checkpoint exists (docs/process/restore-runbook.md), then re-runs
 * `make check-supabase-deep` (HC-A/HC-B will only go green after --apply).
 *
 * Usage:
 *   bun scripts/retire-dropped-vocab-modes.ts               # dry-run (default)
 *   bun scripts/retire-dropped-vocab-modes.ts --dry-run     # same, explicit
 *   bun scripts/retire-dropped-vocab-modes.ts --apply       # execute (OWNER-GATED — see above)
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

import { buildCanonicalKey, DROPPED_VOCAB_CAP_TYPES, KEPT_VOCAB_CAP_TYPES } from '@/lib/capabilities'
import { softRetireCapabilities, type CapabilitySupabaseClient } from './lib/pipeline/capability-stage/adapter'

// ─── Pure layer ─────────────────────────────────────────────────────────────

export interface VocabCapRow {
  id: string
  canonical_key: string
  source_kind: string
  capability_type: string
  source_ref: string
  prerequisite_keys: string[]
  retired_at: string | null
}

/**
 * Step 1 predicate — mirrors the intended DB filter (source_kind='vocabulary_src'
 * AND capability_type IN DROPPED_VOCAB_CAP_TYPES AND retired_at IS NULL) as a
 * pure, independently-testable function, so the selection logic cannot drift
 * from what the report/apply steps actually act on.
 */
export function isRetireCandidate(
  row: Pick<VocabCapRow, 'source_kind' | 'capability_type' | 'retired_at'>,
): boolean {
  return (
    row.source_kind === 'vocabulary_src'
    && (DROPPED_VOCAB_CAP_TYPES as readonly string[]).includes(row.capability_type)
    && row.retired_at === null
  )
}

/**
 * Step 2 — the EXPECTED #1 (recognise_meaning_from_text_cap) canonical key for
 * a #6 (produce_form_from_meaning_cap) row's source_ref. Built the same way
 * `projectors/vocab.ts` builds it. `learnerLanguage` is hardcoded 'nl' because
 * every live vocab cap was seeded by the typed-DB-row projector, which
 * hardcodes 'nl' (l1_translation is always Dutch per the migration
 * constraint — CLAUDE.md "Runtime is unified", every lesson is on
 * projection_version='capability-v3').
 */
export function expectedTextRecognitionKey(sourceRef: string): string {
  return buildCanonicalKey({
    sourceKind: 'vocabulary_src',
    sourceRef,
    capabilityType: 'recognise_meaning_from_text_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
}

export interface PrereqRewrite {
  id: string
  sourceRef: string
  fromKeys: string[]
  toKey: string
}

/**
 * Step 2 — compute the rewrite plan for #6 rows. Idempotent: a row already
 * pointing at exactly `[expectedTextRecognitionKey(sourceRef)]` is skipped
 * (absent from the returned plan) so re-running the script after a partial
 * --apply only touches the rows still pointing at the old #2 key.
 */
export function planPrereqRewrites(produceFormRows: VocabCapRow[]): PrereqRewrite[] {
  const out: PrereqRewrite[] = []
  for (const row of produceFormRows) {
    const toKey = expectedTextRecognitionKey(row.source_ref)
    const alreadyCorrect = row.prerequisite_keys.length === 1 && row.prerequisite_keys[0] === toKey
    if (alreadyCorrect) continue
    out.push({ id: row.id, sourceRef: row.source_ref, fromKeys: row.prerequisite_keys, toKey })
  }
  return out
}

/** Split an array into fixed-size chunks — shared by retire batching and the rewrite concurrency cap. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Reconciliation guard (architect note, 2026-07-08): the dry-run must confirm
 * the targeted `capability_type` strings still exist in the live DB's distinct
 * set — guards against the gated capability-naming Phase-A rename shifting
 * type strings under this script. Returns the DROPPED_VOCAB_CAP_TYPES entries
 * that have ZERO rows in `distinctTypesInDb` (a warning signal, not an error —
 * zero rows could legitimately mean a prior partial --apply already retired
 * every row of that type, or the corpus genuinely has none).
 */
export function typesMissingFromLiveDb(distinctTypesInDb: ReadonlySet<string>): string[] {
  return DROPPED_VOCAB_CAP_TYPES.filter((t) => !distinctTypesInDb.has(t))
}

// ─── IO layer ───────────────────────────────────────────────────────────────

const PAGE = 1000

/**
 * Fetch every `vocabulary_src` capability row needed by both steps in one
 * paginated pass (no `.in()` — a plain `.eq('source_kind', …)` + `.range()`
 * page walk never hits the Kong request-URL length limit, unlike an `.in()`
 * over thousands of ids). One fetch feeds: the retire-candidate filter, the
 * #6 rewrite plan, AND the type-reconciliation guard.
 */
export async function fetchAllVocabCapRows(supabase: CapabilitySupabaseClient): Promise<VocabCapRow[]> {
  const rows: VocabCapRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key, source_kind, capability_type, source_ref, prerequisite_keys, retired_at')
      .eq('source_kind', 'vocabulary_src')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as VocabCapRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/**
 * Step 2 write: bounded-concurrency batches (default 10) rather than a fully
 * sequential ~2,359-round-trip loop — each row's rewrite is an independent
 * single-row UPDATE (distinct `prerequisite_keys` value per row), so there is
 * no shared `.in()` to chunk here (unlike Step 1's soft-retire).
 */
export async function applyPrereqRewrites(
  supabase: CapabilitySupabaseClient,
  rewrites: PrereqRewrite[],
  options: { concurrency?: number } = {},
): Promise<number> {
  const concurrency = options.concurrency ?? 10
  let written = 0
  for (const batch of chunkArray(rewrites, concurrency)) {
    await Promise.all(batch.map(async (r) => {
      const { error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .update({ prerequisite_keys: [r.toKey], updated_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) throw error
      written += 1
    }))
  }
  return written
}

/**
 * Post-apply zero-remaining assertion (mirrors
 * `triage-residual-capabilities.ts`'s `assertNoResidueRemains`): re-fetches
 * and asserts no live dropped-type row and no #6 row with a stale prereq
 * remain. Throws (rather than silently reporting) so a partial --apply is
 * loud, not swallowed.
 */
export async function assertZeroRemaining(supabase: CapabilitySupabaseClient): Promise<void> {
  const rows = await fetchAllVocabCapRows(supabase)
  const remainingDropped = rows.filter(isRetireCandidate)
  if (remainingDropped.length > 0) {
    throw new Error(
      `retire-dropped-vocab-modes: ${remainingDropped.length} dropped-type vocabulary_src `
      + 'capabilities are still live (retired_at IS NULL) after --apply.',
    )
  }
  const produceFormRows = rows.filter((r) => r.capability_type === 'produce_form_from_meaning_cap')
  const remainingRewrites = planPrereqRewrites(produceFormRows)
  if (remainingRewrites.length > 0) {
    throw new Error(
      `retire-dropped-vocab-modes: ${remainingRewrites.length} produce_form_from_meaning_cap rows `
      + 'still do not prereq on #1 after --apply.',
    )
  }
}

// ─── Report + orchestration ────────────────────────────────────────────────

export interface RunReport {
  totalVocabRows: number
  retireCandidates: VocabCapRow[]
  retireCountsByType: Record<string, number>
  rewrites: PrereqRewrite[]
  missingTypesWarning: string[]
}

export function buildReport(rows: VocabCapRow[]): RunReport {
  const retireCandidates = rows.filter(isRetireCandidate)
  const retireCountsByType: Record<string, number> = {}
  for (const type of DROPPED_VOCAB_CAP_TYPES) retireCountsByType[type] = 0
  for (const row of retireCandidates) retireCountsByType[row.capability_type] += 1

  const produceFormRows = rows.filter((r) => r.capability_type === 'produce_form_from_meaning_cap')
  const rewrites = planPrereqRewrites(produceFormRows)

  const distinctTypesInDb = new Set(rows.map((r) => r.capability_type))
  const missingTypesWarning = typesMissingFromLiveDb(distinctTypesInDb)

  return { totalVocabRows: rows.length, retireCandidates, retireCountsByType, rewrites, missingTypesWarning }
}

function printReport(report: RunReport): void {
  console.log(`→ Total vocabulary_src capability rows scanned: ${report.totalVocabRows}`)
  console.log(`\n→ KEPT_VOCAB_CAP_TYPES: ${KEPT_VOCAB_CAP_TYPES.join(', ')}`)
  console.log(`→ DROPPED_VOCAB_CAP_TYPES: ${DROPPED_VOCAB_CAP_TYPES.join(', ')}`)

  if (report.missingTypesWarning.length > 0) {
    console.warn(
      `\n⚠ WARNING: the following targeted capability_type(s) have ZERO rows in the live DB — `
      + 'verify this is expected (e.g. an earlier partial --apply) and not a capability-naming '
      + `rename shifting the type string: ${report.missingTypesWarning.join(', ')}`,
    )
  }

  console.log('\n→ Step 1 — retire counts by dropped type:')
  for (const [type, count] of Object.entries(report.retireCountsByType)) {
    console.log(`  ${type}: ${count}`)
  }
  console.log(`  TOTAL to retire: ${report.retireCandidates.length}`)
  console.log('  Sample canonical_keys:')
  for (const row of report.retireCandidates.slice(0, 5)) {
    console.log(`    ${row.canonical_key}`)
  }

  console.log(`\n→ Step 2 — #6 prereq rewrites needed: ${report.rewrites.length}`)
  console.log('  Sample rewrites (sourceRef: fromKeys → toKey):')
  for (const r of report.rewrites.slice(0, 5)) {
    console.log(`    ${r.sourceRef}: [${r.fromKeys.join(', ')}] → ${r.toKey}`)
  }
}

function loadDotEnvLocal() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export async function run(opts: { apply: boolean }): Promise<RunReport> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const rows = await fetchAllVocabCapRows(supabase)
  const report = buildReport(rows)
  printReport(report)

  if (!opts.apply) {
    console.log('\n→ Dry-run: no writes performed. Pass --apply to execute (OWNER-GATED, see header).')
    return report
  }

  console.log('\n→ --apply: executing writes...')
  await softRetireCapabilities(supabase, report.retireCandidates.map((r) => r.id))
  console.log(`  ✓ Retired ${report.retireCandidates.length} dropped-mode capabilities.`)
  const rewritten = await applyPrereqRewrites(supabase, report.rewrites, { concurrency: 10 })
  console.log(`  ✓ Rewrote ${rewritten} #6 prerequisite_keys.`)

  await assertZeroRemaining(supabase)
  console.log('  ✓ Zero-remaining assertion passed: no live dropped-type caps, no stale #6 prereqs.')

  return report
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

async function main() {
  loadDotEnvLocal()
  const apply = process.argv.includes('--apply')
  await run({ apply })
}

if (isMainModule()) {
  main().catch((err) => {
    console.error('retire-dropped-vocab-modes failed:', err)
    process.exit(1)
  })
}
