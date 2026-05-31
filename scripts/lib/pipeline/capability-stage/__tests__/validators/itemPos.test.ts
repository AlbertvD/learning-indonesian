import { describe, it, expect } from 'vitest'
import { validateItemPos } from '../../validators/itemPos'
import type { ItemForPosCheck } from '../../validators/itemPos'

describe('validateItemPos (CS14)', () => {
  it('passes an empty item list', () => {
    expect(validateItemPos([])).toEqual([])
  })

  it('passes word items with valid POS tags', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'makan', item_type: 'word', pos: 'verb' },
      { normalized_text: 'rumah', item_type: 'word', pos: 'noun' },
      { normalized_text: 'cepat', item_type: 'phrase', pos: 'adjective' },
    ]
    expect(validateItemPos(items)).toEqual([])
  })

  it('ignores dialogue_chunk items (not word/phrase)', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'selamat pagi pak', item_type: 'dialogue_chunk', pos: null },
    ]
    expect(validateItemPos(items)).toEqual([])
  })

  it('emits CS14 warning for word item with missing POS', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'makan', item_type: 'word', pos: null },
    ]
    const findings = validateItemPos(items)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS14')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('makan')
    expect(findings[0].message).toContain('POS')
  })

  it('emits CS14 warning for phrase item with undefined POS', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'selamat pagi', item_type: 'phrase' },
    ]
    const findings = validateItemPos(items)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS14')
    expect(findings[0].severity).toBe('warning')
  })

  it('emits CS14 error for word item with invalid POS value', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'berlari', item_type: 'word', pos: 'action_word' },
    ]
    const findings = validateItemPos(items)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS14')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('action_word')
    expect(findings[0].message).toContain('12-value taxonomy')
  })

  it('includes context.itemSlug in findings', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'berlari', item_type: 'word', pos: 'bad_pos' },
    ]
    const findings = validateItemPos(items)
    expect(findings[0].context?.itemSlug).toBe('berlari')
  })

  it('accepts all 12 valid POS values', () => {
    const validPos = [
      'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
      'classifier', 'preposition', 'conjunction', 'particle',
      'question_word', 'greeting',
    ]
    for (const pos of validPos) {
      const items: ItemForPosCheck[] = [
        { normalized_text: 'test', item_type: 'word', pos },
      ]
      expect(validateItemPos(items), `pos=${pos} should be valid`).toEqual([])
    }
  })

  it('emits one finding per failing item', () => {
    const items: ItemForPosCheck[] = [
      { normalized_text: 'makan', item_type: 'word', pos: null },
      { normalized_text: 'rumah', item_type: 'word', pos: null },
    ]
    const findings = validateItemPos(items)
    expect(findings).toHaveLength(2)
  })
})
