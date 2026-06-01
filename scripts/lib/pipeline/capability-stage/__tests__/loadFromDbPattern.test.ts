/**
 * loadFromDbPattern.test.ts — Unit tests for the Slice 2 pattern (grammar)
 * import seam added to loadFromDb.ts.
 *
 * Mirrors loadFromDb.test.ts: a fixture-backed mock CapabilitySupabaseClient
 * routes `.from(table)` to a chain supporting select/eq/in/range/then. Asserts:
 *   - fetchGrammarSectionsFromDb returns typed categories (examples normalised)
 *     + topics, lesson-scoped
 *   - fetchPatternCapabilityState returns patterns-by-slug, caps-by-canonical_key,
 *     and — the Slice-2-critical bit — the per-pattern exercise-type COVERAGE map
 *     (the OQ2-2 seeded-check input), excluding inactive rows, paginated
 *   - loadPatternFromDb composes them into PatternDbResult
 */

import { describe, it, expect } from 'vitest'
import {
  fetchGrammarSectionsFromDb,
  fetchPatternCapabilityState,
  loadPatternFromDb,
  PAGE_SIZE,
  type GrammarExerciseType,
} from '../loadFromDb'

// ---------------------------------------------------------------------------
// Mock Supabase client — same shape as loadFromDb.test.ts
// ---------------------------------------------------------------------------

interface MockTable {
  rows: Array<Record<string, unknown>>
}

function buildMockSupabase(tables: Record<string, MockTable>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const t = tables[table] ?? { rows: [] }
        let current = [...t.rows]
        let rangeFrom: number | null = null
        let rangeTo: number | null = null
        const chain: Record<string, unknown> = {
          select: () => {
            current = [...t.rows]
            rangeFrom = null
            rangeTo = null
            return chain
          },
          eq: (col: string, val: unknown) => {
            current = current.filter((r) => r[col] === val)
            return chain
          },
          in: (col: string, vals: unknown[]) => {
            current = current.filter((r) => vals.includes(r[col]))
            return chain
          },
          range: (from: number, to: number) => {
            rangeFrom = from
            rangeTo = to
            return chain
          },
          order: () => chain,
          limit: () => chain,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
            if (rangeFrom !== null && rangeTo !== null) {
              return resolve({ data: current.slice(rangeFrom, rangeTo + 1), error: null })
            }
            return resolve({ data: current, error: null })
          },
        }
        return chain
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LESSON_ID = 'lesson-uuid-6'
const SECTION_GRAMMAR_ID = 'section-grammar-1'

const GRAMMAR_CATEGORIES = [
  {
    id: 'cat-1',
    section_id: SECTION_GRAMMAR_ID,
    lesson_id: LESSON_ID,
    display_order: 1,
    title: 'belum / sudah',
    title_en: 'not yet / already',
    rules: ['belum = not yet', 'sudah = already'],
    rules_en: ['belum means not yet'],
    examples: [
      { indonesian: 'Saya belum makan.', dutch: 'Ik heb nog niet gegeten.', english: 'I have not eaten yet.' },
      { indonesian: 'Dia sudah pergi.', dutch: 'Hij is al weg.', english: null },
    ],
  },
  {
    id: 'cat-2',
    section_id: SECTION_GRAMMAR_ID,
    lesson_id: LESSON_ID,
    display_order: 2,
    title: 'bukan / tidak',
    title_en: null,
    rules: ['bukan negates nouns'],
    rules_en: [],
    examples: null, // nullable jsonb → normalises to []
  },
]

// One category belongs to a DIFFERENT lesson — must be excluded by lesson scope.
const OTHER_LESSON_CATEGORY = {
  id: 'cat-other',
  section_id: 'section-other',
  lesson_id: 'lesson-uuid-99',
  display_order: 1,
  title: 'other-lesson grammar',
  title_en: null,
  rules: [],
  rules_en: [],
  examples: [],
}

