import { describe, it, expect } from 'vitest'
import { validatePerItem } from '../../validators/perItem'

describe('validatePerItem (GT6) — vocabulary/expressions/numbers display fields', () => {
  it.each(['vocabulary', 'expressions', 'numbers'] as const)(
    '%s: accepts items with indonesian + dutch (no errors; warnings allowed)',
    (type) => {
      const findings = validatePerItem([
        { id: 's1', content: { type, items: [{ indonesian: 'halo', dutch: 'hallo' }] } },
      ])
      expect(findings.filter((f) => f.severity === 'error')).toEqual([])
    },
  )

  it('vocabulary: accepts items with indonesian + english only (no errors; warnings allowed)', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ indonesian: 'halo', english: 'hello' }] } },
    ])
    expect(findings.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('vocabulary: rejects item missing indonesian', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ dutch: 'hallo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('indonesian'))).toBe(true)
  })

  it('vocabulary: rejects item with empty indonesian', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ indonesian: '   ', dutch: 'hallo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'error')).toBe(true)
  })

  it('vocabulary: rejects item with neither dutch nor english', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.match(/dutch|english/i))).toBe(true)
  })

  it('warns when pos is missing on a vocabulary item (Stage-B-only enrichment)', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ indonesian: 'halo', dutch: 'hallo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'warning' && f.message.includes('pos'))).toBe(true)
  })

  it('warns when level is missing on a vocabulary item (Stage-B-only enrichment)', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'vocabulary', items: [{ indonesian: 'halo', dutch: 'hallo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'warning' && f.message.includes('level'))).toBe(true)
  })

  it('does not warn when pos+level are present', () => {
    const findings = validatePerItem([
      {
        id: 's1',
        content: {
          type: 'vocabulary',
          items: [{ indonesian: 'halo', dutch: 'hallo', pos: 'greeting', level: 'A1' }],
        },
      },
    ])
    expect(findings.filter((f) => f.severity === 'warning')).toEqual([])
  })
})

describe('validatePerItem (GT6) — dialogue line display fields', () => {
  it('accepts a line with text + speaker', () => {
    expect(
      validatePerItem([
        {
          id: 's1',
          content: {
            type: 'dialogue',
            lines: [{ text: 'Halo', speaker: 'Andi', translation: 'Hallo' }],
          },
        },
      ]),
    ).toEqual([])
  })

  it('rejects a line missing text', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'dialogue', lines: [{ speaker: 'Andi' }] } },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('text'))).toBe(true)
  })

  it('rejects a line missing speaker', () => {
    const findings = validatePerItem([
      { id: 's1', content: { type: 'dialogue', lines: [{ text: 'Halo' }] } },
    ])
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('speaker'))).toBe(true)
  })

  it('warns when translation is empty (Stage-B-only enrichment)', () => {
    const findings = validatePerItem([
      {
        id: 's1',
        content: {
          type: 'dialogue',
          lines: [{ text: 'Halo', speaker: 'Andi', translation: '' }],
        },
      },
    ])
    expect(findings.some((f) => f.severity === 'warning' && f.message.includes('translation'))).toBe(true)
  })

  it('does not warn when translation is present', () => {
    const findings = validatePerItem([
      {
        id: 's1',
        content: {
          type: 'dialogue',
          lines: [{ text: 'Halo', speaker: 'Andi', translation: 'Hallo' }],
        },
      },
    ])
    expect(findings.filter((f) => f.severity === 'warning')).toEqual([])
  })
})

describe('validatePerItem — non-item types are skipped', () => {
  it('text/grammar/reference_table/pronunciation/culture/exercises sections produce no findings', () => {
    const findings = validatePerItem([
      { id: 'a', content: { type: 'text', paragraphs: ['p'] } },
      { id: 'b', content: { type: 'grammar', grammar_topics: ['x'] } },
      { id: 'c', content: { type: 'reference_table' } },
      { id: 'd', content: { type: 'pronunciation', letters: [] } },
      { id: 'e', content: { type: 'culture' } },
      { id: 'f', content: { type: 'exercises', exercises: [] } },
    ])
    expect(findings).toEqual([])
  })
})
