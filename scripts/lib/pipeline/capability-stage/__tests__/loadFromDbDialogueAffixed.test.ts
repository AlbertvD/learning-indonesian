/**
 * loadFromDbDialogueAffixed.test.ts — Unit tests for the Slice 3 dialogue +
 * affixed import seams added to loadFromDb.ts.
 *
 * Mirrors loadFromDbPattern.test.ts: a fixture-backed mock CapabilitySupabaseClient
 * routes `.from(table)` to a chain supporting select/eq/in/range/order/then.
 *
 * Dialogue seam asserts:
 *   - fetchDialogueLinesFromDb returns the lesson's dialogue lines (excludes
 *     other lessons), mapping nullable speaker/translation_nl/translation_en
 *   - fetchDialogueClozeState returns dialogue caps-by-canonical_key (excludes
 *     non-dialogue source_kind) + the seededDialogueLineIds set (the 1:1
 *     per-line seeded signal from dialogue_clozes.dialogue_line_id), paginated
 *   - loadDialogueFromDb composes them
 *
 * Affixed seam asserts the analogous shape against lesson_section_affixed_pairs,
 * affixed_form_pairs (seededAffixedCapIds), and word_form_pair_src caps.
 */

import { describe, it, expect } from 'vitest'
import {
  fetchDialogueLinesFromDb,
  fetchDialogueClozeState,
  loadDialogueFromDb,
  fetchAffixedPairsFromDb,
  fetchAffixedCapabilityState,
  loadAffixedFromDb,
  fetchClozePool,
  PAGE_SIZE,
} from '../loadFromDb'

// ---------------------------------------------------------------------------
// Mock Supabase client — same shape as loadFromDbPattern.test.ts
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

const LESSON_ID = 'lesson-uuid-5'
const SECTION_DIALOGUE_ID = 'section-dialogue-1'
const SECTION_MORPH_ID = 'section-morph-1'

const DIALOGUE_LINES = [
  {
    id: 'dl-1',
    section_id: SECTION_DIALOGUE_ID,
    lesson_id: LESSON_ID,
    line_index: 0,
    source_line_ref: 'lesson-5/dialogue/line-0',
    text: 'Selamat pagi, apa kabar?',
    speaker: 'Andi',
    translation: 'Goedemorgen, hoe gaat het?',
    translation_nl: 'Goedemorgen, hoe gaat het?',
    translation_en: 'Good morning, how are you?',
  },
  {
    id: 'dl-2',
    section_id: SECTION_DIALOGUE_ID,
    lesson_id: LESSON_ID,
    line_index: 1,
    source_line_ref: 'lesson-5/dialogue/line-1',
    text: 'Sudah.',
    speaker: null, // nullable speaker preserved
    translation: 'Al.',
    translation_nl: null, // nullable nl/en preserved
    translation_en: null,
  },
]

// A dialogue line in a DIFFERENT lesson — must be excluded by lesson scope.
const OTHER_LESSON_DIALOGUE_LINE = {
  id: 'dl-other',
  section_id: 'section-other',
  lesson_id: 'lesson-uuid-99',
  line_index: 0,
  source_line_ref: 'lesson-99/dialogue/line-0',
  text: 'unrelated',
  speaker: 'X',
  translation: 'x',
  translation_nl: 'x',
  translation_en: 'x',
}

// dialogue_clozes: dl-1 is already seeded (has a row); dl-2 is NOT.
// A row for a different-lesson line proves seeded-set is by dialogue_line_id, not lesson.
const DIALOGUE_CLOZES = [
  { capability_id: 'dcap-1', dialogue_line_id: 'dl-1' },
  { capability_id: 'dcap-other', dialogue_line_id: 'dl-other' },
]

const DIALOGUE_CAPS = [
  { id: 'dcap-1', canonical_key: 'dialogue_line:lesson-5/dialogue/line-0:cloze:none', source_kind: 'dialogue_line_src' },
  { id: 'dcap-2', canonical_key: 'dialogue_line:lesson-5/dialogue/line-1:cloze:none', source_kind: 'dialogue_line_src' },
  // a non-dialogue cap that must be excluded by source_kind filter
  { id: 'icap-x', canonical_key: 'item:buku:recognition:nl', source_kind: 'vocabulary_src' },
]

