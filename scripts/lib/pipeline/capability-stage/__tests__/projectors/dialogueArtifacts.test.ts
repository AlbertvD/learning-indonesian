import { describe, it, expect } from 'vitest'

import {
  projectDialogueArtifacts,
  type DialogueArtifactsInput,
} from '../../projectors/dialogueArtifacts'
import type { CapabilityInput } from '../../adapter'

// PR 2 slice: the projector's SOLE output is typed `dialogue_clozes` rows
// (sentence_with_blank, answer_text, translation_text + source_line_ref). No
// capability_artifacts are emitted; line_text + speaker live in
// lesson_dialogue_lines (written by Stage A) and are joined at read time.
const baseCap = (overrides: Partial<CapabilityInput>): CapabilityInput => ({
  canonicalKey: 'dialogue_line:lesson-9/section-1/line-3:produce_form_from_context_cap:id_to_l1:text:none',
  sourceKind: 'dialogue_line_src',
  sourceRef: 'lesson-9/section-1/line-3',
  capabilityType: 'produce_form_from_context_cap',
  direction: 'id_to_l1',
  modality: 'text',
  learnerLanguage: 'none',
  projectionVersion: 'capability-v3',
  sourceFingerprint: null,
  artifactFingerprint: null,
  lessonId: 'lesson-9-uuid',
  metadata: {
    skillType: 'form_recall',
    // dialogue_line caps require no capability_artifacts (renderContracts: []).
    requiredArtifacts: [],
    prerequisiteKeys: [],
    difficultyLevel: 3,
    goalTags: [],
  },
  ...overrides,
})

// Mirrors L9 dialogue section ordering: the "Kaki saya sakit..." line sits at
// line-3 (real L9 has narrator/narrator/Dokter/Tina/... — see scripts/data/
// staging/lesson-9/lesson.ts). Aligning the fixture with reality keeps the
// default cap sourceRef (line-3) consistent with the matching content.
const baseSections = (): DialogueArtifactsInput['sections'] => [
  {
    order_index: 1,
    content: {
      type: 'dialogue',
      lines: [
        { speaker: 'narrator', text: 'Sekarang di Indonesia di mana-mana ada PUSKESMAS.' },
        { speaker: 'narrator', text: 'Tina kakinya sakit sekali. Dia jatuh dari pohon.' },
        { speaker: 'Dokter', text: 'Ada apa?' },
        { speaker: 'Tina', text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.' },
        { speaker: 'Dokter', text: 'Bagaimana bisa jatuh dari pohon?' },
        { speaker: 'Tina', text: 'Saya mau naik lebih tinggi lagi di pohon itu.' },
      ],
    },
  },
]

describe('projectDialogueArtifacts — happy path', () => {
  it('emits one dialogue_clozes row per dialogue_line cap with a matching clozeContext', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: 'Mijn voet doet erg pijn dokter. Ik ben uit de boom gevallen.',
        },
      ],
      sections: baseSections(),
    })

    expect(out.findings).toEqual([])
    expect(out.dialogueClozes).toEqual([
      {
        capability_id: 'cap-id-1',
        source_line_ref: 'lesson-9/section-1/line-3',
        sentence_with_blank: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
        answer_text: 'pohon',
        translation_text: 'Mijn voet doet erg pijn dokter. Ik ben uit de boom gevallen.',
      },
    ])
  })

  it('matches each cap to its line by sourceRef, not by position in the list', () => {
    // Two caps point at different lines; the clozeContexts list is in reverse order.
    const cap1 = baseCap({
      canonicalKey: 'cap-key-1',
      sourceRef: 'lesson-9/section-1/line-3',
    })
    const cap2 = baseCap({
      canonicalKey: 'cap-key-2',
      sourceRef: 'lesson-9/section-1/line-1',
    })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap1, cap2],
      capabilityIdsByKey: new Map([
        ['cap-key-1', 'cap-id-1'],
        ['cap-key-2', 'cap-id-2'],
      ]),
      clozeContexts: [
        {
          learning_item_slug: 'ada apa? makan minum tidur dan jalan.',
          source_text: 'Ada apa? Makan ___ tidur dan jalan.',
          cloze_answer: 'minum',
          translation_text: 'Wat is er? Eten drinken slapen en lopen.',
        },
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: 'NL line 3',
        },
      ],
      sections: [
        {
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { speaker: 'Dokter', text: 'Ada apa?' },
              { speaker: 'Tina', text: 'Ada apa? Makan minum tidur dan jalan.' },
              { speaker: 'Dokter', text: 'Bagaimana bisa jatuh dari pohon?' },
              { speaker: 'Tina', text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.' },
            ],
          },
        },
      ],
    })

    expect(out.findings).toEqual([])
    expect(out.dialogueClozes).toHaveLength(2)

    const byCap = new Map(out.dialogueClozes.map((r) => [r.capability_id, r]))
    expect(byCap.get('cap-id-1')).toMatchObject({
      source_line_ref: 'lesson-9/section-1/line-3',
      sentence_with_blank: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
      answer_text: 'pohon',
    })
    expect(byCap.get('cap-id-2')).toMatchObject({
      source_line_ref: 'lesson-9/section-1/line-1',
      sentence_with_blank: 'Ada apa? Makan ___ tidur dan jalan.',
      answer_text: 'minum',
    })
  })

  it('strips trailing sentence punctuation from answer_text (defensive normalization)', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon.',
          translation_text: 'NL',
        },
      ],
      sections: baseSections(),
    })

    expect(out.findings).toEqual([])
    expect(out.dialogueClozes).toHaveLength(1)
    expect(out.dialogueClozes[0].answer_text).toBe('pohon')
  })

  it('still emits a typed row when the source line has no speaker attribution', () => {
    // speaker is no longer carried by the projector output (it lives in
    // lesson_dialogue_lines); the row is produced regardless of attribution.
    const cap = baseCap({ sourceRef: 'lesson-9/section-1/line-3' })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: 'NL',
        },
      ],
      sections: [
        {
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Sekarang di Indonesia di mana-mana ada PUSKESMAS.' },
              { text: 'Tina kakinya sakit sekali. Dia jatuh dari pohon.' },
              { text: 'Ada apa?' },
              { text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.' },
            ],
          },
        },
      ],
    })

    expect(out.findings).toEqual([])
    expect(out.dialogueClozes).toHaveLength(1)
    expect(out.dialogueClozes[0].source_line_ref).toBe('lesson-9/section-1/line-3')
  })
})

