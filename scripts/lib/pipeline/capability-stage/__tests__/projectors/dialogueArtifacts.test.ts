import { describe, it, expect } from 'vitest'

import {
  projectDialogueArtifacts,
  type DialogueArtifactsInput,
} from '../../projectors/dialogueArtifacts'
import type { CapabilityInput } from '../../adapter'

const baseCap = (overrides: Partial<CapabilityInput>): CapabilityInput => ({
  canonicalKey: 'dialogue_line:lesson-9/section-1/line-3:contextual_cloze:id_to_l1:text:none',
  sourceKind: 'dialogue_line',
  sourceRef: 'lesson-9/section-1/line-3',
  capabilityType: 'contextual_cloze',
  direction: 'id_to_l1',
  modality: 'text',
  learnerLanguage: 'none',
  projectionVersion: 'capability-v3',
  sourceFingerprint: null,
  artifactFingerprint: null,
  lessonId: 'lesson-9-uuid',
  metadata: {
    skillType: 'form_recall',
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
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
  it('emits cloze_context + cloze_answer + translation:l1 for each dialogue_line cap with a matching clozeContext', () => {
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
    expect(out.artifacts).toHaveLength(3)

    const byKind = new Map(out.artifacts.map((a) => [a.artifact_kind, a]))
    expect(byKind.get('cloze_context')?.artifact_json).toEqual({
      source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
      line_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.',
      speaker: 'Tina',
      source_ref: 'lesson-9/section-1/line-3',
    })
    expect(byKind.get('cloze_answer')?.artifact_json).toEqual({ value: 'pohon' })
    expect(byKind.get('translation:l1')?.artifact_json).toEqual({
      value: 'Mijn voet doet erg pijn dokter. Ik ben uit de boom gevallen.',
    })
    for (const artifact of out.artifacts) {
      expect(artifact.capability_id).toBe('cap-id-1')
      expect(artifact.quality_status).toBe('approved')
    }
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
          // belongs to cap2 (line-1 = "Ada apa?" — but this line is <6 tokens,
          // so in practice clozeContexts wouldn't have it; here we use a longer
          // line at line-1 by overriding sections below).
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
    expect(out.artifacts).toHaveLength(6) // 3 per cap

    const cap1Artifacts = out.artifacts.filter((a) => a.capability_id === 'cap-id-1')
    const cap2Artifacts = out.artifacts.filter((a) => a.capability_id === 'cap-id-2')
    expect(cap1Artifacts).toHaveLength(3)
    expect(cap2Artifacts).toHaveLength(3)
    const cap1Context = cap1Artifacts.find((a) => a.artifact_kind === 'cloze_context')
    expect(cap1Context?.artifact_json).toMatchObject({
      line_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari pohon.',
    })
    const cap2Context = cap2Artifacts.find((a) => a.artifact_kind === 'cloze_context')
    expect(cap2Context?.artifact_json).toMatchObject({
      line_text: 'Ada apa? Makan minum tidur dan jalan.',
    })
  })

  it('strips trailing sentence punctuation from cloze_answer (defensive normalization)', () => {
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
    const ans = out.artifacts.find((a) => a.artifact_kind === 'cloze_answer')
    expect(ans?.artifact_json).toEqual({ value: 'pohon' })
  })

  it('preserves null speaker when the line has no attribution', () => {
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
    const ctx = out.artifacts.find((a) => a.artifact_kind === 'cloze_context')
    expect(ctx?.artifact_json).toMatchObject({ speaker: null })
  })
})

describe('projectDialogueArtifacts — error cases (CS10 findings)', () => {
  it('emits a CS10 finding and skips the artifact set when cloze_answer is missing', () => {
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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

    expect(out.artifacts).toEqual([])
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
    expect(out.artifacts).toEqual([])
    expect(out.findings).toEqual([])
  })

  it('ignores non-dialogue_line caps in the input (defense-in-depth)', () => {
    const itemCap = baseCap({
      sourceKind: 'item',
      sourceRef: 'learning_items/halo',
      canonicalKey: 'item:halo:text_recognition:id_to_l1:text:none',
    })
    const out = projectDialogueArtifacts({
      contextualClozeCapabilities: [itemCap],
      capabilityIdsByKey: new Map([[itemCap.canonicalKey, 'cap-id-1']]),
      clozeContexts: [],
      sections: baseSections(),
    })
    expect(out.artifacts).toEqual([])
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
    expect(out.artifacts).toEqual([])
    expect(out.findings[0].gate).toBe('CS10')
  })
})
