// Cascade tier-behavior tests, lifted verbatim from sessionQueue.test.ts during
// PR-1 of the capabilityContentService spec. The behaviour is unchanged; the
// imports now point at the new home and a smoke test asserts the cascade is
// callable without any session-queue context (proves the extraction is clean).

import { describe, it, expect } from 'vitest'
import { pickDistractorCascade } from '@/lib/distractors'

describe('pickDistractorCascade — tier behavior', () => {
  const target = { itemType: 'word', pos: 'verb' as const, level: 'A1', semanticGroup: 'mental_states' as const }

  it('Tier 0 hit — all 3 matches come from same POS + same group', () => {
    const pool = [
      { id: 'a', option: 'ingat',  itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'b', option: 'lupa',   itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'c', option: 'tahu',   itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'd', option: 'nasi',   itemType: 'word', pos: 'noun',   level: 'A1', semanticGroup: 'food' as const },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toHaveLength(3)
    expect(result).toEqual(expect.arrayContaining(['ingat', 'lupa', 'tahu']))
    expect(result).not.toContain('nasi')
  })

  it('POS-null target falls through Tiers 0–2, starts at Tier 3', () => {
    const nullTarget = { itemType: 'word', pos: null, level: 'A1', semanticGroup: 'mental_states' as const }
    const pool = [
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'b', option: 'y', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'c', option: 'z', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(nullTarget, pool, 3)
    expect(result).toHaveLength(3)
  })

  it('candidate with null POS never appears in Tiers 0–2 when target has POS', () => {
    const pool = [
      { id: 'nullcand', option: 'pos-null', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'verbcand', option: 'pos-verb', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(target, pool, 2)
    // pos-verb hits Tier 0; pos-null only reachable via Tier 4 (same level, no POS req)
    expect(result[0]).toBe('pos-verb')
  })

  it('structural filter honored — sentence target never gets word distractor', () => {
    const sentenceTarget = { itemType: 'sentence', pos: null, level: 'A1', semanticGroup: null }
    const pool = [
      { id: 'w', option: 'word-only', itemType: 'word', pos: null, level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(sentenceTarget, pool, 3)
    // Tier 5 (full pool fallback) will pick the word, but Tiers 3/4 which respect
    // structural filter won't. Tier 5 is last-resort — so it may include word-only.
    // The contract: structural filter is honored until Tier 5.
    // For this test, verify that a sentence target's structural pool is empty.
    expect(result.length).toBeLessThanOrEqual(1)  // at most Tier 5 fallback fires
  })

  it('rejects candidates whose option overlaps the correct answer as a substring', () => {
    const t = { itemType: 'word', pos: 'conjunction' as const, level: 'A1', semanticGroup: null }
    const pool = [
      // karena/sebab case: candidate translation contains target translation as prefix
      { id: 'sebab',   option: 'omdat, de reden is', itemType: 'word', pos: 'conjunction', level: 'A1', semanticGroup: null },
      // unrelated candidate — should be picked
      { id: 'lain',    option: 'anders',             itemType: 'word', pos: 'conjunction', level: 'A1', semanticGroup: null },
      { id: 'andere',  option: 'ander',              itemType: 'word', pos: 'conjunction', level: 'A1', semanticGroup: null },
      { id: 'nog',     option: 'toch',               itemType: 'word', pos: 'conjunction', level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(t, pool, 3, 'omdat')
    expect(result).not.toContain('omdat, de reden is')
  })

  it('rejects candidates with slash-alternative overlap (fijn / mooi vs mooi)', () => {
    const t = { itemType: 'word', pos: 'adjective' as const, level: 'A1', semanticGroup: null }
    const pool = [
      { id: 'halus',   option: 'fijn / mooi (kwaliteit)', itemType: 'word', pos: 'adjective', level: 'A1', semanticGroup: null },
      { id: 'groot',   option: 'groot',                   itemType: 'word', pos: 'adjective', level: 'A1', semanticGroup: null },
      { id: 'klein',   option: 'klein',                   itemType: 'word', pos: 'adjective', level: 'A1', semanticGroup: null },
      { id: 'warm',    option: 'warm',                    itemType: 'word', pos: 'adjective', level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(t, pool, 3, 'mooi')
    // halus translates as "fijn / mooi (kwaliteit)" which shares the component "mooi"
    expect(result).not.toContain('fijn / mooi (kwaliteit)')
  })

  it('rejects whole-word substring overlap (bus ⊂ "met de bus gaan")', () => {
    const t = { itemType: 'word', pos: 'noun' as const, level: 'A1', semanticGroup: null }
    const pool = [
      { id: 'naikbus', option: 'met de bus gaan', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
      { id: 'auto',    option: 'auto',            itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
      { id: 'fiets',   option: 'fiets',           itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
      { id: 'trein',   option: 'trein',           itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(t, pool, 3, 'bus')
    expect(result).not.toContain('met de bus gaan')
  })

  it('dedupes — candidate matching multiple tiers only appears once', () => {
    const pool = [
      // Matches Tier 0 AND would also match Tier 1.
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toEqual(['x'])
  })
})

describe('pickDistractorCascade — extraction smoke test', () => {
  // Per spec §13.2 — proves the cascade can be invoked without any session
  // queue context (legacy and capability paths both call into the same module
  // without one path depending on internal helpers of the other).
  it('is callable as a pure function without session-queue context', () => {
    const target = { itemType: 'word', pos: 'noun' as const, level: 'A1', semanticGroup: null }
    const pool = [
      { id: 'a', option: 'apple', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
      { id: 'b', option: 'banana', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
      { id: 'c', option: 'cherry', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(target, pool, 2)
    expect(result).toHaveLength(2)
    expect(['apple', 'banana', 'cherry']).toEqual(expect.arrayContaining(result))
  })
})
