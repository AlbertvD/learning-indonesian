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
 *   - grammar units use plan.sourceRef / plan.slug (pattern-path aligned,
 *     not naive stableSlug(category.title)) — Decision E amendment 2026-06-04
 */

import { describe, it, expect } from 'vitest'
import { buildContentUnitsFromDb } from '../../projectors/contentUnits'
import {
  projectPatternsFromCategories,
} from '../../projectors/grammar'
import type { LoadedLessonSection } from '../../loader'
import type { TypedItemRow, TypedGrammarCategory } from '../../loadFromDb'
import type { TypedAffixedPair } from '../../loadFromDb'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const LESSON_NUMBER = 3
const LESSON_ID = 'lesson-uuid-3'

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
  lesson_id: LESSON_ID,
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
  lesson_id: LESSON_ID,
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
  lesson_id: LESSON_ID,
  display_order: 2,
  source_item_ref: 'saya mau makan nasi',
  item_type: 'sentence' as unknown as 'word' | 'phrase', // cast to test the filter
  indonesian_text: 'saya mau makan nasi',
  l1_translation: 'ik wil rijst eten',
  l2_translation: null,
  section_kind: 'vocabulary',
}

/**
 * Grammar category with a verbose, non-pre-slugified title.
 *
 * Using title: 'Bukan — ontkenning van zelfstandig naamwoorden' (rather than
 * the rigged 'word-order') exercises the real slug derivation path:
 *   stableSlug('Bukan — ontkenning van zelfstandig naamwoorden')
 *   = 'bukan-ontkenning-van-zelfstandig-naamwoorden'
 * → slug = 'l3-bukan-ontkenning-van-zelfstandig-naamwoorden'
 * → sourceRef = 'lesson-3/pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden'
 *
 * The test asserts that the builder emits this verbatim from the PatternPlan,
 * NOT a naive stableSlug(title) re-derivation.
 */
const GRAMMAR_CATEGORY_VERBOSE: TypedGrammarCategory = {
  id: 'cat-uuid-1',
  section_id: 'section-uuid-1',
  lesson_id: LESSON_ID,
  display_order: 0,
  title: 'Bukan — ontkenning van zelfstandig naamwoorden',
  title_en: 'Bukan — negation of nouns',
  rules: ['Use bukan before nouns.'],
  rules_en: ['Use bukan before nouns.'],
  examples: [],
}

/** Affixed pair — source_ref matches staging affixedFormPairSourceRef output */
const AFFIXED_PAIR: TypedAffixedPair = {
  id: 'pair-uuid-1',
  lesson_id: LESSON_ID,
  section_id: 'section-uuid-morphology',
  source_ref: 'lesson-3/morphology/meN-baca-membaca',
  affix: 'meN-',
  root_text: 'baca',
  derived_text: 'membaca',
  allomorph_rule: 'meN- becomes mem- before b.',
}

// ---------------------------------------------------------------------------
// Helper: build PatternPlan[] from categories (the production code path)
// ---------------------------------------------------------------------------

