import { describe, it, expect } from 'vitest'
import {
  collectEnNeeds,
  applyEnTranslations,
  enrichMissingEnContent,
  type EnNeed,
} from '../enrichEnTranslations'

function sections() {
  return [
    {
      order_index: 0,
      content: {
        type: 'vocabulary',
        items: [
          { indonesian: 'kaki', dutch: 'voet' },
          { indonesian: 'obat', dutch: 'medicijn', english: 'medicine' }, // already has EN
        ],
      },
    },
    {
      order_index: 1,
      content: {
        type: 'dialogue',
        lines: [
          { speaker: 'Dokter', text: 'Ada apa?', translation: 'Wat is er?' },
          { speaker: 'Tina', text: 'Sakit.', translation: 'Pijn.', translation_en: 'It hurts.' }, // has EN
        ],
      },
    },
    {
      order_index: 2,
      content: {
        type: 'grammar',
        categories: [
          {
            title: 'Volgorde A-B-C',
            rules: ['A komt eerst.', 'C is altijd nodig.'],
            examples: [{ indonesian: 'Saya datang.', dutch: 'Ik kom.' }],
          },
          {
            title: 'Woorden per groep', // reference grid (no rules) — title + examples still need EN
            table: [['A', 'B', 'C']],
            examples: [{ indonesian: 'Jam lima', dutch: 'Vijf uur' }],
          },
        ],
        grammar_topics: ['Werkwoordvolgorde'],
      },
    },
  ]
}

describe('collectEnNeeds', () => {
  it('collects items/dialogue/grammar needing EN; skips already-translated, but still collects a table-only category title', () => {
    const needs = collectEnNeeds(sections())
    const keys = needs.map((n) => n.key).sort()
    expect(keys).toEqual(
      [
        '0|item|0', // kaki — needs EN (obat already has it)
        '1|line|0', // Ada apa? — needs EN (Sakit already has it)
        '2|cat|0|ex|0', // example
        '2|cat|0|rule|0',
        '2|cat|0|rule|1',
        '2|cat|0|title',
        '2|cat|1|title', // reference grid — its title still surfaces in the reader/EN briefing
        '2|cat|1|ex|0', // reference grid — its example glosses also surface and need EN
      ].sort(),
    )
    // reference grid index 1 contributes its title + examples (no rules to feed a capability)
    expect(needs.filter((n) => n.key.startsWith('2|cat|1')).map((n) => n.key).sort()).toEqual(
      ['2|cat|1|ex|0', '2|cat|1|title'],
    )
  })

  it('carries indonesian + dutch for items/examples/dialogue and dutch-only for titles/rules', () => {
    const needs = collectEnNeeds(sections())
    const byKey = new Map<string, EnNeed>(needs.map((n) => [n.key, n]))
    expect(byKey.get('0|item|0')).toMatchObject({ indonesian: 'kaki', dutch: 'voet' })
    expect(byKey.get('1|line|0')).toMatchObject({ indonesian: 'Ada apa?', dutch: 'Wat is er?' })
    expect(byKey.get('2|cat|0|ex|0')).toMatchObject({ indonesian: 'Saya datang.', dutch: 'Ik kom.' })
    expect(byKey.get('2|cat|0|title')?.dutch).toBe('Volgorde A-B-C')
    expect(byKey.get('2|cat|0|title')?.indonesian).toBeUndefined()
    expect(byKey.get('2|cat|0|rule|1')?.dutch).toBe('C is altijd nodig.')
  })
})

describe('applyEnTranslations', () => {
  it('writes english/translation_en/title_en/rules_en/examples.english in place', () => {
    const secs = sections()
    const byKey = new Map<string, string>([
      ['0|item|0', 'foot'],
      ['1|line|0', "What's wrong?"],
      ['2|cat|0|title', 'A-B-C order'],
      ['2|cat|0|rule|0', 'A comes first.'],
      ['2|cat|0|rule|1', 'C is always required.'],
      ['2|cat|0|ex|0', 'I am coming.'],
    ])
    const counts = applyEnTranslations(secs, byKey)

    const items = secs[0].content.items as Array<Record<string, unknown>>
    expect(items[0].english).toBe('foot')
    expect(items[1].english).toBe('medicine') // untouched

    const lines = secs[1].content.lines as Array<Record<string, unknown>>
    expect(lines[0].translation_en).toBe("What's wrong?")
    expect(lines[1].translation_en).toBe('It hurts.') // untouched

    const cats = secs[2].content.categories as Array<Record<string, unknown>>
    expect(cats[0].title_en).toBe('A-B-C order')
    expect(cats[0].rules_en).toEqual(['A comes first.', 'C is always required.'])
    expect((cats[0].examples as Array<Record<string, unknown>>)[0].english).toBe('I am coming.')
    // table-only category gets no EN fields
    expect(cats[1].title_en).toBeUndefined()

    expect(counts).toEqual({ items: 1, dialogueLines: 1, grammarCategories: 1 })
  })
})

describe('enrichMissingEnContent', () => {
  it('collects, translates via the injected translator, and applies', async () => {
    const secs = sections()
    const translate = async (needs: EnNeed[]) => {
      const m = new Map<string, string>()
      for (const n of needs) m.set(n.key, `EN:${n.indonesian ?? n.dutch}`)
      return m
    }
    const result = await enrichMissingEnContent(secs, translate)
    expect(result.needed).toBe(8) // +2: the reference grid's title and its example
    expect(result.filled.items).toBe(1)
    expect(result.filled.dialogueLines).toBe(1)
    expect(result.filled.grammarCategories).toBe(2) // rule-bearing cat + the reference grid (title+example)
    const items = secs[0].content.items as Array<Record<string, unknown>>
    expect(items[0].english).toBe('EN:kaki')
  })

  it('no-ops with an empty translator result (e.g. no API key)', async () => {
    const secs = sections()
    const translate = async () => new Map<string, string>()
    const result = await enrichMissingEnContent(secs, translate)
    expect(result.filled).toEqual({ items: 0, dialogueLines: 0, grammarCategories: 0 })
  })

  it('returns zero-needed without calling the translator when everything has EN', async () => {
    const secs = [
      { order_index: 0, content: { type: 'vocabulary', items: [{ indonesian: 'a', dutch: 'b', english: 'c' }] } },
    ]
    let called = false
    const translate = async (needs: EnNeed[]) => {
      called = true
      return new Map(needs.map((n) => [n.key, 'x']))
    }
    const result = await enrichMissingEnContent(secs, translate)
    expect(called).toBe(false)
    expect(result.needed).toBe(0)
  })
})
