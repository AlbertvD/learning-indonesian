/**
 * capability-stage/patternPath.ts — the Slice 2 pattern-kind write path (Task 6).
 *
 * The DB→DB grammar cutover, extracted from the runner so it is unit-testable in
 * isolation (mirrors the item path, which is inlined; the pattern path is large
 * enough to warrant its own home). Pure-ish orchestration over the adapter +
 * the in-stage generator — NO disk I/O.
 *
 * What it does, for ONE lesson that HAS typed grammar categories:
 *   1. Upsert grammar_patterns from the Task-3 projector (NEW slugs `l{N}-…`).
 *   2. Cutover-delete the lesson's LEGACY patterns (slug NOT in the new set) —
 *      CASCADE clears their typed exercise rows (the C1/I2 work
 *      retireOrphanedCapabilities can't do; see adapter.deleteLegacyPatternsForLesson).
 *   3. Write the NEW pattern capabilities (skip-if-exists; FSRS-safe).
 *   4. Per pattern, consult the OQ2-2 seeded-check (patternSeeding) against the
 *      pre-loaded coverage: SEEDED → skip; PARTIAL/REGENERATE → delete-first;
 *      ABSENT/PARTIAL/REGENERATE → generate (in-stage) + write typed rows.
 *   5. Typed-only — NO exercise_variants write. (Task 6 kept a transitional
 *      dual-write until coverageService was repointed; Task 8 repointed it onto
 *      the typed tables + dropped the exercise_review_comments FK, so the
 *      separate-uuid dual-write is gone — the 4 typed tables are the sole store.)
 *
 * The caller (runner) is responsible for the no-double-write filter (excluding
 * `sourceKind === 'pattern'` caps from the legacy staging bundle) and for
 * merging the returned cap-id map into the retire emit set BEFORE the orphan
 * sweep so the new pattern caps are not soft-retired.
 *
 * DETERMINISM BOUNDARY: every step here is deterministic EXCEPT the in-stage
 * generator (an LLM). The seeded-check + idempotent writes make a re-run stable
 * regardless — a seeded lesson regenerates nothing.
 */

import {
  upsertGrammarPatterns,
  upsertCapabilitiesSkipIfExists,
  deleteLegacyPatternsForLesson,
  deleteGrammarExercisesForPattern,
  writeGrammarExercisesForPattern,
  type CapabilitySupabaseClient,
} from './adapter'
import {
  generateGrammarExercises,
  type GenerateFn,
  type GrammarPatternInput,
  type GeneratedExerciseType,
} from './generateGrammarExercises'
import { classifyPatternSeedState } from './patternSeeding'
import type { PatternPlan } from './projectors/grammar'
import type { ExistingPatternState, GrammarExerciseType } from './loadFromDb'

export interface GrammarVocabPoolItem {
  indonesian_text: string
  l1_translation: string
  item_type: 'word' | 'phrase'
}

export interface WritePatternPathInput {
  patternPlans: PatternPlan[]
  lessonId: string
  /** Pre-loaded pattern coverage/state (loadPatternFromDb) — the seeded-check input. */
  patternState: ExistingPatternState
  /** Cumulative vocab pool (current + prior lessons) for the generator. */
  pool: GrammarVocabPoolItem[]
  /** `--regenerate-pattern <slug>` target, or null. */
  regenerateSlug: string | null
}

export interface WritePatternPathHooks {
  /** Inject the generator's Claude call for tests / dry runs. */
  generateFn?: GenerateFn
}

export interface WritePatternPathResult {
  /** grammar_patterns rows upserted (new slugs). */
  patternsUpserted: number
  /** Legacy pattern slugs removed by the cutover-delete. */
  retiredLegacySlugs: string[]
  /** New pattern `grammar_patterns.id` keyed by slug. */
  patternIdsBySlug: Map<string, string>
  /** New pattern cap canonical_key → id (merge into the retire emit set). */
  capIdsByKey: Map<string, string>
  /** The new pattern caps' canonical keys (for the no-double-write filter audit). */
  patternCapKeys: string[]
  /** Typed grammar-exercise rows written across the 4 tables. */
  exercisesWritten: number
  /** Patterns skipped because already fully seeded. */
  patternsSkippedSeeded: number
  /** Patterns deleted-first then regenerated (partial or --regenerate). */
  patternsRegenerated: number
  /** Patterns the generator declined (0 valid exercises — warn-and-skip). */
  skippedPatternSlugs: string[]
  /** Candidates dropped by the generator's defensive validation. */
  droppedCount: number
  /** grammar_patterns table not in the schema cache (PGRST205) — nothing written. */
  tableMissing: boolean
}

/** Map a PatternPlan to the generator's per-pattern input shape. */
function toGeneratorInput(plan: PatternPlan): GrammarPatternInput {
  return {
    slug: plan.slug,
    title: plan.category.title,
    rules: plan.category.rules,
    examples: plan.category.examples.map((e) => ({
      indonesian: e.indonesian,
      dutch: e.dutch,
      english: e.english,
    })),
  }
}

