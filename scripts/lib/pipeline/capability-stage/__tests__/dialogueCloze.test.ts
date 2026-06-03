/**
 * dialogueCloze.test.ts — Slice 3 Task 3: the DB→DB dialogue cloze projector.
 *
 * Repoints the dialogue path off staging.clozeContexts onto the Mode-2 generator
 * output (GeneratedDialogueCloze[]). Two pure functions:
 *   - projectDialogueClozeCapabilities: one dialogue_line:contextual_cloze cap
 *     per generated cloze, canonical_key minted from the line's source_line_ref
 *     IDENTICALLY to the legacy emission (FSRS-key stability — verified against
 *     the live DB: cap source_ref === lesson_dialogue_lines.source_line_ref).
 *   - projectDialogueClozeRows: one dialogue_clozes row per cloze (after cap
 *     upsert), translations carried from the DB line (R3).
 */

import { describe, it, expect } from 'vitest'
import {
  projectDialogueClozeCapabilities,
  projectDialogueClozeRows,
} from '../projectors/dialogueCloze'
import type { GeneratedDialogueCloze } from '../generateClozeContexts'

const LESSON_ID = 'lesson-uuid-5'

const CLOZES: GeneratedDialogueCloze[] = [
  {
    dialogueLineId: 'dl-1',
    sourceLineRef: 'lesson-5/section-3/line-0',
    sentenceWithBlank: 'Saya benar benar jatuh dari sebuah ___.',
    answerText: 'pohon',
    translationText: 'Ik ben echt uit een boom gevallen.',
    translationNl: 'Ik ben echt uit een boom gevallen.',
    translationEn: 'I really fell out of a tree.',
  },
  {
    dialogueLineId: 'dl-2',
    sourceLineRef: 'lesson-5/section-3/line-2',
    sentenceWithBlank: '___ saya sakit sekali dokter.',
    answerText: 'Kaki',
    translationText: 'Mijn voet doet erg pijn dokter.',
    translationNl: 'Mijn voet doet erg pijn dokter.',
    translationEn: null,
  },
]

// ---------------------------------------------------------------------------
// projectDialogueClozeCapabilities
// ---------------------------------------------------------------------------

describe('projectDialogueClozeCapabilities', () => {
  it('emits one dialogue_line:contextual_cloze cap per generated cloze', () => {
    const caps = projectDialogueClozeCapabilities(CLOZES, LESSON_ID)
    expect(caps).toHaveLength(2)
    for (const cap of caps) {
      expect(cap.sourceKind).toBe('dialogue_line')
      expect(cap.capabilityType).toBe('contextual_cloze')
      expect(cap.direction).toBe('id_to_l1')
      expect(cap.modality).toBe('text')
      expect(cap.learnerLanguage).toBe('none')
      expect(cap.lessonId).toBe(LESSON_ID)
      expect(cap.requiredArtifacts).toEqual([])
      expect(cap.prerequisiteKeys).toEqual([])
    }
  })

  it('mints the canonical_key IDENTICALLY to the legacy emission (FSRS-key stability)', () => {
    const caps = projectDialogueClozeCapabilities(CLOZES, LESSON_ID)
    // Verified live-DB format: cap:v1:dialogue_line:<source_ref>:contextual_cloze:id_to_l1:text:none
    expect(caps[0].canonicalKey).toBe(
      'cap:v1:dialogue_line:lesson-5/section-3/line-0:contextual_cloze:id_to_l1:text:none',
    )
    expect(caps[0].sourceRef).toBe('lesson-5/section-3/line-0')
  })

  it('normalizes the lesson segment of the source_ref (zero-padding etc.)', () => {
    const caps = projectDialogueClozeCapabilities(
      [{ ...CLOZES[0], sourceLineRef: 'lesson-05/section-3/line-0' }],
      LESSON_ID,
    )
    expect(caps[0].sourceRef).toBe('lesson-5/section-3/line-0')
  })

  it('returns [] for no clozes', () => {
    expect(projectDialogueClozeCapabilities([], LESSON_ID)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// projectDialogueClozeRows
// ---------------------------------------------------------------------------

describe('projectDialogueClozeRows', () => {
  function capIdMap(): Map<string, string> {
    const caps = projectDialogueClozeCapabilities(CLOZES, LESSON_ID)
    return new Map(caps.map((c, i) => [c.canonicalKey, `cap-id-${i}`]))
  }

  it('emits one dialogue_clozes row per cloze with translations from the DB line (R3)', () => {
    const { dialogueClozes, findings } = projectDialogueClozeRows(CLOZES, capIdMap())
    expect(findings).toHaveLength(0)
    expect(dialogueClozes).toHaveLength(2)
    expect(dialogueClozes[0]).toEqual({
      capability_id: 'cap-id-0',
      source_line_ref: 'lesson-5/section-3/line-0',
      sentence_with_blank: 'Saya benar benar jatuh dari sebuah ___.',
      answer_text: 'pohon',
      translation_text: 'Ik ben echt uit een boom gevallen.',
      translation_nl: 'Ik ben echt uit een boom gevallen.',
      translation_en: 'I really fell out of a tree.',
    })
    // nullable translation_en preserved
    expect(dialogueClozes[1].translation_en).toBeNull()
  })

  it('emits a CS10 finding and skips a cloze whose cap has no upserted id', () => {
    const partial = new Map<string, string>() // empty — no cap ids resolved
    const { dialogueClozes, findings } = projectDialogueClozeRows(CLOZES, partial)
    expect(dialogueClozes).toHaveLength(0)
    expect(findings).toHaveLength(2)
    expect(findings[0].gate).toBe('CS10')
    expect(findings[0].severity).toBe('error')
  })
})
