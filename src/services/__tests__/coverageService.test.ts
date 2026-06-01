import { describe, expect, it, vi } from 'vitest'

// Hoisted so vi.mock can reference it; reset per test by reassigning.
const { tablesRef } = vi.hoisted(() => ({
  tablesRef: { current: {} as Record<string, unknown[]> },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({
      from: (table: string) => {
        const rows = tablesRef.current[table] ?? []
        const builder = {
          select: () => builder,
          order: () => builder,
          eq: () => builder,
          not: () => builder,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null }),
        }
        return builder
      },
    }),
  },
}))

import { getExerciseCoverage, getSectionCoverage } from '../coverageService'

function setTables(tables: Record<string, unknown[]>) {
  tablesRef.current = tables
}

describe('getSectionCoverage', () => {
  it('aggregates section-content types per lesson and sorts by order_index', async () => {
    setTables({
      lessons: [
        { id: 'l-2', order_index: 2, title: 'Two' },
        { id: 'l-1', order_index: 1, title: 'One' },
      ],
      lesson_sections: [
        { lesson_id: 'l-1', content: { type: 'vocabulary' } },
        { lesson_id: 'l-1', content: { type: 'grammar' } },
        { lesson_id: 'l-1', content: { type: 'vocabulary' } }, // dup; still one entry
        { lesson_id: 'l-2', content: { type: 'dialogue' } },
        { lesson_id: 'unknown-lesson', content: { type: 'vocabulary' } }, // ignored
      ],
    })

    const result = await getSectionCoverage()
    expect(result.map(r => r.lessonId)).toEqual(['l-1', 'l-2'])
    expect([...result[0]!.sectionTypes].sort()).toEqual(['grammar', 'vocabulary'])
    expect([...result[1]!.sectionTypes]).toEqual(['dialogue'])
  })
})

describe('getExerciseCoverage', () => {
  it('counts learning items via item_contexts and grammar exercises via the typed tables', async () => {
    setTables({
      lessons: [{ id: 'l-1', order_index: 1, title: 'One' }],
      item_contexts: [
        { id: 'ctx-1', source_lesson_id: 'l-1', learning_item_id: 'item-a', context_type: 'anchor' },
        { id: 'ctx-2', source_lesson_id: 'l-1', learning_item_id: 'item-b', context_type: 'cloze' },
      ],
      item_meanings: [{ learning_item_id: 'item-a' }],
      // Slice 2 Task 8: grammar exercises counted from the typed tables, NOT
      // exercise_variants. (Vocab exercises are runtime-generated → not counted.)
      contrast_pair_exercises: [{ lesson_id: 'l-1', grammar_pattern_id: 'gp-1' }],
      cloze_mcq_exercises: [{ lesson_id: 'l-1', grammar_pattern_id: 'gp-1' }],
      item_context_grammar_patterns: [],
      grammar_patterns: [],
    })

    const [row] = await getExerciseCoverage()
    expect(row?.learningItems).toBe(2)
    expect(row?.hasMeanings).toBe(true)
    expect(row?.clozeContexts).toBe(1)
    expect(row?.exerciseVariants).toEqual({ contrast_pair: 1, cloze_mcq: 1 })
  })

  it('counts grammar patterns via introduced_by_lesson_id, the typed tables, and the item_context junction', async () => {
    setTables({
      lessons: [{ id: 'l-1', order_index: 1, title: 'One' }],
      item_contexts: [
        { id: 'ctx-1', source_lesson_id: 'l-1', learning_item_id: 'item-a', context_type: 'anchor' },
      ],
      item_meanings: [],
      // Path B: grammar exercise in a typed table with lesson_id + pattern_id
      sentence_transformation_exercises: [{ lesson_id: 'l-1', grammar_pattern_id: 'gp-1' }],
      item_context_grammar_patterns: [
        // Path A: vocab-context link
        { context_id: 'ctx-1', grammar_pattern_id: 'gp-2' },
      ],
      grammar_patterns: [
        // Path C: published-pattern direct link (and overlap with gp-1 from Path B — should dedupe)
        { id: 'gp-1', introduced_by_lesson_id: 'l-1' },
        { id: 'gp-3', introduced_by_lesson_id: 'l-1' },
      ],
    })

    const [row] = await getExerciseCoverage()
    // gp-1 (B + C), gp-2 (A), gp-3 (C) → 3 unique
    expect(row?.grammarPatterns).toBe(3)
  })
})
