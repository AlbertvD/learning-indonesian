import { describe, expect, it } from 'vitest'
import { labelForCapabilityType } from '@/lib/session/learnerSkillLabels'

describe('learner skill labels', () => {
  it.each([
    ['text_recognition', 'Herkennen'],
    ['l1_to_id_choice', 'Kiezen'],
    ['form_recall', 'Onthouden'],
    ['contextual_cloze', 'Gebruiken'],
    ['audio_recognition', 'Verstaan'],
    ['dictation', 'Opschrijven'],
    ['pattern_recognition', 'Patronen'],
    ['pattern_contrast', 'Patronen'],
    ['root_derived_recognition', 'Patronen'],
    ['root_derived_recall', 'Patronen'],
  ] as const)('maps %s to %s', (capabilityType, label) => {
    expect(labelForCapabilityType(capabilityType).displayLabel).toBe(label)
  })

  it('keeps stable label keys for summaries and progress details', () => {
    expect(labelForCapabilityType('l1_to_id_choice')).toEqual({
      key: 'choice',
      displayLabel: 'Kiezen',
      description: 'Kies het Indonesisch bij een Nederlandse prompt.',
    })
  })
})