describe('projectDialogueArtifacts — error cases (CS10 findings)', () => {
  it('emits a CS10 finding and skips the typed row when cloze_answer is missing', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          translation_text: 'NL',
          // cloze_answer omitted
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]).toMatchObject({
      gate: 'CS10',
      severity: 'error',
      context: { capabilityKey: cap.canonicalKey },
    })
    expect(out.findings[0].message).toContain('cloze_answer')
  })

  it('emits a CS10 finding when cloze_answer is whitespace-only (treated as missing after normalization)', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: '   ',
          translation_text: 'NL',
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0].gate).toBe('CS10')
  })

  it('emits a CS10 finding when the cap sourceRef does not resolve to a dialogue line', () => {
    const cap = baseCap({ sourceRef: 'lesson-9/section-1/line-99' })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: 'NL',
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0].gate).toBe('CS10')
    expect(out.findings[0].message).toContain('lesson_sections')
  })

  it('emits a CS10 finding when no clozeContext matches the line slug', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [], // no matching cloze
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0].gate).toBe('CS10')
    expect(out.findings[0].message).toContain('clozeContexts')
  })

  it('emits a CS10 finding when the source_text is missing the ___ placeholder', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.',
          cloze_answer: 'pohon',
          translation_text: 'NL',
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings[0].message).toContain('___')
  })

  it('emits a CS10 finding when translation_text is empty', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: '',
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings[0].message).toContain('translation_text')
  })

  it('emits a CS10 finding when the cap was not upserted (no id in the map)', () => {
    const cap = baseCap({})
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map(), // empty
      clozeContexts: [
        {
          learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
          source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
          cloze_answer: 'pohon',
          translation_text: 'NL',
        },
      ],
      sections: baseSections(),
    })

    expect(out.dialogueClozes).toEqual([])
    expect(out.findings[0].message).toContain('upsert result')
  })
})

describe('projectDialogueArtifacts — input shape edge cases', () => {
  it('no-ops on empty contextualClozeCapabilities list', () => {
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [],
      capabilityIdsByKey: new Map(),
      clozeContexts: [],
      sections: [],
    })
    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toEqual([])
  })

  it('ignores non-dialogue_line caps in the input (defense-in-depth)', () => {
    const itemCap = baseCap({
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/halo',
      canonicalKey: 'item:halo:recognise_meaning_from_text_cap:id_to_l1:text:none',
    })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [itemCap],
      capabilityIdsByKey: new Map([[itemCap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [],
      sections: baseSections(),
    })
    expect(out.dialogueClozes).toEqual([])
    expect(out.findings).toEqual([])
  })

  it('skips lines with empty text (defensive)', () => {
    const cap = baseCap({ sourceRef: 'lesson-9/section-1/line-1' })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [cap],
      capabilityIdsByKey: new Map([[cap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [
        {
          learning_item_slug: 'whatever',
          source_text: 'A ___ B',
          cloze_answer: 'x',
          translation_text: 'NL',
        },
      ],
      sections: [
        {
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { speaker: 'X', text: 'first' },
              { speaker: 'X', text: '' }, // empty line at index 1 — skipped
            ],
          },
        },
      ],
    })

    // The cap's line-1 has empty text → not in linesBySourceRef → CS10 finding
    expect(out.dialogueClozes).toEqual([])
    expect(out.findings[0].gate).toBe('CS10')
  })
})