const GRAMMAR_TOPICS = [
  { id: 'topic-1', section_id: SECTION_GRAMMAR_ID, lesson_id: LESSON_ID, topic_label: 'Negation' },
  { id: 'topic-2', section_id: SECTION_GRAMMAR_ID, lesson_id: LESSON_ID, topic_label: 'Aspect markers' },
  { id: 'topic-other', section_id: 'section-other', lesson_id: 'lesson-uuid-99', topic_label: 'unrelated' },
]

const GRAMMAR_PATTERNS = [
  { id: 'gp-1', slug: 'belum-sudah' },
  { id: 'gp-2', slug: 'bukan-tidak' },
]

const PATTERN_CAPS = [
  { id: 'pcap-1', canonical_key: 'pattern:belum-sudah:recognition:none', source_kind: 'pattern' },
  { id: 'pcap-2', canonical_key: 'pattern:belum-sudah:contrast:none', source_kind: 'pattern' },
  // a non-pattern cap that must be excluded by source_kind filter
  { id: 'icap-x', canonical_key: 'item:buku:recognition:nl', source_kind: 'item' },
]

// Exercise rows define the per-pattern coverage:
//   gp-1 → contrast_pair (1 active) + cloze_mcq (1 active)  → {contrast_pair, cloze_mcq}
//   gp-2 → sentence_transformation (1 active)               → {sentence_transformation}
//   gp-2 has an INACTIVE constrained_translation row        → excluded from coverage
const CONTRAST_ROWS = [{ grammar_pattern_id: 'gp-1', is_active: true }]
const SENTENCE_TRANSFORM_ROWS = [{ grammar_pattern_id: 'gp-2', is_active: true }]
const CONSTRAINED_TRANSLATION_ROWS = [{ grammar_pattern_id: 'gp-2', is_active: false }]
const CLOZE_MCQ_ROWS = [{ grammar_pattern_id: 'gp-1', is_active: true }]

function buildFixtureMock() {
  return buildMockSupabase({
    lesson_section_grammar_categories: { rows: [...GRAMMAR_CATEGORIES, OTHER_LESSON_CATEGORY] },
    lesson_section_grammar_topics: { rows: GRAMMAR_TOPICS },
    grammar_patterns: { rows: GRAMMAR_PATTERNS },
    learning_capabilities: { rows: PATTERN_CAPS },
    contrast_pair_exercises: { rows: CONTRAST_ROWS },
    sentence_transformation_exercises: { rows: SENTENCE_TRANSFORM_ROWS },
    constrained_translation_exercises: { rows: CONSTRAINED_TRANSLATION_ROWS },
    cloze_mcq_exercises: { rows: CLOZE_MCQ_ROWS },
  })
}

// ---------------------------------------------------------------------------
// fetchGrammarSectionsFromDb
// ---------------------------------------------------------------------------

