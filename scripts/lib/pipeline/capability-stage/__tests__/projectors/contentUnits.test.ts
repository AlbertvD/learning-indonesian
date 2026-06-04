/**
 * contentUnits.test.ts — DB-driven content_units builder unit tests.
 *
 * Verifies byte-identical identity fields (content_unit_key, unit_slug,
 * source_ref, source_section_ref, unit_kind, display_order) vs the staging
 * builder (buildContentUnitsFromStaging) for equivalent fixture inputs.
 *
 * Intentional divergences from staging builder output:
 *   - payload_json is always {} (Decision E: column will be dropped)
 *   - sentence / dialogue_chunk items produce NO unit (expected 5b delta)
 */

import { describe, it, expect } from 'vitest'
import { buildContentUnitsFromDb } from '../../projectors/contentUnits'
import type { LoadedLessonSection } from '../../loader'
import type { TypedItemRow } from '../../loadFromDb'
import type { TypedGrammarCategory } from '../../loadFromDb'
import type { TypedAffixedPair } from '../../loadFromDb'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const LESSON_NUMBER = 1

/** Minimal LoadedLessonSection fixtures */
const SECTIONS: LoadedLessonSection[] = [
  {
    id: 'section-uuid-0',
    title: 'Vocabulary',
    content: { type: 'vocabulary' },
    order_index: 0,
  },
  {
    id: 'section-uuid-1',
    title: '',
    content: { type: 'grammar' },
    order_index: 1,
  },
]

/** Word item in a vocabulary section */
const WORD_ROW: TypedItemRow = {
  id: 'item-uuid-1',
  section_id: 'section-uuid-0',
  lesson_id: 'lesson-uuid-1',
  display_order: 0,
  source_item_ref: 'makan',
  item_type: 'word',
  indonesian_text: 'makan',
  l1_translation: 'eten',
  l2_translation: 'to eat',
  section_kind: 'vocabulary',
}

/** Phrase item in a dialogue section */
const PHRASE_ROW: TypedItemRow = {
  id: 'item-uuid-2',
  section_id: 'section-uuid-dialogue',
  lesson_id: 'lesson-uuid-1',
  display_order: 1,
  source_item_ref: 'apa kabar',
  item_type: 'phrase',
  indonesian_text: 'apa kabar',
  l1_translation: 'hoe gaat het',
  l2_translation: null,
  section_kind: 'dialogue',
}

/** Sentence item — must NOT produce a content unit */
const SENTENCE_ROW: TypedItemRow = {
  id: 'item-uuid-3',
  section_id: 'section-uuid-0',
  lesson_id: 'lesson-uuid-1',
  display_order: 2,
  source_item_ref: 'saya mau makan nasi',
  item_type: 'sentence' as unknown as 'word' | 'phrase', // typed as word|phrase in TypedItemRow but we cast to test the filter
  indonesian_text: 'saya mau makan nasi',
  l1_translation: 'ik wil rijst eten',
  l2_translation: null,
  section_kind: 'vocabulary',
}

/** Grammar category — title chosen so stableSlug(title) == 'word-order' for parity */
const GRAMMAR_CATEGORY: TypedGrammarCategory = {
  id: 'cat-uuid-1',
  section_id: 'section-uuid-1',
  lesson_id: 'lesson-uuid-1',
  display_order: 0,
  title: 'word-order',
  title_en: 'Word order',
  rules: ['Adjectives follow nouns.'],
  rules_en: ['Adjectives follow nouns.'],
  examples: [],
}

