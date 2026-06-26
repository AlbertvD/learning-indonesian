import { describe, it, expect } from 'vitest'
import { buildReport } from '../crossCheckReport'
import type { GrammarClaim } from '../grammarClaims'

const claims: GrammarClaim[] = [
  { claimId: 'L1-s0-c0-r0', lesson: 1, topic: 'Werkwoord', kind: 'rule', text: 'Werkwoorden worden niet vervoegd.', examples: [] },
  { claimId: 'L1-s0-c0-r1', lesson: 1, topic: 'Werkwoord', kind: 'rule', text: 'Geen koppelwerkwoord.', examples: [] },
]

describe('buildReport', () => {
  it('joins exactly one verdict per claim with its citation', () => {
    const report = buildReport(1, claims, [
      { claimId: 'L1-s0-c0-r0', status: 'confirmed', citation: 'TBBBI §V.2', note: 'correct' },
      { claimId: 'L1-s0-c0-r1', status: 'confirmed', citation: 'TBBBI §III.1', note: 'correct' },
    ])
    expect(report.claimCount).toBe(2)
    expect(report.verdicts).toHaveLength(2)
    expect(report.verdicts[0]).toMatchObject({ topic: 'Werkwoord', status: 'confirmed', citation: 'TBBBI §V.2' })
    expect(report.unresolved).toEqual([])
    expect(report.unknownVerdicts).toEqual([])
  })

  it('lists a claim with no verdict in `unresolved` (coverage is provable)', () => {
    const report = buildReport(1, claims, [
      { claimId: 'L1-s0-c0-r0', status: 'wrong', citation: 'TBBBI §V.2', note: 'should say X' },
    ])
    expect(report.unresolved).toEqual(['L1-s0-c0-r1'])
  })

  it('flags a verdict referencing an unknown claim instead of silently keeping it', () => {
    const report = buildReport(1, claims, [
      { claimId: 'L1-s0-c0-r0', status: 'confirmed', citation: 'TBBBI', note: '' },
      { claimId: 'GHOST', status: 'confirmed', citation: 'TBBBI', note: '' },
    ])
    expect(report.unknownVerdicts).toContain('GHOST')
    expect(report.verdicts).toHaveLength(1)
  })

  it('flags a duplicate verdict for the same claim', () => {
    const report = buildReport(1, claims, [
      { claimId: 'L1-s0-c0-r0', status: 'confirmed', citation: 'A', note: '' },
      { claimId: 'L1-s0-c0-r0', status: 'wrong', citation: 'B', note: '' },
      { claimId: 'L1-s0-c0-r1', status: 'confirmed', citation: 'C', note: '' },
    ])
    expect(report.verdicts).toHaveLength(2)
    expect(report.unknownVerdicts.some((u) => u.includes('duplicate'))).toBe(true)
  })
})
