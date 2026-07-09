#!/usr/bin/env bun
/**
 * unretire-vocab-mode.ts — one-off PR-A content correction
 * (docs/plans/2026-07-09-vocab-four-card-ladder.md §2.2, ADR 0027 amendment
 * "vocabulary-mode-set-bounded" — four-card ladder, 2026-07-09).
 *
 * Reverses the 2026-07-08 retirement of #2 (`recognise_form_from_meaning_cap`)
 * now that the four-card ladder reinstates it as a KEPT vocab mode (the
 * production-direction MCQ scaffold that graduates once #6 reaches mastery
 * strength — `graduation.ts`, `#2 ← #6`).
 *
 * Two steps, run in order against the LIVE `learning_capabilities` /
 * `learner_capability_state` tables:
 *
 *   1. UN-RETIRE — a SINGLE two-predicate filtered UPDATE:
 *        retired_at = NULL WHERE source_kind = 'vocabulary_src'
 *                       AND capability_type = 'recognise_form_from_meaning_cap'
 *      One round trip, no id-fetch-then-chunk loop (data-architect m1, §2.2):
 *      the predicate itself scopes the write — there is no id list to chunk
 *      for this step (unlike the down-direction `retire-dropped-vocab-modes.ts`,
 *      which chunks its `.in(id)` UPDATE because it targets an arbitrary,
 *      pre-fetched id set). Idempotent: re-running only re-sets an already-NULL
 *      column, harmless.
 *
 *   2. REANIMATION FIX (shipped mode-set-reduction spec §6 quirk) — for #2
 *      caps' `learner_capability_state` rows with `review_count > 0 AND
 *      next_due_at IS NULL`, set `next_due_at = now()`. Un-retiring (step 1)
 *      only clears `retired_at`; it does not restore `next_due_at`, so a
 *      previously-practiced #2 card would otherwise never come due again.
 *      This step DOES need capability ids (paginated, `.order('id')` — the
 *      PR #400 lesson: `.range()` pagination without a stable sort is
 *      non-deterministic in Postgres) and chunks the state UPDATE
 *      (~100/batch, mirrors `softRetireCapabilities`'s chunk size).
 *
 * Dry-run by DEFAULT (no writes, prints a report). Pass --apply to execute.
 * Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL in .env.local.
 *
 * No post-apply zero-remaining assertion (unlike `retire-dropped-vocab-modes.ts`):
 * both steps are idempotent single-predicate operations (not a per-row rewrite
 * plan with a dangling-target failure mode to guard against), so a second
 * dry-run after --apply IS the zero-remaining check — it would report
 * unretireCandidateCount=0 and reanimationCandidateCount=0. Adding a dedicated
 * assertion here would be a second DB round trip enforcing what the existing
 * dry-run report already proves (Minimum Mechanism).
 *
 * ⛔ LIVE-RUN GATE (spec §2.2, mirrors §3.2 of the shipped mode-set-reduction
 * spec): the --apply run writes `learner_capability_state.next_due_at` across
 * ALL users — a precious-table write. This is NOT part of autonomous PR
 * execution: Sonnet builds + tests this script with dry-run evidence only.
 * The owner (or main thread with the owner's explicit go-ahead) executes
 * --apply as a separate gated step, immediately after confirming the nightly
 * backup checkpoint exists (docs/process/restore-runbook.md), then re-runs
 * `make check-supabase-deep`.
 *
 * Usage:
 *   bun scripts/unretire-vocab-mode.ts               # dry-run (default)
 *   bun scripts/unretire-vocab-mode.ts --dry-run     # same, explicit
 *   bun scripts/unretire-vocab-mode.ts --apply       # execute (OWNER-GATED — see above)
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

import { KEPT_VOCAB_CAP_TYPES } from '@/lib/capabilities'
import type { CapabilitySupabaseClient } from './lib/pipeline/capability-stage/adapter'

// The one capability_type this script targets. A LITERAL, not derived from
// KEPT_VOCAB_CAP_TYPES, because this script's whole job is a point-in-time
// reversal of the 2026-07-08 retirement of THIS specific type — its identity
// must not silently shift if the mode-set constant's shape changes again
// later. `run()` asserts it is currently a KEPT type before writing (guards
// against running this out of order relative to a future re-retirement).
export const TARGET_SOURCE_KIND = 'vocabulary_src'
export const TARGET_CAPABILITY_TYPE = 'recognise_form_from_meaning_cap'
// #6 — used only for the gap-word check (architect note, §2.2): a word first
// seeded after the 2026-07-08 retirement and before this un-retire has no #2
// row at all; the script only flips EXISTING rows, so such words need their
// #2 minted by the next re-publish's projector re-emit, not by this script.
export const SIBLING_CAPABILITY_TYPE = 'produce_form_from_meaning_cap'

// ─── Pure layer ─────────────────────────────────────────────────────────────

export interface VocabCapRow {
  id: string
  canonical_key: string
  source_kind: string
  capability_type: string
  source_ref: string
  retired_at: string | null
}

/**
 * Step 1 predicate — mirrors the intended DB filter (source_kind='vocabulary_src'
 * AND capability_type='recognise_form_from_meaning_cap' AND retired_at IS NOT NULL)
 * as a pure, independently-testable function, so the report's counted set
 * cannot drift from what the live UPDATE actually targets. (The live UPDATE
 * itself has no `retired_at IS NOT NULL` predicate — see `unretireTargetCapabilities`
 * — because re-setting an already-NULL column is harmless and adding the
 * predicate would only save a no-op write; this predicate exists purely to
 * make the DRY-RUN COUNT meaningful.)
 */
