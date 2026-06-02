#!/usr/bin/env bun
/**
 * reauthor-translation-separators.ts — Fix 2e (live-DB half; plan
 * docs/plans/2026-06-02-productive-ceiling-and-paraphrase-acceptance.md §2e).
 *
 * One-off operator tool: re-author already-seeded
 * `learning_items.translation_nl` rows that carry a non-canonical alternatives
 * separator (";" or comma-as-OR) → canonical "/". The staging re-author (PR #130)
 * only fixes fresh-publish input; the live rows the running app reads need this
 * surgical DB correction (ADR 0011 — capability content is DB-authoritative
 * after seeding, so corrections live in the DB, not via re-publish).
 *
 * Scope = exactly what the SHARED classifyDutchSeparator flags (the same
 * predicate the CS19 gate + HC24 health check use), word/phrase only, minus
 * DUTCH_COMMA_EXEMPTIONS. Idempotent: a re-run finds zero offenders.
 *
 * DEPLOY ORDERING (plan §Deploy ordering M2): this must run — and HC24 must read
 * clean — BEFORE the comma-drop grader image is deployed to the live container.
 * Otherwise a still-comma-authored meaning becomes one unmatchable target.
 *
 * First applied 2026-06-02 (50 live rows). Kept as a permanent operator tool
 * alongside scripts/retire-overharvested-caps.ts.
 *
 * Usage:
 *   bun scripts/reauthor-translation-separators.ts --dry-run
 *   bun scripts/reauthor-translation-separators.ts
 *
 * Exit codes: 0 success (incl. no-op); 1 error (missing env, DB failure).
 */

import { createClient } from '@supabase/supabase-js'
import { classifyDutchSeparator } from '@/lib/capabilities'

const PAGE = 1000

interface ReauthorSupabase {
  schema(name: string): { from(table: string): any }
}

export interface ReauthorOffender {
  id: string
  base_text: string
  old: string
  next: string
}

export interface ReauthorResult {
  scanned: number
  offenders: ReauthorOffender[]
  updated: number
  dryRun: boolean
}

/** Canonicalise a non-canonical Dutch value: split on ";"/"," (none sit inside
 *  parentheses in our data) and join with " / ". Mirrors the PR #130 staging
 *  transform so the live DB ends up byte-identical to the canonical staging. */
export function canonicaliseSeparators(s: string): string {
  return s.split(/[;,]/).map((t) => t.trim()).filter(Boolean).join(' / ')
}

/**
 * Core, client-injectable so it is unit-testable without a live DB. Scans every
 * word/phrase `learning_items` with a translation_nl, selects the non-canonical
 * ones via the shared classifier, and (unless dryRun) rewrites them to "/".
 */
export async function reauthorTranslationSeparators(
  supabase: ReauthorSupabase,
  opts: { dryRun?: boolean } = {},
): Promise<ReauthorResult> {
  const dryRun = opts.dryRun ?? false

  const offenders: ReauthorOffender[] = []
  let scanned = 0
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id, base_text, item_type, translation_nl')
      .in('item_type', ['word', 'phrase'])
      .not('translation_nl', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: string; base_text: string; item_type: string; translation_nl: string | null }>
    for (const r of rows) {
      scanned++
      const v = r.translation_nl
      if (!v || !classifyDutchSeparator(v)) continue
      offenders.push({ id: r.id, base_text: r.base_text, old: v, next: canonicaliseSeparators(v) })
    }
    if (rows.length < PAGE) break
  }

  if (!dryRun && offenders.length > 0) {
    const nowIso = new Date().toISOString()
    for (const o of offenders) {
      const { error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .update({ translation_nl: o.next, updated_at: nowIso })
        .eq('id', o.id)
      if (error) throw error
    }
  }

  return { scanned, offenders, updated: dryRun ? 0 : offenders.length, dryRun }
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const supabase = createClient(url, key) as unknown as ReauthorSupabase

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Re-authoring non-canonical translation_nl separators → "/"…`)
  const result = await reauthorTranslationSeparators(supabase, { dryRun })
  console.log(`  Scanned ${result.scanned} word/phrase items with translation_nl.`)
  console.log(`  ${dryRun ? 'Would re-author' : 'Re-authored'} ${result.offenders.length} row(s):`)
  for (const o of result.offenders) console.log(`    "${o.base_text}": ${JSON.stringify(o.old)} -> ${JSON.stringify(o.next)}`)
  if (dryRun || result.offenders.length === 0) return

  const recheck = await reauthorTranslationSeparators(supabase, { dryRun: true })
  if (recheck.offenders.length !== 0) {
    console.error(`  ✗ ${recheck.offenders.length} offender(s) remain after re-author — investigate.`)
    process.exit(1)
  }
  console.log('  ✓ Verified: zero non-canonical word/phrase translation_nl separators remain.')
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
