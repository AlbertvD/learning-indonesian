#!/usr/bin/env bun
/**
 * triage-residual-capabilities.ts — PR-3 of `2026-05-17-extend-decision-3-lesson-id.md`.
 *
 * Cleans up `learning_capabilities` rows that the per-lesson re-publish loop
 * (Step 2 of `docs/process/decision-3b-rollout.md`) couldn't reach:
 *
 *   1. Orphan-item caps — `source_ref` is `learning_items/<slug>` but the slug
 *      no longer matches any `learning_items.base_text` slug.
 *        • No review history → DELETE (with explicit child-table enumeration
 *          because the FKs are RESTRICT — see
 *          `scripts/migrations/2026-04-25-capability-core.sql:33,45,59,86`).
 *        • Has review history → default-assign to lesson 1 with a
 *          metadata_json.note flag.
 *
 *   2. Function-word / cross-corpus residue — non-orphan but still no lesson
 *      home after re-publish. Default-assign to lesson 1 with a note.
 *
 * After processing, asserts that `select count(*) from
 * indonesian.learning_capabilities where lesson_id is null and source_kind
 * not in ('podcast_segment_src', 'podcast_phrase_src')` returns 0. Throws if not.
 *
 * Usage:
 *   bun scripts/triage-residual-capabilities.ts --dry-run
 *   bun scripts/triage-residual-capabilities.ts --apply
 *
 * Requires SUPABASE_SERVICE_KEY and VITE_SUPABASE_URL in .env.local.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

// ─── Pure layer ────────────────────────────────────────────────────────────

export interface ResidueCap {
  id: string
  source_kind: string
  source_ref: string
}

export type ClassifiedAction =
  | { kind: 'delete'; capId: string; reason: string }
  | { kind: 'default_assign'; capId: string; note: string }

const LEARNING_ITEMS_PREFIX = 'learning_items/'
const NOTE_ORPHAN_WITH_HISTORY = 'orphan source_ref preserved for history'
const NOTE_CROSS_CORPUS = 'cross-corpus, defaulted to lesson 1'

/**
 * Mirrors `stableSlug` in `scripts/lib/content-pipeline-output.ts:99-106`.
 * Lifted as a separate export so the slug-set the loader builds matches the
 * slug the projector embedded into `source_ref`.
 */
export function stableSlugForBaseText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function classifyResidue(input: {
  residueCaps: ResidueCap[]
  learningItemSlugs: Set<string>
  capsWithReviewEvents: Set<string>
}): ClassifiedAction[] {
  const out: ClassifiedAction[] = []
  for (const cap of input.residueCaps) {
    if (cap.source_kind === 'vocabulary_src') {
      if (!cap.source_ref.startsWith(LEARNING_ITEMS_PREFIX)) {
        throw new Error(
          `Unexpected source_ref shape for source_kind=item: ${cap.source_ref} (cap ${cap.id}) — ` +
          'item caps must use the learning_items/<slug> prefix.',
        )
      }
      const slug = cap.source_ref.slice(LEARNING_ITEMS_PREFIX.length)
      const orphan = !input.learningItemSlugs.has(slug)
      if (orphan) {
        if (input.capsWithReviewEvents.has(cap.id)) {
          out.push({ kind: 'default_assign', capId: cap.id, note: NOTE_ORPHAN_WITH_HISTORY })
        } else {
          out.push({ kind: 'delete', capId: cap.id, reason: 'orphan item with no review history' })
        }
      } else {
        out.push({ kind: 'default_assign', capId: cap.id, note: NOTE_CROSS_CORPUS })
      }
    } else {
      // dialogue_line, pattern, word_form_pair_src, etc. We don't delete these
      // because we can't safely classify them as orphan from source_ref alone.
      out.push({ kind: 'default_assign', capId: cap.id, note: NOTE_CROSS_CORPUS })
    }
  }
  return out
}

// ─── IO layer ──────────────────────────────────────────────────────────────

// Loose Supabase-like shape so the tests can hand us a recorder. The runtime
// type is `SupabaseClient` from `@supabase/supabase-js`; we only need
// .schema().from() chain so we keep this any-typed at the boundary.
type SupabaseLike = {
  schema: (name: string) => {
    from: (table: string) => any
  }
}

