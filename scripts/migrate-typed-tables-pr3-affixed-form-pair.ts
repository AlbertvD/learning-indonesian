#!/usr/bin/env bun
/**
 * migrate-typed-tables-pr3-affixed-form-pair.ts
 *
 * ⚠️ ALREADY EXECUTED — DO NOT RE-RUN. This one-shot bridge reads the legacy
 * `capability_artifacts` table, which was DROPPED in Slice 4b (#102). Re-running
 * it post-drop returns a PGRST205 "table not found" runtime error. Retained as a
 * paper-trail record of the PR 3 migration only.
 *
 * One-shot bridge for PR 3 — moves word_form_pair_src content from the legacy
 * 2-artifact shape (`capability_artifacts` rows for `root_derived_pair` +
 * `allomorph_rule`) into the typed satellite table `affixed_form_pairs`.
 *
 * BACKGROUND
 * ----------
 * PR 3 introduces:
 *   1. A pipeline writer for `affixed_form_pairs` (capability-stage morphology
 *      projector). Re-publishing a lesson populates the typed table from
 *      staging and STOPS writing the legacy root_derived_pair/allomorph_rule
 *      artifacts (capabilityCatalog requiredArtifacts: []).
 *   2. A typed-table reader at src/lib/exercise-content/byKind/affixedFormPair.ts
 *      that reads `affixed_form_pairs` and fails loud
 *      (`affixed_form_pair_typed_row_missing`) when the row is missing.
 *
 * The reader switches over on this PR's deploy. Re-publish covers any lesson the
 * pipeline can publish — currently only L9 (the only lesson with
 * word_form_pair_src caps). But the typed table starts empty (PR 0 created it
 * only). Without this bridge, a deploy without an immediate re-publish would
 * surface the new fail-loud reader's diagnostic for every active
 * word_form_pair_src cap. This bridge populates the typed rows from the existing
 * artifacts so the deploy + re-publish sequence stays safe, and so any lesson
 * the re-publish does not reach keeps a valid row.
 *
 * WHAT THIS DOES
 * --------------
 * For every active `word_form_pair_src` capability:
 *   1. Read its two `capability_artifacts` rows (`root_derived_pair` →
 *      {root, derived}; `allomorph_rule` → {rule}).
 *   2. Insert one `affixed_form_pairs` row keyed by UNIQUE(capability_id):
 *        source_ref     ← cap.source_ref (lesson-N/morphology/<slug>)
 *        lesson_id      ← cap.lesson_id
 *        root_text      ← root_derived_pair.root
 *        derived_text   ← root_derived_pair.derived
 *        allomorph_rule ← allomorph_rule.rule
 *
 * IDEMPOTENCY
 * -----------
 * Inserts with ON CONFLICT (capability_id) DO NOTHING (ignoreDuplicates). A
 * second run is a no-op. DO NOTHING (NOT DO UPDATE) is deliberate: the bridge is
 * one-shot for caps the re-publish does not reach; it must never clobber fresh
 * re-publish output with stale artifact-derived data.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * - Lessons with no word_form_pair_src caps. Nothing to bridge.
 * - Caps missing root_derived_pair or allomorph_rule, or with empty fields.
 *   Logged as a CRITICAL anomaly; script aborts (the typed columns are NOT NULL).
 *
 * USAGE
 *   bun scripts/migrate-typed-tables-pr3-affixed-form-pair.ts --dry-run  # preview
 *   bun scripts/migrate-typed-tables-pr3-affixed-form-pair.ts            # apply
 *   Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Env loading (mirror migrate-typed-tables-pr2-dialogue.ts) ────────────────
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

const SOURCE_REF_RE = /^lesson-\d+\/morphology\/.+$/u

interface CapabilityRow {
  id: string
  canonical_key: string
  source_ref: string
  lesson_id: string
}

interface ArtifactRow {
  capability_id: string
  artifact_kind: string
  artifact_json: Record<string, unknown>
}

interface ResolvedAffixedFormPair {
  capability_id: string
  source_ref: string
  lesson_id: string
  root_text: string
  derived_text: string
  allomorph_rule: string
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required.')
    process.exit(1)
  }
  const supabase: SupabaseClient = createClient(url, key)

  console.log(`PR 3 word_form_pair_src typed-table bridge — dry-run=${DRY_RUN}`)
  console.log('Surface: affixed_form_pairs ← capability_artifacts(root_derived_pair/allomorph_rule)\n')

  const before = await count(supabase)
  console.log(`BEFORE: affixed_form_pairs=${before}`)

  // ── 1. Active word_form_pair_src capabilities ─────────────────────────────
  const { data: capsData, error: capsError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_ref, lesson_id')
    .eq('source_kind', 'word_form_pair_src')
    .is('retired_at', null)
  if (capsError) throw new Error(capsError.message)
  const caps = (capsData ?? []) as CapabilityRow[]
  console.log(`Found ${caps.length} active word_form_pair_src capabilit${caps.length === 1 ? 'y' : 'ies'}.`)
  if (caps.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // ── 2. Artifacts for the cap set ─────────────────────────────────────────
  const capIds = caps.map((c) => c.id)
  const { data: artifactsData, error: artifactsError } = await supabase
    .schema('indonesian')
    .from('capability_artifacts')
    .select('capability_id, artifact_kind, artifact_json')
    .in('capability_id', capIds)
    .in('artifact_kind', ['root_derived_pair', 'allomorph_rule'])
    .eq('quality_status', 'approved')
  if (artifactsError) throw new Error(artifactsError.message)
  const artifactByKey = new Map<string, ArtifactRow>()
  for (const a of (artifactsData ?? []) as ArtifactRow[]) {
    artifactByKey.set(`${a.capability_id}:${a.artifact_kind}`, a)
  }

  // ── 3. Resolve every cap into one affixed_form_pairs row ─────────────────
  const rows: ResolvedAffixedFormPair[] = []
  const anomalies: string[] = []

  for (const cap of caps) {
    if (!SOURCE_REF_RE.test(cap.source_ref)) {
      anomalies.push(`cap ${cap.canonical_key}: source_ref "${cap.source_ref}" does not match lesson-N/morphology/<slug>`)
      continue
    }
    if (!cap.lesson_id) {
      anomalies.push(`cap ${cap.canonical_key}: lesson_id is null (affixed_form_pairs.lesson_id is NOT NULL)`)
      continue
    }
    const pair = artifactByKey.get(`${cap.id}:root_derived_pair`)
    const rule = artifactByKey.get(`${cap.id}:allomorph_rule`)
    if (!pair || !rule) {
      anomalies.push(`cap ${cap.canonical_key}: missing artifact(s) — root_derived_pair=${!!pair}, allomorph_rule=${!!rule}`)
      continue
    }
    const pairJson = pair.artifact_json as { root?: unknown; derived?: unknown }
    const ruleJson = rule.artifact_json as { rule?: unknown }
    const rootText = typeof pairJson?.root === 'string' ? pairJson.root.trim() : ''
    const derivedText = typeof pairJson?.derived === 'string' ? pairJson.derived.trim() : ''
    const allomorphRule = typeof ruleJson?.rule === 'string' ? ruleJson.rule.trim() : ''
    if (!rootText || !derivedText || !allomorphRule) {
      anomalies.push(`cap ${cap.canonical_key}: empty field(s) — root="${rootText}", derived="${derivedText}", rule="${allomorphRule}"`)
      continue
    }
    rows.push({
      capability_id: cap.id,
      source_ref: cap.source_ref,
      lesson_id: cap.lesson_id,
      root_text: rootText,
      derived_text: derivedText,
      allomorph_rule: allomorphRule,
    })
  }

  console.log(`\nPlan: ${rows.length} affixed_form_pairs row(s).`)
  if (anomalies.length > 0) {
    console.error('\n✗ Anomalies (CRITICAL — bridge aborted):')
    for (const a of anomalies) console.error(`  - ${a}`)
    process.exit(1)
  }

  if (DRY_RUN) {
    for (const r of rows) {
      console.log(`  [dry-run] would insert cap=${r.capability_id} ref=${r.source_ref} ${r.root_text} → ${r.derived_text}`)
    }
    console.log('\n[DRY RUN] No writes performed.')
    return
  }

  // ── 4. Apply — ON CONFLICT (capability_id) DO NOTHING (ignoreDuplicates) ──
  let written = 0
  for (const r of rows) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('affixed_form_pairs')
      .upsert(
        {
          capability_id: r.capability_id,
          source_ref: r.source_ref,
          lesson_id: r.lesson_id,
          root_text: r.root_text,
          derived_text: r.derived_text,
          allomorph_rule: r.allomorph_rule,
        },
        { onConflict: 'capability_id', ignoreDuplicates: true },
      )
      .select('id')
    if (error) {
      console.error(`! affixed_form_pairs insert failed for cap=${r.capability_id}: ${error.message}`)
      process.exit(1)
    }
    if (data && data.length > 0) written++
  }

  const after = await count(supabase)
  console.log(`\nInserted: ${written} new affixed_form_pairs row(s) (existing rows left untouched — DO NOTHING).`)
  console.log(`AFTER: affixed_form_pairs=${after}`)
  console.log(`Delta: affixed_form_pairs ${before} → ${after} (+${after - before})`)
  console.log('\n✓ Bridge complete.')
}

async function count(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .schema('indonesian')
    .from('affixed_form_pairs')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return count ?? 0
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
