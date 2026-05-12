import { describe, it, expect } from 'vitest'
import { validateGrammarPattern } from '../../validators/grammarPattern'

describe('validateGrammarPattern (CS6) — moved from lesson-stage GT7', () => {
  it('accepts a well-formed pattern', () => {
    expect(
      validateGrammarPattern([
        { slug: 'yang-relative-pronoun', pattern_name: 'YANG - Relative Pronoun', complexity_score: 3 },
      ]),
    ).toEqual([])
  })

  it('accepts multiple patterns with distinct slugs', () => {
    expect(
      validateGrammarPattern([
        { slug: 'yang-one', pattern_name: 'A', complexity_score: 1 },
        { slug: 'yang-two', pattern_name: 'B', complexity_score: 2 },
      ]),
    ).toEqual([])
  })

  it('rejects a pattern missing slug', () => {
    const findings = validateGrammarPattern([
      { pattern_name: 'YANG', complexity_score: 1 } as unknown as { slug: string; pattern_name: string; complexity_score: number },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.match(/slug/i))).toBe(true)
    expect(findings[0].gate).toBe('CS6')
  })

  it('rejects a pattern with empty slug', () => {
    const findings = validateGrammarPattern([
      { slug: '   ', pattern_name: 'YANG', complexity_score: 1 },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.match(/slug/i))).toBe(true)
  })

  it('rejects a slug that does not match ^[a-z0-9-]+$', () => {
    const cases = ['Yang_Pattern', 'Yang Pattern', 'yang/pattern', 'YANG-PATTERN']
    for (const slug of cases) {
      const findings = validateGrammarPattern([
        { slug, pattern_name: 'YANG', complexity_score: 1 },
      ])
      expect(findings.some((f) => f.severity === 'error' && f.message.match(/slug/i))).toBe(true)
    }
  })

  it('rejects a pattern missing pattern_name', () => {
    const findings = validateGrammarPattern([
      { slug: 'yang-x', pattern_name: '', complexity_score: 1 },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.match(/pattern_name/))).toBe(true)
  })

  it('rejects a pattern missing complexity_score', () => {
    const findings = validateGrammarPattern([
      { slug: 'yang-x', pattern_name: 'YANG', complexity_score: undefined as unknown as number },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.match(/complexity/))).toBe(true)
  })

  it('rejects duplicate slugs within the same lesson', () => {
    const findings = validateGrammarPattern([
      { slug: 'yang-x', pattern_name: 'YANG one', complexity_score: 1 },
      { slug: 'yang-x', pattern_name: 'YANG two', complexity_score: 2 },
    ])
    expect(findings.filter((f) => f.severity === 'error' && f.message.match(/duplicate/i))).toHaveLength(1)
  })

  it('reports per-pattern errors via context.itemSlug', () => {
    const findings = validateGrammarPattern([
      { slug: 'BAD_SLUG', pattern_name: 'X', complexity_score: 1 },
    ])
    expect(findings[0].context?.itemSlug).toBe('BAD_SLUG')
  })

  it('accepts an empty pattern list (lesson without grammar patterns)', () => {
    expect(validateGrammarPattern([])).toEqual([])
  })
})
