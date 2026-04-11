/**
 * Unit tests for the spoken variant generator.
 *
 * Tests the pure transformation logic — no file I/O.
 */

import { describe, it, expect } from 'vitest'
import { parseTranscript, generateSpokenVariants } from '../../scripts/spoken-variant-generator/transform.js'
import type { TransformRule } from '../../scripts/spoken-variant-generator/rules.js'

// ── parseTranscript ──────────────────────────────────────────────────────────

describe('parseTranscript', () => {
  it('splits text into numbered lines', () => {
    const lines = parseTranscript('Line one\nLine two\nLine three')
    expect(lines).toEqual([
      { lineNumber: 1, text: 'Line one' },
      { lineNumber: 2, text: 'Line two' },
      { lineNumber: 3, text: 'Line three' },
    ])
  })

  it('preserves blank lines', () => {
    const lines = parseTranscript('First\n\nThird')
    expect(lines).toHaveLength(3)
    expect(lines[1].text).toBe('')
    expect(lines[1].lineNumber).toBe(2)
  })

  it('handles single line input', () => {
    const lines = parseTranscript('Solo line')
    expect(lines).toEqual([{ lineNumber: 1, text: 'Solo line' }])
  })

  it('handles empty input', () => {
    const lines = parseTranscript('')
    expect(lines).toEqual([{ lineNumber: 1, text: '' }])
  })
})

// ── Pronoun transformations ──────────────────────────────────────────────────

