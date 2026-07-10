import { describe, it, expect } from 'vitest'
import {
  tokenize,
  computeEditFootprint,
  classifyEditFootprint,
  classifyProduceAnswerFreedom,
} from '../lib/produceAnswerFreedom'

describe('tokenize', () => {
  it('lowercases, strips punctuation, and splits on whitespace', () => {
    expect(tokenize('Saya pergi ke pasar.')).toEqual(['saya', 'pergi', 'ke', 'pasar'])
  })

  it('collapses repeated whitespace and trims', () => {
    expect(tokenize('  Saya   pergi  ')).toEqual(['saya', 'pergi'])
  })

  it('returns an empty array for an empty/punctuation-only string', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('...')).toEqual([])
  })
})

describe('computeEditFootprint + classifyEditFootprint — sentence_transformation shape (same-language)', () => {
  it('single insertion (e.g. inserting "sedang") -> single_element', () => {
    const fp = computeEditFootprint('Saya pergi ke pasar', 'Saya sedang pergi ke pasar')
    expect(fp).toEqual({ sourceTokenCount: 4, answerTokenCount: 5, matchedTokenCount: 4, spanCount: 1 })
    expect(classifyEditFootprint(fp)).toBe('single_element')
  })

  it('single verb-form swap -> single_element', () => {
    const fp = computeEditFootprint('Dia membeli buku itu', 'Dia membelikan buku itu')
    expect(fp.spanCount).toBe(1)
    expect(classifyEditFootprint(fp)).toBe('single_element')
  })

  it('identical prompt/answer (spanCount 0) classifies single_element (HC35 territory, not this classifier)', () => {
    const fp = computeEditFootprint('Saya pergi ke pasar', 'Saya pergi ke pasar')
    expect(fp.spanCount).toBe(0)
    expect(classifyEditFootprint(fp)).toBe('single_element')
  })

  it('a reordering (word moved from end to start) produces >=2 spans -> multi_answer_free', () => {
    const fp = computeEditFootprint('Saya pergi ke pasar besok', 'Besok saya pergi ke pasar')
    expect(fp.spanCount).toBeGreaterThanOrEqual(2)
    expect(classifyEditFootprint(fp)).toBe('multi_answer_free')
  })

  it('two independent, non-adjacent edits -> multi_answer_free (multi-span)', () => {
    const fp = computeEditFootprint('Saya makan nasi di rumah', 'Kami makan nasi di kantor')
    expect(fp.spanCount).toBe(2)
    expect(classifyEditFootprint(fp)).toBe('multi_answer_free')
  })
})

describe('computeEditFootprint + classifyEditFootprint — constrained_translation shape (cross-language)', () => {
  it('zero shared tokens (typical Dutch source vs Indonesian answer) -> multi_answer_free', () => {
    const fp = computeEditFootprint('Ik ga naar de markt', 'Saya pergi ke pasar')
    expect(fp.matchedTokenCount).toBe(0)
    expect(classifyEditFootprint(fp)).toBe('multi_answer_free')
  })

  it('one shared anchor token (a proper noun) amid an otherwise cross-language sentence -> multi_answer_free (ratio guard)', () => {
    const fp = computeEditFootprint('Ik ga naar Jakarta', 'Saya pergi ke Jakarta')
    expect(fp.matchedTokenCount).toBe(1)
    expect(fp.spanCount).toBe(1)
    // matchedRatio = 1/4 = 0.25 < 0.5 floor -> multi_answer_free despite spanCount===1
    expect(classifyEditFootprint(fp)).toBe('multi_answer_free')
  })

  it('a short answer that is mostly shared/cognate tokens can still read single_element', () => {
    const fp = computeEditFootprint('lima', 'lima')
    expect(classifyEditFootprint(fp)).toBe('single_element')
  })
})

describe('classifyProduceAnswerFreedom (convenience wrapper)', () => {
  it('returns both the footprint and the classification', () => {
    const result = classifyProduceAnswerFreedom('Saya pergi ke pasar', 'Saya sedang pergi ke pasar')
    expect(result.classification).toBe('single_element')
    expect(result.footprint.spanCount).toBe(1)
  })
})
