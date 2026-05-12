import { describe, it, expect } from 'vitest'
import { selectPublishableItems, projectVocab, type VocabStagingItem, type VocabStagingClozeContext } from '../../projectors/vocab'

const baseItem = (overrides: Partial<VocabStagingItem>): VocabStagingItem => ({
  base_text: 'halo',
  item_type: 'word',
  context_type: 'vocabulary_list',
  translation_nl: 'hallo',
  translation_en: 'hello',
  pos: 'greeting',
  level: 'A1',
  review_status: 'pending_review',
  ...overrides,
})

describe('selectPublishableItems — deferred-dialogue gate (legacy 422–465)', () => {
  it('publishes a dialogue_chunk that has BOTH translation_nl AND a cloze context', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: 'Hoe gaat het',
        context_type: 'dialogue',
      }),
    ]
    const cloze: VocabStagingClozeContext[] = [
      { learning_item_slug: 'apa kabar', source_text: 'Apa ___', translation_text: 'Hoe ___' },
    ]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: cloze })
    expect(publishable).toHaveLength(1)
    expect(deferred).toHaveLength(0)
  })

  it('defers a dialogue_chunk missing translation_nl', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: '',
        context_type: 'dialogue',
      }),
    ]
    const cloze: VocabStagingClozeContext[] = [
      { learning_item_slug: 'apa kabar', source_text: 'Apa ___', translation_text: 'Hoe ___' },
    ]
    const { publishable, deferred, deferredKeys } = selectPublishableItems({ learningItems: items, clozeContexts: cloze })
    expect(publishable).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    expect(deferredKeys.has('Apa kabar')).toBe(true)
  })

  it('defers a dialogue_chunk missing a matching cloze context', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: 'Hoe gaat het',
        context_type: 'dialogue',
      }),
    ]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: [] })
    expect(publishable).toHaveLength(0)
    expect(deferred).toHaveLength(1)
  })

  it('non-dialogue_chunk items are never deferred regardless of cloze coverage', () => {
    const items = [baseItem({ base_text: 'halo', item_type: 'word' })]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: [] })
    expect(publishable).toHaveLength(1)
    expect(deferred).toHaveLength(0)
  })
})

describe('projectVocab — Decision 5b: contextual_cloze emission driven by clozeContexts', () => {
  it('emits zero contextual_cloze capabilities when there are no cloze contexts', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [{ text: 'Apa kabar', speaker: 'Andi' }],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [],
    })
    expect(out.contextualClozeCapabilities).toHaveLength(0)
  })

  it('emits a contextual_cloze capability for each dialogue line whose slug matches a cloze context', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Apa kabar', speaker: 'Andi' },
              { text: 'Baik baik', speaker: 'Budi' },
            ],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [
        { learning_item_slug: 'apa kabar', source_text: '___ kabar?', translation_text: 'Hoe ___?' },
      ],
    })
    expect(out.contextualClozeCapabilities).toHaveLength(1)
    expect(out.contextualClozeCapabilities[0].sourceKind).toBe('dialogue_line')
    expect(out.contextualClozeCapabilities[0].sourceRef).toContain('lesson-9/section-1/line-0')
  })
})