export async function applyClassification(
  supabase: SupabaseLike,
  options: {
    lesson1Id: string
    actions: ClassifiedAction[]
    dryRun: boolean
  },
): Promise<{ deleted: number; defaultAssigned: number }> {
  let deleted = 0
  let defaultAssigned = 0

  for (const action of options.actions) {
    if (options.dryRun) {
      if (action.kind === 'delete') deleted++
      else defaultAssigned++
      continue
    }
    if (action.kind === 'delete') {
      // Post-PR-4 (ADR 0006): all four child FKs (capability_aliases,
      // capability_artifacts, learner_capability_state,
      // capability_review_events) are ON DELETE CASCADE — deleting the parent
      // sweeps the children. Pre-PR-4 this branch enumerated each child table
      // explicitly; the capability_aliases call also had a wrong column name
      // (capability_id instead of new_capability_id) which the CASCADE rewrite
      // makes moot.
      await supabase.schema('indonesian').from('learning_capabilities')
        .delete().eq('id', action.capId)
      deleted++
    } else {
      // Read current metadata_json, merge note, write back.
      const { data: row, error: readErr } = await supabase
        .schema('indonesian').from('learning_capabilities')
        .select('id, metadata_json').eq('id', action.capId)
        .maybeSingle()
      if (readErr) throw readErr
      const existingMeta = (row?.metadata_json && typeof row.metadata_json === 'object')
        ? (row.metadata_json as Record<string, unknown>)
        : {}
      const existingNote = typeof existingMeta.note === 'string' ? existingMeta.note : ''
      const mergedNote = existingNote
        ? (existingNote === action.note ? existingNote : `${existingNote}; ${action.note}`)
        : action.note
      const patchedMeta = { ...existingMeta, note: mergedNote }
      await supabase
        .schema('indonesian').from('learning_capabilities')
        .update({ lesson_id: options.lesson1Id, metadata_json: patchedMeta })
        .eq('id', action.capId)
      defaultAssigned++
    }
  }
  return { deleted, defaultAssigned }
}

export async function assertNoResidueRemains(supabase: SupabaseLike): Promise<void> {
  const { count, error } = await supabase
    .schema('indonesian').from('learning_capabilities')
    .select('id', { count: 'exact', head: true })
    .is('lesson_id', null)
    .not('source_kind', 'in', '("podcast_segment_src","podcast_phrase_src")')
  if (error) throw error
  if ((count ?? 0) > 0) {
    throw new Error(
      `Triage assertion failed: ${count} non-podcast capabilities still have lesson_id IS NULL. ` +
      'PR-3 is incomplete — do NOT open PR-4 until this is reconciled.',
    )
  }
}

// ─── Top-level orchestration ───────────────────────────────────────────────

const DRY_RUN_CSV_PATH = '/tmp/triage-diff.csv'

async function loadResidueAndContext(supabase: SupabaseLike): Promise<{
  residueCaps: ResidueCap[]
  learningItemSlugs: Set<string>
  capsWithReviewEvents: Set<string>
  lesson1Id: string
}> {
  // 1. Lesson 1's id — the default-assign target.
  const { data: lesson1, error: lessonErr } = await supabase
    .schema('indonesian').from('lessons')
    .select('id, order_index').eq('order_index', 1).maybeSingle()
  if (lessonErr) throw lessonErr
  if (!lesson1?.id) throw new Error('No lesson found with order_index=1 — the default-assign target. Aborting.')

  // 2. Every residue cap.
  const { data: capsRaw, error: capErr } = await supabase
    .schema('indonesian').from('learning_capabilities')
    .select('id, source_kind, source_ref')
    .is('lesson_id', null)
    .not('source_kind', 'in', '("podcast_segment_src","podcast_phrase_src")')
  if (capErr) throw capErr
  const residueCaps = (capsRaw ?? []) as ResidueCap[]

  // 3. All learning_items.base_text → stableSlug set.
  const learningItemSlugs = new Set<string>()
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .schema('indonesian').from('learning_items')
      .select('base_text').range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { base_text: string }[]
    for (const row of rows) learningItemSlugs.add(stableSlugForBaseText(row.base_text))
    if (rows.length < PAGE) break
  }

  // 4. Cap-ids that have at least one capability_review_events row.
  // Only need to check the residue set, not all caps. Page in small chunks
  // because PostgREST routes through Kong with a strict URL-length limit;
  // .in('id', [...100 uuids...]) hits "URI too long" quickly.
  const capsWithReviewEvents = new Set<string>()
  if (residueCaps.length > 0) {
    const ids = residueCaps.map((c) => c.id)
    const CHUNK = 40
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const { data, error } = await supabase
        .schema('indonesian').from('capability_review_events')
        .select('capability_id').in('capability_id', slice)
      if (error) throw error
      const rows = (data ?? []) as { capability_id: string }[]
      for (const r of rows) capsWithReviewEvents.add(r.capability_id)
    }
  }

  return { residueCaps, learningItemSlugs, capsWithReviewEvents, lesson1Id: lesson1.id as string }
}