describe('fetchGrammarSectionsFromDb', () => {
  it('returns the lesson\'s grammar categories (excludes other lessons)', async () => {
    const { categories } = await fetchGrammarSectionsFromDb(buildFixtureMock() as never, LESSON_ID)
    expect(categories).toHaveLength(2)
    expect(categories.map((c) => c.title).sort()).toEqual(['belum / sudah', 'bukan / tidak'])
  })

  it('maps examples jsonb into typed GrammarExample[]', async () => {
    const { categories } = await fetchGrammarSectionsFromDb(buildFixtureMock() as never, LESSON_ID)
    const belum = categories.find((c) => c.title === 'belum / sudah')!
    expect(belum.examples).toHaveLength(2)
    expect(belum.examples[0]).toEqual({
      indonesian: 'Saya belum makan.',
      dutch: 'Ik heb nog niet gegeten.',
      english: 'I have not eaten yet.',
    })
    // null english preserved as null
    expect(belum.examples[1].english).toBeNull()
  })

  it('normalises null examples jsonb to []', async () => {
    const { categories } = await fetchGrammarSectionsFromDb(buildFixtureMock() as never, LESSON_ID)
    const bukan = categories.find((c) => c.title === 'bukan / tidak')!
    expect(bukan.examples).toEqual([])
  })

  it('drops malformed example elements (missing indonesian)', async () => {
    const mock = buildMockSupabase({
      lesson_section_grammar_categories: {
        rows: [{
          id: 'cat-bad', section_id: SECTION_GRAMMAR_ID, lesson_id: LESSON_ID, display_order: 1,
          title: 'mixed', title_en: null, rules: [], rules_en: [],
          examples: [
            { indonesian: 'ok', dutch: 'goed', english: 'good' },
            { dutch: 'no indonesian' },          // dropped — no indonesian
            null,                                  // dropped
            { indonesian: '', dutch: 'empty' },   // dropped — empty indonesian
          ],
        }],
      },
      lesson_section_grammar_topics: { rows: [] },
    })
    const { categories } = await fetchGrammarSectionsFromDb(mock as never, LESSON_ID)
    expect(categories[0].examples).toHaveLength(1)
    expect(categories[0].examples[0].indonesian).toBe('ok')
  })

  it('preserves rules/rules_en arrays and nullable title_en', async () => {
    const { categories } = await fetchGrammarSectionsFromDb(buildFixtureMock() as never, LESSON_ID)
    const belum = categories.find((c) => c.title === 'belum / sudah')!
    expect(belum.rules).toEqual(['belum = not yet', 'sudah = already'])
    expect(belum.title_en).toBe('not yet / already')
    const bukan = categories.find((c) => c.title === 'bukan / tidak')!
    expect(bukan.title_en).toBeNull()
  })

  it('returns the lesson\'s grammar topics (excludes other lessons)', async () => {
    const { topics } = await fetchGrammarSectionsFromDb(buildFixtureMock() as never, LESSON_ID)
    expect(topics).toHaveLength(2)
    expect(topics.map((t) => t.topic_label).sort()).toEqual(['Aspect markers', 'Negation'])
  })

  it('throws when the category query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                resolve({ data: null, error: { message: 'cat boom' } }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchGrammarSectionsFromDb(errorMock as never, LESSON_ID)).rejects.toThrow(
      'Failed to fetch lesson_section_grammar_categories',
    )
  })
})

// ---------------------------------------------------------------------------
// fetchPatternCapabilityState
// ---------------------------------------------------------------------------

