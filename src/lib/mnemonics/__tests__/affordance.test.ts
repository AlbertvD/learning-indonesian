// src/lib/mnemonics/__tests__/affordance.test.ts
import { describe, it, expect } from 'vitest'
import { resolveMnemonicAffordance, type MnemonicGateEvidence } from '../affordance'

const SOURCE_REF = 'learning_items/pintar'

function evidence(overrides: Partial<MnemonicGateEvidence>): MnemonicGateEvidence {
  return { lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 0, ...overrides }
}

describe('resolveMnemonicAffordance', () => {
  it('shows nothing on a correct outcome, even with a note and stubborn evidence', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: 'a mnemonic',
      evidence: evidence({ consecutiveFailureCount: 6 }),
      outcome: 'correct',
    })
    expect(result).toEqual({ kind: 'none' })
  })

  it('resurfaces the saved note on a wrong outcome, regardless of failure count', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: 'schilder die heel slim is',
      evidence: evidence({ consecutiveFailureCount: 1 }),
      outcome: 'wrong',
    })
    expect(result).toEqual({ kind: 'resurface', note: 'schilder die heel slim is' })
  })

  it('offers the prominent create affordance once the word is genuinely stubborn', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: undefined,
      evidence: evidence({ consecutiveFailureCount: 4 }),
      outcome: 'wrong',
    })
    expect(result).toEqual({ kind: 'offer', tier: 'prominent', sourceRef: SOURCE_REF, failureCount: 4 })
  })

  it('offers the quiet create affordance on an earlier miss (1-3 consecutive failures)', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: undefined,
      evidence: evidence({ consecutiveFailureCount: 2 }),
      outcome: 'wrong',
    })
    expect(result).toEqual({ kind: 'offer', tier: 'quiet', sourceRef: SOURCE_REF })
  })

  it('shows nothing for a fresh miss not yet reflected in the build-time evidence', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: undefined,
      evidence: evidence({ consecutiveFailureCount: 0 }),
      outcome: 'wrong',
    })
    expect(result).toEqual({ kind: 'none' })
  })

  it('never gives a lapsed word the prominent (acquisition-framed) offer, even at >=4 failures', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: undefined,
      evidence: evidence({ lapseCount: 1, consecutiveFailureCount: 5 }),
      outcome: 'wrong',
    })
    expect(result.kind).toBe('offer')
    expect(result.kind === 'offer' && result.tier).toBe('quiet')
  })

  it('a note always wins over the offer, even when the word is stubborn', () => {
    const result = resolveMnemonicAffordance({
      sourceRef: SOURCE_REF,
      note: 'already have one',
      evidence: evidence({ consecutiveFailureCount: 7 }),
      outcome: 'wrong',
    })
    expect(result).toEqual({ kind: 'resurface', note: 'already have one' })
  })
})
