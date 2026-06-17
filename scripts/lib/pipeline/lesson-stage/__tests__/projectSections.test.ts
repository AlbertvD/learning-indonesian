import { describe, it, expect } from 'vitest'
import {
  projectSections,
  classifyItemType,
  isNamedNumber,
  deriveAffix,
  sourceSectionRef,
} from '../projectSections'

describe('classifyItemType', () => {
  it('single token → word, multi-token → phrase', () => {
    expect(classifyItemType('awas')).toBe('word')
    expect(classifyItemType('rumah sakit')).toBe('phrase')
    expect(classifyItemType('di mana-mana')).toBe('phrase')
    expect(classifyItemType('tidak (ada) apa-apa')).toBe('phrase')
    expect(classifyItemType('kaki-kaki')).toBe('word') // hyphenated reduplication, no space
  })
})

describe('isNamedNumber', () => {
  it('values 0–20 are named', () => {
    expect(isNamedNumber('nol, kosong', '0')).toBe(true)
    expect(isNamedNumber('sepuluh', '10')).toBe(true)
    expect(isNamedNumber('dua belas', '12')).toBe(true)
    expect(isNamedNumber('dua puluh', '20')).toBe(true)
  })
  it('composed numbers > 20 are not named', () => {
    expect(isNamedNumber('dua puluh satu', '21')).toBe(false)
    expect(isNamedNumber('tiga puluh', '30')).toBe(false)
    expect(isNamedNumber('dua ratus', '200')).toBe(false)
    expect(isNamedNumber('sepuluh ribu', '10.000')).toBe(false)
    expect(isNamedNumber('dua ribu', '2.000')).toBe(false)
  })
  it('place-value landmarks (se- forms) are named regardless of value', () => {
    expect(isNamedNumber('seratus', '100')).toBe(true)
    expect(isNamedNumber('seribu', '1.000')).toBe(true)
    expect(isNamedNumber('sejuta', '1.000.000')).toBe(true)
    expect(isNamedNumber('semiliar', '1.000.000.000')).toBe(true)
    expect(isNamedNumber('setriliun', '1.000.000.000.000')).toBe(true)
  })
})

describe('deriveAffix', () => {
  it('derives the affix from the allomorph rule prefix', () => {
    expect(deriveAffix('lesson-9/morphology/meN-baca-membaca', 'meN- becomes mem- before b: baca -> membaca.')).toBe('meN-')
    expect(deriveAffix('lesson-9/morphology/di-x-y', 'di- is the passive prefix.')).toBe('di-')
  })
  it('falls back to the sourceRef first segment when the rule has no leading affix', () => {
    expect(deriveAffix('lesson-9/morphology/ber-jalan-berjalan', 'Prefix attaches to jalan.')).toBe('ber-')
  })
})

describe('sourceSectionRef', () => {
  it('formats as lesson-N/section-orderIndex', () => {
    expect(sourceSectionRef(9, 4)).toBe('lesson-9/section-4')
  })
})

function sections() {
  return [
    {
      order_index: 2,
      content: {
        type: 'vocabulary',
        items: [
          { indonesian: 'kaki', dutch: 'voet', english: 'foot' },
          { indonesian: 'rumah sakit', dutch: 'ziekenhuis', english: 'hospital' },
        ],
      },
    },
    {
      order_index: 3,
      content: {
        type: 'numbers',
        items: [
          { indonesian: 'sepuluh', dutch: '10', english: 'ten' },
          { indonesian: 'dua puluh satu', dutch: '21', english: 'twenty-one' }, // composed → dropped
          { indonesian: 'seribu', dutch: '1.000', english: 'one thousand' }, // landmark → kept
        ],
      },
    },
    {
      order_index: 4,
      content: {
        type: 'grammar',
        categories: [
          {
            title: 'Volgorde A-B-C',
            title_en: 'A-B-C order',
            rules: ['A komt eerst.'],
            rules_en: ['A comes first.'],
            examples: [{ indonesian: 'Saya datang.', dutch: 'Ik kom.', english: 'I am coming.' }],
          },
          { title: 'Woorden per groep', table: [['A', 'B']] }, // table-only → skipped
        ],
        grammar_topics: ['Werkwoordvolgorde', 'Werkwoordvolgorde'], // dup → deduped
      },
    },
  ]
}