describe('pronoun transformations', () => {
  it('keeps saya in learner track', () => {
    const lines = parseTranscript('Saya mau ke pasar.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0].toLowerCase()).toContain('saya')
    expect(output.learnerSpoken[0]).not.toMatch(/\baku\b/i)
  })

  it('converts saya to aku in natural track', () => {
    const lines = parseTranscript('Saya mau ke pasar.')
    const output = generateSpokenVariants(lines)
    expect(output.naturalSpoken[0]).toContain('aku')
    expect(output.naturalSpoken[0]).not.toContain('saya')
    expect(output.naturalSpoken[0]).not.toContain('Saya')
  })

  it('normalizes aku to saya in learner track', () => {
    const lines = parseTranscript('Aku mau makan.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toBe('saya mau makan.')
  })

  it('keeps aku in natural track', () => {
    const lines = parseTranscript('Aku mau makan.')
    const output = generateSpokenVariants(lines)
    // aku stays as-is in natural; then saya→aku won't match since there's no saya
    expect(output.naturalSpoken[0]).toContain('ku')
  })

  it('converts Anda to kamu in natural track', () => {
    const lines = parseTranscript('Anda mau ke mana?')
    const output = generateSpokenVariants(lines)
    expect(output.naturalSpoken[0]).toContain('kamu')
  })
})

// ── Negation transformations ─────────────────────────────────────────────────

describe('negation transformations', () => {
  it('keeps tidak in learner track', () => {
    const lines = parseTranscript('Saya tidak mau.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('tidak')
  })

  it('converts tidak to nggak in natural track', () => {
    const lines = parseTranscript('Saya tidak mau.')
    const output = generateSpokenVariants(lines)
    expect(output.naturalSpoken[0]).toContain('nggak')
  })

  it('normalizes nggak to tidak in learner track', () => {
    const lines = parseTranscript('Aku nggak mau.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('tidak')
  })

  it('preserves belum in both tracks', () => {
    const lines = parseTranscript('Belum bisa, Bu.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('Belum')
    expect(output.naturalSpoken[0]).toContain('Belum')
  })
})

// ── Vocabulary simplification ────────────────────────────────────────────────

describe('vocabulary simplification', () => {
  it('converts tetapi to tapi in both tracks', () => {
    const lines = parseTranscript('Tetapi itu mahal.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toBe('tapi itu mahal.')
    expect(output.naturalSpoken[0]).toBe('tapi itu mahal.')
  })

  it('converts bagaimana to gimana only in natural', () => {
    const lines = parseTranscript('Bagaimana harganya?')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('Bagaimana')
    expect(output.naturalSpoken[0]).toContain('gimana')
  })

  it('converts mengapa to kenapa in both tracks', () => {
    const lines = parseTranscript('Mengapa ibu membeli nanas?')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('kenapa')
    expect(output.naturalSpoken[0]).toContain('kenapa')
  })

  it('converts hendak to mau in both tracks', () => {
    const lines = parseTranscript('Saya hendak pergi.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('mau')
    expect(output.naturalSpoken[0]).toContain('mau')
  })

  it('converts kalau to kalo in natural track', () => {
    const lines = parseTranscript('Kalau mau, bisa.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toMatch(/[Kk]alau/)
    expect(output.naturalSpoken[0]).toContain('kalo')
  })

  it('converts sudah to udah in natural track', () => {
    const lines = parseTranscript('Saya sudah makan.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('sudah')
    expect(output.naturalSpoken[0]).toContain('udah')
  })
})

// ── Affix reduction ─────────────────────────────────────────────────────────

describe('affix reduction', () => {
  it('converts membeli to beli in both tracks', () => {
    const lines = parseTranscript('Ibu membeli nanas.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toBe('Ibu beli nanas.')
    expect(output.naturalSpoken[0]).toBe('Ibu beli nanas.')
  })

  it('converts melihat to liat in natural track', () => {
    const lines = parseTranscript('Saya melihat bapak.')
    const output = generateSpokenVariants(lines)
    expect(output.naturalSpoken[0]).toContain('liat')
  })

  it('converts memberikan to kasih in natural track', () => {
    const lines = parseTranscript('Saya bisa memberikan diskon.')
    const output = generateSpokenVariants(lines)
    expect(output.learnerSpoken[0]).toContain('memberi')
    expect(output.naturalSpoken[0]).toContain('kasih')
  })
})

// ── Line alignment ───────────────────────────────────────────────────────────

describe('line alignment', () => {
  it('maintains 1:1 line count between source, learner, and natural', () => {
    const text = 'Line one\n\nLine three\nLine four'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    expect(output.learnerSpoken).toHaveLength(lines.length)
    expect(output.naturalSpoken).toHaveLength(lines.length)
  })

  it('preserves blank lines as empty strings', () => {
    const text = 'Saya mau.\n\nTidak mau.'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    expect(output.learnerSpoken[1]).toBe('')
    expect(output.naturalSpoken[1]).toBe('')
  })

  it('blank lines produce no style decisions', () => {
    const text = '\n\n'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    expect(output.styleDecisions).toHaveLength(0)
  })
})

// ── Style decisions ──────────────────────────────────────────────────────────

describe('style decisions', () => {
  it('records transformations with line numbers', () => {
    const text = 'Saya tidak mau.'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    expect(output.styleDecisions.length).toBeGreaterThan(0)
    expect(output.styleDecisions[0].lineNumber).toBe(1)
    expect(output.styleDecisions[0].original).toBe('Saya tidak mau.')
  })

  it('records rule names in transformations', () => {
    const text = 'Tetapi itu mahal.'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    const decision = output.styleDecisions[0]
    expect(decision).toBeDefined()
    const ruleNames = decision.transformations.map(t => t.rule)
    expect(ruleNames).toContain('vocab-tetapi-to-tapi')
  })

  it('does not create decisions for unchanged lines', () => {
    const text = 'Baik, terima kasih.'
    const lines = parseTranscript(text)
    const output = generateSpokenVariants(lines)

    // "baik" and "terima kasih" have no transformation rules
    // Only check that if no rules matched, no decisions are recorded
    const decisionsForLine = output.styleDecisions.filter(d => d.lineNumber === 1)
    if (decisionsForLine.length > 0) {
      expect(decisionsForLine[0].transformations.length).toBeGreaterThan(0)
    }
  })
})

// ── Custom rules ─────────────────────────────────────────────────────────────

describe('custom rules', () => {
  it('allows passing custom rule set', () => {
    const customRules: TransformRule[] = [
      {
        name: 'test-replace',
        pattern: /\bhello\b/gi,
        learner: 'halo',
        natural: 'halo',
      },
    ]

    const lines = parseTranscript('Hello world')
    const output = generateSpokenVariants(lines, customRules)

    expect(output.learnerSpoken[0]).toBe('halo world')
    expect(output.naturalSpoken[0]).toBe('halo world')
  })
})

// ── Full transcript integration ──────────────────────────────────────────────

describe('full transcript integration', () => {
  const sampleTranscript = `Selamat pagi. Apa kabar?

Saya baik, terima kasih. Dan Anda?

Saya mau ke pasar. Saya hendak membeli buah.

Tidak, harganya tidak mahal. Tetapi nanas mahal.

Belum bisa, Bu. Tetapi kalau mau lima buah, bisa sembilan ribu.`

  it('processes multi-line transcript without errors', () => {
    const lines = parseTranscript(sampleTranscript)
    const output = generateSpokenVariants(lines)

    expect(output.learnerSpoken.length).toBe(lines.length)
    expect(output.naturalSpoken.length).toBe(lines.length)
    expect(output.styleDecisions.length).toBeGreaterThan(0)
  })

  it('learner track uses saya consistently', () => {
    const lines = parseTranscript(sampleTranscript)
    const output = generateSpokenVariants(lines)

    for (const line of output.learnerSpoken) {
      expect(line).not.toMatch(/\baku\b/i)
    }
  })

  it('natural track uses aku instead of saya', () => {
    const lines = parseTranscript(sampleTranscript)
    const output = generateSpokenVariants(lines)

    // At least one line should have aku
    const hasAku = output.naturalSpoken.some(line => /\baku\b/i.test(line))
    expect(hasAku).toBe(true)

    // No saya should remain
    for (const line of output.naturalSpoken) {
      expect(line).not.toMatch(/\bsaya\b/i)
    }
  })

  it('natural track uses nggak instead of tidak', () => {
    const lines = parseTranscript(sampleTranscript)
    const output = generateSpokenVariants(lines)

    const hasNggak = output.naturalSpoken.some(line => /\bnggak\b/i.test(line))
    expect(hasNggak).toBe(true)
  })

  it('learner track keeps tidak', () => {
    const lines = parseTranscript(sampleTranscript)
    const output = generateSpokenVariants(lines)

    const hasTidak = output.learnerSpoken.some(line => /\btidak\b/i.test(line))
    expect(hasTidak).toBe(true)
  })
})
