import { describe, it, expect } from 'vitest'
import { parseGenerateResponse, type ArtifactCandidate } from '../enrich-answer-variants'

describe('parseGenerateResponse', () => {
  const itemsById = new Map([
    ['item-1', { id: 'item-1', base_text: 'nasi', item_type: 'word', translation_nl: 'rijst', translation_en: 'rice' }],
    ['item-2', { id: 'item-2', base_text: 'lauk', item_type: 'word', translation_nl: 'bijgerecht', translation_en: 'side dish' }],
  ])

  it('parses a well-formed JSON array response', () => {
    const raw = JSON.stringify([
      { id: 'item-1', language: 'nl', variantText: 'de rijst', variantType: 'informal' },
      { id: 'item-2', language: 'en', variantText: 'accompaniment', variantType: 'alternative_translation' },
    ])
    const result = parseGenerateResponse(raw, itemsById)
    expect(result).toEqual<ArtifactCandidate[]>([
      { learningItemId: 'item-1', baseText: 'nasi', language: 'nl', variantText: 'de rijst', variantType: 'informal' },
      { learningItemId: 'item-2', baseText: 'lauk', language: 'en', variantText: 'accompaniment', variantType: 'alternative_translation' },
    ])
  })

  it('strips markdown fences if the model ignores instructions', () => {
    const raw = '```json\n' + JSON.stringify([
      { id: 'item-1', language: 'nl', variantText: 'de rijst', variantType: 'informal' },
    ]) + '\n```'
    const result = parseGenerateResponse(raw, itemsById)
    expect(result).toHaveLength(1)
  })

  it('drops an entry whose id is not in the batch (model must not invent ids)', () => {
    const raw = JSON.stringify([{ id: 'item-999', language: 'nl', variantText: 'x', variantType: 'informal' }])
    expect(parseGenerateResponse(raw, itemsById)).toEqual([])
  })

  it('drops entries missing a required field', () => {
    const raw = JSON.stringify([
      { id: 'item-1', language: 'nl', variantText: '', variantType: 'informal' },
      { id: 'item-1', language: 'nl', variantType: 'informal' },
      { id: 'item-1', variantText: 'x', variantType: 'informal' },
    ])
    expect(parseGenerateResponse(raw, itemsById)).toEqual([])
  })

  it('returns [] for unparseable JSON', () => {
    expect(parseGenerateResponse('not json at all', itemsById)).toEqual([])
  })

  it('returns [] when the top-level value is not an array', () => {
    expect(parseGenerateResponse('{"foo": "bar"}', itemsById)).toEqual([])
  })

  it('returns [] for an empty array response (model proposed nothing)', () => {
    expect(parseGenerateResponse('[]', itemsById)).toEqual([])
  })
})