/** Affixed pair — source_ref matches staging affixedFormPairSourceRef output */
const AFFIXED_PAIR: TypedAffixedPair = {
  id: 'pair-uuid-1',
  lesson_id: 'lesson-uuid-1',
  section_id: 'section-uuid-morphology',
  source_ref: 'lesson-1/morphology/meN-baca-membaca',
  affix: 'meN-',
  root_text: 'baca',
  derived_text: 'membaca',
  allomorph_rule: 'meN- becomes mem- before b.',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildContentUnitsFromDb', () => {
  describe('lesson sections', () => {
    it('emits one unit per section with the correct identity fields', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [],
        affixedPairs: [],
      })

      // Section 0 — title "Vocabulary" → slug section-0-vocabulary
      const sec0 = units.find((u) => u.unit_slug === 'section-0-vocabulary')
      expect(sec0).toBeDefined()
      expect(sec0?.unit_kind).toBe('lesson_section')
      expect(sec0?.source_ref).toBe('lesson-1')
      expect(sec0?.source_section_ref).toBe('lesson-1/section-0')
      expect(sec0?.content_unit_key).toBe('lesson-1::lesson-1/section-0::section-0-vocabulary')
      expect(sec0?.display_order).toBe(0)

      // Section 1 — empty title, falls back to content.type 'grammar' → slug section-1-grammar
      const sec1 = units.find((u) => u.unit_slug === 'section-1-grammar')
      expect(sec1).toBeDefined()
      expect(sec1?.source_section_ref).toBe('lesson-1/section-1')
      expect(sec1?.display_order).toBe(1)
    })

    it('emits payload_json as empty object (Decision E)', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [],
        affixedPairs: [],
      })
      for (const u of units) {
        expect(u.payload_json).toEqual({})
      }
    })
  })

  describe('word/phrase items', () => {
    it('emits a unit for a word item with correct identity', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW],
        grammarCategories: [],
        affixedPairs: [],
      })

      const item = units.find((u) => u.unit_kind === 'learning_item')
      expect(item).toBeDefined()
      expect(item?.unit_slug).toBe('item-makan')
      expect(item?.source_ref).toBe('learning_items/makan')
      // vocabulary section_kind → 'section-vocabulary'
      expect(item?.source_section_ref).toBe('lesson-1/section-vocabulary')
      expect(item?.content_unit_key).toBe(
        'learning_items/makan::lesson-1/section-vocabulary::item-makan',
      )
      expect(item?.display_order).toBe(1000)
    })

    it('uses section-dialogue for dialogue section_kind', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [PHRASE_ROW],
        grammarCategories: [],
        affixedPairs: [],
      })

      const item = units.find((u) => u.unit_kind === 'learning_item')
      expect(item).toBeDefined()
      expect(item?.source_section_ref).toBe('lesson-1/section-dialogue')
      expect(item?.content_unit_key).toBe(
        'learning_items/apa kabar::lesson-1/section-dialogue::item-apa-kabar',
      )
    })

    it('does NOT emit a unit for sentence items', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [SENTENCE_ROW],
        grammarCategories: [],
        affixedPairs: [],
      })

      expect(units.filter((u) => u.unit_kind === 'learning_item')).toHaveLength(0)
    })

    it('display_order increments per item position', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW, PHRASE_ROW],
        grammarCategories: [],
        affixedPairs: [],
      })

      const items = units.filter((u) => u.unit_kind === 'learning_item')
      expect(items).toHaveLength(2)
      // Items are ordered by position in itemRows; display_order starts at 1000
      const orders = items.map((u) => u.display_order).sort((a, b) => a - b)
      expect(orders[0]).toBe(1000)
      expect(orders[1]).toBe(1001)
    })
  })

  describe('grammar patterns', () => {
    it('emits a unit for a grammar category with correct identity', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [GRAMMAR_CATEGORY],
        affixedPairs: [],
      })

      const pattern = units.find((u) => u.unit_kind === 'grammar_pattern')
      expect(pattern).toBeDefined()
      // stableSlug('word-order') = 'word-order'
      expect(pattern?.unit_slug).toBe('pattern-word-order')
      expect(pattern?.source_ref).toBe('lesson-1/pattern-word-order')
      expect(pattern?.source_section_ref).toBe('lesson-1/section-grammar')
      expect(pattern?.content_unit_key).toBe(
        'lesson-1/pattern-word-order::lesson-1/section-grammar::pattern-word-order',
      )
      expect(pattern?.display_order).toBe(2000)
    })

    it('assigns display_order starting at 2000 + category index', () => {
      const cat2: TypedGrammarCategory = {
        ...GRAMMAR_CATEGORY,
        id: 'cat-uuid-2',
        display_order: 1,
        title: 'zero-copula',
      }
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [GRAMMAR_CATEGORY, cat2],
        affixedPairs: [],
      })

      const patterns = units
        .filter((u) => u.unit_kind === 'grammar_pattern')
        .sort((a, b) => a.display_order - b.display_order)
      expect(patterns[0]?.display_order).toBe(2000)
      expect(patterns[1]?.display_order).toBe(2001)
    })
  })

  describe('affixed pairs', () => {
    it('emits a unit for an affixed pair with correct identity', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [],
        affixedPairs: [AFFIXED_PAIR],
      })

      const pair = units.find((u) => u.unit_kind === 'affixed_form_pair')
      expect(pair).toBeDefined()
      // source_ref = 'lesson-1/morphology/meN-baca-membaca'
      // slug from last segment after '/morphology/': stableSlug('meN-baca-membaca') = 'men-baca-membaca'
      expect(pair?.unit_slug).toBe('morphology-men-baca-membaca')
      expect(pair?.source_ref).toBe('lesson-1/morphology/meN-baca-membaca')
      expect(pair?.source_section_ref).toBe('lesson-1/section-morphology')
      expect(pair?.content_unit_key).toBe(
        'lesson-1/morphology/meN-baca-membaca::lesson-1/section-morphology::morphology-men-baca-membaca',
      )
      expect(pair?.display_order).toBe(3000)
    })

    it('derives slug from source_ref /morphology/ segment, matching staging stableSlug(pair.id)', () => {
      // Staging: pair.id = 'men-baca-membaca' → stableSlug = 'men-baca-membaca'
      // DB: source_ref last segment 'meN-baca-membaca' → stableSlug = 'men-baca-membaca'
      // Same result.
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [],
        affixedPairs: [AFFIXED_PAIR],
      })
      const pair = units.find((u) => u.unit_kind === 'affixed_form_pair')
      expect(pair?.unit_slug).toBe('morphology-men-baca-membaca')
    })

    it('assigns display_order starting at 3000 + pair index', () => {
      const pair2: TypedAffixedPair = {
        ...AFFIXED_PAIR,
        id: 'pair-uuid-2',
        source_ref: 'lesson-1/morphology/meN-tulis-menulis',
        root_text: 'tulis',
        derived_text: 'menulis',
      }
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        grammarCategories: [],
        affixedPairs: [AFFIXED_PAIR, pair2],
      })

      const pairs = units
        .filter((u) => u.unit_kind === 'affixed_form_pair')
        .sort((a, b) => a.display_order - b.display_order)
      expect(pairs[0]?.display_order).toBe(3000)
      expect(pairs[1]?.display_order).toBe(3001)
    })
  })

  describe('output ordering', () => {
    it('sorts output by display_order ascending', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW],
        grammarCategories: [GRAMMAR_CATEGORY],
        affixedPairs: [AFFIXED_PAIR],
      })

      const orders = units.map((u) => u.display_order)
      const sorted = [...orders].sort((a, b) => a - b)
      expect(orders).toEqual(sorted)
    })
  })

  describe('all unit kinds together', () => {
    it('emits sections, word items, grammar, affixed — but NOT sentence items', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW, PHRASE_ROW, SENTENCE_ROW],
        grammarCategories: [GRAMMAR_CATEGORY],
        affixedPairs: [AFFIXED_PAIR],
      })

      const byKind = (kind: string) => units.filter((u) => u.unit_kind === kind)
      expect(byKind('lesson_section')).toHaveLength(2)
      expect(byKind('learning_item')).toHaveLength(2) // word + phrase, NOT sentence
      expect(byKind('grammar_pattern')).toHaveLength(1)
      expect(byKind('affixed_form_pair')).toHaveLength(1)

      // Confirm no unit has the sentence's indonesian_text
      expect(units.some((u) => u.unit_slug === 'item-saya-mau-makan-nasi')).toBe(false)
    })
  })
})
