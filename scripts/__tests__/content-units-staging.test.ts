import { describe, expect, it } from 'vitest'
import {
  buildCapabilityStagingFromContent,
  buildContentUnitsFromStaging,
  buildLessonPageBlocksFromStaging,
  validateCapabilityStaging,
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

  it('merges repeated learning items before projecting content and capabilities', () => {
    const duplicateInput: StagingLessonInput = {
      ...lessonInput,
      learningItems: [
        {
          base_text: 'kaki',
          item_type: 'word',
          context_type: 'vocabulary_list',
          translation_nl: 'voet',
          translation_en: '',
          source_page: 4,
          review_status: 'published',
        },
        {
          base_text: 'kaki',
          item_type: 'word',
          context_type: 'vocabulary_list',
          translation_nl: 'been',
          translation_en: '',
          source_page: 9,
          review_status: 'published',
        },
      ],
      grammarPatterns: [],
    }

    const units = buildContentUnitsFromStaging(duplicateInput)

    expect(units.filter(unit => unit.unit_slug === 'item-kaki')).toHaveLength(1)
    expect(units.find(unit => unit.unit_slug === 'item-kaki')?.payload_json).toEqual(expect.objectContaining({
      translationNl: 'voet / been',
    }))
    expect(validateContentUnits(units)).toEqual([])
  })

  it('projects affixed form pairs into content units, capabilities, and lesson blocks', () => {
    const morphologyInput: StagingLessonInput = {
      ...lessonInput,
      learningItems: [],
      grammarPatterns: [],
      affixedFormPairs: [{
        id: 'men-baca-membaca',
        sourceRef: 'lesson-1/morphology/meN-baca-membaca',
        patternSourceRef: 'lesson-1/pattern-men-active',
        root: 'baca',
        derived: 'membaca',
        allomorphRule: 'meN- becomes mem- before b.',
      }],
    }

    const contentUnits = buildContentUnitsFromStaging(morphologyInput)
    const capabilityPlan = buildCapabilityStagingFromContent({ ...morphologyInput, contentUnits })
    const lessonPageBlocks = buildLessonPageBlocksFromStaging({
      ...morphologyInput,
      contentUnits,
      capabilities: capabilityPlan.capabilities,
    })

    expect(contentUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_ref: 'lesson-1/morphology/meN-baca-membaca',
        source_section_ref: 'lesson-1/section-morphology',
        unit_kind: 'affixed_form_pair',
        unit_slug: 'morphology-men-baca-membaca',
      }),
    ]))
    expect(capabilityPlan.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: 'affixed_form_pair',
        sourceRef: 'lesson-1/morphology/meN-baca-membaca',
        contentUnitSlugs: ['morphology-men-baca-membaca'],
        requiredSourceProgress: expect.objectContaining({
          sourceRef: 'lesson-1/morphology/meN-baca-membaca',
          requiredState: 'pattern_noticing_seen',
        }),
      }),
    ]))
    expect(capabilityPlan.exerciseAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ artifact_kind: 'root_derived_pair' }),
      expect.objectContaining({ artifact_kind: 'allomorph_rule' }),
    ]))
    expect(validateCapabilityStaging({ capabilities: capabilityPlan.capabilities, contentUnits })).toEqual([])
    expect(lessonPageBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        block_key: 'lesson-1-morphology',
        block_kind: 'section',
        content_unit_slugs: expect.arrayContaining(['morphology-men-baca-membaca']),
        source_refs: expect.arrayContaining([
          'lesson-1',
          'lesson-1/morphology/meN-baca-membaca',
          'lesson-1/pattern-men-active',
        ]),
        source_progress_event: 'pattern_noticing_seen',
        payload_json: expect.objectContaining({
          type: 'morphology',
          items: expect.arrayContaining([
            expect.objectContaining({ indonesian: 'membaca' }),
          ]),
        }),
      }),
    ]))
  })

  it('vocab strip blocks list each item source_ref so health-check filterScopedContentUnits keeps the item content_unit', () => {
    const contentUnits = buildContentUnitsFromStaging(lessonInput)
    const capabilityPlan = buildCapabilityStagingFromContent({ ...lessonInput, contentUnits })
    const blocks = buildLessonPageBlocksFromStaging({
      ...lessonInput,
      contentUnits,
      capabilities: capabilityPlan.capabilities,
    })

    const vocabBlock = blocks.find(block => block.block_kind === 'section'
      && (block.content_unit_slugs ?? []).includes('item-makan'))
    expect(vocabBlock).toBeDefined()
    // The block must surface the item's own source_ref. Without it,
    // filterScopedContentUnits in scripts/check-capability-health.ts drops the
    // content_unit, so any capability requiring `learning_items/<slug>` source
    // progress fires the `ready_capability_unknown_source_progress_ref` rule.
    expect(vocabBlock!.source_refs).toEqual(expect.arrayContaining([
      'lesson-1',
      'learning_items/makan',
    ]))
  })

  it('grammar pattern callout blocks list the pattern source_ref alongside the lesson ref', () => {
    const grammarLessonInput: StagingLessonInput = {
      ...lessonInput,
      lesson: {
        ...lessonInput.lesson,
        sections: [{
          title: 'Grammatica',
          order_index: 1,
          content: {
            type: 'grammar',
            intro: 'Korte introductie.',
            categories: [
              {
                title: 'Word order',
                rules: ['Adjectives follow nouns.'],
                examples: [{ indonesian: 'rumah besar', dutch: 'groot huis' }],
              },
            ],
          },
        }],
      },
    }
    const contentUnits = buildContentUnitsFromStaging(grammarLessonInput)
    const capabilityPlan = buildCapabilityStagingFromContent({ ...grammarLessonInput, contentUnits })
    const blocks = buildLessonPageBlocksFromStaging({
      ...grammarLessonInput,
      contentUnits,
      capabilities: capabilityPlan.capabilities,
    })

    const patternBlock = blocks.find(block => block.block_kind === 'section'
      && (block.content_unit_slugs ?? []).some(slug => slug.startsWith('pattern-')))
    expect(patternBlock).toBeDefined()
    expect(patternBlock!.source_refs).toEqual(expect.arrayContaining([
      'lesson-1',
      'lesson-1/pattern-word-order',
    ]))
  })
})
