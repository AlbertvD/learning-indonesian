import { describe, it, expect } from 'vitest'
import { runLessonCountParity } from '../../verify/countParity'
import { runLessonContentNonEmpty } from '../../verify/contentNonEmpty'

/**
 * Post-write verification (the Lesson Gate's "did the write land" layer,
 * slice 1 / ADR 0013). These are the lesson-stage analogue of the capability
 * stage's CS7–CS9 verify hooks; same isolation-test style as
 * capability-stage/__tests__/verify/seedHooks.test.ts.
 */

interface MockTable {
  rows: Array<Record<string, unknown>>
  /** Optional count override; if set, head:true count returns this. */
  countOverride?: number
}

function buildMockSupabase(tables: Record<string, MockTable>) {
  return {
    schema: () => ({
      from: (table: string) => ({
        select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
          const t = tables[table] ?? { rows: [] }
          let current = [...t.rows]
          const buildResult = () => ({
            data: current,
            error: null,
            count: opts?.count ? (t.countOverride ?? current.length) : undefined,
          })
          const chain: any = {
            eq: (col: string, val: unknown) => {
              current = current.filter((r) => r[col] === val)
              return chain
            },
            in: (col: string, vals: unknown[]) => {
              current = current.filter((r) => vals.includes(r[col]))
              return chain
            },
            order: () => chain,
            then: (resolve: (v: ReturnType<typeof buildResult>) => unknown) => resolve(buildResult()),
          }
          return chain
        },
      }),
    }),
  } as unknown as Parameters<typeof runLessonCountParity>[0]
}

const LESSON_ID = 'lesson-10-uuid'

function declared(overrides: Partial<Record<string, number>> = {}) {
  return {
    sections: 0,
    dialogueLines: 0,
    itemRows: 0,
    grammarCategories: 0,
    grammarTopics: 0,
    affixedPairs: 0,
    ...overrides,
  }
}

describe('LV1 runLessonCountParity — per-lesson row-count parity (db_count >= declaredCount)', () => {
  it('passes when DB count meets declared count for every table', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: { rows: [], countOverride: 5 },
      lesson_dialogue_lines: { rows: [], countOverride: 4 },
      lesson_section_item_rows: { rows: [], countOverride: 12 },
      lesson_section_grammar_categories: { rows: [], countOverride: 2 },
      lesson_section_grammar_topics: { rows: [], countOverride: 3 },
      lesson_section_affixed_pairs: { rows: [], countOverride: 6 },
    })
    const findings = await runLessonCountParity(supabase, {
      lessonId: LESSON_ID,
      declared: declared({
        sections: 5,
        dialogueLines: 4,
        itemRows: 12,
        grammarCategories: 2,
        grammarTopics: 3,
        affixedPairs: 6,
      }),
    })
    expect(findings).toEqual([])
  })

  it('flags a table whose DB count is below declared (silent write failure)', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: { rows: [], countOverride: 5 },
      // 12 item rows declared but only 9 landed.
      lesson_section_item_rows: { rows: [], countOverride: 9 },
    })
    const findings = await runLessonCountParity(supabase, {
      lessonId: LESSON_ID,
      declared: declared({ sections: 5, itemRows: 12 }),
    })
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('LV1')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].context?.table).toBe('lesson_section_item_rows')
  })

  it('accumulates one finding per under-declared table (no early return)', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: { rows: [], countOverride: 5 },
      // Two tables short at once.
      lesson_section_item_rows: { rows: [], countOverride: 9 },
      lesson_dialogue_lines: { rows: [], countOverride: 1 },
    })
    const findings = await runLessonCountParity(supabase, {
      lessonId: LESSON_ID,
      declared: declared({ sections: 5, itemRows: 12, dialogueLines: 4 }),
    })
    expect(findings.length).toBe(2)
    expect(findings.every((f) => f.gate === 'LV1' && f.severity === 'error')).toBe(true)
    expect(findings.map((f) => f.context?.table).sort()).toEqual([
      'lesson_dialogue_lines',
      'lesson_section_item_rows',
    ])
  })

  it('treats every lesson-stage table as a populated-or-zero contract (declared 0 → no finding)', async () => {
    // A lesson with no grammar/dialogue/morphology: those tables are empty and
    // declared 0, so they must not be flagged as "not populated".
    const supabase = buildMockSupabase({
      lesson_sections: { rows: [], countOverride: 4 },
      lesson_section_item_rows: { rows: [], countOverride: 8 },
    })
    const findings = await runLessonCountParity(supabase, {
      lessonId: LESSON_ID,
      declared: declared({ sections: 4, itemRows: 8 }),
    })
    expect(findings).toEqual([])
  })

  it('passes on re-run when DB count exceeds declared (>= semantics, no flake)', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: { rows: [], countOverride: 6 }, // a stale extra section from a prior publish
      lesson_section_item_rows: { rows: [], countOverride: 12 },
    })
    const findings = await runLessonCountParity(supabase, {
      lessonId: LESSON_ID,
      declared: declared({ sections: 5, itemRows: 12 }),
    })
    expect(findings).toEqual([])
  })
})

describe('LV2 runLessonContentNonEmpty — retained content blob non-empty per section', () => {
  it('passes when every section content blob is a non-empty object', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: {
        rows: [
          { id: 's0', lesson_id: LESSON_ID, order_index: 0, content: { type: 'vocabulary', items: [{}] } },
          { id: 's1', lesson_id: LESSON_ID, order_index: 1, content: { type: 'dialogue', lines: [{}] } },
        ],
      },
    })
    const findings = await runLessonContentNonEmpty(supabase, { lessonId: LESSON_ID })
    expect(findings).toEqual([])
  })

  it('flags a section whose content blob is an empty object', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: {
        rows: [
          { id: 's0', lesson_id: LESSON_ID, order_index: 0, content: { type: 'vocabulary', items: [{}] } },
          { id: 's1', lesson_id: LESSON_ID, order_index: 1, content: {} },
        ],
      },
    })
    const findings = await runLessonContentNonEmpty(supabase, { lessonId: LESSON_ID })
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('LV2')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].context?.rowId).toBe('s1')
    expect(findings[0].context?.sectionOrderIndex).toBe(1)
  })

  it('flags a section whose content blob is null', async () => {
    const supabase = buildMockSupabase({
      lesson_sections: {
        rows: [{ id: 's0', lesson_id: LESSON_ID, order_index: 0, content: null }],
      },
    })
    const findings = await runLessonContentNonEmpty(supabase, { lessonId: LESSON_ID })
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('LV2')
    expect(findings[0].context?.rowId).toBe('s0')
  })
})
