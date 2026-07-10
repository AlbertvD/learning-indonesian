import { describe, it, expect } from 'vitest'
import {
  projectSections,
  classifyItemType,
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
          { indonesian: 'kantor', dutch: 'kantoor', english: 'office', loanSourceNl: 'kantoor' }, // loanword → loan_source_nl set
          { indonesian: 'rumah sakit', dutch: 'ziekenhuis', english: 'hospital' }, // non-loan → loan_source_nl null
          { indonesian: 'nggak', dutch: 'niet', english: 'not', register: 'informal', registerCounterpart: 'tidak' }, // spreektaal pair → register set
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
        affix: 'meN-',
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
        affix: 'meN-',
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

  it('harvests vocab items with item_type + per-occurrence source_item_ref + l1/l2 + loan_source_nl + register', () => {
    const vocab = out.itemRows.filter((r) => r.sourceSectionOrderIndex === 2)
    expect(vocab).toEqual([
      { sourceSectionOrderIndex: 2, display_order: 0, source_item_ref: 'lesson-9/section-2/item-0', item_type: 'word', indonesian_text: 'kantor', l1_translation: 'kantoor', l2_translation: 'office', loan_source_nl: 'kantoor', register: null, register_counterpart: null },
      { sourceSectionOrderIndex: 2, display_order: 1, source_item_ref: 'lesson-9/section-2/item-1', item_type: 'phrase', indonesian_text: 'rumah sakit', l1_translation: 'ziekenhuis', l2_translation: 'hospital', loan_source_nl: null, register: null, register_counterpart: null },
      { sourceSectionOrderIndex: 2, display_order: 2, source_item_ref: 'lesson-9/section-2/item-2', item_type: 'word', indonesian_text: 'nggak', l1_translation: 'niet', l2_translation: 'not', loan_source_nl: null, register: 'informal', register_counterpart: 'tidak' },
    ])
  })

  it('non-informal register value on a staging item projects to null (only the literal string "informal" is honoured)', () => {
    const out2 = projectSections({
      lessonNumber: 9,
      sections: [
        {
          order_index: 2,
          content: {
            type: 'vocabulary',
            items: [{ indonesian: 'gue', dutch: 'ik', register: 'gaul' }],
          },
        },
      ],
    })
    expect(out2.itemRows[0].register).toBeNull()
  })

  it('harvests ALL numbers items incl. composed numbers (named-number gate removed 2026-06-25)', () => {
    const nums = out.itemRows.filter((r) => r.sourceSectionOrderIndex === 3)
    // composed 'dua puluh satu' is now kept alongside named 'sepuluh' + landmark 'seribu'
    expect(nums.map((r) => r.indonesian_text)).toEqual(['sepuluh', 'dua puluh satu', 'seribu'])
    expect(nums.map((r) => r.display_order)).toEqual([0, 1, 2])
    expect(nums.map((r) => r.source_item_ref)).toEqual([
      'lesson-9/section-3/item-0', 'lesson-9/section-3/item-1', 'lesson-9/section-3/item-2',
    ])
    expect(nums.map((r) => r.item_type)).toEqual(['word', 'phrase', 'word'])
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
        carrier_text: null,
        derived_gloss_nl: null,
        derived_gloss_en: null,
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
        carrier_text: null,
        derived_gloss_nl: null,
        derived_gloss_en: null,
      },
    ])
  })
})