function makePlans(categories: TypedGrammarCategory[]) {
  return projectPatternsFromCategories({
    categories,
    lessonNumber: LESSON_NUMBER,
    lessonId: LESSON_ID,
  }).patternPlans
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
        patternPlans: [],
        affixedPairs: [],
      })

      // Section 0 — title "Vocabulary" → slug section-0-vocabulary
      const sec0 = units.find((u) => u.unit_slug === 'section-0-vocabulary')
      expect(sec0).toBeDefined()
      expect(sec0?.unit_kind).toBe('lesson_section')
      expect(sec0?.source_ref).toBe('lesson-3')
      expect(sec0?.source_section_ref).toBe('lesson-3/section-0')
      expect(sec0?.content_unit_key).toBe('lesson-3::lesson-3/section-0::section-0-vocabulary')
      expect(sec0?.display_order).toBe(0)

      // Section 1 — empty title, falls back to content.type 'grammar' → slug section-1-grammar
      const sec1 = units.find((u) => u.unit_slug === 'section-1-grammar')
      expect(sec1).toBeDefined()
      expect(sec1?.source_section_ref).toBe('lesson-3/section-1')
      expect(sec1?.display_order).toBe(1)
    })

    it('emits payload_json as empty object (Decision E)', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: [],
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
        patternPlans: [],
        affixedPairs: [],
      })

      const item = units.find((u) => u.unit_kind === 'learning_item')
      expect(item).toBeDefined()
      expect(item?.unit_slug).toBe('item-makan')
      expect(item?.source_ref).toBe('learning_items/makan')
      // vocabulary section_kind → 'section-vocabulary'
      expect(item?.source_section_ref).toBe('lesson-3/section-vocabulary')
      expect(item?.content_unit_key).toBe(
        'learning_items/makan::lesson-3/section-vocabulary::item-makan',
      )
      expect(item?.display_order).toBe(1000)
    })

    it('uses section-dialogue for dialogue section_kind', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [PHRASE_ROW],
        patternPlans: [],
        affixedPairs: [],
      })

      const item = units.find((u) => u.unit_kind === 'learning_item')
      expect(item).toBeDefined()
      expect(item?.source_section_ref).toBe('lesson-3/section-dialogue')
      expect(item?.content_unit_key).toBe(
        'learning_items/apa kabar::lesson-3/section-dialogue::item-apa-kabar',
      )
    })

    it('does NOT emit a unit for sentence items', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [SENTENCE_ROW],
        patternPlans: [],
        affixedPairs: [],
      })

      expect(units.filter((u) => u.unit_kind === 'learning_item')).toHaveLength(0)
    })

    it('display_order increments per item position', () => {
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW, PHRASE_ROW],
        patternPlans: [],
        affixedPairs: [],
      })

      const items = units.filter((u) => u.unit_kind === 'learning_item')
      expect(items).toHaveLength(2)
      const orders = items.map((u) => u.display_order).sort((a, b) => a - b)
      expect(orders[0]).toBe(1000)
      expect(orders[1]).toBe(1001)
    })
  })

  describe('grammar patterns', () => {
    it('emits a unit for a verbose-title grammar category with pattern-path-aligned identity', () => {
      // Use the verbose-title category to test real slug derivation (not pre-slugified 'word-order')
      const plans = makePlans([GRAMMAR_CATEGORY_VERBOSE])
      expect(plans).toHaveLength(1)

      const plan = plans[0]
      // Verify the plan's slug is the lesson-prefixed form, not a curated slug
      expect(plan.slug).toBe('l3-bukan-ontkenning-van-zelfstandig-naamwoorden')
      expect(plan.sourceRef).toBe(
        'lesson-3/pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden',
      )

      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: plans,
        affixedPairs: [],
      })

      const pattern = units.find((u) => u.unit_kind === 'grammar_pattern')
      expect(pattern).toBeDefined()

      // The builder must use plan.slug and plan.sourceRef verbatim:
      // - unit_slug = 'pattern-' + plan.slug  (l{N}-prefixed)
      // - source_ref = plan.sourceRef          (== capability.source_ref by construction)
      expect(pattern?.unit_slug).toBe('pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden')
      expect(pattern?.source_ref).toBe(
        'lesson-3/pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden',
      )
      // source_ref MUST equal plan.sourceRef — this is the bridge join key
      expect(pattern?.source_ref).toBe(plan.sourceRef)
      expect(pattern?.source_section_ref).toBe('lesson-3/section-grammar')
      expect(pattern?.content_unit_key).toBe(
        'lesson-3/pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden' +
        '::lesson-3/section-grammar' +
        '::pattern-l3-bukan-ontkenning-van-zelfstandig-naamwoorden',
      )
      expect(pattern?.display_order).toBe(2000)
    })

    it('collision: two categories with same title-slug inherit plan disambiguation suffix', () => {
      // Two categories in lesson 3 whose titles slugify to the same base.
      // 'Ontkenning' and 'ontkenning (variant)' both → stableSlug = 'ontkenning'.
      // projectPatternsFromCategories applies the -display_order suffix: l3-ontkenning-0, l3-ontkenning-1.
      // The builder must emit those disambiguated slugs — NOT the naive colliding slug.
      // Both 'Ontkenning' and 'ONTKENNING' slugify to 'ontkenning' via stableSlug
      // (lowercase + strip non-alnum-hyphen). This forces the disambiguation path.
      const catA: TypedGrammarCategory = {
        id: 'cat-uuid-a',
        section_id: 'section-uuid-1',
        lesson_id: LESSON_ID,
        display_order: 0,
        title: 'Ontkenning',
        title_en: 'Negation',
        rules: ['Rule A'],
        rules_en: ['Rule A'],
        examples: [],
      }
      const catB: TypedGrammarCategory = {
        id: 'cat-uuid-b',
        section_id: 'section-uuid-1',
        lesson_id: LESSON_ID,
        display_order: 1,
        title: 'ONTKENNING',
        title_en: 'Negation (uppercase)',
        rules: ['Rule B'],
        rules_en: ['Rule B'],
        examples: [],
      }

      const plans = makePlans([catA, catB])
      expect(plans).toHaveLength(2)

      // Both have same base slug 'l3-ontkenning'; projectPatternsFromCategories appends display_order
      expect(plans[0].slug).toBe('l3-ontkenning-0')
      expect(plans[1].slug).toBe('l3-ontkenning-1')

      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: plans,
        affixedPairs: [],
      })

      const patterns = units.filter((u) => u.unit_kind === 'grammar_pattern')
        .sort((a, b) => a.display_order - b.display_order)
      expect(patterns).toHaveLength(2)

      // Builder consumes plans verbatim — inherits the disambiguation suffix
      expect(patterns[0].unit_slug).toBe('pattern-l3-ontkenning-0')
      expect(patterns[1].unit_slug).toBe('pattern-l3-ontkenning-1')
      expect(patterns[0].source_ref).toBe(plans[0].sourceRef)
      expect(patterns[1].source_ref).toBe(plans[1].sourceRef)
    })

    it('negative: no emitted grammar unit is in the old curated-slug form (data-arch N1)', () => {
      // Every grammar unit must have a slug starting with 'pattern-l{digit}' (pattern-path form).
      // None may be 'pattern-{curated}' without the l{N}- lesson prefix.
      // This guards against the bug where the builder re-derives from stableSlug(title) —
      // curated staging slugs were e.g. 'word-order', 'zero-copula'; pattern-path slugs are
      // 'l3-bukan-ontkenning-van-zelfstandig-naamwoorden', 'l3-ontkenning-0'.
      const plans = makePlans([GRAMMAR_CATEGORY_VERBOSE])

      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: plans,
        affixedPairs: [],
      })

      const grammarUnits = units.filter((u) => u.unit_kind === 'grammar_pattern')
      expect(grammarUnits.length).toBeGreaterThan(0)

      for (const u of grammarUnits) {
        // Pattern-path form: unit_slug matches 'pattern-l{N}-...' (l + digit, then hyphen)
        expect(u.unit_slug).toMatch(/^pattern-l\d+-/)
        // source_ref must contain '/pattern-l{N}-' (not '/pattern-{curated}')
        expect(u.source_ref).toMatch(/\/pattern-l\d+-/)
      }
    })

    it('assigns display_order starting at 2000 + plan index', () => {
      const cat2: TypedGrammarCategory = {
        ...GRAMMAR_CATEGORY_VERBOSE,
        id: 'cat-uuid-2',
        display_order: 1,
        title: 'Kata ganti orang',
        title_en: 'Personal pronouns',
      }
      const plans = makePlans([GRAMMAR_CATEGORY_VERBOSE, cat2])

      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: plans,
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
        patternPlans: [],
        affixedPairs: [AFFIXED_PAIR],
      })

      const pair = units.find((u) => u.unit_kind === 'affixed_form_pair')
      expect(pair).toBeDefined()
      // source_ref = 'lesson-3/morphology/meN-baca-membaca'
      // slug from last segment after '/morphology/': stableSlug('meN-baca-membaca') = 'men-baca-membaca'
      expect(pair?.unit_slug).toBe('morphology-men-baca-membaca')
      expect(pair?.source_ref).toBe('lesson-3/morphology/meN-baca-membaca')
      expect(pair?.source_section_ref).toBe('lesson-3/section-morphology')
      expect(pair?.content_unit_key).toBe(
        'lesson-3/morphology/meN-baca-membaca::lesson-3/section-morphology::morphology-men-baca-membaca',
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
        patternPlans: [],
        affixedPairs: [AFFIXED_PAIR],
      })
      const pair = units.find((u) => u.unit_kind === 'affixed_form_pair')
      expect(pair?.unit_slug).toBe('morphology-men-baca-membaca')
    })

    it('assigns display_order starting at 3000 + pair index', () => {
      const pair2: TypedAffixedPair = {
        ...AFFIXED_PAIR,
        id: 'pair-uuid-2',
        source_ref: 'lesson-3/morphology/meN-tulis-menulis',
        root_text: 'tulis',
        derived_text: 'menulis',
      }
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [],
        patternPlans: [],
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
      const plans = makePlans([GRAMMAR_CATEGORY_VERBOSE])
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW],
        patternPlans: plans,
        affixedPairs: [AFFIXED_PAIR],
      })

      const orders = units.map((u) => u.display_order)
      const sorted = [...orders].sort((a, b) => a - b)
      expect(orders).toEqual(sorted)
    })
  })

  describe('all unit kinds together', () => {
    it('emits sections, word items, grammar, affixed — but NOT sentence items', () => {
      const plans = makePlans([GRAMMAR_CATEGORY_VERBOSE])
      const units = buildContentUnitsFromDb({
        lessonNumber: LESSON_NUMBER,
        sections: SECTIONS,
        itemRows: [WORD_ROW, PHRASE_ROW, SENTENCE_ROW],
        patternPlans: plans,
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
