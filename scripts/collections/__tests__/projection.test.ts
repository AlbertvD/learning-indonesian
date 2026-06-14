import { describe, expect, it } from 'vitest'
import {
  frequencyMembers,
  projectionViolations,
  partitionByExistence,
  type RankedItem,
} from '../projection'

const items: RankedItem[] = [
  { id: 'a', frequencyRank: 1 },
  { id: 'b', frequencyRank: 100 },
  { id: 'c', frequencyRank: 101 },
  { id: 'd', frequencyRank: null },
]

describe('frequencyMembers', () => {
  it('includes items with rank <= cutoff (inclusive) and excludes unranked', () => {
    expect(frequencyMembers(items, 100).sort()).toEqual(['a', 'b'])
  })

  it('treats the cutoff as inclusive at the boundary', () => {
    expect(frequencyMembers(items, 101).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing when no item is ranked low enough', () => {
    expect(frequencyMembers(items, 0)).toEqual([])
  })
})

describe('projectionViolations (bidirectional, §8 gate 2)', () => {
  it('passes when members exactly equal the eligible set', () => {
    const members = new Set(['a', 'b'])
    expect(projectionViolations(items, members, 100)).toEqual([])
  })

  it('flags a member whose rank is above the cutoff', () => {
    const members = new Set(['a', 'b', 'c']) // c is rank 101 > 100
    const v = projectionViolations(items, members, 100)
    expect(v).toEqual([{ kind: 'member-over-cutoff', itemId: 'c', frequencyRank: 101 }])
  })

  it('flags an eligible item that is missing from the materialised set (stale projection)', () => {
    const members = new Set(['a']) // b (rank 100) eligible but absent
    const v = projectionViolations(items, members, 100)
    expect(v).toEqual([{ kind: 'missing-eligible', itemId: 'b', frequencyRank: 100 }])
  })

  it('reports both directions at once', () => {
    const members = new Set(['a', 'c']) // missing b, extra c
    const v = projectionViolations(items, members, 100)
    expect(v).toContainEqual({ kind: 'member-over-cutoff', itemId: 'c', frequencyRank: 101 })
    expect(v).toContainEqual({ kind: 'missing-eligible', itemId: 'b', frequencyRank: 100 })
  })
})

describe('partitionByExistence (resolve-or-create, §7)', () => {
  it('splits words by the canonical slug against existing normalized_text', () => {
    const existing = new Set(['saya', 'untuk'])
    const { resolved, gaps } = partitionByExistence(
      [
        { word: 'Saya', rank: 1 }, // itemSlug lowercases → 'saya' exists
        { word: 'untuk', rank: 2 }, // exists
        { word: 'dia', rank: 3 }, // gap
      ],
      existing,
    )
    expect(resolved.map(r => r.normalizedText)).toEqual(['saya', 'untuk'])
    expect(gaps.map(g => g.normalizedText)).toEqual(['dia'])
  })

  it('collapses duplicate normalized forms to the lowest rank', () => {
    const { gaps } = partitionByExistence(
      [
        { word: 'Dia', rank: 9 },
        { word: 'dia', rank: 3 },
      ],
      new Set(),
    )
    expect(gaps).toEqual([{ word: 'dia', rank: 3, normalizedText: 'dia' }])
  })

  it('sorts both buckets by rank', () => {
    const { gaps } = partitionByExistence(
      [
        { word: 'ketiga', rank: 50 },
        { word: 'dia', rank: 3 },
        { word: 'usah', rank: 20 },
      ],
      new Set(),
    )
    expect(gaps.map(g => g.rank)).toEqual([3, 20, 50])
  })
})