describe('fetchPatternCapabilityState', () => {
  it('returns grammar_patterns keyed by slug', async () => {
    const state = await fetchPatternCapabilityState(buildFixtureMock() as never)
    expect(state.existingPatternsBySlug.has('belum-sudah')).toBe(true)
    expect(state.existingPatternsBySlug.get('belum-sudah')!.id).toBe('gp-1')
  })

  it('returns only pattern-kind caps keyed by canonical_key (excludes item caps)', async () => {
    const state = await fetchPatternCapabilityState(buildFixtureMock() as never)
    expect(state.existingPatternCapsByCanonicalKey.has('pattern:belum-sudah:recognition:none')).toBe(true)
    expect(state.existingPatternCapsByCanonicalKey.has('pattern:belum-sudah:contrast:none')).toBe(true)
    // the item cap must NOT appear (source_kind filter)
    expect(state.existingPatternCapsByCanonicalKey.has('item:buku:recognition:nl')).toBe(false)
  })

  it('builds the per-pattern exercise-type coverage map (the seeded-check input)', async () => {
    const state = await fetchPatternCapabilityState(buildFixtureMock() as never)
    const gp1 = state.exerciseCoverageByPatternId.get('gp-1')
    expect(gp1).toBeDefined()
    expect([...gp1!].sort()).toEqual(['cloze_mcq', 'contrast_pair'])
    const gp2 = state.exerciseCoverageByPatternId.get('gp-2')
    expect(gp2).toBeDefined()
    expect([...gp2!]).toEqual(['sentence_transformation'])
  })

  it('excludes inactive exercise rows from coverage', async () => {
    const state = await fetchPatternCapabilityState(buildFixtureMock() as never)
    // gp-2's only constrained_translation row is is_active=false → not covered
    const gp2 = state.exerciseCoverageByPatternId.get('gp-2')!
    expect(gp2.has('constrained_translation')).toBe(false)
  })

  it('omits patterns with no active exercise rows from the coverage map', async () => {
    const mock = buildMockSupabase({
      grammar_patterns: { rows: [{ id: 'gp-empty', slug: 'no-exercises' }] },
      learning_capabilities: { rows: [] },
      contrast_pair_exercises: { rows: [] },
      sentence_transformation_exercises: { rows: [] },
      constrained_translation_exercises: { rows: [] },
      cloze_mcq_exercises: { rows: [] },
    })
    const state = await fetchPatternCapabilityState(mock as never)
    expect(state.existingPatternsBySlug.has('no-exercises')).toBe(true)
    expect(state.exerciseCoverageByPatternId.has('gp-empty')).toBe(false)
  })

  it('paginates each coverage table across pages', async () => {
    // > PAGE_SIZE active contrast rows, all for one pattern, plus a second-page
    // row for a DIFFERENT pattern to prove the loop reads beyond page 1.
    const manyContrast = [
      ...Array.from({ length: PAGE_SIZE }, () => ({ grammar_pattern_id: 'gp-bulk', is_active: true })),
      { grammar_pattern_id: 'gp-tail', is_active: true },
    ]
    const mock = buildMockSupabase({
      grammar_patterns: { rows: [] },
      learning_capabilities: { rows: [] },
      contrast_pair_exercises: { rows: manyContrast },
      sentence_transformation_exercises: { rows: [] },
      constrained_translation_exercises: { rows: [] },
      cloze_mcq_exercises: { rows: [] },
    })
    const state = await fetchPatternCapabilityState(mock as never)
    expect(state.exerciseCoverageByPatternId.get('gp-bulk')!.has('contrast_pair')).toBe(true)
    // the row on the 2nd page would be lost without pagination:
    expect(state.exerciseCoverageByPatternId.get('gp-tail')!.has('contrast_pair')).toBe(true)
  })

  it('throws when a coverage query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              range: () => ({
                then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
                  resolve(
                    table === 'contrast_pair_exercises'
                      ? { data: null, error: { message: 'coverage boom' } }
                      : { data: [], error: null },
                  ),
              }),
            }),
            range: () => ({
              then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchPatternCapabilityState(errorMock as never)).rejects.toThrow(
      'Failed to fetch exercise coverage from contrast_pair_exercises',
    )
  })
})

// ---------------------------------------------------------------------------
// loadPatternFromDb (composed seam)
// ---------------------------------------------------------------------------

describe('loadPatternFromDb', () => {
  it('composes categories, topics, and patternState', async () => {
    const result = await loadPatternFromDb(buildFixtureMock() as never, { lessonId: LESSON_ID })
    expect(result.categories).toHaveLength(2)
    expect(result.topics).toHaveLength(2)
    expect(result.patternState.existingPatternsBySlug.size).toBe(2)
    expect(result.patternState.existingPatternCapsByCanonicalKey.size).toBe(2)
    expect(result.patternState.exerciseCoverageByPatternId.size).toBe(2)
  })

  it('coverage map types are well-formed GrammarExerciseType values', async () => {
    const result = await loadPatternFromDb(buildFixtureMock() as never, { lessonId: LESSON_ID })
    const valid: GrammarExerciseType[] = [
      'contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq',
    ]
    for (const set of result.patternState.exerciseCoverageByPatternId.values()) {
      for (const type of set) expect(valid).toContain(type)
    }
  })
})
