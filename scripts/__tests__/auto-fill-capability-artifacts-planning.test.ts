import { describe, expect, it } from 'vitest'
import {
  planMeaningL1,
  planMeaningEn,
  planBaseText,
  planAcceptedAnswersId,
  planAcceptedAnswersL1,
  planPatternExplanationL1,
  planPatternExample,
  planRootDerivedPair,
  planAllomorphRule,
  tokenizePatternName,
  splitAcceptedL1,
  type ItemSource,
  type PatternSource,
  type AffixedFormPairSource,
  type GrammarSection,
} from '../auto-fill-capability-artifacts-from-legacy'

const baseItem: ItemSource = {
  id: 'item-1',
  baseText: 'akhir',
  normalizedText: 'akhir',
  itemType: 'word',
  isActive: true,
  meanings: [
    { language: 'nl', text: 'einde', isPrimary: true },
    { language: 'en', text: 'end, ending', isPrimary: false },
  ],
  answerVariants: [],
}

describe('tokenizePatternName', () => {
  it('strips parentheticals, lowercases, drops Dutch stopwords', () => {
    expect(tokenizePatternName('Werkwoord (kata kerja)')).toEqual(['werkwoord'])
  })

  it('keeps multi-token Dutch names', () => {
    expect(tokenizePatternName('Zelfstandig naamwoord')).toEqual(['zelfstandig', 'naamwoord'])
  })

  it('drops common stopwords', () => {
    expect(tokenizePatternName('Het werkwoord met een prefix')).toEqual(['werkwoord', 'prefix'])
  })

  it('returns empty for purely-stopword input', () => {
    expect(tokenizePatternName('de het een')).toEqual([])
  })
})

describe('splitAcceptedL1', () => {
  it('splits on slash with surrounding whitespace', () => {
    expect(splitAcceptedL1('eten / consumeren')).toEqual(['eten', 'consumeren'])
  })

  it('splits on semicolon with optional whitespace', () => {
    expect(splitAcceptedL1('eten;te eten')).toEqual(['eten', 'te eten'])
  })

  it('handles mixed separators and trims', () => {
    expect(splitAcceptedL1('eten ; te eten / consumeren')).toEqual(['eten', 'te eten', 'consumeren'])
  })

  it('deduplicates equal entries', () => {
    expect(splitAcceptedL1('eten / eten / te eten')).toEqual(['eten', 'te eten'])
  })

  it('returns empty array for empty input', () => {
    expect(splitAcceptedL1('')).toEqual([])
  })
})

