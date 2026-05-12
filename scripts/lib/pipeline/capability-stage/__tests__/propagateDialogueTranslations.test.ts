import { describe, it, expect } from 'vitest'

import { propagateDialogueTranslationsToLearningItems } from '../propagateDialogueTranslations'

describe('propagateDialogueTranslationsToLearningItems', () => {
  it('fills empty translation_nl on dialogue_chunk items from matching dialogue lines', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [
            { text: 'Selamat siang', translation: 'Goedemiddag' },
            { text: 'Apa kabar?', translation: 'Hoe gaat het?' },
          ],
        },
      },
    ]
    const items = [
      { base_text: 'Selamat siang', item_type: 'dialogue_chunk', translation_nl: '' },
      { base_text: 'Apa kabar?', item_type: 'dialogue_chunk', translation_nl: null },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(2)
    expect(items[0].translation_nl).toBe('Goedemiddag')
    expect(items[1].translation_nl).toBe('Hoe gaat het?')
  })

  it('does not overwrite an existing translation_nl', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [{ text: 'Halo', translation: 'New Hallo' }],
        },
      },
    ]
    const items = [
      { base_text: 'Halo', item_type: 'dialogue_chunk', translation_nl: 'Existing' },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(0)
    expect(items[0].translation_nl).toBe('Existing')
  })

  it('ignores non-dialogue_chunk items', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [{ text: 'halo', translation: 'hallo' }],
        },
      },
    ]
    const items = [
      { base_text: 'halo', item_type: 'word', translation_nl: '' },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(0)
    expect(items[0].translation_nl).toBe('')
  })

  it('ignores dialogue lines with empty translation', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [
            { text: 'Halo', translation: '' },
            { text: 'Apa kabar?', translation: '   ' },
          ],
        },
      },
    ]
    const items = [
      { base_text: 'Halo', item_type: 'dialogue_chunk', translation_nl: '' },
      { base_text: 'Apa kabar?', item_type: 'dialogue_chunk', translation_nl: '' },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(0)
  })

  it('no-op when there are no dialogue sections at all', () => {
    const sections = [
      { content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] } },
    ]
    const items = [
      { base_text: 'Halo', item_type: 'dialogue_chunk', translation_nl: '' },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(0)
  })

  it('returns the count of items filled, even when not every item has a matching line', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [{ text: 'A', translation: 'Een' }],
        },
      },
    ]
    const items = [
      { base_text: 'A', item_type: 'dialogue_chunk', translation_nl: '' },
      { base_text: 'B', item_type: 'dialogue_chunk', translation_nl: '' },
    ]
    const filled = propagateDialogueTranslationsToLearningItems({ sections, learningItems: items })
    expect(filled).toBe(1)
    expect(items[0].translation_nl).toBe('Een')
    expect(items[1].translation_nl).toBe('')
  })
})
