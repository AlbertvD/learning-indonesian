/**
 * verify/countParity.ts — CS7 seed hook (post-write).
 *
 * For each write surface this stage touched, asserts that the rows the
 * upsert step claimed it wrote are actually present in the DB. Per fold
 * §11 #21 the comparison is `>=`, not strict equality — re-runs that
 * pick up rows from prior runs (or rows authored by other lessons
 * sharing a junction) must not flake.
 *
 * Verification strategy:
 *   - `content_units`, `learning_capabilities`: verify by ID membership.
 *     The runner has the UUIDs returned by the upsert calls, so the
 *     check is "are these N IDs present?" — no need to filter by
 *     source_ref or walk a junction.
 *   - `grammar_patterns`: keep the column-keyed query — patterns are
 *     genuinely lesson-scoped via `introduced_by_lesson_id`.
 *   - `exercise_variants`: keep the existing lesson_id-keyed check.
 *     Vocab variants route via context_id, which seedIntegrity covers.
 *
 * Why not source_ref filtering on content_units? Of the four source_ref
 * shapes a publish writes (`lesson-N`, `lesson-N/pattern-…`,
 * `lesson-N/morphology/…`, `learning_items/…`), only the first matches
 * a literal `.eq('source_ref', 'lesson-N')` — so the prior implementation
 * always reported a false-positive parity failure on any lesson with
 * vocabulary, grammar, or morphology rows.
 *
 * Mismatches produce a CS7 `error` finding; the runner returns
 * `status: 'partial'`.
 */

import type { CapabilitySupabaseClient } from '../adapter'
import { countRowsByIds, countTableForLesson, countExerciseVariantsForLesson } from '../adapter'
import type { ValidationFinding } from '../model'

export interface CountParityInput {
  lessonId: string
  declared: {
    contentUnits: number
    grammarPatterns: number
    capabilities: number
    learningItems: number
    exerciseVariants: number
    clozeContexts: number
    /** Optional — only set when morphology fired. */
    morphologyContentUnits?: number
  }
  /** Content unit UUIDs returned by upsertContentUnits. */
  contentUnitIds: string[]
  /** Capability UUIDs returned by upsertCapabilities. */
  capabilityIds: string[]
}

export async function runCountParity(
  supabase: CapabilitySupabaseClient,
  input: CountParityInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []

  // content_units: every UUID the runner declared must be in the DB.
  const contentUnitsCount = await countRowsByIds(supabase, 'content_units', 'id', input.contentUnitIds)
  if (contentUnitsCount < input.declared.contentUnits) {
    findings.push(parityFinding('content_units', input.declared.contentUnits, contentUnitsCount))
  }

  // learning_capabilities: every UUID the runner declared must be in the DB.
  const capabilitiesCount = await countRowsByIds(supabase, 'learning_capabilities', 'id', input.capabilityIds)
  if (capabilitiesCount < input.declared.capabilities) {
    findings.push(parityFinding('learning_capabilities', input.declared.capabilities, capabilitiesCount))
  }

  // grammar_patterns: keyed by introduced_by_lesson_id.
  const grammarPatternsCount = await countTableForLesson(supabase, 'grammar_patterns', {
    column: 'introduced_by_lesson_id',
    value: input.lessonId,
  })
  if (grammarPatternsCount < input.declared.grammarPatterns) {
    findings.push(parityFinding('grammar_patterns', input.declared.grammarPatterns, grammarPatternsCount))
  }

  // exercise_variants: keyed by lesson_id (grammar) + context (vocab joined to lesson).
  // The vocab branch lacks a direct lesson_id, so this only verifies the grammar-variant
  // lower bound. seedIntegrity (CS9) catches the orphan pattern for vocab.
  const variantsCount = await countExerciseVariantsForLesson(supabase, input.lessonId)
  if (input.declared.exerciseVariants > 0 && variantsCount === 0) {
    findings.push(parityFinding('exercise_variants', input.declared.exerciseVariants, variantsCount))
  }

  return findings
}

function parityFinding(table: string, declared: number, actual: number): ValidationFinding {
  return {
    gate: 'CS7',
    severity: 'error',
    message:
      `Count parity check failed for ${table}: declared ${declared}, ` +
      `DB has ${actual} (expected db_count >= declaredCount)`,
    context: { table },
  }
}
