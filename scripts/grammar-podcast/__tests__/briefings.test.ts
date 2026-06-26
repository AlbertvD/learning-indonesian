import { describe, it, expect } from 'vitest'
import { buildBriefings } from '../briefings'

const meta = { lesson: 1, title: 'Di Pasar', level: 'A1' }

const sections = [
  {
    title: 'Grammatica',
    content: {
      type: 'grammar',
      categories: [
        {
          title: 'Werkwoord',
          title_en: 'Verbs',
          rules: ['Werkwoorden worden niet vervoegd.'],
          rules_en: ['Verbs are not conjugated.'],
          examples: [{ indonesian: 'Saya beli buah', dutch: 'Ik koop een vrucht' }],
          note: 'Default tegenwoordige tijd.',
        },
      ],
    },
  },
]

describe('buildBriefings', () => {
  it('NL briefing carries Dutch rules + Indonesian examples with Dutch glosses', () => {
    const { nl } = buildBriefings(meta, sections)
    expect(nl).toContain('Niveau: A1 (ERK)')
    expect(nl).toContain('Werkwoorden worden niet vervoegd.')
    expect(nl).toContain('Saya beli buah — Ik koop een vrucht')
  })

  it('EN briefing uses rules_en + bare Indonesian examples — NO Dutch leaks in', () => {
    const { en } = buildBriefings(meta, sections)
    expect(en).toContain('Level: CEFR A1')
    expect(en).toContain('Verbs are not conjugated.')
    expect(en).toContain('Saya beli buah')
    expect(en).not.toContain('Ik koop een vrucht') // the Dutch gloss must not appear
    expect(en).not.toContain('niet vervoegd') // the Dutch rule must not appear
  })

  it('returns the topic list (the output-gate coverage checklist)', () => {
    const { topics } = buildBriefings(meta, sections)
    expect(topics).toEqual(['Werkwoord'])
  })

  it('WARNS when a category lacks rules_en (omitted from EN, not leaked as Dutch)', () => {
    const { en, warnings } = buildBriefings(meta, [
      { title: 'G', content: { type: 'grammar', categories: [{ title: 'Bijwoord', rules: ['NL regel'], examples: [] }] } },
    ])
    expect(warnings.some((w) => w.includes('no rules_en'))).toBe(true)
    expect(en).not.toContain('NL regel')
  })

  it('warns on an empty grammar set', () => {
    const { warnings } = buildBriefings(meta, [{ title: 'G', content: { type: 'grammar', categories: [] } }])
    expect(warnings.some((w) => w.includes('no grammar categories'))).toBe(true)
  })
})
