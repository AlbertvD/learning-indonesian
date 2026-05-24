// lib/exercise-content/byKind/pattern — pattern-source-kind fetcher (PR 4).
//
// First-ever live rendering of grammar (pattern) capabilities. Switches the 4
// grammar exercise types from the legacy `exercise_variants.payload_json` blob
// to the typed grammar-exercise tables (target plan Decision B + G):
//   contrast_pair           → contrast_pair_exercises
//   sentence_transformation → sentence_transformation_exercises
//   constrained_translation → constrained_translation_exercises
//   cloze_mcq (pattern)     → cloze_mcq_exercises
//
// Structural difference from the other source kinds: these tables are keyed by
// `grammar_pattern_id` (NOT capability_id), with MANY rows per pattern. A
// pattern cap links to its pattern via `source_ref` (`lesson-N/pattern-<slug>`)
// → strip the `lesson-N/pattern-` prefix → `grammar_patterns.slug` →
// `grammar_pattern_id` (verified 94/94 resolve, 2026-05-24). The reader
// collapses the N rows per (pattern, exercise_type) to one deterministically
// (lowest id), mirroring the legacy `variantByItemAndType` single-pick in
// byKind/item.ts — selection/variety is a planner concern, out of scope here.
//
// FAIL-LOUD per §1.5: a ready pattern cap whose typed table has no row for the
// resolver-chosen exercise_type surfaces `pattern_typed_row_missing` rather than
// skipping silently. This also catches the per-type coverage gap (a pattern with
// cloze_mcq rows but no sentence_transformation row, say) — readiness is
// structural (renderContracts + NOT NULL columns), not data-existence (Decision R).

import {
  type PatternBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  makeFailContext,
} from '../adapter'
import type { PatternExerciseInput } from '@/lib/capabilities'

// exercise_type → typed table. The 4 grammar types this fetcher serves; any
// other exerciseType on a pattern block is a planner bug (surfaced as a fail).
const TABLE_BY_TYPE = {
  contrast_pair: 'contrast_pair_exercises',
  sentence_transformation: 'sentence_transformation_exercises',
  constrained_translation: 'constrained_translation_exercises',
  cloze_mcq: 'cloze_mcq_exercises',
} as const
type GrammarExerciseType = keyof typeof TABLE_BY_TYPE

const GRAMMAR_TYPES = new Set<string>(Object.keys(TABLE_BY_TYPE))

/** lesson-N/pattern-<slug> → <slug>. Verified against the live DB: all 94
 *  pattern caps' source_refs resolve to a grammar_patterns.slug this way. */
function slugFromSourceRef(sourceRef: string): string {
  return sourceRef.replace(/^lesson-\d+\/pattern-/u, '')
}

export async function fetchForPatternBlocks(
  client: SupabaseSchemaClient,
  patternBlocks: PatternBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (patternBlocks.length === 0) return

  // 1. Resolve all needed slugs → grammar_pattern_id in one query.
  const slugByBlockId = new Map<string, string>()
  for (const { block, sourceRef } of patternBlocks) {
    slugByBlockId.set(block.id, slugFromSourceRef(sourceRef))
  }
  const slugs = [...new Set(slugByBlockId.values())]
  const { data: patternRows, error: pErr } = await client.schema('indonesian')
    .from('grammar_patterns')
    .select('id, slug')
    .in('slug', slugs)
  if (pErr) throw pErr
  const patternIdBySlug = new Map<string, string>()
  for (const r of (patternRows ?? []) as Array<{ id: string; slug: string }>) {
    patternIdBySlug.set(r.slug, r.id)
  }

  // 2. Group blocks by the resolver-chosen exercise_type so each typed table is
  //    queried once. Blocks with a non-grammar exercise_type fail immediately.
  const blocksByType = new Map<GrammarExerciseType, PatternBucketEntry[]>()
  for (const entry of patternBlocks) {
    const et = entry.block.renderPlan.exerciseType
    if (!GRAMMAR_TYPES.has(et)) {
      result.set(entry.block.id, {
        kind: 'fail',
        block: entry.block,
        context: makeFailContext(entry.block, 'pattern_typed_row_missing',
          `pattern block scheduled with non-grammar exercise_type '${et}' — planner/contract drift`,
          { capabilityId: entry.block.capabilityId, sourceRef: entry.sourceRef, exerciseType: et }),
      })
      continue
    }
    const list = blocksByType.get(et as GrammarExerciseType) ?? []
    list.push(entry)
    blocksByType.set(et as GrammarExerciseType, list)
  }

  // 3. Per exercise_type: fetch all active rows for the needed patterns, then
  //    collapse to one row per grammar_pattern_id (lowest id — deterministic).
  for (const [exerciseType, entries] of blocksByType) {
    const patternIds = [...new Set(
      entries
        .map(e => patternIdBySlug.get(slugByBlockId.get(e.block.id)!))
        .filter((x): x is string => x != null),
    )]

    const rowByPatternId = new Map<string, Record<string, unknown>>()
    if (patternIds.length > 0) {
      const { data, error } = await client.schema('indonesian')
        .from(TABLE_BY_TYPE[exerciseType])
        .select('*')
        .in('grammar_pattern_id', patternIds)
        .eq('is_active', true)
        .order('id', { ascending: true })
      if (error) throw error
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const pid = row.grammar_pattern_id as string
        // First row wins (rows arrive id-ascending) — deterministic single-pick.
        if (!rowByPatternId.has(pid)) rowByPatternId.set(pid, row)
      }
    }

    for (const { block, sourceRef } of entries) {
      const slug = slugByBlockId.get(block.id)!
      const patternId = patternIdBySlug.get(slug)
      const row = patternId ? rowByPatternId.get(patternId) : undefined
      if (!row) {
        // Fail-loud: a ready pattern cap with no typed row for this exercise
        // type. Means the bridge/re-publish never populated this (pattern,
        // exercise_type), or the resolver chose a type this pattern lacks.
        result.set(block.id, {
          kind: 'fail',
          block,
          context: makeFailContext(block, 'pattern_typed_row_missing',
            `pattern cap ${block.capabilityId} (${slug}) has no active ${exerciseType} row — typed table not populated for this pattern`,
            { capabilityId: block.capabilityId, sourceRef, slug, exerciseType, patternResolved: patternId != null }),
        })
        continue
      }

      // The DB NOT NULL columns + validateGrammarExercises guarantee the row
      // matches the exerciseType's typed shape; narrow the `select('*')` result
      // (Record<string, unknown>) to the discriminated union via unknown.
      const patternExercise = { exerciseType, row } as unknown as PatternExerciseInput
      result.set(block.id, {
        kind: 'ok',
        block,
        input: {
          block,
          learningItem: null,
          dialogueLine: null,
          affixedFormPair: null,
          patternExercise,
          meanings: [],
          contexts: [],
          answerVariants: [],
          // No artifacts in the typed-table path — the byType grammar packagers
          // read input.exercise; the empty map is a no-op for them.
          artifactsByKind: new Map(),
          poolItems: [],
          poolMeaningsByItem: new Map(),
          userLanguage,
        },
      })
    }
  }
}
