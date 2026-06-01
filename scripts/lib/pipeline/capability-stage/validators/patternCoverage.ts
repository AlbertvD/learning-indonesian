/**
 * CS18 — pattern typed-exercise coverage (Slice 2 Task 7).
 *
 * The post-write half of OQ2-2: the seeded-check (patternSeeding.ts) decides
 * skip-vs-regenerate from PRE-write coverage; THIS validator certifies what
 * actually landed. For every grammar pattern the runner wrote this run, it
 * queries the 4 typed exercise tables and asserts the pattern ended with >=1
 * active row for EVERY required exercise type. This is what makes the OQ2-2
 * idempotency trustworthy — a partial pattern that slipped through would be
 * re-detected `partial` and churn delete+regenerate on every future publish,
 * and at runtime `byKind/pattern.ts` would raise `pattern_typed_row_missing`
 * for the cap whose type is absent.
 *
 * It also re-expresses (against DB state) the INTENT of the retired lint-staging
 * disk checks `checkGrammarPatterns` / `checkCandidatesStructural`: those asserted
 * a pattern has a valid slug + at least one resolvable candidate. The in-stage
 * projector (slug by construction) + generator (defensive per-type validation)
 * guarantee the structural half; this gate certifies the OUTPUT actually covers
 * the types — the part only post-write DB state can know.
 *
 * Severity discipline (Lesson #6 — don't over-error a graceful condition):
 *   - DECLINED (0 rows AND slug in skippedSlugs): WARNING `pattern_declined`.
 *     The generator found nothing drill-worthy (a rules-only reference category,
 *     OQ2-5 CONTENT-QUALITY WATCH). The pattern caps still exist; the runtime
 *     simply has no exercise to show — expected, surfaced for review.
 *   - NO EXERCISES (0 rows AND NOT skipped): ERROR `pattern_no_exercises`.
 *     We intended to seed it but nothing landed — a real generation/write gap.
 *   - PARTIAL (some types present, at least one required type missing): ERROR
 *     `pattern_typed_row_missing`. The named failure class: a cap can't render +
 *     idempotency would churn. Lists the missing types.
 *   - FULL coverage → no finding.
 *
 * Machine-readable: every finding carries `context.itemSlug` = the pattern slug
 * and a structured message (so a monitoring agent can parse missing types).
 */

import type { ValidationFinding } from '../model'
import type { CapabilitySupabaseClient } from '../adapter'
import { GRAMMAR_EXERCISE_TABLES, type GrammarExerciseType } from '../loadFromDb'
import { REQUIRED_PATTERN_EXERCISE_TYPES } from '../patternSeeding'

export interface PatternCoverageInput {
  /** grammar pattern slug → grammar_patterns.id, for patterns written this run. */
  patternIdsBySlug: Map<string, string>
  /** Slugs the generator declined (0 valid exercises) — a WARNING, not an error. */
  skippedSlugs: string[]
  /** Override the required type set (defaults to all 4). */
  requiredTypes?: readonly GrammarExerciseType[]
}

/**
 * Query the 4 typed exercise tables for the given pattern ids and build, per
 * pattern id, the set of exercise types with >=1 active row.
 */
async function fetchCoverage(
  supabase: CapabilitySupabaseClient,
  patternIds: string[],
): Promise<Map<string, Set<GrammarExerciseType>>> {
  const coverage = new Map<string, Set<GrammarExerciseType>>()
  if (patternIds.length === 0) return coverage
  for (const [exerciseType, table] of Object.entries(GRAMMAR_EXERCISE_TABLES) as Array<
    [GrammarExerciseType, string]
  >) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from(table)
      .select('grammar_pattern_id')
      .eq('is_active', true)
      .in('grammar_pattern_id', patternIds)
    if (error) {
      throw new Error(`CS18: failed to read coverage from ${table}: ${error.message}`)
    }
    for (const row of (data ?? []) as Array<{ grammar_pattern_id: string }>) {
      let set = coverage.get(row.grammar_pattern_id)
      if (!set) {
        set = new Set<GrammarExerciseType>()
        coverage.set(row.grammar_pattern_id, set)
      }
      set.add(exerciseType)
    }
  }
  return coverage
}

export async function validatePatternCoverage(
  supabase: CapabilitySupabaseClient,
  input: PatternCoverageInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  const required = input.requiredTypes ?? REQUIRED_PATTERN_EXERCISE_TYPES
  const skipped = new Set(input.skippedSlugs)

  const patternIds = [...input.patternIdsBySlug.values()]
  const coverage = await fetchCoverage(supabase, patternIds)

  for (const [slug, patternId] of input.patternIdsBySlug) {
    const covered = coverage.get(patternId) ?? new Set<GrammarExerciseType>()
    const missing = required.filter((t) => !covered.has(t))

    if (missing.length === 0) continue // full coverage

    const ctx = { itemSlug: slug }
    if (covered.size === 0) {
      if (skipped.has(slug)) {
        findings.push({
          gate: 'CS18',
          severity: 'warning',
          message: `Pattern "${slug}" was declined by the generator (no drill-worthy exercises) — caps exist but have no exercise to render`,
          context: ctx,
        })
      } else {
        findings.push({
          gate: 'CS18',
          severity: 'error',
          message: `Pattern "${slug}" has NO typed exercise rows but was not declined — generation/write gap (expected ${required.join(', ')})`,
          context: ctx,
        })
      }
      continue
    }

    // Partial — has some types, missing at least one required type.
    findings.push({
      gate: 'CS18',
      severity: 'error',
      message: `Pattern "${slug}" pattern_typed_row_missing: missing exercise type(s) [${missing.join(', ')}] (has [${[...covered].join(', ')}]) — a cap cannot render + idempotency would churn`,
      context: ctx,
    })
  }

  return findings
}