describe('projectSections', () => {
  const out = projectSections({
    lessonNumber: 9,
    sections: sections(),
    affixedPairs: [
      {
        sourceRef: 'lesson-9/morphology/meN-baca-membaca',
        patternSourceRef: 'lesson-9/pattern-men-active',
        root: 'baca',
        derived: 'membaca',
        allomorphRule: 'meN- becomes mem- before b: baca -> membaca.',
        affixType: 'prefix',
        affixGloss: 'active/agent verb-former',
        allomorphClass: 'mem',
        productive: true,
      },
      {
        // optional payload absent -> projects to null (cap-stage validator enforces presence)
        sourceRef: 'lesson-9/morphology/meN-tulis-menulis',
        patternSourceRef: 'lesson-9/pattern-men-active',
        root: 'tulis',
        derived: 'menulis',
        allomorphRule: 'meN- becomes men- before t: tulis -> menulis.',
      },
    ],
  })

  it('emits section_kind + source_section_ref per section', () => {
    expect(out.sectionMeta).toEqual([
      { orderIndex: 2, sectionKind: 'vocabulary', sourceSectionRef: 'lesson-9/section-2' },
      { orderIndex: 3, sectionKind: 'numbers', sourceSectionRef: 'lesson-9/section-3' },
      { orderIndex: 4, sectionKind: 'grammar', sourceSectionRef: 'lesson-9/section-4' },
    ])
  })

  it('harvests vocab items with item_type + per-occurrence source_item_ref + l1/l2', () => {
    const vocab = out.itemRows.filter((r) => r.sourceSectionOrderIndex === 2)
    expect(vocab).toEqual([
      { sourceSectionOrderIndex: 2, display_order: 0, source_item_ref: 'lesson-9/section-2/item-0', item_type: 'word', indonesian_text: 'kaki', l1_translation: 'voet', l2_translation: 'foot' },
      { sourceSectionOrderIndex: 2, display_order: 1, source_item_ref: 'lesson-9/section-2/item-1', item_type: 'phrase', indonesian_text: 'rumah sakit', l1_translation: 'ziekenhuis', l2_translation: 'hospital' },
    ])
  })

  it('drops composed numbers but keeps named numbers + landmarks (display_order = authored index)', () => {
    const nums = out.itemRows.filter((r) => r.sourceSectionOrderIndex === 3)
    expect(nums.map((r) => r.indonesian_text)).toEqual(['sepuluh', 'seribu'])
    expect(nums.map((r) => r.display_order)).toEqual([0, 2]) // index 1 (dua puluh satu) dropped
    expect(nums.map((r) => r.source_item_ref)).toEqual(['lesson-9/section-3/item-0', 'lesson-9/section-3/item-2'])
  })

  it('projects rule-bearing grammar categories with EN; skips table-only', () => {
    expect(out.grammarCategories).toHaveLength(1)
    expect(out.grammarCategories[0]).toMatchObject({
      sourceSectionOrderIndex: 4,
      display_order: 0,
      title: 'Volgorde A-B-C',
      title_en: 'A-B-C order',
      rules: ['A komt eerst.'],
      rules_en: ['A comes first.'],
      examples: [{ indonesian: 'Saya datang.', dutch: 'Ik kom.', english: 'I am coming.' }],
    })
  })

  it('dedups grammar topic labels per section', () => {
    expect(out.grammarTopics).toEqual([
      { sourceSectionOrderIndex: 4, topic_label: 'Werkwoordvolgorde' },
    ])
  })

  it('projects affixed pairs at lesson level with derived affix and null section', () => {
    expect(out.affixedPairs).toEqual([
      {
        source_ref: 'lesson-9/morphology/meN-baca-membaca',
        pattern_source_ref: 'lesson-9/pattern-men-active',
        affix: 'meN-',
        root_text: 'baca',
        derived_text: 'membaca',
        allomorph_rule: 'meN- becomes mem- before b: baca -> membaca.',
        affix_type: 'prefix',
        affix_gloss: 'active/agent verb-former',
        allomorph_class: 'mem',
        circumfix_left: null,
        circumfix_right: null,
        productive: true,
      },
      {
        source_ref: 'lesson-9/morphology/meN-tulis-menulis',
        pattern_source_ref: 'lesson-9/pattern-men-active',
        affix: 'meN-',
        root_text: 'tulis',
        derived_text: 'menulis',
        allomorph_rule: 'meN- becomes men- before t: tulis -> menulis.',
        affix_type: null,
        affix_gloss: null,
        allomorph_class: null,
        circumfix_left: null,
        circumfix_right: null,
        productive: null,
      },
    ])
  })
})
