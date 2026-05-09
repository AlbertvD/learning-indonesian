import { describe, it, expect } from 'vitest'
import { validateGrammarTopics } from '../../validators/grammarTopics'

describe('validateGrammarTopics (GT1)', () => {
  it('a) accepts grammar section with non-empty grammar_topics', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'grammar', grammar_topics: ['ada', 'subject pronouns'] } },
    ])
    expect(findings).toEqual([])
  })

  it('b) rejects grammar section with missing grammar_topics', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'grammar' } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT1')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].context?.sectionId).toBe('s1')
  })

  it('c) rejects grammar section with empty grammar_topics array', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'grammar', grammar_topics: [] } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT1')
  })

  it('d) rejects grammar section whose grammar_topics contain only whitespace', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'grammar', grammar_topics: ['   ', '\t', ''] } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT1')
  })

  it('e) rejects grammar section whose entries carry the "grammar:" or "grammatica:" prefix', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'grammar', grammar_topics: ['grammar: ada'] } },
      { id: 's2', content: { type: 'grammar', grammar_topics: ['Grammatica: subject pronouns'] } },
    ])
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.gate === 'GT1')).toBe(true)
  })

  it('f) reference_table sections follow the same rules', () => {
    const ok = validateGrammarTopics([
      { id: 's1', content: { type: 'reference_table', grammar_topics: ['pronouns'] } },
    ])
    expect(ok).toEqual([])

    const bad = validateGrammarTopics([
      { id: 's2', content: { type: 'reference_table' } },
    ])
    expect(bad).toHaveLength(1)
    expect(bad[0].gate).toBe('GT1')
  })

  it('g) non-grammar sections are exempt — no findings', () => {
    const findings = validateGrammarTopics([
      { id: 's1', content: { type: 'text', paragraphs: ['halo'] } },
      { id: 's2', content: { type: 'vocabulary', items: [] } },
      { id: 's3', content: { type: 'dialogue', lines: [] } },
    ])
    expect(findings).toEqual([])
  })
})
