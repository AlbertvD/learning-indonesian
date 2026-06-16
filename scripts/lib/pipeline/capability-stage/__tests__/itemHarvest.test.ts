import { describe, it, expect } from 'vitest'
import {
  HARVESTED_ITEM_TYPES,
  NON_HARVESTED_ITEM_TYPES,
  LENGTH_GUARD_TOKEN_THRESHOLD,
  extractItemSlug,
  isNonHarvestedItemType,
  isOverHarvestedItemCap,
  tokenCount,
} from '../itemHarvest'

describe('itemHarvest constants', () => {
  it('harvests only word/phrase', () => {
    expect([...HARVESTED_ITEM_TYPES].sort()).toEqual(['phrase', 'word'])
  })
  it('does not harvest sentence/dialogue_chunk', () => {
    expect([...NON_HARVESTED_ITEM_TYPES].sort()).toEqual(['dialogue_chunk', 'sentence'])
  })
  it('pins the length-guard threshold at 6', () => {
    expect(LENGTH_GUARD_TOKEN_THRESHOLD).toBe(6)
  })
})

describe('extractItemSlug', () => {
  it('extracts the slug from an item source_ref', () => {
    expect(extractItemSlug('learning_items/harganya murah')).toBe('harganya murah')
  })
  it('returns null for a non-item source_ref', () => {
    expect(extractItemSlug('grammar_patterns/me-verb')).toBeNull()
    expect(extractItemSlug('lesson_dialogue_lines/l1-s2-3')).toBeNull()
  })
})

describe('isNonHarvestedItemType', () => {
  it('flags sentence and dialogue_chunk', () => {
    expect(isNonHarvestedItemType('sentence')).toBe(true)
    expect(isNonHarvestedItemType('dialogue_chunk')).toBe(true)
  })
  it('does not flag word/phrase', () => {
    expect(isNonHarvestedItemType('word')).toBe(false)
    expect(isNonHarvestedItemType('phrase')).toBe(false)
  })
})

describe('isOverHarvestedItemCap', () => {
  const itemTypeBySlug = new Map<string, string>([
    ['buku', 'word'],
    ['terima kasih kembali', 'phrase'],
    ['ada yang dari negeri belanda', 'sentence'],
    ['selamat pagi, apa kabar', 'dialogue_chunk'],
  ])

  it('flags an item cap whose source resolves to a sentence', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'vocabulary_src', sourceRef: 'learning_items/ada yang dari negeri belanda' },
      itemTypeBySlug,
    )).toBe(true)
  })

  it('flags an item cap whose source resolves to a dialogue_chunk', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'vocabulary_src', sourceRef: 'learning_items/selamat pagi, apa kabar' },
      itemTypeBySlug,
    )).toBe(true)
  })

  it('keeps an item cap whose source resolves to a word', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'vocabulary_src', sourceRef: 'learning_items/buku' },
      itemTypeBySlug,
    )).toBe(false)
  })

  it('keeps an item cap whose source resolves to a phrase', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'vocabulary_src', sourceRef: 'learning_items/terima kasih kembali' },
      itemTypeBySlug,
    )).toBe(false)
  })

  it('keeps a cap whose source resolves to NO item row (non-item cap)', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'vocabulary_src', sourceRef: 'learning_items/unknown-slug' },
      itemTypeBySlug,
    )).toBe(false)
  })

  it('keeps a dialogue_line / pattern source-kind cap (sourceRef not an item ref)', () => {
    expect(isOverHarvestedItemCap(
      { sourceKind: 'dialogue_line_src', sourceRef: 'lesson_dialogue_lines/l1-s2-3' },
      itemTypeBySlug,
    )).toBe(false)
    expect(isOverHarvestedItemCap(
      { sourceKind: 'grammar_pattern_src', sourceRef: 'grammar_patterns/me-verb' },
      itemTypeBySlug,
    )).toBe(false)
  })
})

describe('tokenCount', () => {
  it('counts whitespace-separated tokens', () => {
    expect(tokenCount('terima kasih kembali')).toBe(3)
    expect(tokenCount('Ada yang dari negeri Belanda dan ada yang dari negeri Jerman.')).toBe(11)
    expect(tokenCount('  buku  ')).toBe(1)
  })
})
