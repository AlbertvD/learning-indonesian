/**
 * satellitePresence.ts — the single shared "does this capability's required
 * typed satellite row exist?" predicate.
 *
 * Layer 1 of the readiness↔artifact reconciliation three-layer gate
 * (docs/plans/2026-06-14-readiness-artifact-reconciliation.md §2c). It is the ONE
 * importable home for the HC15/17/19/20 satellite-presence logic, imported by:
 *   - the capability-stage reconciliation step (reconcileArtifactPresence in
 *     adapter.ts) — soft-retires an active+ready+published cap whose required
 *     satellite row has disappeared, so an unrenderable cap can never stay
 *     schedulable (Layer 2, pipeline).
 *   - HC15 / HC17 / HC19 / HC20 in scripts/check-supabase-deep.ts — the live-DB
 *     no-orphan mirrors (Layer 3).
 * One predicate behind all three layers means they can never drift to three
 * different definitions of "renderable" (the exact failure the three-layer gate
 * prevents — project_three_layer_invariant_gates).
 *
 * Per source_kind / capability_type, the required satellite row is:
 *   dialogue_line / contextual_cloze     → a dialogue_clozes row     (by capability_id, HC15)
 *   affixed_form_pair / root_derived_*   → an affixed_form_pairs row  (by capability_id, HC17)
 *   pattern / pattern_contrast           → a contrast_pair_exercises row for the cap's pattern (HC19)
 *   pattern / pattern_recognition        → ≥1 row across the 3 recognition exercise
 *                                          tables for the cap's pattern (HC20)
 *   item / *                             → N/A — no per-cap satellite row to key on
 *                                          (§2c); item caps are never offenders.
 *
 * The caller decides WHICH caps to feed in (so it owns the readiness/publication
 * scope): the HC checks pass every active cap of a kind; the reconciliation step
 * passes only active+ready+published caps. This predicate only answers, for the
 * caps it is given, which ones lack their required satellite row.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { GRAMMAR_EXERCISE_TABLES } from './loadFromDb'

export interface CapForSatelliteCheck {
  id: string
  canonical_key: string
  source_kind: string
  source_ref: string
  capability_type: string
}

const CHUNK = 50

/** Strip the `lesson-N/pattern-` prefix to recover the grammar_patterns.slug. */
const patternSlugOf = (sourceRef: string): string =>
  sourceRef.replace(/^lesson-\d+\/pattern-/u, '')

/**
 * Chunked read of a 1:1 satellite table's `capability_id` column → the set of
 * capability_ids that HAVE a row. Used for dialogue_clozes (HC15) and
 * affixed_form_pairs (HC17), both keyed by capability_id.
 */
async function fetchPresentCapIds(
  supabase: SupabaseClient,
  table: string,
  capIds: string[],
): Promise<Set<string>> {
  const present = new Set<string>()
  for (let i = 0; i < capIds.length; i += CHUNK) {
    const chunk = capIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from(table)
      .select('capability_id')
      .in('capability_id', chunk)
    if (error) throw new Error(`satellitePresence: read of ${table} failed: ${error.message}`)
    for (const row of (data ?? []) as Array<{ capability_id: string }>) {
      present.add(row.capability_id)
    }
  }
  return present
}

/** Set of `grammar_pattern_id`s with ≥1 active row in a typed grammar-exercise table. */
async function fetchActivePatternIds(
  supabase: SupabaseClient,
  table: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from(table)
    .select('grammar_pattern_id')
    .eq('is_active', true)
  if (error) throw new Error(`satellitePresence: read of ${table} failed: ${error.message}`)
  return new Set(((data ?? []) as Array<{ grammar_pattern_id: string }>).map((r) => r.grammar_pattern_id))
}

