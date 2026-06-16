/**
 * adapter.grammarExercises.test.ts — Slice 2 Task 5 idempotent typed
 * grammar-exercise writers (NO exercise_variants):
 *   - writeGrammarExercisesForPattern — maps each candidate via the SHARED
 *     buildGrammarExerciseRow + inserts into the right typed table with
 *     grammar_pattern_id + lesson_id; fails loud on a DB error.
 *   - deleteGrammarExercisesForPattern — deletes by grammar_pattern_id across
 *     the 4 typed tables (the partial-rebuild + --regenerate path).
 *   - deleteLegacyPatternsForLesson — the cutover-delete: removes a lesson's
 *     patterns whose slug is NOT in the keep-set (CASCADE clears typed rows).
 *
 * REGRESSION GUARD: the mocks expose the REAL supabase-js chains (.insert(...)
 * .select('id').single() / .delete().eq().select('id') / .select().eq() /
 * .delete().in()). A drift to a non-existent option/method throws.
 */

import { describe, expect, it } from 'vitest'
import {
  writeGrammarExercisesForPattern,
  deleteGrammarExercisesForPattern,
  deleteLegacyPatternsForLesson,
  type GrammarExerciseCandidateInput,
} from '../adapter'

// ---------------------------------------------------------------------------
// Fixtures — constraint-valid candidates (already passed generator validation)
// ---------------------------------------------------------------------------

const CONTRAST: GrammarExerciseCandidateInput = {
  exercise_type: 'choose_correct_form_ex',
  payload: {
    promptText: 'Wijs naar het gebouw.',
    targetMeaning: 'bukan — geen',
    options: [
      { id: 'bukan', text: 'bukan' },
      { id: 'tidak', text: 'tidak' },
    ],
    correctOptionId: 'bukan',
    explanationText: 'bukan ontkent zelfstandige naamwoorden.',
  },
}

const CLOZE: GrammarExerciseCandidateInput = {
  exercise_type: 'choose_missing_word_ex',
  payload: {
    sentence: 'Ini ___ rumah.',
    translation: 'Dit is geen huis.',
    options: ['bukan', 'tidak', 'belum', 'jangan'],
    correctOptionId: 'bukan',
    explanationText: 'bukan ontkent rumah.',
  },
}

// ---------------------------------------------------------------------------
// Mock: write client — .insert(row).select('id').single()
// ---------------------------------------------------------------------------

function buildWriteClient(failTable?: string) {
  const inserted: Record<string, Array<Record<string, unknown>>> = {}
  const client = {
    schema: () => ({
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (table === failTable) {
                return { data: null, error: { message: 'simulated DB reject' } }
              }
              inserted[table] ??= []
              inserted[table].push(row)
              return { data: { id: `${table}-${inserted[table].length}` }, error: null }
            },
          }),
        }),
      }),
    }),
  } as never
  return { client, inserted }
}

// ---------------------------------------------------------------------------
// Mock: delete-by-pattern client — .delete().eq('grammar_pattern_id', id).select('id')
// ---------------------------------------------------------------------------

function buildDeleteByPatternClient(rowsByTable: Record<string, string[]>) {
  const deletedFrom: Record<string, string> = {}
  const client = {
    schema: () => ({
      from: (table: string) => ({
        delete: () => ({
          eq: (_col: string, id: string) => ({
            select: async () => {
              deletedFrom[table] = id
              const ids = rowsByTable[table] ?? []
              return { data: ids.map((rid) => ({ id: rid })), error: null }
            },
          }),
        }),
      }),
    }),
  } as never
  return { client, deletedFrom }
}

// ---------------------------------------------------------------------------
// Mock: legacy-pattern cutover client
//   .select('id, slug').eq('introduced_by_lesson_id', lessonId)  → existing rows
//   .delete().in('id', ids)                                       → records deleted ids
// ---------------------------------------------------------------------------

