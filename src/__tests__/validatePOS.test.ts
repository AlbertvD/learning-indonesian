import { describe, it, expect } from 'vitest'
import { validatePOS } from '../../scripts/lib/validate-pos'

describe('validatePOS', () => {
  it('emits WARNING for word/phrase without pos', () => {
    const result = validatePOS([{ base_text: 'makan', item_type: 'word' }])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('makan')
    expect(result.criticalErrors).toHaveLength(0)
  })

  it('emits CRITICAL for invalid pos value', () => {
    const result = validatePOS([{ base_text: 'x', item_type: 'word', pos: 'not_a_pos' }])
    expect(result.criticalErrors).toHaveLength(1)
    expect(result.criticalErrors[0]).toContain('not_a_pos')
  })

  it('accepts all 12 taxonomy values', () => {
    const all = ['verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
      'classifier', 'preposition', 'conjunction', 'particle',
      'question_word', 'greeting']
    for (const pos of all) {
      const result = validatePOS([{ base_text: 'x', item_type: 'word', pos }])
      expect(result.criticalErrors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    }
  })

  it('omits sentence/dialogue_chunk items from warnings and coverage', () => {
    const result = validatePOS([
      { base_text: 'S', item_type: 'sentence' },
      { base_text: 'D', item_type: 'dialogue_chunk' },
    ])
    expect(result.warnings).toHaveLength(0)
    expect(result.coverage).toEqual({})
  })

  it('aggregates coverage by pos', () => {
    const result = validatePOS([
      { base_text: 'a', item_type: 'word', pos: 'verb' },
      { base_text: 'b', item_type: 'word', pos: 'verb' },
      { base_text: 'c', item_type: 'word', pos: 'noun' },
      { base_text: 'd', item_type: 'word' },
    ])
    expect(result.coverage).toEqual({ verb: 2, noun: 1, null: 1 })
  })
})
