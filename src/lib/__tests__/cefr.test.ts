import { describe, it, expect } from 'vitest'
import { cefrRank, groupByCefrLevel } from '@/lib/cefr'

interface Row {
  id: string
  level: string | null
}

describe('cefrRank', () => {
  it('orders the CEFR ladder ascending', () => {
    expect(cefrRank('A1')).toBeLessThan(cefrRank('A2'))
    expect(cefrRank('A2')).toBeLessThan(cefrRank('B1'))
    expect(cefrRank('B1')).toBeLessThan(cefrRank('B2'))
  })

  it('is case- and whitespace-insensitive', () => {
    expect(cefrRank(' a1 ')).toBe(cefrRank('A1'))
  })

  it('sorts unknown/blank levels last', () => {
    expect(cefrRank('')).toBeGreaterThan(cefrRank('C2'))
    expect(cefrRank('nonsense')).toBeGreaterThan(cefrRank('C2'))
  })
})

describe('groupByCefrLevel', () => {
  it('groups rows into ascending CEFR sections', () => {
    const rows: Row[] = [
      { id: 'b1', level: 'B1' },
      { id: 'a1', level: 'A1' },
      { id: 'a2', level: 'A2' },
    ]
    const groups = groupByCefrLevel(rows, (r) => r.level)
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2', 'B1'])
  })

  it('preserves incoming order within a level (stable — caller sort wins)', () => {
    const rows: Row[] = [
      { id: 'first', level: 'A1' },
      { id: 'second', level: 'A1' },
      { id: 'third', level: 'A1' },
    ]
    const groups = groupByCefrLevel(rows, (r) => r.level)
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((r) => r.id)).toEqual(['first', 'second', 'third'])
  })

  it('collects null/blank/unknown levels into a trailing Overig bucket', () => {
    const rows: Row[] = [
      { id: 'known', level: 'A2' },
      { id: 'null', level: null },
      { id: 'blank', level: '  ' },
      { id: 'weird', level: 'Z9' },
    ]
    const groups = groupByCefrLevel(rows, (r) => r.level)
    expect(groups.map((g) => g.level)).toEqual(['A2', 'Overig'])
    const overig = groups[1]
    expect(overig.isUnknown).toBe(true)
    expect(overig.items.map((r) => r.id)).toEqual(['null', 'blank', 'weird'])
  })

  it('honours a custom unknown label', () => {
    const rows: Row[] = [{ id: 'x', level: null }]
    const groups = groupByCefrLevel(rows, (r) => r.level, 'Other')
    expect(groups[0].level).toBe('Other')
  })

  it('normalises case so a1 and A1 land in one bucket', () => {
    const rows: Row[] = [
      { id: 'lower', level: 'a1' },
      { id: 'upper', level: 'A1' },
    ]
    const groups = groupByCefrLevel(rows, (r) => r.level)
    expect(groups).toHaveLength(1)
    expect(groups[0].level).toBe('A1')
  })
})
