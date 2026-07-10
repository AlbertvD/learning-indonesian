import { describe, it, expect } from 'vitest'
import { validateNoRegisterTwinDistractors } from '../../validators/itemDistractorRegisterTwin'
import type { DistractorRegisterTwinCheckRow } from '../../validators/itemDistractorRegisterTwin'

describe('validateNoRegisterTwinDistractors (CS25)', () => {
  it('passes an empty row list', () => {
    expect(validateNoRegisterTwinDistractors([])).toEqual([])
  })

  it('rejects a distractor that IS the (informal) answer\'s own register_counterpart', () => {
    // answer = 'nggak' (informal, register_counterpart='tidak'); distractor drawn = 'tidak'.
    const rows: DistractorRegisterTwinCheckRow[] = [
      {
        capabilityKey: 'cap:v1:vocabulary_src:learning_items/nggak:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        answerNormalizedText: 'nggak',
        answerRegisterCounterpart: 'tidak',
        distractorNormalizedText: 'tidak',
        distractorRegister: null,
        distractorRegisterCounterpart: null,
      },
    ]
    const findings = validateNoRegisterTwinDistractors(rows)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS25')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('tidak')
    expect(findings[0].message).toContain('nggak')
    expect(findings[0].context?.itemSlug).toBe('nggak')
  })

  it('rejects a distractor that is ITSELF informal and whose register_counterpart resolves back to the (formal) answer', () => {
    // answer = 'tidak' (formal); distractor drawn = 'nggak' (informal, register_counterpart='tidak').
    const rows: DistractorRegisterTwinCheckRow[] = [
      {
        capabilityKey: 'cap:v1:vocabulary_src:learning_items/tidak:recognise_form_from_meaning_cap:l1_to_id:text:nl',
        answerNormalizedText: 'tidak',
        answerRegisterCounterpart: null,
        distractorNormalizedText: 'nggak',
        distractorRegister: 'informal',
        distractorRegisterCounterpart: 'tidak',
      },
    ]
    const findings = validateNoRegisterTwinDistractors(rows)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS25')
  })

  it('passes an unrelated distractor (no register relationship)', () => {
    // answer = 'rumah' (formal, no counterpart); distractor drawn = 'meja' (formal, no counterpart).
    const rows: DistractorRegisterTwinCheckRow[] = [
      {
        capabilityKey: 'cap:v1:vocabulary_src:learning_items/rumah:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        answerNormalizedText: 'rumah',
        answerRegisterCounterpart: null,
        distractorNormalizedText: 'meja',
        distractorRegister: null,
        distractorRegisterCounterpart: null,
      },
    ]
    expect(validateNoRegisterTwinDistractors(rows)).toEqual([])
  })

  it('resolves through the canonical itemSlug() mint — case/whitespace differences still match', () => {
    // register_counterpart is raw authored text (trimmed, not slugged) — 'Tidak ' must
    // still match the distractor's normalized_text 'tidak'.
    const rows: DistractorRegisterTwinCheckRow[] = [
      {
        capabilityKey: 'cap:v1:vocabulary_src:learning_items/nggak:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        answerNormalizedText: 'nggak',
        answerRegisterCounterpart: 'Tidak ',
        distractorNormalizedText: 'tidak',
        distractorRegister: null,
        distractorRegisterCounterpart: null,
      },
    ]
    const findings = validateNoRegisterTwinDistractors(rows)
    expect(findings).toHaveLength(1)
  })

  it('an informal distractor whose register_counterpart resolves to a DIFFERENT item passes', () => {
    // distractor 'nggak' is informal but its counterpart is 'tidak', not the answer 'rumah'.
    const rows: DistractorRegisterTwinCheckRow[] = [
      {
        capabilityKey: 'cap:v1:vocabulary_src:learning_items/rumah:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        answerNormalizedText: 'rumah',
        answerRegisterCounterpart: null,
        distractorNormalizedText: 'nggak',
        distractorRegister: 'informal',
        distractorRegisterCounterpart: 'tidak',
      },
    ]
    expect(validateNoRegisterTwinDistractors(rows)).toEqual([])
  })
})