const AFFIXED_PAIRS = [
  {
    id: 'afp-row-1',
    lesson_id: LESSON_ID,
    section_id: SECTION_MORPH_ID,
    source_ref: 'lesson-5/affixed/ber-jalan',
    pattern_source_ref: 'ber-active',
    affix: 'ber-',
    root_text: 'jalan',
    derived_text: 'berjalan',
    allomorph_rule: 'ber- attaches without sound change: jalan -> berjalan',
  },
  {
    id: 'afp-row-2',
    lesson_id: LESSON_ID,
    section_id: null, // nullable section_id (morphology has no section) preserved
    source_ref: 'lesson-5/affixed/me-masak',
    pattern_source_ref: null,
    affix: 'me-',
    root_text: 'masak',
    derived_text: 'memasak',
    allomorph_rule: 'me- before m stays me-: masak -> memasak',
  },
]

const OTHER_LESSON_AFFIXED_PAIR = {
  id: 'afp-other',
  lesson_id: 'lesson-uuid-99',
  section_id: null,
  source_ref: 'lesson-99/affixed/x',
  pattern_source_ref: null,
  affix: 'x-',
  root_text: 'x',
  derived_text: 'xx',
  allomorph_rule: 'x',
}

// affixed_form_pairs: acap-1 is seeded; acap-2 is NOT.
const AFFIXED_FORM_PAIRS = [
  { capability_id: 'acap-1', source_ref: 'lesson-5/affixed/ber-jalan' },
]

const AFFIXED_CAPS = [
  { id: 'acap-1', canonical_key: 'word_form_pair_src:lesson-5/affixed/ber-jalan:recognise_word_form_link_cap:none', source_kind: 'word_form_pair_src' },
  { id: 'acap-2', canonical_key: 'word_form_pair_src:lesson-5/affixed/me-masak:recognise_word_form_link_cap:none', source_kind: 'word_form_pair_src' },
  { id: 'pcap-x', canonical_key: 'pattern:belum-sudah:recognition:none', source_kind: 'grammar_pattern_src' },
]

function buildFixtureMock() {
  return buildMockSupabase({
    lesson_dialogue_lines: { rows: [...DIALOGUE_LINES, OTHER_LESSON_DIALOGUE_LINE] },
    dialogue_clozes: { rows: DIALOGUE_CLOZES },
    lesson_section_affixed_pairs: { rows: [...AFFIXED_PAIRS, OTHER_LESSON_AFFIXED_PAIR] },
    affixed_form_pairs: { rows: AFFIXED_FORM_PAIRS },
    learning_capabilities: { rows: [...DIALOGUE_CAPS, ...AFFIXED_CAPS] },
  })
}

// ===========================================================================
// Dialogue seam
// ===========================================================================

describe('fetchDialogueLinesFromDb', () => {
  it('returns the lesson\'s dialogue lines (excludes other lessons)', async () => {
    const lines = await fetchDialogueLinesFromDb(buildFixtureMock() as never, LESSON_ID)
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.source_line_ref).sort()).toEqual([
      'lesson-5/dialogue/line-0',
      'lesson-5/dialogue/line-1',
    ])
  })

  it('maps all columns including nullable speaker/translation_nl/translation_en', async () => {
    const lines = await fetchDialogueLinesFromDb(buildFixtureMock() as never, LESSON_ID)
    const line0 = lines.find((l) => l.source_line_ref === 'lesson-5/dialogue/line-0')!
    expect(line0).toEqual({
      id: 'dl-1',
      section_id: SECTION_DIALOGUE_ID,
      lesson_id: LESSON_ID,
      line_index: 0,
      source_line_ref: 'lesson-5/dialogue/line-0',
      text: 'Selamat pagi, apa kabar?',
      speaker: 'Andi',
      translation: 'Goedemorgen, hoe gaat het?',
      translation_nl: 'Goedemorgen, hoe gaat het?',
      translation_en: 'Good morning, how are you?',
    })
  })

  it('preserves null speaker and null translation_nl/en', async () => {
    const lines = await fetchDialogueLinesFromDb(buildFixtureMock() as never, LESSON_ID)
    const line1 = lines.find((l) => l.source_line_ref === 'lesson-5/dialogue/line-1')!
    expect(line1.speaker).toBeNull()
    expect(line1.translation_nl).toBeNull()
    expect(line1.translation_en).toBeNull()
    // translation (NOT NULL leg) is always present
    expect(line1.translation).toBe('Al.')
  })

  it('throws when the query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                resolve({ data: null, error: { message: 'dialogue boom' } }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchDialogueLinesFromDb(errorMock as never, LESSON_ID)).rejects.toThrow(
      'Failed to fetch lesson_dialogue_lines',
    )
  })
})

