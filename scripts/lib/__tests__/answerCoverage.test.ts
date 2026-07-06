import { describe, it, expect } from 'vitest'
import { assessAnswerCoverage } from '../answerCoverage'

describe('assessAnswerCoverage', () => {
  it('flags a thin set when there are zero variants and no "/" in the primary gloss', () => {
    const result = assessAnswerCoverage('rijst', [])
    expect(result.alternatives).toEqual(['rijst'])
    expect(result.isThinSet).toBe(true)
  })

  it('is not thin once a variant adds a second distinct form', () => {
    const result = assessAnswerCoverage('rijst', ['de rijst'])
    expect(result.alternatives).toEqual(['rijst', 'de rijst'])
    expect(result.isThinSet).toBe(false)
  })

  it('is not thin when the primary gloss itself packs "/" alternatives', () => {
    const result = assessAnswerCoverage('rijden / gaan / lopen', [])
    expect(result.alternatives).toEqual(['rijden', 'gaan', 'lopen'])
    expect(result.isThinSet).toBe(false)
  })

  it('dedupes case-insensitively across primary + variants', () => {
    const result = assessAnswerCoverage('Rijst', ['rijst', ' RIJST '])
    expect(result.alternatives).toEqual(['rijst'])
    expect(result.isThinSet).toBe(true)
  })

  it('splits ";" defensively like the runtime grader', () => {
    const result = assessAnswerCoverage('huis; woning', [])
    expect(result.alternatives).toEqual(['huis', 'woning'])
  })

  it('never splits a comma — one clause with an internal comma is one alternative', () => {
    const result = assessAnswerCoverage('Goed, dank u wel', [])
    expect(result.alternatives).toEqual(['goed, dank u wel'])
    expect(result.isThinSet).toBe(true)
  })

  it('computes the shortest-alternative token count across all forms', () => {
    const result = assessAnswerCoverage('rijden / gaan / lopen', ['te voet gaan'])
    // shortest is "rijden" (or "gaan"/"lopen") — 1 token
    expect(result.shortestAlternativeTokenCount).toBe(1)
    expect(result.isUnfairLength).toBe(false)
  })

  it('flags unfair-length when the SHORTEST alternative is >= N tokens, even with only one alternative', () => {
    const result = assessAnswerCoverage('hoe gaat het ermee', [])
    expect(result.shortestAlternativeTokenCount).toBe(4)
    expect(result.isUnfairLength).toBe(true)
    expect(result.isThinSet).toBe(true) // both can be true at once — distinct axes
  })

  it('is fair when at least one short alternative exists, even if others are long', () => {
    const result = assessAnswerCoverage('hoe gaat het ermee', ['hoi'])
    expect(result.shortestAlternativeTokenCount).toBe(1)
    expect(result.isUnfairLength).toBe(false)
  })

  it('respects a custom token threshold', () => {
    const result = assessAnswerCoverage('een twee drie', [], 3)
    expect(result.isUnfairLength).toBe(true)
    const notUnfair = assessAnswerCoverage('een twee drie', [], 4)
    expect(notUnfair.isUnfairLength).toBe(false)
  })

  it('handles an entirely empty answer set without throwing', () => {
    const result = assessAnswerCoverage('', [])
    expect(result.alternatives).toEqual([])
    expect(result.isThinSet).toBe(true)
    expect(result.shortestAlternativeTokenCount).toBe(0)
    expect(result.isUnfairLength).toBe(false)
  })
})
