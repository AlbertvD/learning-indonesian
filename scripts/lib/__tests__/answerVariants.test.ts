import { describe, it, expect } from 'vitest'
import {
  normalizeVariantText,
  toCandidateVariant,
  dropDistractorCollisions,
  dedupeCandidates,
  toInsertRow,
  buildDistractorTextsByItem,
  type CandidateVariant,
} from '../answerVariants'

describe('normalizeVariantText', () => {
  it('trims and lowercases', () => {
    expect(normalizeVariantText('  Rijst ')).toBe('rijst')
  })
})

describe('toCandidateVariant', () => {
  const base = {
    learningItemId: 'item-1',
    language: 'nl',
    variantText: 'rijst',
    variantType: 'alternative_translation',
  }

  it('accepts a well-formed raw row', () => {
    expect(toCandidateVariant(base)).toEqual({
      learningItemId: 'item-1',
      language: 'nl',
      variantText: 'rijst',
      variantType: 'alternative_translation',
    })
  })

  it('accepts variant_type=informal', () => {
    expect(toCandidateVariant({ ...base, variantType: 'informal' })?.variantType).toBe('informal')
  })

  it('rejects variant_type=paraphrase — never allowed (plan §Part 1 step 4)', () => {
    expect(toCandidateVariant({ ...base, variantType: 'paraphrase' })).toBeNull()
  })

  it('rejects an unrecognised variant_type', () => {
    expect(toCandidateVariant({ ...base, variantType: 'made_up' })).toBeNull()
  })

  it('rejects a missing/empty variantText', () => {
    expect(toCandidateVariant({ ...base, variantText: '' })).toBeNull()
    expect(toCandidateVariant({ ...base, variantText: '   ' })).toBeNull()
    expect(toCandidateVariant({ ...base, variantText: undefined })).toBeNull()
  })

  it('rejects a missing learningItemId or language', () => {
    expect(toCandidateVariant({ ...base, learningItemId: undefined })).toBeNull()
    expect(toCandidateVariant({ ...base, language: undefined })).toBeNull()
  })

  it('rejects wrong types defensively (malformed artifact)', () => {
    expect(toCandidateVariant({ ...base, learningItemId: 42 })).toBeNull()
  })
})

describe('dropDistractorCollisions', () => {
  const candidates: CandidateVariant[] = [
    { learningItemId: 'item-1', language: 'nl', variantText: 'rijst', variantType: 'alternative_translation' },
    { learningItemId: 'item-1', language: 'nl', variantText: 'Brood', variantType: 'alternative_translation' },
    { learningItemId: 'item-2', language: 'nl', variantText: 'huis', variantType: 'alternative_translation' },
  ]

  it('drops a candidate that collides with the item\'s distractor set (case/whitespace-insensitive)', () => {
    const distractorTextsByItem = new Map([['item-1', new Set(['brood'])]])
    const { kept, dropped } = dropDistractorCollisions(candidates, distractorTextsByItem)
    expect(dropped).toHaveLength(1)
    expect(dropped[0].variantText).toBe('Brood')
    expect(kept.map((c) => c.variantText)).toEqual(['rijst', 'huis'])
  })

  it('keeps everything when the item has no distractor set', () => {
    const { kept, dropped } = dropDistractorCollisions(candidates, new Map())
    expect(kept).toHaveLength(3)
    expect(dropped).toHaveLength(0)
  })

  it('never cross-contaminates between items', () => {
    const distractorTextsByItem = new Map([['item-2', new Set(['rijst'])]]) // only affects item-2
    const { kept, dropped } = dropDistractorCollisions(candidates, distractorTextsByItem)
    expect(dropped).toHaveLength(0) // item-1's "rijst" is untouched by item-2's distractor set
    expect(kept).toHaveLength(3)
  })
})

describe('dedupeCandidates', () => {
  it('collapses candidates that normalize to the same (item, text, language)', () => {
    const candidates: CandidateVariant[] = [
      { learningItemId: 'item-1', language: 'nl', variantText: 'rijst', variantType: 'alternative_translation' },
      { learningItemId: 'item-1', language: 'nl', variantText: ' Rijst ', variantType: 'informal' },
      { learningItemId: 'item-1', language: 'en', variantText: 'rice', variantType: 'alternative_translation' },
    ]
    const deduped = dedupeCandidates(candidates)
    expect(deduped).toHaveLength(2)
    expect(deduped[0].variantText).toBe('rijst') // first occurrence kept
  })
})

describe('toInsertRow', () => {
  it('shapes the exact item_answer_variants insert row', () => {
    const row = toInsertRow({
      learningItemId: 'item-1', language: 'nl', variantText: '  Rijst ', variantType: 'alternative_translation',
    })
    expect(row).toEqual({
      learning_item_id: 'item-1',
      variant_text: 'rijst',
      variant_type: 'alternative_translation',
      language: 'nl',
      is_accepted: true,
    })
  })
})

describe('buildDistractorTextsByItem', () => {
  it('resolves a recognition-cap distractor pointer to the wrong item\'s gloss, keyed by TARGET item', () => {
    // cap-1 belongs to target item "item-1" (recognise_meaning_from_text_cap);
    // its distractor pointer is to "item-2" (the wrong-option item, gloss "huis").
    const capabilityRows = [
      { id: 'cap-1', capability_type: 'recognise_meaning_from_text_cap', targetItemId: 'item-1' },
    ]
    const distractorRows = [{ capability_id: 'cap-1', item_id: 'item-2' }]
    const distractorItemById = new Map([
      ['item-2', { base_text: 'rumah', translation_nl: 'huis', translation_en: 'house' }],
    ])
    const result = buildDistractorTextsByItem(capabilityRows, distractorRows, distractorItemById, 'nl')
    expect(result.get('item-1')).toEqual(new Set(['huis']))
  })

  it('unions recognition + cued-recall distractor sets for the same target item', () => {
    const capabilityRows = [
      { id: 'cap-1', capability_type: 'recognise_meaning_from_text_cap', targetItemId: 'item-1' },
      { id: 'cap-2', capability_type: 'recognise_form_from_meaning_cap', targetItemId: 'item-1' },
    ]
    const distractorRows = [
      { capability_id: 'cap-1', item_id: 'item-2' }, // gloss distractor
      { capability_id: 'cap-2', item_id: 'item-3' }, // form distractor
    ]
    const distractorItemById = new Map([
      ['item-2', { base_text: 'rumah', translation_nl: 'huis', translation_en: 'house' }],
      ['item-3', { base_text: 'gedung', translation_nl: 'gebouw', translation_en: 'building' }],
    ])
    const result = buildDistractorTextsByItem(capabilityRows, distractorRows, distractorItemById, 'nl')
    // cued-recall renders the distractor item's INDONESIAN base_text, not its gloss.
    expect(result.get('item-1')).toEqual(new Set(['huis', 'gedung']))
  })

  it('produces an empty map when there are no capability rows', () => {
    const result = buildDistractorTextsByItem([], [], new Map(), 'nl')
    expect(result.size).toBe(0)
  })
})