describe('fetchDialogueClozeState', () => {
  it('returns only dialogue_line caps keyed by canonical_key (excludes other source_kinds)', async () => {
    const state = await fetchDialogueClozeState(buildFixtureMock() as never)
    expect(state.existingDialogueCapsByCanonicalKey.has('dialogue_line:lesson-5/dialogue/line-0:cloze:none')).toBe(true)
    expect(state.existingDialogueCapsByCanonicalKey.has('dialogue_line:lesson-5/dialogue/line-1:cloze:none')).toBe(true)
    expect(state.existingDialogueCapsByCanonicalKey.has('item:buku:recognition:nl')).toBe(false)
  })

  it('builds seededDialogueLineIds from dialogue_clozes.dialogue_line_id (the 1:1 seeded signal)', async () => {
    const state = await fetchDialogueClozeState(buildFixtureMock() as never)
    // dl-1 has a dialogue_clozes row → seeded; dl-2 has none → not seeded
    expect(state.seededDialogueLineIds.has('dl-1')).toBe(true)
    expect(state.seededDialogueLineIds.has('dl-2')).toBe(false)
  })

  it('paginates the dialogue_clozes read across pages', async () => {
    const manyClozes = [
      ...Array.from({ length: PAGE_SIZE }, (_, i) => ({ capability_id: `c-${i}`, dialogue_line_id: 'dl-bulk' })),
      { capability_id: 'c-tail', dialogue_line_id: 'dl-tail' },
    ]
    const mock = buildMockSupabase({
      learning_capabilities: { rows: [] },
      dialogue_clozes: { rows: manyClozes },
    })
    const state = await fetchDialogueClozeState(mock as never)
    expect(state.seededDialogueLineIds.has('dl-bulk')).toBe(true)
    // the row on the 2nd page would be lost without pagination:
    expect(state.seededDialogueLineIds.has('dl-tail')).toBe(true)
  })

  it('throws when the dialogue_clozes query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              range: () => ({
                then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                  resolve({ data: [], error: null }),
              }),
            }),
            range: () => ({
              then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
                resolve(
                  table === 'dialogue_clozes'
                    ? { data: null, error: { message: 'cloze boom' } }
                    : { data: [], error: null },
                ),
            }),
          }),
        }),
      }),
    }
    await expect(fetchDialogueClozeState(errorMock as never)).rejects.toThrow(
      'Failed to fetch dialogue_clozes',
    )
  })
})

describe('loadDialogueFromDb', () => {
  it('composes dialogueLines + dialogueState', async () => {
    const result = await loadDialogueFromDb(buildFixtureMock() as never, { lessonId: LESSON_ID })
    expect(result.dialogueLines).toHaveLength(2)
    expect(result.dialogueState.existingDialogueCapsByCanonicalKey.size).toBe(2)
    expect(result.dialogueState.seededDialogueLineIds.has('dl-1')).toBe(true)
  })
})

// ===========================================================================
// Affixed seam
// ===========================================================================

describe('fetchAffixedPairsFromDb', () => {
  it('returns the lesson\'s affixed pairs (excludes other lessons)', async () => {
    const pairs = await fetchAffixedPairsFromDb(buildFixtureMock() as never, LESSON_ID)
    expect(pairs).toHaveLength(2)
    expect(pairs.map((p) => p.source_ref).sort()).toEqual([
      'lesson-5/affixed/ber-jalan',
      'lesson-5/affixed/me-masak',
    ])
  })

  it('maps columns including nullable section_id; allomorph_rule passthrough', async () => {
    const pairs = await fetchAffixedPairsFromDb(buildFixtureMock() as never, LESSON_ID)
    const ber = pairs.find((p) => p.source_ref === 'lesson-5/affixed/ber-jalan')!
    expect(ber).toEqual({
      id: 'afp-row-1',
      lesson_id: LESSON_ID,
      section_id: SECTION_MORPH_ID,
      source_ref: 'lesson-5/affixed/ber-jalan',
      affix: 'ber-',
      root_text: 'jalan',
      derived_text: 'berjalan',
      allomorph_rule: 'ber- attaches without sound change: jalan -> berjalan',
    })
    const me = pairs.find((p) => p.source_ref === 'lesson-5/affixed/me-masak')!
    expect(me.section_id).toBeNull()
  })

  it('throws when the query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                resolve({ data: null, error: { message: 'affixed boom' } }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchAffixedPairsFromDb(errorMock as never, LESSON_ID)).rejects.toThrow(
      'Failed to fetch lesson_section_affixed_pairs',
    )
  })
})

