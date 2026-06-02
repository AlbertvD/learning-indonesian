import { describe, it, expect } from 'vitest'
import {
  validateItemSeparatorConvention,
} from '../../validators/itemSeparatorConvention'

function item(overrides: Partial<{ base_text: string; item_type: string; translation_nl: string | null }> = {}) {
  return { base_text: 'x', item_type: 'word', translation_nl: 'boek', ...overrides }
}

describe('validateItemSeparatorConvention — CS19', () => {
  it('errors on a Dutch translation_nl using ";" as an alternatives separator', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'bapak', translation_nl: 'vader; meneer' }),
    ])
    expect(findings.some((f) => f.gate === 'CS19' && f.severity === 'error')).toBe(true)
  })

  it('errors on a Dutch translation_nl using comma-as-OR (short segments)', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'bapak', translation_nl: 'vader, meneer, u' }),
    ])
    expect(findings.some((f) => f.gate === 'CS19' && f.severity === 'error')).toBe(true)
  })

  it('passes a canonical "/"-separated Dutch translation', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'huis', translation_nl: 'huis / woning' }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('passes a single Dutch clause that merely contains an internal comma (>=4 tokens)', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'idee', translation_nl: 'ja, dat is een goed idee' }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('does NOT check sentence / dialogue_chunk items — their translations are full clauses', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'a long line', item_type: 'dialogue_chunk', translation_nl: 'Ja, ik kom; tot straks' }),
      item({ base_text: 'an example', item_type: 'sentence', translation_nl: 'Hier, daar; overal' }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('respects the exemption denylist for a legitimate comma-bearing Dutch meaning', () => {
    const exempt = new Set(['ja, hoor'])
    const findings = validateItemSeparatorConvention(
      [item({ base_text: 'jahoor', translation_nl: 'ja, hoor' })],
      [],
      exempt,
    )
    expect(findings).toHaveLength(0)
  })

  it('skips items with no translation_nl (CS4b owns missing-translation)', () => {
    const findings = validateItemSeparatorConvention([
      item({ base_text: 'leeg', translation_nl: null }),
    ])
    expect(findings).toHaveLength(0)
  })

  it('warns (never errors) on an Indonesian-side answer using ";"', () => {
    const findings = validateItemSeparatorConvention(
      [],
      [{ itemRef: 'makan', value: 'makan; santap' }],
    )
    expect(findings.some((f) => f.gate === 'CS19' && f.severity === 'warning')).toBe(true)
    expect(findings.some((f) => f.severity === 'error')).toBe(false)
  })

  it('does NOT flag an Indonesian verbless comma segment (verbless equatives are normal)', () => {
    const findings = validateItemSeparatorConvention(
      [],
      [{ itemRef: 'guru', value: 'dia guru, saya guru' }],
    )
    expect(findings).toHaveLength(0)
  })
})
