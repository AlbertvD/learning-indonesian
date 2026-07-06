import { describe, expect, it } from 'vitest'
import { reserveGrammarDueFloor, GRAMMAR_DUE_FLOOR_FRACTION } from '../compose'
import type { DueCapability } from '../dueFilter'
import type { CapabilityFamily } from '../model'

// Canonical key encodes family: `g:<id>` = grammar, anything else = vocab.
function due(id: string, family: 'g' | 'v'): DueCapability {
  return {
    stateId: id,
    capabilityId: `cap-${id}`,
    canonicalKeySnapshot: `${family}:${id}`,
    nextDueAt: '2026-01-01T00:00:00.000Z',
    stateVersion: 1,
  }
}
const familyOf = (key: string): CapabilityFamily | undefined =>
  key.startsWith('g:') ? 'grammar' : 'vocab'

const ids = (list: DueCapability[]) => list.map(d => d.stateId)
const grammarCount = (list: DueCapability[]) =>
  list.filter(d => familyOf(d.canonicalKeySnapshot) === 'grammar').length

// Overdue-ordered list: `vocab` most-overdue first, `grammar` sorting below the cut.
function pool(vocab: number, grammar: number): DueCapability[] {
  return [
    ...Array.from({ length: vocab }, (_, i) => due(`v${i}`, 'v')),
    ...Array.from({ length: grammar }, (_, i) => due(`g${i}`, 'g')),
  ]
}

describe('reserveGrammarDueFloor', () => {
  it('A2 — promotes grammar sorting below the cut into the reserved slots', () => {
    // 20 overdue vocab, 5 less-overdue grammar; limit 10; floor 0.2 → 2 grammar slots.
    const result = reserveGrammarDueFloor(pool(20, 5), 10, familyOf, 0.2)
    expect(result).toHaveLength(10)
    expect(grammarCount(result)).toBe(2)
    // The 2 most-overdue grammar (g0, g1) ride in; the 2 least-overdue of the top-10
    // vocab (v8, v9) are displaced.
    expect(ids(result)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'g0', 'g1'])
  })

  it('A1 — no-op when grammar already meets the floor in the natural top', () => {
    const ordered = [due('g0', 'g'), due('g1', 'g'), ...pool(28, 0)]
    const result = reserveGrammarDueFloor(ordered, 10, familyOf, 0.2)
    expect(ids(result)).toEqual(ids(ordered.slice(0, 10))) // identical to a plain slice
  })

  it('A3 — returns everything unchanged when fewer than `limit` are due', () => {
    const ordered = pool(5, 2)
    const result = reserveGrammarDueFloor(ordered, 25, familyOf, 0.2)
    expect(result).toEqual(ordered)
  })

  it('fraction 0 → exact legacy most-overdue slice', () => {
    const ordered = pool(20, 5)
    expect(ids(reserveGrammarDueFloor(ordered, 10, familyOf, 0))).toEqual(ids(ordered.slice(0, 10)))
  })

  it('no grammar due → exact legacy most-overdue slice', () => {
    const ordered = pool(30, 0)
    expect(ids(reserveGrammarDueFloor(ordered, 10, familyOf, 0.2))).toEqual(ids(ordered.slice(0, 10)))
  })

  it('A5 — floor slot count is floor(limit * fraction)', () => {
    // limit 25, fraction 0.2 → 5 grammar slots when ≥5 grammar sort below the cut.
    const result = reserveGrammarDueFloor(pool(25, 8), 25, familyOf, 0.2)
    expect(grammarCount(result)).toBe(5)
  })

  it('SESSION SIZE — output is always exactly `limit` when more than `limit` are due, for any fraction', () => {
    const ordered = pool(25, 5) // 30 due, limit 25
    for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
      expect(reserveGrammarDueFloor(ordered, 25, familyOf, fraction)).toHaveLength(25)
    }
  })

  it('SESSION SIZE — floor never exceeds available grammar; fills the rest with vocab to reach `limit`', () => {
    // Only 3 grammar due but a 25% floor of a 20-slot session asks for 5.
    const result = reserveGrammarDueFloor(pool(30, 3), 20, familyOf, 0.25)
    expect(result).toHaveLength(20)
    expect(grammarCount(result)).toBe(3) // all available grammar, no phantom slots
  })

  it('is pure — does not mutate the input and returns overdue order', () => {
    const ordered = pool(20, 5)
    const snapshot = ids(ordered)
    const result = reserveGrammarDueFloor(ordered, 10, familyOf, 0.2)
    expect(ids(ordered)).toEqual(snapshot) // input untouched
    // Result preserves the relative overdue order of whatever it chose.
    const chosenOriginalOrder = ordered.filter(d => result.includes(d))
    expect(result).toEqual(chosenOriginalOrder)
  })

  it('ships a documented default fraction', () => {
    expect(GRAMMAR_DUE_FLOOR_FRACTION).toBe(0.2)
  })
})
