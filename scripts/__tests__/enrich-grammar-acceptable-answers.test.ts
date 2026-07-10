import { describe, it, expect } from 'vitest'
import { computeFullTargetSet } from '../enrich-grammar-acceptable-answers'
import type { RegisterPairLite } from '../lib/registerExpansion'

const PAIRS: RegisterPairLite[] = [
  { formal: 'tidak', informal: 'nggak' },
  { formal: 'sudah', informal: 'udah' },
]

describe('computeFullTargetSet', () => {
  it('keeps the canonical answer at index 0, always', () => {
    const out = computeFullTargetSet(['Saya tidak tahu.'], ['Saya belum tahu.'], PAIRS)
    expect(out[0]).toBe('Saya tidak tahu.')
  })

  it('unions canonical + generate additions + register expansion, deduped', () => {
    const out = computeFullTargetSet(
      ['Saya tidak tahu.'],
      ['Saya belum tahu.'],
      PAIRS,
    )
    expect(out).toContain('Saya tidak tahu.')
    expect(out).toContain('Saya belum tahu.')
    expect(out).toContain('Saya nggak tahu.') // register expansion of the canonical
    // "Saya belum tahu." has no register-substitutable token -> no expansion of it
    expect(out).toHaveLength(3)
  })

  it('does not duplicate a generate addition that is already in canonical', () => {
    const out = computeFullTargetSet(
      ['Saya tidak tahu.', 'Saya belum tahu.'],
      ['Saya belum tahu.'], // already present
      PAIRS,
    )
    expect(out.filter((a) => a === 'Saya belum tahu.')).toHaveLength(1)
  })

  it('does not duplicate a register expansion that collides with an existing answer', () => {
    const out = computeFullTargetSet(
      ['Saya tidak tahu.', 'Saya nggak tahu.'], // informal form already authored
      [],
      PAIRS,
    )
    expect(out.filter((a) => a === 'Saya nggak tahu.')).toHaveLength(1)
    expect(out).toHaveLength(2)
  })

  it('is idempotent — re-running on its own output produces the same array', () => {
    const first = computeFullTargetSet(['Saya tidak tahu.'], ['Saya belum tahu.'], PAIRS)
    const second = computeFullTargetSet(first, ['Saya belum tahu.'], PAIRS)
    expect(second).toEqual(first)
  })

  it('returns just the canonical when there are no additions and no register matches', () => {
    const out = computeFullTargetSet(['Saya makan nasi.'], [], PAIRS)
    expect(out).toEqual(['Saya makan nasi.'])
  })

  it('expands register substitutions on a generate-added answer too, not just canonical', () => {
    const out = computeFullTargetSet(
      ['Dia pergi.'],
      ['Dia sudah pergi.'],
      PAIRS,
    )
    expect(out).toContain('Dia sudah pergi.')
    expect(out).toContain('Dia udah pergi.') // register expansion of the GENERATE addition
  })

  describe('REGRESSION (2026-07-10 live-DB re-run): idempotency with >3 substitutable tokens', () => {
    // Real shape that broke idempotency before the hasInformalToken guard:
    // a canonical answer with 4 substitutable tokens (bounded fallback:
    // substitute-all + substitute-each-singly = 5 variants on round 1). A
    // second apply run must NOT grow the array further.
    const FOUR_TOKEN_PAIRS: RegisterPairLite[] = [
      { formal: 'tidak', informal: 'nggak' },
      { formal: 'saja', informal: 'aja' },
      { formal: 'besar', informal: 'gede' },
      { formal: 'tetapi', informal: 'tapi' },
    ]
    const canonical = 'Teman saya tidak saja besar, tetapi juga kuat.'

    it('round 1 produces the bounded fallback (substitute-all + 4 singly = 5 additions)', () => {
      const out = computeFullTargetSet([canonical], [], FOUR_TOKEN_PAIRS)
      expect(out).toHaveLength(6) // canonical + 5
    })

    it('round 2 (re-running on round 1s own output) adds NOTHING new — stable fixed point', () => {
      const round1 = computeFullTargetSet([canonical], [], FOUR_TOKEN_PAIRS)
      const round2 = computeFullTargetSet(round1, [], FOUR_TOKEN_PAIRS)
      expect(round2).toEqual(round1)
    })

    it('does not re-expand an already-partially-substituted answer even when it now has <=3 remaining formal tokens', () => {
      // "Teman saya nggak saja besar, tetapi juga kuat." (tidak->nggak done,
      // 3 formal tokens remain: saja/besar/tetapi) must NOT get the full
      // 2^3-1=7-combo treatment when it shows up in a later canonical array.
      const partiallySubstituted = 'Teman saya nggak saja besar, tetapi juga kuat.'
      const out = computeFullTargetSet([canonical, partiallySubstituted], [], FOUR_TOKEN_PAIRS)
      // Only variants derivable from the ORIGINAL fully-formal canonical are
      // allowed in; the partially-substituted seed contributes nothing.
      expect(out).not.toContain('Teman saya nggak aja besar, tetapi juga kuat.')
    })
  })
})
