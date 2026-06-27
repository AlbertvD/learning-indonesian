import { describe, it, expect } from 'vitest'
import { levelToPacing } from '../pacing'

describe('levelToPacing', () => {
  it('gives A1 the slowest rate and learner-length pauses', () => {
    const p = levelToPacing('A1')
    expect(p.variant).toBe('learner')
    expect(p.speed).toBeLessThan(1)
  })

  it('slows A2 less than A1 but still uses learner pauses', () => {
    const a1 = levelToPacing('A1')
    const a2 = levelToPacing('A2')
    expect(a2.variant).toBe('learner')
    expect(a2.speed).toBeGreaterThan(a1.speed)
    expect(a2.speed).toBeLessThanOrEqual(1)
  })

  it('narrates B1 and B2 at natural pace', () => {
    for (const level of ['B1', 'B2'] as const) {
      const p = levelToPacing(level)
      expect(p.variant).toBe('natural')
      expect(p.speed).toBe(1)
    }
  })
})