/**
 * The pattern arm (HC19 + HC20). A pattern cap renders from a typed grammar-
 * exercise row keyed by grammar_pattern_id (NOT capability_id). The link is:
 *   source_ref (lesson-N/pattern-<slug>) → slug → grammar_patterns.id →
 *   <typed table>.grammar_pattern_id.
 *   - pattern_contrast    → needs a contrast_pair_exercises row.
 *   - pattern_recognition → needs ≥1 row in the union of the 3 recognition tables.
 * Other pattern capability_types have no satellite predicate and are never offenders.
 */
async function findPatternCapsMissing(
  supabase: SupabaseClient,
  patternCaps: CapForSatelliteCheck[],
): Promise<CapForSatelliteCheck[]> {
  const slugs = [...new Set(patternCaps.map((c) => patternSlugOf(c.source_ref)))]
  const { data: patternRows, error: pErr } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .select('id, slug')
    .in('slug', slugs)
  if (pErr) throw new Error(`satellitePresence: read of grammar_patterns failed: ${pErr.message}`)
  const patternIdBySlug = new Map(
    ((patternRows ?? []) as Array<{ id: string; slug: string }>).map((p) => [p.slug, p.id]),
  )

  const contrastSet = await fetchActivePatternIds(supabase, GRAMMAR_EXERCISE_TABLES.contrast_pair)
  const stSet = await fetchActivePatternIds(supabase, GRAMMAR_EXERCISE_TABLES.sentence_transformation)
  const ctSet = await fetchActivePatternIds(supabase, GRAMMAR_EXERCISE_TABLES.constrained_translation)
  const cmSet = await fetchActivePatternIds(supabase, GRAMMAR_EXERCISE_TABLES.cloze_mcq)
  const recognitionUnion = new Set<string>([...stSet, ...ctSet, ...cmSet])

  const missing: CapForSatelliteCheck[] = []
  for (const c of patternCaps) {
    const pid = patternIdBySlug.get(patternSlugOf(c.source_ref))
    if (c.capability_type === 'pattern_contrast') {
      if (!pid || !contrastSet.has(pid)) missing.push(c)
    } else if (c.capability_type === 'pattern_recognition') {
      if (!pid || !recognitionUnion.has(pid)) missing.push(c)
    }
    // Any other pattern capability_type: no satellite predicate → not an offender.
  }
  return missing
}

/**
 * Given a set of capabilities, return the subset whose REQUIRED typed satellite
 * row is absent. Throws on any DB read error (the caller surfaces it).
 *
 * Source kinds with no per-cap satellite predicate (notably `item`, §2c) are
 * silently skipped — their caps are never offenders.
 */
export async function findCapsMissingSatellite(
  supabase: SupabaseClient,
  caps: CapForSatelliteCheck[],
): Promise<CapForSatelliteCheck[]> {
  if (caps.length === 0) return []
  const missing: CapForSatelliteCheck[] = []

  // dialogue_line → dialogue_clozes (HC15)
  const dialogueCaps = caps.filter((c) => c.source_kind === 'dialogue_line')
  if (dialogueCaps.length > 0) {
    const present = await fetchPresentCapIds(supabase, 'dialogue_clozes', dialogueCaps.map((c) => c.id))
    for (const c of dialogueCaps) if (!present.has(c.id)) missing.push(c)
  }

  // affixed_form_pair → affixed_form_pairs (HC17)
  const affixedCaps = caps.filter((c) => c.source_kind === 'affixed_form_pair')
  if (affixedCaps.length > 0) {
    const present = await fetchPresentCapIds(supabase, 'affixed_form_pairs', affixedCaps.map((c) => c.id))
    for (const c of affixedCaps) if (!present.has(c.id)) missing.push(c)
  }

  // pattern → typed grammar-exercise rows (HC19 + HC20)
  const patternCaps = caps.filter((c) => c.source_kind === 'pattern')
  if (patternCaps.length > 0) {
    missing.push(...(await findPatternCapsMissing(supabase, patternCaps)))
  }

  return missing
}