export async function writePatternPath(
  supabase: CapabilitySupabaseClient,
  input: WritePatternPathInput,
  hooks: WritePatternPathHooks = {},
): Promise<WritePatternPathResult> {
  const allPatternCaps = input.patternPlans.flatMap((p) => p.capabilities)
  const patternCapKeys = allPatternCaps.map((c) => c.canonicalKey)

  const empty: WritePatternPathResult = {
    patternsUpserted: 0,
    retiredLegacySlugs: [],
    patternIdsBySlug: new Map(),
    capIdsByKey: new Map(),
    patternCapKeys,
    exercisesWritten: 0,
    exerciseVariantIds: [],
    patternsSkippedSeeded: 0,
    patternsRegenerated: 0,
    skippedPatternSlugs: [],
    droppedCount: 0,
    tableMissing: false,
  }

  if (input.patternPlans.length === 0) return empty

  // 1. Upsert grammar_patterns (new slugs).
  const upsert = await upsertGrammarPatterns(
    supabase,
    input.patternPlans.map((p) => p.grammarPatternInput),
  )
  if (upsert.tableMissing) {
    return { ...empty, tableMissing: true }
  }
  const patternIdsBySlug = upsert.idsBySlug

  // 2. Cutover-delete legacy patterns (keep the new slugs).
  const keepSlugs = input.patternPlans.map((p) => p.slug)
  const retiredLegacySlugs = await deleteLegacyPatternsForLesson(
    supabase,
    input.lessonId,
    keepSlugs,
  )

  // 3. Write new pattern capabilities (skip-if-exists). Build the full key→id map
  //    (newly inserted ∪ already-existing) for the retire emit set.
  const newCapIds = await upsertCapabilitiesSkipIfExists(supabase, allPatternCaps)
  const capIdsByKey = new Map<string, string>()
  for (const cap of allPatternCaps) {
    const id =
      newCapIds.get(cap.canonicalKey) ??
      input.patternState.existingPatternCapsByCanonicalKey.get(cap.canonicalKey)?.id
    if (id) capIdsByKey.set(cap.canonicalKey, id)
  }

  // 4. Per-pattern seeded-check → decide skip / delete-first / generate.
  const toGenerate: PatternPlan[] = []
  let patternsSkippedSeeded = 0
  let patternsRegenerated = 0
  for (const plan of input.patternPlans) {
    const patternId = patternIdsBySlug.get(plan.slug)
    if (!patternId) continue // table-missing already returned; defensive.
    const isRegenerate = input.regenerateSlug === plan.slug
    const covered = input.patternState.exerciseCoverageByPatternId.get(patternId)
    const state = classifyPatternSeedState(covered)

    if (state === 'seeded' && !isRegenerate) {
      patternsSkippedSeeded += 1
      continue
    }
    if (state === 'partial' || isRegenerate) {
      // Delete-first: clear the keyless typed rows so regeneration cannot duplicate.
      await deleteGrammarExercisesForPattern(supabase, patternId)
      patternsRegenerated += 1
    }
    toGenerate.push(plan)
  }

  if (toGenerate.length === 0) {
    return {
      ...empty,
      patternsUpserted: patternIdsBySlug.size,
      retiredLegacySlugs,
      patternIdsBySlug,
      capIdsByKey,
      patternsSkippedSeeded,
      patternsRegenerated,
    }
  }

  // 5. Generate (in-stage) for the patterns that need it (one Claude call each).
  const generation = await generateGrammarExercises(
    toGenerate.map(toGeneratorInput),
    input.pool,
    { generateFn: hooks.generateFn },
  )

  // 6. Write typed rows only (the 4 typed tables are the sole grammar-exercise
  //    store — no exercise_variants write; Task 8 dropped that path).
  let exercisesWritten = 0
  for (const plan of toGenerate) {
    const patternId = patternIdsBySlug.get(plan.slug)
    if (!patternId) continue
    const candidates = generation.candidatesByPatternSlug.get(plan.slug) ?? []
    if (candidates.length === 0) continue

    const writeResult = await writeGrammarExercisesForPattern(
      supabase,
      patternId,
      input.lessonId,
      candidates.map((c) => ({
        exercise_type: c.exercise_type as GrammarExerciseType,
        payload: c.payload,
      })),
    )
    exercisesWritten += writeResult.written
  }

  return {
    patternsUpserted: patternIdsBySlug.size,
    retiredLegacySlugs,
    patternIdsBySlug,
    capIdsByKey,
    patternCapKeys,
    exercisesWritten,
    patternsSkippedSeeded,
    patternsRegenerated,
    skippedPatternSlugs: generation.skippedPatternSlugs,
    droppedCount: generation.droppedCount,
    tableMissing: false,
  }
}

// Re-export for the runner's gate inputs.
export type { GeneratedExerciseType }