describe('fetchAffixedCapabilityState', () => {
  it('returns only word_form_pair_src caps keyed by canonical_key (excludes other source_kinds)', async () => {
    const state = await fetchAffixedCapabilityState(buildFixtureMock() as never)
    expect(state.existingAffixedCapsByCanonicalKey.has('word_form_pair_src:lesson-5/affixed/ber-jalan:recognise_word_form_link_cap:none')).toBe(true)
    expect(state.existingAffixedCapsByCanonicalKey.has('word_form_pair_src:lesson-5/affixed/me-masak:recognise_word_form_link_cap:none')).toBe(true)
    expect(state.existingAffixedCapsByCanonicalKey.has('pattern:belum-sudah:recognition:none')).toBe(false)
  })

  it('builds seededAffixedCapIds from affixed_form_pairs.capability_id', async () => {
    const state = await fetchAffixedCapabilityState(buildFixtureMock() as never)
    expect(state.seededAffixedCapIds.has('acap-1')).toBe(true)
    expect(state.seededAffixedCapIds.has('acap-2')).toBe(false)
  })

  it('paginates the affixed_form_pairs read across pages', async () => {
    const manyPairs = [
      ...Array.from({ length: PAGE_SIZE }, (_, i) => ({ capability_id: `bulk-${i}`, source_ref: `r-${i}` })),
      { capability_id: 'tail-cap', source_ref: 'r-tail' },
    ]
    const mock = buildMockSupabase({
      learning_capabilities: { rows: [] },
      affixed_form_pairs: { rows: manyPairs },
    })
    const state = await fetchAffixedCapabilityState(mock as never)
    expect(state.seededAffixedCapIds.has('bulk-0')).toBe(true)
    expect(state.seededAffixedCapIds.has('tail-cap')).toBe(true)
  })

  it('throws when the affixed_form_pairs query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              range: () => ({
                then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                  resolve({ data: [], error: null }),
              }),
            }),
            range: () => ({
              then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
                resolve(
                  table === 'affixed_form_pairs'
                    ? { data: null, error: { message: 'afp boom' } }
                    : { data: [], error: null },
                ),
            }),
          }),
        }),
      }),
    }
    await expect(fetchAffixedCapabilityState(errorMock as never)).rejects.toThrow(
      'Failed to fetch affixed_form_pairs',
    )
  })
})

describe('loadAffixedFromDb', () => {
  it('composes affixedPairs + affixedState', async () => {
    const result = await loadAffixedFromDb(buildFixtureMock() as never, { lessonId: LESSON_ID })
    expect(result.affixedPairs).toHaveLength(2)
    expect(result.affixedState.existingAffixedCapsByCanonicalKey.size).toBe(2)
    expect(result.affixedState.seededAffixedCapIds.has('acap-1')).toBe(true)
  })
})

// ===========================================================================
// fetchClozePool (dialogue cloze generator input — pool WITH pos)
// ===========================================================================

describe('fetchClozePool', () => {
  it('returns active word/phrase items as ClozePoolItem (normalized_text, base_text, pos)', async () => {
    const mock = buildMockSupabase({
      learning_items: {
        rows: [
          { normalized_text: 'pohon', base_text: 'pohon', pos: 'noun', item_type: 'word', is_active: true },
          { normalized_text: 'kaki', base_text: 'kaki', pos: 'noun', item_type: 'phrase', is_active: true },
        ],
      },
    })
    const pool = await fetchClozePool(mock as never)
    expect(pool).toHaveLength(2)
    expect(pool[0]).toEqual({ normalized_text: 'pohon', base_text: 'pohon', pos: 'noun' })
  })

  it('coerces a missing pos to null', async () => {
    const mock = buildMockSupabase({
      learning_items: {
        rows: [{ normalized_text: 'x', base_text: 'x', pos: null, item_type: 'word', is_active: true }],
      },
    })
    const pool = await fetchClozePool(mock as never)
    expect(pool[0].pos).toBeNull()
  })

  it('paginates beyond one page', async () => {
    const many = [
      ...Array.from({ length: PAGE_SIZE }, (_, i) => ({
        normalized_text: `w${i}`, base_text: `w${i}`, pos: 'noun', item_type: 'word', is_active: true,
      })),
      { normalized_text: 'tail', base_text: 'tail', pos: 'verb', item_type: 'word', is_active: true },
    ]
    const mock = buildMockSupabase({ learning_items: { rows: many } })
    const pool = await fetchClozePool(mock as never)
    expect(pool.some((p) => p.normalized_text === 'tail')).toBe(true)
  })

  it('throws when the query errors', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                range: () => ({
                  then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                    resolve({ data: null, error: { message: 'pool boom' } }),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchClozePool(errorMock as never)).rejects.toThrow('Failed to fetch cloze pool')
  })
})
