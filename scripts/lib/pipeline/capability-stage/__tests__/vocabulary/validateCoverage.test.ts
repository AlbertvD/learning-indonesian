/**
 * cap-v2 Slice 1 — distractor coverage validator (CS15, pointer path).
 *
 * Deterministic selection makes the old CS16 quality arms (no-answer, in-pool)
 * structurally impossible — the planner only points at non-answer Pool(N) items
 * and the FK guarantees existence — so the pointer path keeps ONLY the coverage
 * check: a distractor-bearing capability must reach the runtime floor, else it
 * is flagged `insufficient_distractor_pool` (the capability stays schedulable via
 * its typed exercises; only that one MCQ render is skipped). Typed capabilities
 * (meaning_recall/form_recall/dictation/contextual_cloze) are never flagged.
 */

import { describe, it, expect } from 'vitest'
import { validateDistractorCoverage } from '../../vocabulary/validateCoverage'

describe('validateDistractorCoverage', () => {
  it('flags a distractor-bearing capability below the floor; passes one that meets it', () => {
    const findings = validateDistractorCoverage(
      [
        { capabilityId: 'cap-text', capabilityType: 'text_recognition', distractorCount: 3 },
        { capabilityId: 'cap-cued', capabilityType: 'l1_to_id_choice', distractorCount: 1 },
      ],
      2,
    )

    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS15')
    expect(findings[0].context?.capabilityKey ?? findings[0].message).toContain('cap-cued')
    expect(findings[0].message.toLowerCase()).toContain('insufficient')
  })

  it('never flags typed capabilities (they carry no distractors by design)', () => {
    const findings = validateDistractorCoverage(
      [
        { capabilityId: 'cap-mr', capabilityType: 'meaning_recall', distractorCount: 0 },
        { capabilityId: 'cap-fr', capabilityType: 'form_recall', distractorCount: 0 },
        { capabilityId: 'cap-dict', capabilityType: 'dictation', distractorCount: 0 },
      ],
      2,
    )

    expect(findings).toEqual([])
  })

  it('passes when every distractor-bearing capability meets the floor', () => {
    const findings = validateDistractorCoverage(
      [
        { capabilityId: 'cap-text', capabilityType: 'text_recognition', distractorCount: 3 },
        { capabilityId: 'cap-audio', capabilityType: 'audio_recognition', distractorCount: 2 },
      ],
      2,
    )
    expect(findings).toEqual([])
  })
})
