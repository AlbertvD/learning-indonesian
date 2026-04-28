import type { CapabilityType } from '@/lib/capabilities/capabilityTypes'

export type LearnerSkillLabelKey =
  | 'recognition'
  | 'choice'
  | 'recall'
  | 'use'
  | 'listening'
  | 'dictation'
  | 'patterns'

export interface LearnerSkillLabel {
  key: LearnerSkillLabelKey
  displayLabel: string
  description: string
}

const patternLabel: LearnerSkillLabel = {
  key: 'patterns',
  displayLabel: 'Patronen',
  description: 'Herken grammatica en woordvormen.',
}

const labels: Record<CapabilityType, LearnerSkillLabel> = {
  text_recognition: {
    key: 'recognition',
    displayLabel: 'Herkennen',
    description: 'Begrijp Indonesisch wanneer je het ziet.',
  },
  meaning_recall: {
    key: 'recognition',
    displayLabel: 'Herkennen',
    description: 'Haal de betekenis van Indonesisch actief op.',
  },
  l1_to_id_choice: {
    key: 'choice',
    displayLabel: 'Kiezen',
    description: 'Kies het Indonesisch bij een Nederlandse prompt.',
  },
  form_recall: {
    key: 'recall',
    displayLabel: 'Onthouden',
    description: 'Produceer het Indonesisch uit je geheugen.',
  },
  contextual_cloze: {
    key: 'use',
    displayLabel: 'Gebruiken',
    description: 'Gebruik het woord of patroon in context.',
  },
  audio_recognition: {
    key: 'listening',
    displayLabel: 'Verstaan',
    description: 'Begrijp Indonesisch wanneer je het hoort.',
  },
  dictation: {
    key: 'dictation',
    displayLabel: 'Opschrijven',
    description: 'Schrijf Indonesisch op vanuit audio.',
  },
  podcast_gist: {
    key: 'listening',
    displayLabel: 'Verstaan',
    description: 'Volg de hoofdgedachte van gesproken Indonesisch.',
  },
  pattern_recognition: patternLabel,
  pattern_contrast: patternLabel,
  root_derived_recognition: patternLabel,
  root_derived_recall: patternLabel,
}

export function labelForCapabilityType(capabilityType: CapabilityType): LearnerSkillLabel {
  return labels[capabilityType] ?? patternLabel
}
