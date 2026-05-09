import { describe, it, expect } from 'vitest'
import { validateSectionType } from '../../validators/sectionType'

describe('validateSectionType (GT5) — type discriminator', () => {
  it('rejects sections without a content.type value', () => {
    const findings = validateSectionType([
      { id: 's1', content: { paragraphs: ['halo'] } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT5')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/missing content\.type/i)
  })

  it('rejects unknown content.type values with a clear message', () => {
    const findings = validateSectionType([
      { id: 's1', content: { type: 'glossary', items: [] } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT5')
    expect(findings[0].message).toMatch(/glossary/)
    expect(findings[0].message).toMatch(/canonical/i)
  })

  it('accepts every canonical type when sub-shape is satisfied', () => {
    const findings = validateSectionType([
      { id: 'a', content: { type: 'text', paragraphs: ['halo'] } },
      { id: 'b', content: { type: 'grammar', grammar_topics: ['ada'] } },
      { id: 'c', content: { type: 'reference_table', grammar_topics: ['pronouns'] } },
      { id: 'd', content: { type: 'vocabulary', items: [{ indonesian: 'halo', dutch: 'hallo' }] } },
      { id: 'e', content: { type: 'expressions', items: [{ indonesian: 'apa kabar', dutch: 'hoe gaat het' }] } },
      { id: 'f', content: { type: 'numbers', items: [{ indonesian: 'satu', dutch: 'een' }] } },
      { id: 'g', content: { type: 'dialogue', lines: [{ text: 'halo', speaker: 'A' }] } },
      { id: 'h', content: { type: 'pronunciation', letters: [{ letter: 'c', rule: 'ts', examples: ['cara'] }] } },
      { id: 'i', content: { type: 'culture', paragraphs: ['halo'] } },
      { id: 'j', content: { type: 'exercises', exercises: [{ title: 'q1', type: 'mcq' }] } },
    ])
    expect(findings).toEqual([])
  })
})

describe('validateSectionType — per-type sub-shape rules', () => {
  describe('text', () => {
    it('accepts paragraphs[]', () => {
      expect(validateSectionType([{ id: 's', content: { type: 'text', paragraphs: ['p1'] } }])).toEqual([])
    })
    it('accepts legacy lessons 1–3 shapes (intro / sentences / examples / spelling)', () => {
      expect(validateSectionType([
        { id: 'a', content: { type: 'text', intro: 'i' } },
        { id: 'b', content: { type: 'text', sentences: ['s'] } },
        { id: 'c', content: { type: 'text', examples: ['e'] } },
        { id: 'd', content: { type: 'text', spelling: ['x'] } },
      ])).toEqual([])
    })
    it('rejects empty text section (no paragraphs and no legacy fallback)', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'text' } }])
      expect(findings).toHaveLength(1)
      expect(findings[0].gate).toBe('GT5')
    })
  })

  describe('grammar', () => {
    // GT1 owns the grammar_topics rule. GT5 only checks the type is canonical.
    it('accepts when grammar_topics is present (GT1 enforces non-empty)', () => {
      expect(validateSectionType([{ id: 's', content: { type: 'grammar', grammar_topics: ['x'] } }])).toEqual([])
    })
  })

  describe('vocabulary', () => {
    it('rejects when items is missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'vocabulary' } }])
      expect(findings).toHaveLength(1)
    })
    it('rejects when items is empty', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'vocabulary', items: [] } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('expressions', () => {
    it('rejects when items[] missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'expressions' } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('numbers', () => {
    it('rejects when items[] missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'numbers' } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('dialogue', () => {
    it('rejects when lines[] missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'dialogue' } }])
      expect(findings).toHaveLength(1)
    })
    it('rejects when lines[] is empty', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'dialogue', lines: [] } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('pronunciation', () => {
    it('rejects when letters[] missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'pronunciation' } }])
      expect(findings).toHaveLength(1)
    })
    it('rejects when letters[] is empty', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'pronunciation', letters: [] } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('culture', () => {
    // No sub-shape requirement in Phase 1 (no culture sections in staging today).
    it('accepts any shape — Phase 1 reserves the type', () => {
      expect(validateSectionType([{ id: 's', content: { type: 'culture' } }])).toEqual([])
      expect(validateSectionType([{ id: 's', content: { type: 'culture', paragraphs: ['p'] } }])).toEqual([])
    })
  })

  describe('exercises', () => {
    it('rejects when exercises[] missing', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'exercises' } }])
      expect(findings).toHaveLength(1)
    })
    it('rejects when exercises[] is empty', () => {
      const findings = validateSectionType([{ id: 's', content: { type: 'exercises', exercises: [] } }])
      expect(findings).toHaveLength(1)
    })
  })

  describe('reference_table', () => {
    // GT1 owns the grammar_topics rule. GT5 only checks the type is canonical.
    it('accepts when type is canonical (sub-shape is permissive)', () => {
      expect(validateSectionType([{ id: 's', content: { type: 'reference_table', grammar_topics: ['x'] } }])).toEqual([])
    })
  })
})
