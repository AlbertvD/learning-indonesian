#!/usr/bin/env bun
/**
 * migrate-typed-tables-pr4-grammar.ts
 *
 * One-shot bridge for PR 4 — moves the 716 grammar exercises from the legacy
 * `exercise_variants` blob (payload_json + answer_key_json) into the 4 typed
 * grammar-exercise tables, dispatching by exercise_type:
 *   contrast_pair           → contrast_pair_exercises
 *   sentence_transformation → sentence_transformation_exercises
 *   constrained_translation → constrained_translation_exercises
 *   cloze_mcq               → cloze_mcq_exercises
 *
 * BACKGROUND
 * ----------
 * PR 4 switches the runtime reader (byKind/pattern.ts) to the typed tables and
 * the writer (capability-stage runner step 10) to dual-write them. But the
 * writer only fired for not-yet-published candidates, and all 716 live
 * candidates were already `published` — so a re-publish did not regenerate them
 * (the standalone publish-grammar-candidates.ts publisher was later retired in
 * Slice 2 Task 9). This bridge was the SOLE population path for the existing
 * rows; without it the new fail-loud reader surfaces `pattern_typed_row_missing`
 * for every pattern cap. (One-shot; already run.)
 *
 * MAPPING
 * -------
 * Uses the SAME mapper as the writer (capability-stage/projectors/
 * grammarExerciseRows.ts) so the bridge and the pipeline cannot drift. Each
 * typed row also carries grammar_pattern_id + lesson_id + is_active from the
 * source variant.
 *
 * IDEMPOTENCY
 * -----------
 * The typed tables have NO unique constraint besides the PK `id`, so the bridge
 * carries the source exercise_variants.id into the typed row's id and upserts
 * with ON CONFLICT (id) DO NOTHING (ignoreDuplicates). A second run is a no-op,
 * and the carried id never collides with the writer's gen_random_uuid() rows.
 *
 * FAIL-FAST
 * ---------
 * A grammar variant missing grammar_pattern_id / lesson_id, or whose payload
 * does not deserialize to the typed shape (empty required field), is a CRITICAL
 * anomaly — the script aborts before writing anything (the typed columns are
 * NOT NULL).
 *
 * USAGE
 *   bun scripts/migrate-typed-tables-pr4-grammar.ts --dry-run   # preview
 *   bun scripts/migrate-typed-tables-pr4-grammar.ts             # apply
 *   Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import {
  buildGrammarExerciseRow,
  GRAMMAR_EXERCISE_TABLE,
} from './lib/pipeline/capability-stage/projectors/grammarExerciseRows'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function loadEnv() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')
const GRAMMAR_TYPES = Object.keys(GRAMMAR_EXERCISE_TABLE)
const TABLES = [...new Set(Object.values(GRAMMAR_EXERCISE_TABLE))]

interface VariantRow {
  id: string
  exercise_type: string
  grammar_pattern_id: string | null
  lesson_id: string | null
  payload_json: Record<string, unknown>
  answer_key_json: Record<string, unknown> | null
  is_active: boolean
}

interface PlannedRow {
  table: string
  row: Record<string, unknown>
}

async function countRows(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase
    .schema('indonesian')
    .from(table)
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(`count(${table}): ${error.message}`)
  return count ?? 0
}

async function countsByTable(supabase: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of TABLES) out[t] = await countRows(supabase, t)
  return out
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required.')
    process.exit(1)
  }
  const supabase: SupabaseClient = createClient(url, key)

  console.log(`PR 4 grammar typed-table bridge — dry-run=${DRY_RUN}`)
  console.log('Surface: {contrast_pair,sentence_transformation,constrained_translation,cloze_mcq}_exercises ← exercise_variants\n')

  const before = await countsByTable(supabase)
  console.log('BEFORE:', TABLES.map((t) => `${t}=${before[t]}`).join('  '))

  // ── 1. All grammar exercise_variants ─────────────────────────────────────
  const { data: variantsData, error: variantsError } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .select('id, exercise_type, grammar_pattern_id, lesson_id, payload_json, answer_key_json, is_active')
    .in('exercise_type', GRAMMAR_TYPES)
  if (variantsError) throw new Error(variantsError.message)
  const variants = (variantsData ?? []) as VariantRow[]
  console.log(`\nFound ${variants.length} grammar exercise_variants.`)
  if (variants.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // ── 2. Resolve every variant into one typed row ──────────────────────────
  const planned: PlannedRow[] = []
  const anomalies: string[] = []

  for (const v of variants) {
    if (!v.grammar_pattern_id) {
      anomalies.push(`variant ${v.id} (${v.exercise_type}): grammar_pattern_id is null (typed table NOT NULL)`)
      continue
    }
    if (!v.lesson_id) {
      anomalies.push(`variant ${v.id} (${v.exercise_type}): lesson_id is null (typed table NOT NULL)`)
      continue
    }
    const built = buildGrammarExerciseRow(v.exercise_type, v.payload_json ?? {}, v.answer_key_json)
    if (!built) {
      anomalies.push(`variant ${v.id}: exercise_type "${v.exercise_type}" has no typed-table mapping`)
      continue
    }
    // Every typed column must be present + non-empty (NOT NULL guard mirror).
    const empties = Object.entries(built.columns).filter(([k, val]) => {
      if (k === 'hint_text' || k === 'disallowed_shortcut_forms') return false  // nullable / may be empty
      if (typeof val === 'string') return val.length === 0
      if (Array.isArray(val)) return val.length === 0
      return val == null
    })
    if (empties.length > 0) {
      anomalies.push(`variant ${v.id} (${v.exercise_type}): empty required field(s) ${empties.map(([k]) => k).join(', ')}`)
      continue
    }
    planned.push({
      table: built.table,
      row: {
        id: v.id,  // carry the source id → idempotent on ON CONFLICT (id)
        ...built.columns,
        grammar_pattern_id: v.grammar_pattern_id,
        lesson_id: v.lesson_id,
        is_active: v.is_active,
      },
    })
  }

  const planByTable: Record<string, number> = {}
  for (const p of planned) planByTable[p.table] = (planByTable[p.table] ?? 0) + 1
  console.log('\nPlan:', TABLES.map((t) => `${t}=${planByTable[t] ?? 0}`).join('  '), `(total ${planned.length})`)

  if (anomalies.length > 0) {
    console.error(`\n✗ ${anomalies.length} anomalies (CRITICAL — bridge aborted, no writes):`)
    for (const a of anomalies.slice(0, 30)) console.error(`  - ${a}`)
    if (anomalies.length > 30) console.error(`  … and ${anomalies.length - 30} more`)
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No writes performed.')
    return
  }

  // ── 3. Apply per table — ON CONFLICT (id) DO NOTHING ─────────────────────
  const written: Record<string, number> = {}
  for (const table of TABLES) {
    const rows = planned.filter((p) => p.table === table).map((p) => p.row)
    written[table] = 0
    // Insert in chunks to keep payloads reasonable.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { data, error } = await supabase
        .schema('indonesian')
        .from(table)
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
        .select('id')
      if (error) {
        console.error(`! ${table} insert failed: ${error.message}`)
        process.exit(1)
      }
      written[table] += data?.length ?? 0
    }
  }

  const after = await countsByTable(supabase)
  console.log('\nInserted (new rows; existing left untouched — DO NOTHING):', TABLES.map((t) => `${t}=+${written[t]}`).join('  '))
  console.log('AFTER: ', TABLES.map((t) => `${t}=${after[t]}`).join('  '))
  console.log('Delta: ', TABLES.map((t) => `${t} ${before[t]}→${after[t]}`).join('  '))
  console.log('\n✓ Bridge complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
