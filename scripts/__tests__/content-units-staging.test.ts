import { describe, expect, it } from 'vitest'
import {
  buildContentUnitsFromStaging,
  validateContentUnits,
  type StagingLessonInput,
} from '../lib/content-pipeline-output'

const lessonInput: StagingLessonInput = {
  lessonNumber: 1,
  lesson: {
    title: 'Les 1 - Di Pasar',
    level: 'A1',
    module_id: 'module-1',
    order_index: 1,
    sections: [{
      title: 'Vocabulary',
      order_index: 0,
      content: { type: 'vocabulary' },
    }],
  },
  learningItems: [{
    base_text: 'makan',
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: 'eten',
    translation_en: 'to eat',
    source_page: 1,
    review_status: 'pending_review',
  }],
  grammarPatterns: [{
    slug: 'word-order',
    pattern_name: 'Word order',
    description: 'Adjectives follow nouns.',
    complexity_score: 2,
  }],
}

describe('content unit staging', () => {
  it('creates stable source/section/unit identities for lesson content', () => {
    const units = buildContentUnitsFromStaging(lessonInput)

    expect(units).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content_unit_key: 'lesson-1::lesson-1/section-0::section-0-vocabulary',
        source_ref: 'lesson-1',
        source_section_ref: 'lesson-1/section-0',
        unit_kind: 'lesson_section',
        unit_slug: 'section-0-vocabulary',
        display_order: 0,
      }),
      expect.objectContaining({
        content_unit_key: 'learning_items/makan::lesson-1/section-vocabulary::item-makan',
        source_ref: 'learning_items/makan',
        source_section_ref: 'lesson-1/section-vocabulary',
        unit_kind: 'learning_item',
        unit_slug: 'item-makan',
        display_order: 1000,
      }),
      expect.objectContaining({
        source_ref: 'lesson-1/pattern-word-order',
        source_section_ref: 'lesson-1/section-grammar',
        unit_kind: 'grammar_pattern',
        unit_slug: 'pattern-word-order',
      }),
    ]))
  })

  it('validates duplicate content unit identities and bad slugs', () => {
    const units = buildContentUnitsFromStaging(lessonInput)
    const findings = validateContentUnits([
      ...units,
      { ...units[0]!, unit_slug: 'Bad Slug' },
      { ...units[0]! },
    ])

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'content-unit-slug-not-stable' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'content-unit-duplicate-identity' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'content-unit-duplicate-slug' }),
    ]))
  })
})
