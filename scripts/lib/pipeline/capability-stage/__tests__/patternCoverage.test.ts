/**
 * patternCoverage.test.ts — CS18 post-write pattern coverage certification
 * (Slice 2 Task 7). The OQ2-2 (2) half: certifies what actually landed in the 4
 * typed exercise tables for each written pattern.
 */

import { describe, it, expect } from 'vitest'
import { validatePatternCoverage } from '../validators/patternCoverage'
import type { GrammarExerciseType } from '../loadFromDb'

const ALL: GrammarExerciseType[] = ['choose_correct_form_ex', 'transform_sentence_ex', 'translate_sentence_ex', 'choose_missing_word_ex']

/** Fake supabase whose 4 typed tables return the seeded coverage per pattern id. */
function makeCoverageClient(coverageByPatternId: Record<string, GrammarExerciseType[]>) {
  const tableForType: Record<GrammarExerciseType, string> = {
    choose_correct_form_ex: 'contrast_pair_exercises',
    transform_sentence_ex: 'sentence_transformation_exercises',
    translate_sentence_ex: 'constrained_translation_exercises',
    choose_missing_word_ex: 'cloze_mcq_exercises',
  }
  const typeForTable: Record<string, GrammarExerciseType> = Object.fromEntries(
    Object.entries(tableForType).map(([t, tbl]) => [tbl, t as GrammarExerciseType]),
  ) as Record<string, GrammarExerciseType>

  return {
    schema: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async (_col: string, ids: string[]) => {
              const type = typeForTable[table]
              const rows: Array<{ grammar_pattern_id: string }> = []
              for (const id of ids) {
                if ((coverageByPatternId[id] ?? []).includes(type)) {
                  rows.push({ grammar_pattern_id: id })
                }
              }
              return { data: rows, error: null }
            },
          }),
        }),
      }),
    }),
  } as never
}

describe('validatePatternCoverage (CS18)', () => {
  it('no finding when every pattern has full per-type coverage', async () => {
    const client = makeCoverageClient({ 'pat-A': ALL, 'pat-B': ALL })
    const findings = await validatePatternCoverage(client, {
      patternIdsBySlug: new Map([['l6-a', 'pat-A'], ['l6-b', 'pat-B']]),
      skippedSlugs: [],
    })
    expect(findings).toHaveLength(0)
  })

  it('ERROR pattern_typed_row_missing when a pattern has partial coverage', async () => {
    const client = makeCoverageClient({ 'pat-A': ['choose_correct_form_ex', 'choose_missing_word_ex'] }) // missing 2
    const findings = await validatePatternCoverage(client, {
      patternIdsBySlug: new Map([['l6-a', 'pat-A']]),
      skippedSlugs: [],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS18')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('pattern_typed_row_missing')
    expect(findings[0].message).toContain('transform_sentence_ex')
    expect(findings[0].message).toContain('translate_sentence_ex')
    expect(findings[0].context?.itemSlug).toBe('l6-a')
  })

  it('WARNING pattern_declined when a 0-coverage pattern was in skippedSlugs', async () => {
    const client = makeCoverageClient({}) // pat-A has no rows
    const findings = await validatePatternCoverage(client, {
      patternIdsBySlug: new Map([['l6-duur', 'pat-A']]),
      skippedSlugs: ['l6-duur'],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('declined')
  })

  it('ERROR pattern_no_exercises when a 0-coverage pattern was NOT declined', async () => {
    const client = makeCoverageClient({}) // pat-A has no rows
    const findings = await validatePatternCoverage(client, {
      patternIdsBySlug: new Map([['l6-a', 'pat-A']]),
      skippedSlugs: [], // not declined → unexpected gap
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('NO typed exercise rows')
  })

  it('empty pattern set → no findings', async () => {
    const client = makeCoverageClient({})
    const findings = await validatePatternCoverage(client, { patternIdsBySlug: new Map(), skippedSlugs: [] })
    expect(findings).toHaveLength(0)
  })
})