export function isUnretireCandidate(
  row: Pick<VocabCapRow, 'source_kind' | 'capability_type' | 'retired_at'>,
): boolean {
  return (
    row.source_kind === TARGET_SOURCE_KIND
    && row.capability_type === TARGET_CAPABILITY_TYPE
    && row.retired_at !== null
  )
}

export interface LearnerStateRow {
  id: string
  capability_id: string
  review_count: number
  next_due_at: string | null
}

/** Step 2 predicate — a learner_capability_state row needing the reanimation fix. */
export function needsReanimation(
  row: Pick<LearnerStateRow, 'review_count' | 'next_due_at'>,
): boolean {
  return row.review_count > 0 && row.next_due_at === null
}

/**
 * Gap-word check (architect note, §2.2): #6 (produce_form_from_meaning_cap)
 * source_refs that have NO #2 row at all — not "retired", genuinely absent.
 * Such words were seeded strictly between the 2026-07-08 retirement and this
 * un-retire, so they need the next re-publish's projector re-emit, not this
 * script (which only flips existing rows).
 */
export function gapWordSourceRefs(
  produceFormSourceRefs: ReadonlySet<string>,
  recogniseFormSourceRefs: ReadonlySet<string>,
): string[] {
  return [...produceFormSourceRefs].filter((ref) => !recogniseFormSourceRefs.has(ref))
}

/** Split an array into fixed-size chunks — shared by the state-table batching. */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[])
  return out
}

export interface RunReport {
  totalScannedRows: number
  unretireCandidateCount: number
  unretireSamples: VocabCapRow[]
  gapWordSourceRefs: string[]
  /** ALL #2 capability ids (regardless of current retired_at) — step 2's target set post-un-retire. */
  targetCapabilityIds: string[]
}

/**
 * Pure aggregation over one fetch of {#2, #6} rows (both types, so the gap-word
 * check needs no second query). Mirrors `retire-dropped-vocab-modes.ts`'s
 * `buildReport` shape.
 */
export function buildReport(rows: VocabCapRow[]): RunReport {
  const targetRows = rows.filter((r) => r.capability_type === TARGET_CAPABILITY_TYPE)
  const siblingRows = rows.filter((r) => r.capability_type === SIBLING_CAPABILITY_TYPE)

  const unretireCandidates = targetRows.filter(isUnretireCandidate)

  const targetSourceRefs = new Set(targetRows.map((r) => r.source_ref))
  const siblingSourceRefs = new Set(siblingRows.map((r) => r.source_ref))
  const gaps = gapWordSourceRefs(siblingSourceRefs, targetSourceRefs)

  return {
    totalScannedRows: rows.length,
    unretireCandidateCount: unretireCandidates.length,
    unretireSamples: unretireCandidates.slice(0, 5),
    gapWordSourceRefs: gaps,
    targetCapabilityIds: targetRows.map((r) => r.id),
  }
}

function printReport(report: RunReport, reanimationCandidateCount: number): void {
  console.log(`→ Total {#2, #6} vocabulary_src capability rows scanned: ${report.totalScannedRows}`)
  console.log(`→ Target type: ${TARGET_CAPABILITY_TYPE} (#2)`)

  console.log(`\n→ Step 1 — currently-retired #2 rows to un-retire: ${report.unretireCandidateCount}`)
  console.log('  Sample canonical_keys:')
  for (const row of report.unretireSamples) {
    console.log(`    ${row.canonical_key}`)
  }

  console.log(`\n→ Step 2 — learner_capability_state rows needing reanimation (review_count > 0, next_due_at IS NULL): ${reanimationCandidateCount}`)

  if (report.gapWordSourceRefs.length > 0) {
    console.warn(
      `\n⚠ NOTE: ${report.gapWordSourceRefs.length} #6 word(s) have NO #2 row at all `
      + '(seeded after the 2026-07-08 retirement, before this un-retire). This script does '
      + 'not create rows — these words get their #2 on the next re-publish (projector re-emit):',
    )
    for (const ref of report.gapWordSourceRefs.slice(0, 10)) {
      console.warn(`    ${ref}`)
    }
  } else {
    console.log('\n→ Gap-word check: 0 #6 words lacking a #2 row.')
  }
}

// ─── IO layer ───────────────────────────────────────────────────────────────

const PAGE = 1000
const STATE_CHUNK_SIZE = 100

