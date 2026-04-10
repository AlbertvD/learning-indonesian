/**
 * buildSections.test.ts
 *
 * Unit tests for the logic in build-sections.ts.
 * Tests the section filtering logic, content type detection, and the
 * structured output shape that Claude is expected to return.
 *
 * Claude API calls are NOT made in these tests — we test the pure logic only.
 */

import { describe, it, expect } from 'vitest'

// ── Inline the pure logic from build-sections.ts ──────────────────────────────
// These functions are extracted here to avoid importing a Bun-only CLI script
// into a Vitest environment. If they are extracted to a lib file in the future,
// update these imports.

type SectionContent = Record<string, unknown>

function isRawSection(content: SectionContent): boolean {
  return typeof content.body === 'string' && (content.body as string).trim().length > 0
}

function isGrammarSection(content: SectionContent): boolean {
  return content.type === 'grammar' || content.type === 'reference_table'
}

function isExercisesSection(content: SectionContent): boolean {
  return content.type === 'exercises'
}

function needsStructuring(content: SectionContent): boolean {
  return isRawSection(content) && (isGrammarSection(content) || isExercisesSection(content))
}

// ── Fixture data ──────────────────────────────────────────────────────────────

const rawGrammarSection = {
  title: 'Grammatica: YANG',
  order_index: 1,
  content: {
    type: 'grammar',
    body: 'Yang als betrekkelijk voornaamwoord. Voorbeeld: Pisang yang terlalu tua tidak enak.',
  },
}

const rawExercisesSection = {
  title: 'Oefeningen',
  order_index: 2,
  content: {
    type: 'exercises',
    body: 'Oefening I. Vertaal: 1. Het grote huis. → Rumah yang besar',
  },
}

const structuredGrammarSection = {
  title: 'Grammatica: NYA',
  order_index: 4,
  content: {
    type: 'grammar',
    categories: [
      {
        title: '-nya als bezittelijk achtervoegsel',
        rules: ['-nya achter een zelfstandig naamwoord = bezittelijk voornaamwoord.'],
        examples: [{ indonesian: 'Sepedanya hitam', dutch: 'Zijn/haar fiets is zwart' }],
      },
    ],
  },
}

const vocabularySection = {
  title: 'Woordenlijst',
  order_index: 0,
  content: {
    type: 'vocabulary',
    items: [{ indonesian: 'air', dutch: 'water' }],
  },
}

const rawReferenceTableSection = {
  title: 'Referentietabel',
  order_index: 3,
  content: {
    type: 'reference_table',
    body: 'Hari Senin = maandag\nHari Selasa = dinsdag',
  },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('build-sections: section detection', () => {
  it('identifies raw grammar sections that need structuring', () => {
    const content = rawGrammarSection.content as SectionContent
    expect(isRawSection(content)).toBe(true)
    expect(isGrammarSection(content)).toBe(true)
    expect(needsStructuring(content)).toBe(true)
  })

  it('identifies raw exercises sections that need structuring', () => {
    const content = rawExercisesSection.content as SectionContent
    expect(isRawSection(content)).toBe(true)
    expect(isExercisesSection(content)).toBe(true)
    expect(needsStructuring(content)).toBe(true)
  })

  it('identifies raw reference_table sections as grammar-type', () => {
    const content = rawReferenceTableSection.content as SectionContent
    expect(isGrammarSection(content)).toBe(true)
    expect(needsStructuring(content)).toBe(true)
  })

  it('does not flag vocabulary sections for structuring', () => {
    const content = vocabularySection.content as SectionContent
    expect(needsStructuring(content)).toBe(false)
  })

  it('does not flag already-structured grammar sections', () => {
    const content = structuredGrammarSection.content as SectionContent
    expect(isRawSection(content)).toBe(false)
    expect(needsStructuring(content)).toBe(false)
  })

  it('does not flag sections with empty body', () => {
    const content: SectionContent = { type: 'grammar', body: '   ' }
    expect(isRawSection(content)).toBe(false)
    expect(needsStructuring(content)).toBe(false)
  })

  it('does not flag sections without body field', () => {
    const content: SectionContent = { type: 'grammar' }
    expect(isRawSection(content)).toBe(false)
    expect(needsStructuring(content)).toBe(false)
  })
})

describe('build-sections: structured grammar output shape', () => {
  it('validates grammar output has categories array', () => {
    const output = structuredGrammarSection.content
    expect(output.type).toBe('grammar')
    expect(Array.isArray(output.categories)).toBe(true)
    expect(output.categories.length).toBeGreaterThan(0)
  })

  it('validates each category has expected fields', () => {
    const category = structuredGrammarSection.content.categories[0]
    expect(typeof category.title).toBe('string')
    expect(category.title.length).toBeGreaterThan(0)
    // rules and examples are optional but common
    if (category.rules) {
      expect(Array.isArray(category.rules)).toBe(true)
    }
    if (category.examples) {
      expect(Array.isArray(category.examples)).toBe(true)
      for (const ex of category.examples) {
        expect(typeof ex.indonesian).toBe('string')
        expect(typeof ex.dutch).toBe('string')
      }
    }
  })

  it('validates exercises output has sections array', () => {
    const exerciseOutput = {
      type: 'exercises',
      sections: [
        {
          title: 'Oefening I',
          instruction: 'Vertaal en gebruik yang.',
          type: 'grammar_drill',
          items: [
            { prompt: 'Het grote huis', answer: 'Rumah yang besar' },
          ],
        },
      ],
    }
    expect(exerciseOutput.type).toBe('exercises')
    expect(Array.isArray(exerciseOutput.sections)).toBe(true)
    expect(exerciseOutput.sections[0].title).toBe('Oefening I')
    expect(Array.isArray(exerciseOutput.sections[0].items)).toBe(true)
  })
})

describe('build-sections: section counting', () => {
  const sections = [
    rawGrammarSection,
    rawExercisesSection,
    vocabularySection,
    structuredGrammarSection,
    rawReferenceTableSection,
  ]

  it('counts raw grammar/exercise sections correctly', () => {
    const rawSections = sections.filter(s => needsStructuring(s.content as SectionContent))
    // rawGrammar + rawExercises + rawReferenceTable = 3
    expect(rawSections.length).toBe(3)
  })

  it('does not include vocabulary or already-structured sections', () => {
    const rawSections = sections.filter(s => needsStructuring(s.content as SectionContent))
    const titles = rawSections.map(s => s.title)
    expect(titles).not.toContain('Woordenlijst')
    expect(titles).not.toContain('Grammatica: NYA') // already structured — should be excluded
  })
})
