#!/usr/bin/env bun
/**
 * retire-overharvested-caps.ts — Fix 1b (ADR 0014, productive ceiling).
 *
 * One-off backfill that soft-retires the already-published over-harvested item
 * capabilities: `learning_capabilities` with source_kind='item', retired_at IS
 * NULL, whose source_ref resolves to a `sentence`/`dialogue_chunk` learning_item
 * (the 56 the 2026-06 audit counted). Explicitly EXCLUDES dialogue_line-source
 * cloze caps (they are not item caps). Sets retired_at = now() — a targeted,
 * DB-resident correction consistent with ADR 0011, NOT a destructive --regenerate.
 * learner_capability_state rows are left inert (the session builder already
 * excludes retired catalog caps); review history is kept as the audit trail.
 *
 * Idempotent: a second run finds the same caps already retired_at != NULL (so
 * they fall out of the scan) and writes nothing.
 *
 * HARD DEPLOY ORDERING (ADR 0014 §M3): Fix 1a (the runner stops EMITTING these
 * caps) MUST be live before — or atomically with — this backfill. Otherwise the
 * next publish of a lesson re-emits the over-harvested caps and the adapter flips
 * retired_at back to NULL (adapter.ts:143-145), undoing this script.
 *
 * Usage:
 *   bun scripts/retire-overharvested-caps.ts            # apply
 *   bun scripts/retire-overharvested-caps.ts --dry-run  # preview
 *
 * Exit codes: 0 success (incl. no-op); 1 error (missing env, DB failure).
 */

import { createClient } from '@supabase/supabase-js'
import { isOverHarvestedItemCap } from './lib/pipeline/capability-stage/itemHarvest'

const PAGE_SIZE = 1000
const UPDATE_CHUNK = 200

interface OverharvestSupabase {
  schema(name: string): {
    from(table: string): any
  }
}

export interface RetireResult {
  scannedItemCaps: number
  retiredIds: string[]
  retired: number
  dryRun: boolean
}

/**
 * Core, client-injectable so it is unit-testable without a live DB. Returns the
 * cap ids selected (and, unless dryRun, retired).
 */
export async function retireOverharvestedCaps(
  supabase: OverharvestSupabase,
  opts: { dryRun?: boolean } = {},
): Promise<RetireResult> {
  const dryRun = opts.dryRun ?? false

  // 1. All active item-source-kind caps (id + source_ref).
  const itemCaps: Array<{ id: string; source_kind: string; source_ref: string }> = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, source_kind, source_ref')
      .eq('source_kind', 'item')
      .is('retired_at', null)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: string; source_kind: string; source_ref: string }>
    itemCaps.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  // 2. normalized_text → item_type map (the join the staged caps can't carry).
  const itemTypeBySlug = new Map<string, string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, item_type')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ normalized_text: string; item_type: string }>
    for (const r of rows) itemTypeBySlug.set(r.normalized_text, r.item_type)
    if (rows.length < PAGE_SIZE) break
  }

  // 3. Select the over-harvested caps via the SHARED predicate (same definition
  //    the runner's Fix 1a filter uses — they can never disagree on scope).
  const retiredIds = itemCaps
    .filter((c) => isOverHarvestedItemCap({ sourceKind: c.source_kind, sourceRef: c.source_ref }, itemTypeBySlug))
    .map((c) => c.id)

  // 4. Apply (unless dry-run), chunked to stay under Kong's URL ceiling.
  if (!dryRun && retiredIds.length > 0) {
    const nowIso = new Date().toISOString()
    for (let i = 0; i < retiredIds.length; i += UPDATE_CHUNK) {
      const slice = retiredIds.slice(i, i + UPDATE_CHUNK)
      const { error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .update({ retired_at: nowIso, updated_at: nowIso })
        .in('id', slice)
      if (error) throw error
    }
  }

  return { scannedItemCaps: itemCaps.length, retiredIds, retired: dryRun ? 0 : retiredIds.length, dryRun }
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const supabase = createClient(url, serviceKey)

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Retiring over-harvested item caps (sentence/dialogue_chunk)…`)
  const result = await retireOverharvestedCaps(supabase as unknown as OverharvestSupabase, { dryRun })
  console.log(`  Scanned ${result.scannedItemCaps} active item caps.`)
  console.log(`  ${dryRun ? 'Would retire' : 'Retired'} ${result.retiredIds.length} over-harvested cap(s).`)
  if (result.retiredIds.length > 0) {
    console.log(`  IDs: ${result.retiredIds.slice(0, 10).join(', ')}${result.retiredIds.length > 10 ? ` …(+${result.retiredIds.length - 10})` : ''}`)
  }
  if (dryRun) return

  // Verify: the retired set now reports retired_at != NULL (re-scan finds 0).
  const recheck = await retireOverharvestedCaps(supabase as unknown as OverharvestSupabase, { dryRun: true })
  if (recheck.retiredIds.length !== 0) {
    console.error(`  ✗ ${recheck.retiredIds.length} over-harvested cap(s) still active after retire — investigate.`)
    process.exit(1)
  }
  console.log('  ✓ Verified: zero over-harvested item caps remain active.')
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