/**
 * Fetch every `vocabulary_src` row of the two types this script needs — #2
 * (the un-retire target) and #6 (the gap-word sibling) — in one paginated
 * pass. `.in('capability_type', [...])` over a 2-element array never
 * approaches the Kong request-URL length limit, so no further chunking is
 * needed on the read side.
 *
 * `.order('id')` is LOAD-BEARING: `.range()` pagination without a stable sort
 * is non-deterministic in Postgres — pages can skip/duplicate rows between
 * requests (the PR #400 lesson, live 2026-07-09 on `retire-dropped-vocab-modes.ts`'s
 * first --apply run).
 */
export async function fetchTargetAndSiblingRows(supabase: CapabilitySupabaseClient): Promise<VocabCapRow[]> {
  const rows: VocabCapRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key, source_kind, capability_type, source_ref, retired_at')
      .eq('source_kind', TARGET_SOURCE_KIND)
      .in('capability_type', [TARGET_CAPABILITY_TYPE, SIBLING_CAPABILITY_TYPE])
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as VocabCapRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/**
 * Step 1 write — a SINGLE two-predicate filtered UPDATE, no id list (§2.2,
 * data-architect m1). One round trip regardless of corpus size.
 */
export async function unretireTargetCapabilities(supabase: CapabilitySupabaseClient): Promise<void> {
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .update({ retired_at: null, updated_at: nowIso })
    .eq('source_kind', TARGET_SOURCE_KIND)
    .eq('capability_type', TARGET_CAPABILITY_TYPE)
  if (error) throw error
}

/** Dry-run count for step 2 — chunked `.in()` reads over the #2 capability ids. */
export async function countReanimationCandidates(
  supabase: CapabilitySupabaseClient,
  capabilityIds: readonly string[],
): Promise<number> {
  let total = 0
  for (const chunk of chunkArray(capabilityIds, STATE_CHUNK_SIZE)) {
    const { count, error } = await supabase
      .schema('indonesian')
      .from('learner_capability_state')
      .select('id', { count: 'exact', head: true })
      .in('capability_id', chunk)
      .gt('review_count', 0)
      .is('next_due_at', null)
    if (error) throw error
    total += count ?? 0
  }
  return total
}

/**
 * Step 2 write — chunked `.in()` UPDATE (~100/batch, mirrors
 * `softRetireCapabilities`'s SOFT_RETIRE_CHUNK_SIZE) over the #2 capability
 * ids. Returns the number of learner_capability_state rows actually touched
 * (via `.select('id')` on the update response) so the report is honest even
 * if `countReanimationCandidates`'s dry-run count and the live write diverge
 * (e.g. a concurrent review between dry-run and --apply).
 */
export async function reanimateDueDates(
  supabase: CapabilitySupabaseClient,
  capabilityIds: readonly string[],
): Promise<number> {
  const nowIso = new Date().toISOString()
  let written = 0
  for (const chunk of chunkArray(capabilityIds, STATE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_capability_state')
      .update({ next_due_at: nowIso })
      .in('capability_id', chunk)
      .gt('review_count', 0)
      .is('next_due_at', null)
      .select('id')
    if (error) throw error
    written += (data ?? []).length
  }
  return written
}

// ─── Orchestration ──────────────────────────────────────────────────────────

function loadDotEnvLocal() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export async function run(opts: { apply: boolean }): Promise<RunReport & { reanimationCandidateCount: number }> {
  // Safety net: this script's whole job is un-retiring TARGET_CAPABILITY_TYPE.
  // If a future change re-retires #2 (the pre-agreed 2026-07-23 checkpoint
  // reversal lever), this script must refuse to run rather than silently
  // fighting that decision.
  if (!(KEPT_VOCAB_CAP_TYPES as readonly string[]).includes(TARGET_CAPABILITY_TYPE)) {
    throw new Error(
      `unretire-vocab-mode: ${TARGET_CAPABILITY_TYPE} is not currently in KEPT_VOCAB_CAP_TYPES — `
      + 'refusing to un-retire it. Check for a re-retirement (four-card-ladder checkpoint '
      + 'reversal) before running this script.',
    )
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const rows = await fetchTargetAndSiblingRows(supabase)
  const report = buildReport(rows)
  const reanimationCandidateCount = await countReanimationCandidates(supabase, report.targetCapabilityIds)
  printReport(report, reanimationCandidateCount)

  if (!opts.apply) {
    console.log('\n→ Dry-run: no writes performed. Pass --apply to execute (OWNER-GATED, see header).')
    return { ...report, reanimationCandidateCount }
  }

  console.log('\n→ --apply: executing writes...')
  await unretireTargetCapabilities(supabase)
  console.log(`  ✓ Un-retired ${report.unretireCandidateCount} #2 (${TARGET_CAPABILITY_TYPE}) capabilities.`)

  const reanimated = await reanimateDueDates(supabase, report.targetCapabilityIds)
  console.log(`  ✓ Reanimated next_due_at for ${reanimated} learner_capability_state rows.`)

  return { ...report, reanimationCandidateCount }
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
    console.error('unretire-vocab-mode failed:', err)
    process.exit(1)
  })
}
