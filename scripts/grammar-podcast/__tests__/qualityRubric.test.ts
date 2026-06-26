import { describe, it, expect } from 'vitest'
import { buildGradingPrompt, evaluate, type GateInput, type RubricVerdict } from '../qualityRubric'

const input: GateInput = { lesson: 1, lang: 'nl', level: 'A1', topics: ['Werkwoord', 'Zelfstandig naamwoord'] }

function verdict(over: Partial<RubricVerdict> = {}): RubricVerdict {
  const ok = { pass: true, note: '' }
  return {
    branding: { ...ok },
    noForeignNames: { ...ok },
    language: { ...ok },
    coverage: { pass: true, missingTopics: [], note: '' },
    detail: { ...ok },
    levelAppropriate: { ...ok },
    summary: 'ok',
    ...over,
  }
}

describe('buildGradingPrompt', () => {
  it('names the brand, the language, the level and the topic checklist', () => {
    const p = buildGradingPrompt(input)
    expect(p).toContain('Kamoe Bisa')
    expect(p).toContain('Dutch')
    expect(p).toContain('CEFR level A1')
    expect(p).toContain('"Werkwoord"')
    expect(p).toContain('"Zelfstandig naamwoord"')
  })

  it('says English for an EN episode', () => {
    expect(buildGradingPrompt({ ...input, lang: 'en' })).toContain('English')
  })
})

describe('evaluate', () => {
  it('passes when every check passes', () => {
    const r = evaluate(input, verdict())
    expect(r.pass).toBe(true)
    expect(r.failures).toEqual([])
  })

  it('fails on a wrong-name (noForeignNames) episode', () => {
    const r = evaluate(input, verdict({ noForeignNames: { pass: false, note: 'said "Deep Dive"' } }))
    expect(r.pass).toBe(false)
    expect(r.failures).toContain('noForeignNames')
  })

  it('fails when the EN episode drifts language', () => {
    const r = evaluate({ ...input, lang: 'en' }, verdict({ language: { pass: false, note: 'spoke Dutch' } }))
    expect(r.failures).toContain('language')
  })

  it('fails coverage and reports the missing topic', () => {
    const v = verdict({ coverage: { pass: false, missingTopics: ['Zelfstandig naamwoord'], note: 'skipped nouns' } })
    const r = evaluate(input, v)
    expect(r.failures).toContain('coverage')
    expect(r.verdict.coverage.missingTopics).toEqual(['Zelfstandig naamwoord'])
  })

  it('derives overall pass from the checks, not a model-supplied overall', () => {
    const r = evaluate(input, verdict({ levelAppropriate: { pass: false, note: 'taught B1 affixes' } }))
    expect(r.pass).toBe(false)
    expect(r.failures).toEqual(['levelAppropriate'])
  })
})
