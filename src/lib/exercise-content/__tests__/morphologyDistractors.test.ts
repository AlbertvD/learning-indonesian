import { describe, it, expect } from 'vitest'
import { pickMeaningDistractors } from '../morphologyDistractors'

describe('pickMeaningDistractors (ADR 0021)', () => {
  it('prefers root meaning + family siblings, excludes the answer, guarantees 3', () => {
    const d = pickMeaningDistractors({
      correctGloss: 'to walk',
      rootMeaning: 'road',
      siblingGlosses: ['journey', 'streets'],
      poolGlosses: ['to run', 'to eat', 'to sleep'],
    })
    expect(d).toHaveLength(3)
    expect(d).not.toContain('to walk')
    expect(d).toContain('road') // root-meaning distractor drills the shift
    expect(d).toContain('journey') // family sibling
  })

  it('excludes a near-duplicate of the answer (case / whitespace / trailing punctuation)', () => {
    const d = pickMeaningDistractors({
      correctGloss: 'to walk',
      rootMeaning: '  To Walk. ',
      siblingGlosses: [],
      poolGlosses: ['to run', 'to eat', 'to sleep'],
    })
    expect(d).not.toContain('  To Walk. ')
    expect(d).toHaveLength(3)
  })

  it('dedups duplicate candidate glosses, keeping priority order', () => {
    const d = pickMeaningDistractors({
      correctGloss: 'x',
      rootMeaning: 'a',
      siblingGlosses: ['a', 'b'],
      poolGlosses: ['b', 'c', 'd'],
    })
    expect(d).toEqual(['a', 'b', 'c'])
  })

  it('backfills from the pool when the family is thin', () => {
    const d = pickMeaningDistractors({
      correctGloss: 'x',
      rootMeaning: null,
      siblingGlosses: ['only'],
      poolGlosses: ['p1', 'p2', 'p3'],
    })
    expect(d).toEqual(['only', 'p1', 'p2'])
  })

  it('returns fewer than 3 only when candidates are genuinely exhausted (caller fails loud)', () => {
    const d = pickMeaningDistractors({ correctGloss: 'x', rootMeaning: 'a', siblingGlosses: [], poolGlosses: [] })
    expect(d).toEqual(['a'])
  })
})