function buildLegacyPatternClient(existing: Array<{ id: string; slug: string }>) {
  const deletedIds: string[] = [] // grammar_patterns ids deleted
  const reviewEventsCleared: string[] = [] // review_events grammar_pattern_ids cleared first
  const client = {
    schema: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({ data: existing, error: null }),
        }),
        delete: () => ({
          in: async (_col: string, ids: string[]) => {
            if (table === 'review_events') reviewEventsCleared.push(...ids)
            else deletedIds.push(...ids)
            return { error: null }
          },
        }),
      }),
    }),
  } as never
  return { client, deletedIds, reviewEventsCleared }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeGrammarExercisesForPattern', () => {
  it('writes each candidate to its typed table with pattern + lesson keys', async () => {
    const { client, inserted } = buildWriteClient()
    const result = await writeGrammarExercisesForPattern(client, 'pat-1', 'lesson-1', [CONTRAST, CLOZE])
    expect(result.written).toBe(2)
    expect(result.byType.choose_correct_form_ex).toBe(1)
    expect(result.byType.choose_missing_word_ex).toBe(1)
    expect(inserted['contrast_pair_exercises']).toHaveLength(1)
    expect(inserted['cloze_mcq_exercises']).toHaveLength(1)
    // keys + is_active injected on the row
    const row = inserted['contrast_pair_exercises'][0]
    expect(row.grammar_pattern_id).toBe('pat-1')
    expect(row.lesson_id).toBe('lesson-1')
    expect(row.is_active).toBe(true)
    // typed columns mapped from the camelCase payload
    expect(row.prompt_text).toBe('Wijs naar het gebouw.')
    expect(row.correct_option_id).toBe('bukan')
  })

  it('fails loud when a typed-table insert errors (Lesson #2 — real schema surprise)', async () => {
    const { client } = buildWriteClient('cloze_mcq_exercises')
    await expect(
      writeGrammarExercisesForPattern(client, 'pat-1', 'lesson-1', [CLOZE]),
    ).rejects.toThrow(/cloze_mcq_exercises.*simulated DB reject/)
  })

  it('returns zero counts for an empty candidate list', async () => {
    const { client } = buildWriteClient()
    const result = await writeGrammarExercisesForPattern(client, 'pat-1', 'lesson-1', [])
    expect(result.written).toBe(0)
  })
})

describe('deleteGrammarExercisesForPattern', () => {
  it('deletes by grammar_pattern_id across all 4 typed tables and totals removed rows', async () => {
    const { client, deletedFrom } = buildDeleteByPatternClient({
      contrast_pair_exercises: ['a', 'b'],
      sentence_transformation_exercises: ['c'],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: ['d', 'e', 'f'],
    })
    const total = await deleteGrammarExercisesForPattern(client, 'pat-9')
    expect(total).toBe(6)
    // all 4 tables targeted, scoped to the pattern id
    expect(Object.keys(deletedFrom).sort()).toEqual([
      'cloze_mcq_exercises',
      'constrained_translation_exercises',
      'contrast_pair_exercises',
      'sentence_transformation_exercises',
    ])
    expect(deletedFrom['contrast_pair_exercises']).toBe('pat-9')
  })
})

describe('deleteLegacyPatternsForLesson', () => {
  it('deletes only the lesson patterns whose slug is NOT in the keep-set', async () => {
    const { client, deletedIds, reviewEventsCleared } = buildLegacyPatternClient([
      { id: 'p1', slug: 'l4-bukan-negatie' }, // keep (new)
      { id: 'p2', slug: 'bukan-negation' }, // legacy → delete
      { id: 'p3', slug: 'zero-copula' }, // legacy → delete
    ])
    const removed = await deleteLegacyPatternsForLesson(client, 'lesson-4', ['l4-bukan-negatie'])
    expect(removed.sort()).toEqual(['bukan-negation', 'zero-copula'])
    expect(deletedIds.sort()).toEqual(['p2', 'p3'])
    // Live-trial fix: the dead-legacy review_events for the deleted patterns are
    // cleared FIRST (else SET-NULL violates review_events_source_check).
    expect(reviewEventsCleared.sort()).toEqual(['p2', 'p3'])
  })

  it('is a no-op (deletes nothing) when every existing slug is kept', async () => {
    const { client, deletedIds } = buildLegacyPatternClient([
      { id: 'p1', slug: 'l4-bukan-negatie' },
    ])
    const removed = await deleteLegacyPatternsForLesson(client, 'lesson-4', [
      'l4-bukan-negatie',
      'l4-duur',
    ])
    expect(removed).toEqual([])
    expect(deletedIds).toEqual([])
  })
})