function writeDryRunCsv(
  actions: ClassifiedAction[],
  residueByCapId: Map<string, ResidueCap>,
): string {
  const lines: string[] = ['cap_id,source_kind,source_ref,action,detail']
  for (const a of actions) {
    const cap = residueByCapId.get(a.capId)
    const sk = cap?.source_kind ?? ''
    const sr = cap?.source_ref ?? ''
    const detail = a.kind === 'delete' ? a.reason : a.note
    lines.push(`${a.capId},${sk},${sr},${a.kind},${detail}`)
  }
  const csv = lines.join('\n') + '\n'
  fs.mkdirSync(path.dirname(DRY_RUN_CSV_PATH), { recursive: true })
  fs.writeFileSync(DRY_RUN_CSV_PATH, csv)
  return DRY_RUN_CSV_PATH
}

export async function runTriage(opts: { dryRun: boolean }): Promise<{
  classified: ClassifiedAction[]
  deleted: number
  defaultAssigned: number
  csvPath?: string
}> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { residueCaps, learningItemSlugs, capsWithReviewEvents, lesson1Id } =
    await loadResidueAndContext(supabase)
  console.log(`→ Residue caps to triage: ${residueCaps.length}`)
  console.log(`  learning_items slugs known: ${learningItemSlugs.size}`)
  console.log(`  residue caps with review history: ${capsWithReviewEvents.size}`)
  console.log(`  default-assign target lesson_id (lesson 1): ${lesson1Id}`)

  const classified = classifyResidue({ residueCaps, learningItemSlugs, capsWithReviewEvents })
  const deletes = classified.filter((a) => a.kind === 'delete').length
  const orphanHist = classified.filter((a) => a.kind === 'default_assign' && a.note === NOTE_ORPHAN_WITH_HISTORY).length
  const crossCorpus = classified.filter((a) => a.kind === 'default_assign' && a.note === NOTE_CROSS_CORPUS).length
  console.log('\n→ Classification:')
  console.log(`  delete_orphan_no_history:           ${deletes}`)
  console.log(`  default_assign_orphan_with_history: ${orphanHist}`)
  console.log(`  default_assign_cross_corpus:        ${crossCorpus}`)

  const residueByCapId = new Map(residueCaps.map((c) => [c.id, c]))
  let csvPath: string | undefined
  if (opts.dryRun) {
    csvPath = writeDryRunCsv(classified, residueByCapId)
    console.log(`\n→ Dry-run: proposed changes written to ${csvPath} (no DB writes)`)
  }

  const { deleted, defaultAssigned } = await applyClassification(supabase, {
    lesson1Id,
    actions: classified,
    dryRun: opts.dryRun,
  })

  if (opts.dryRun) {
    console.log(`\n→ Dry-run summary: would delete ${deleted}, would default-assign ${defaultAssigned}`)
    return { classified, deleted, defaultAssigned, csvPath }
  }

  console.log(`\n→ Applied: deleted ${deleted}, default-assigned ${defaultAssigned}`)
  await assertNoResidueRemains(supabase)
  console.log('  ✓ Final assertion: 0 non-podcast caps with NULL lesson_id remain')
  return { classified, deleted, defaultAssigned }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
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

async function main() {
  loadDotEnvLocal()
  const dryRun = process.argv.includes('--dry-run')
  const apply = process.argv.includes('--apply')
  if (dryRun === apply) {
    console.error('Usage: bun scripts/triage-residual-capabilities.ts [--dry-run | --apply]')
    process.exit(1)
  }
  await runTriage({ dryRun })
}

if (isMainModule()) {
  main().catch((err) => {
    console.error('triage-residual-capabilities failed:', err)
    process.exit(1)
  })
}