describe('planMeaningL1', () => {
  it('fills with primary NL meaning + provenance tag', () => {
    const out = planMeaningL1(baseItem)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson).toMatchObject({
      value: 'einde',
      reviewedBy: 'auto-from-legacy-db',
      autoFillVersion: '1',
    })
    expect(out.payloadJson?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('picks longest non-empty when two are is_primary=true', () => {
    const item: ItemSource = {
      ...baseItem,
      meanings: [
        { language: 'nl', text: 'einde', isPrimary: true },
        { language: 'nl', text: 'het einde van iets', isPrimary: true },
      ],
    }
    const out = planMeaningL1(item)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toBe('het einde van iets')
    expect(out.warning).toMatch(/multiple.*primary/i)
  })

  it('falls back to first NL meaning when no is_primary', () => {
    const item: ItemSource = {
      ...baseItem,
      meanings: [
        { language: 'nl', text: 'einde', isPrimary: false },
        { language: 'nl', text: 'beëindiging', isPrimary: false },
      ],
    }
    const out = planMeaningL1(item)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toBe('beëindiging') // longest
  })

  it('skips when no NL meaning', () => {
    const item: ItemSource = { ...baseItem, meanings: [{ language: 'en', text: 'end', isPrimary: true }] }
    const out = planMeaningL1(item)
    expect(out.decision).toBe('skip')
  })

  it('skips when item is_active=false', () => {
    const item: ItemSource = { ...baseItem, isActive: false }
    const out = planMeaningL1(item)
    expect(out.decision).toBe('skip')
  })

  it('flags critical when value is empty after trim', () => {
    const item: ItemSource = { ...baseItem, meanings: [{ language: 'nl', text: '   ', isPrimary: true }] }
    const out = planMeaningL1(item)
    expect(out.decision).toBe('skip')
    expect(out.critical).toMatch(/empty|shape_failure/i)
  })
})

describe('planMeaningEn', () => {
  it('fills with EN meaning when present', () => {
    const out = planMeaningEn(baseItem)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toBe('end, ending')
  })

  it('skips when no EN meaning', () => {
    const item: ItemSource = { ...baseItem, meanings: [{ language: 'nl', text: 'einde', isPrimary: true }] }
    const out = planMeaningEn(item)
    expect(out.decision).toBe('skip')
  })
})

describe('planBaseText', () => {
  it('fills from base_text', () => {
    const out = planBaseText(baseItem)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toBe('akhir')
  })

  it('skips when base_text is empty', () => {
    const item: ItemSource = { ...baseItem, baseText: '' }
    const out = planBaseText(item)
    expect(out.decision).toBe('skip')
  })

  it('skips when item is inactive', () => {
    const item: ItemSource = { ...baseItem, isActive: false }
    const out = planBaseText(item)
    expect(out.decision).toBe('skip')
  })
})

describe('planAcceptedAnswersId', () => {
  it('includes base_text plus all id-language answer variants', () => {
    const item: ItemSource = {
      ...baseItem,
      answerVariants: [
        { language: 'id', text: 'akhirnya' },
        { language: 'id', text: 'pengakhiran' },
      ],
    }
    const out = planAcceptedAnswersId(item)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.values).toEqual(['akhir', 'akhirnya', 'pengakhiran'])
  })

  it('returns just base_text when no variants', () => {
    const out = planAcceptedAnswersId(baseItem)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.values).toEqual(['akhir'])
  })

  it('skips when base_text empty', () => {
    const out = planAcceptedAnswersId({ ...baseItem, baseText: '' })
    expect(out.decision).toBe('skip')
  })
})

describe('planAcceptedAnswersL1', () => {
  it('splits on / and ; and dedupes from meanings + variants', () => {
    const item: ItemSource = {
      ...baseItem,
      meanings: [{ language: 'nl', text: 'einde / beëindiging', isPrimary: true }],
      answerVariants: [{ language: 'nl', text: 'einde; afsluiting' }],
    }
    const out = planAcceptedAnswersL1(item)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.values).toEqual(['einde', 'beëindiging', 'afsluiting'])
  })

  it('skips when no NL data', () => {
    const item: ItemSource = { ...baseItem, meanings: [], answerVariants: [] }
    const out = planAcceptedAnswersL1(item)
    expect(out.decision).toBe('skip')
  })
})

describe('planPatternExplanationL1', () => {
  const pattern: PatternSource = {
    id: 'pattern-1',
    slug: 'verb-no-conjugation',
    name: 'Werkwoord (kata kerja)',
    shortExplanation: 'Indonesische werkwoorden worden niet vervoegd voor persoon, tijd of getal.',
    introducedByLessonId: 'lesson-uuid-1',
  }

  it('fills with short_explanation', () => {
    const out = planPatternExplanationL1(pattern)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toBe(pattern.shortExplanation)
  })

  it('warns when explanation < 20 chars but still fills', () => {
    const out = planPatternExplanationL1({ ...pattern, shortExplanation: 'Niet vervoegd.' })
    expect(out.decision).toBe('fill')
    expect(out.warning).toMatch(/short|< ?20/i)
  })

  it('skips when explanation is empty', () => {
    const out = planPatternExplanationL1({ ...pattern, shortExplanation: '' })
    expect(out.decision).toBe('skip')
  })
})

