import { describe, it, expect } from 'vitest'
import { extractGrammarClaims } from '../grammarClaims'

const section = {
  title: 'Werkwoord',
  content: {
    type: 'grammar',
    categories: [
      {
        title: 'Werkwoord',
        rules: ['Zinnen zonder werkwoord zijn gewoon.', 'Werkwoorden worden niet vervoegd.'],
        examples: [
          { indonesian: 'Itu mahal', dutch: 'Dat is duur', note: 'geen koppelwerkwoord' },
          { indonesian: 'Saya beli buah', dutch: 'Ik koop een vrucht' },
        ],
        note: 'Tenzij context anders blijkt: tegenwoordige tijd.',
      },
    ],
  },
}

describe('extractGrammarClaims', () => {
  it('emits one claim per rule, carrying topic + examples', () => {
    const { claims } = extractGrammarClaims(1, [section])
    const rules = claims.filter((c) => c.kind === 'rule')
    expect(rules).toHaveLength(2)
    expect(rules[0]).toMatchObject({ topic: 'Werkwoord', text: 'Zinnen zonder werkwoord zijn gewoon.' })
    expect(rules[0].examples).toHaveLength(2)
    expect(rules[0].examples[0]).toEqual({ indonesian: 'Itu mahal', gloss: 'Dat is duur', note: 'geen koppelwerkwoord' })
  })

  it('emits a note claim (exceptions are verifiable too) — nothing dropped', () => {
    const { claims } = extractGrammarClaims(1, [section])
    expect(claims.filter((c) => c.kind === 'note')).toHaveLength(1)
    expect(claims.find((c) => c.kind === 'note')!.text).toContain('tegenwoordige tijd')
  })

  it('emits one claim per table row', () => {
    const { claims } = extractGrammarClaims(15, [
      { title: 'ME-vorm', content: { type: 'grammar', categories: [{ title: 'Schema', table: [['mem-', 'b/f', 'membeli → beli'], ['men-', 'c/d/j', 'mencuci → cuci']] }] } },
    ])
    const table = claims.filter((c) => c.kind === 'table')
    expect(table).toHaveLength(2)
    expect(table[0].text).toBe('mem- — b/f — membeli → beli')
  })

  it('captures top-level word_order and intro as claims', () => {
    const { claims } = extractGrammarClaims(2, [
      { title: 'Zinsbouw', content: { type: 'grammar', intro: 'Indonesisch is SVO.', word_order: 'Agens — werkwoord — patiens', categories: [] } },
    ])
    expect(claims.find((c) => c.kind === 'intro')!.text).toBe('Indonesisch is SVO.')
    expect(claims.find((c) => c.kind === 'word_order')!.text).toBe('Agens — werkwoord — patiens')
  })

  it('WARNS on an unknown grammar field shape (no silent drop)', () => {
    const { warnings } = extractGrammarClaims(1, [
      { title: 'X', content: { type: 'grammar', categories: [{ title: 'X', rules: ['r'], surprise_field: 'unhandled' }] } },
    ])
    expect(warnings.some((w) => w.includes('surprise_field'))).toBe(true)
  })

  it('produces stable, unique claimIds', () => {
    const { claims } = extractGrammarClaims(1, [section])
    const ids = claims.map((c) => c.claimId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('L1-'))).toBe(true)
  })
})
