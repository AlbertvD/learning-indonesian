import { describe, it, expect } from 'vitest'
import { resolveDistractorMaps } from '../byKind/item'

const items = new Map([
  ['i-1', { base_text: 'mahal', translation_nl: 'duur', translation_en: 'expensive' }],
  ['i-2', { base_text: 'murah', translation_nl: 'goedkoop', translation_en: 'cheap' }],
  ['i-3', { base_text: 'gratis', translation_nl: 'gratis', translation_en: 'free' }],
])

describe('resolveDistractorMaps', () => {
  it('routes meaning caps (text/audio recognition) to the recognition map as L1 glosses', () => {
    const rows = [
      { capability_id: 'cap-text', item_id: 'i-2' },
      { capability_id: 'cap-text', item_id: 'i-3' },
      { capability_id: 'cap-audio', item_id: 'i-2' },
    ]
    const types = new Map([['cap-text', 'recognise_meaning_from_text_cap'], ['cap-audio', 'recognise_meaning_from_audio_cap']])
    const { curatedRecognitionDistractors, curatedCuedRecallDistractors } = resolveDistractorMaps(rows, types, items, 'nl')

    expect(curatedRecognitionDistractors.get('cap-text')).toEqual(['goedkoop', 'gratis'])
    expect(curatedRecognitionDistractors.get('cap-audio')).toEqual(['goedkoop']) // recognise_meaning_from_audio_cap uses the same meaning map
    expect(curatedCuedRecallDistractors.size).toBe(0)
  })

  it('routes form caps (recognise_form_from_meaning_cap) to the cued map as Indonesian forms', () => {
    const rows = [
      { capability_id: 'cap-cued', item_id: 'i-2' },
      { capability_id: 'cap-cued', item_id: 'i-3' },
    ]
    const types = new Map([['cap-cued', 'recognise_form_from_meaning_cap']])
    const { curatedRecognitionDistractors, curatedCuedRecallDistractors } = resolveDistractorMaps(rows, types, items, 'nl')

    expect(curatedCuedRecallDistractors.get('cap-cued')).toEqual(['murah', 'gratis'])
    expect(curatedRecognitionDistractors.size).toBe(0)
  })

  it('uses the English gloss when userLanguage is en', () => {
    const rows = [{ capability_id: 'cap-text', item_id: 'i-2' }]
    const types = new Map([['cap-text', 'recognise_meaning_from_text_cap']])
    const { curatedRecognitionDistractors } = resolveDistractorMaps(rows, types, items, 'en')
    expect(curatedRecognitionDistractors.get('cap-text')).toEqual(['cheap'])
  })

  it('skips a pointer whose cap type or item is unknown, and typed caps (meaning_recall) entirely', () => {
    const rows = [
      { capability_id: 'cap-missing-type', item_id: 'i-2' },
      { capability_id: 'cap-text', item_id: 'i-missing-item' },
      { capability_id: 'cap-recall', item_id: 'i-2' },
    ]
    const types = new Map([['cap-text', 'recognise_meaning_from_text_cap'], ['cap-recall', 'meaning_recall']])
    const { curatedRecognitionDistractors, curatedCuedRecallDistractors } = resolveDistractorMaps(rows, types, items, 'nl')
    expect(curatedRecognitionDistractors.size).toBe(0) // missing type + missing item both skipped
    expect(curatedCuedRecallDistractors.size).toBe(0) // meaning_recall carries no distractors
  })
})