describe('planPatternExample', () => {
  const grammarSection: GrammarSection = {
    categories: [
      {
        title: 'Werkwoord',
        rules: ['Werkwoorden worden niet vervoegd.'],
        examples: [
          { indonesian: 'Saya beli buah', dutch: 'Ik koop een vrucht (geen vervoeging)' },
          { indonesian: 'Saya mau beli rumah besar', dutch: 'Ik wil een groot huis kopen (werkwoorden bij elkaar)' },
        ],
      },
      {
        title: 'Zelfstandig naamwoord',
        rules: ['Geen lidwoorden.'],
        examples: [{ indonesian: 'Saya beli rumah', dutch: 'Ik koop een huis (geen lidwoord)' }],
      },
    ],
  }

  it('matches by category title (step 1 of fallback chain)', () => {
    const pattern: PatternSource = {
      id: 'p1',
      slug: 'no-articles',
      name: 'Zelfstandig naamwoord',
      shortExplanation: 'Geen lidwoorden.',
      introducedByLessonId: 'l1',
    }
    const out = planPatternExample(pattern, grammarSection)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.value).toContain('Saya beli rumah')
  })

  it('keyword-matches within shared category (step 2 of fallback chain)', () => {
    // Two patterns share the Werkwoord category; the keyword "vervoeging" picks
    // the right example.
    const pattern: PatternSource = {
      id: 'p2',
      slug: 'verb-no-conjugation',
      name: 'Werkwoord — geen vervoeging',
      shortExplanation: 'Werkwoorden worden niet vervoegd.',
      introducedByLessonId: 'l1',
    }
    const out = planPatternExample(pattern, grammarSection)
    expect(out.decision).toBe('fill')
    // Keyword "vervoeging" should match the first example
    expect(out.payloadJson?.value).toContain('Saya beli buah')
  })

  it('falls back to lesson-wide first example when no category and no keyword (step 3)', () => {
    const pattern: PatternSource = {
      id: 'p3',
      slug: 'unknown-pattern',
      name: 'Onbekende structuur',
      shortExplanation: '...',
      introducedByLessonId: 'l1',
    }
    const out = planPatternExample(pattern, grammarSection)
    expect(out.decision).toBe('fill')
    expect(out.warning).toMatch(/lesson-wide|fallback/i)
  })

  it('skips when grammar section has no categories with examples (step 4)', () => {
    const empty: GrammarSection = { categories: [] }
    const pattern: PatternSource = {
      id: 'p4',
      slug: 'x',
      name: 'X',
      shortExplanation: '...',
      introducedByLessonId: 'l1',
    }
    const out = planPatternExample(pattern, empty)
    expect(out.decision).toBe('skip')
  })

  it('uses pattern.name (Dutch) for keyword tokenization, not slug (English)', () => {
    // Slug 'verb-no-conjugation' should NOT be used for keyword match;
    // the Dutch name 'Werkwoord — geen vervoeging' is what's tokenized.
    // Test that even with a misleading slug, the Dutch name drives the match.
    const pattern: PatternSource = {
      id: 'p5',
      slug: 'unrelated-english-slug',
      name: 'Werkwoord — geen vervoeging',
      shortExplanation: '...',
      introducedByLessonId: 'l1',
    }
    const out = planPatternExample(pattern, grammarSection)
    expect(out.decision).toBe('fill')
    // Should match Werkwoord category by name token
    expect(out.payloadJson?.value).toContain('Saya beli buah')
  })
})

describe('planRootDerivedPair / planAllomorphRule', () => {
  const pair: AffixedFormPairSource = {
    id: 'men-baca-membaca',
    sourceRef: 'lesson-9/morphology/meN-baca-membaca',
    root: 'baca',
    derived: 'membaca',
    allomorphRule: 'meN- becomes mem- before b: baca -> membaca',
  }

  it('planRootDerivedPair fills root + derived', () => {
    const out = planRootDerivedPair(pair)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson).toMatchObject({ root: 'baca', derived: 'membaca' })
  })

  it('planAllomorphRule fills the rule', () => {
    const out = planAllomorphRule(pair)
    expect(out.decision).toBe('fill')
    expect(out.payloadJson?.rule).toBe(pair.allomorphRule)
  })

  it('planRootDerivedPair skips when root or derived missing', () => {
    expect(planRootDerivedPair({ ...pair, root: '' }).decision).toBe('skip')
    expect(planRootDerivedPair({ ...pair, derived: '' }).decision).toBe('skip')
  })

  it('planAllomorphRule skips when rule missing', () => {
    expect(planAllomorphRule({ ...pair, allomorphRule: '' }).decision).toBe('skip')
  })
})
