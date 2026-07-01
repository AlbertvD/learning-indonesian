import { describe, it, expect } from 'vitest'
import { groupRowsByLevel, defaultOpenLevel } from '../levelGrouping'
import type { LessonOverviewRow } from '@/lib/lessons'

// Minimal row — the grouping only reads level / masteredPercent / isActivated.
function row(over: Partial<LessonOverviewRow>): LessonOverviewRow {
  return {
    level: 'A1',
    masteredPercent: 0,
    isActivated: false,
    ...over,
  } as LessonOverviewRow
}

describe('groupRowsByLevel', () => {
  it('groups by level and orders A1 → A2 → B1, unknown/blank last', () => {
    const groups = groupRowsByLevel([
      row({ level: 'B1' }),
      row({ level: 'A1' }),
      row({ level: null }),
      row({ level: 'A2' }),
      row({ level: 'A1' }),
    ])
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2', 'B1', 'Overig'])
    expect(groups[0].rows).toHaveLength(2) // two A1 rows
  })

  it('averages masteredPercent across the group for the collapsed summary', () => {
    const groups = groupRowsByLevel([
      row({ level: 'A1', masteredPercent: 100 }),
      row({ level: 'A1', masteredPercent: 50 }),
      row({ level: 'A1', masteredPercent: 0 }),
    ])
    expect(groups[0].masteredPercent).toBe(50) // (100+50+0)/3
  })

  it('treats a null masteredPercent as 0', () => {
    const groups = groupRowsByLevel([row({ level: 'A1', masteredPercent: null as unknown as number })])
    expect(groups[0].masteredPercent).toBe(0)
  })
})

describe('defaultOpenLevel', () => {
  it('opens the first level with an activated, not-yet-mastered lesson', () => {
    const groups = groupRowsByLevel([
      row({ level: 'A1', masteredPercent: 100, isActivated: true }),
      row({ level: 'A2', masteredPercent: 40, isActivated: true }),
      row({ level: 'B1', masteredPercent: 0 }),
    ])
    expect(defaultOpenLevel(groups)).toBe('A2')
  })

  it('falls back to the first not-fully-mastered level when nothing is in progress', () => {
    const groups = groupRowsByLevel([
      row({ level: 'A1', masteredPercent: 100 }),
      row({ level: 'A2', masteredPercent: 20 }),
    ])
    expect(defaultOpenLevel(groups)).toBe('A2')
  })

  it('returns the first level when everything is mastered, and null when empty', () => {
    const allDone = groupRowsByLevel([row({ level: 'A1', masteredPercent: 100 })])
    expect(defaultOpenLevel(allDone)).toBe('A1')
    expect(defaultOpenLevel([])).toBeNull()
  })
})
