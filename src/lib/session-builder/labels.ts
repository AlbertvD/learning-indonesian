import type { CapabilityType } from '@/lib/capabilities/capabilityTypes'
import type { ExerciseType, SkillType } from '@/types/learning'

export interface CapabilityDisplay {
  label: string
  description?: string
  example?: string
}

// Per-capability display copy. PR-A lands with terse `label` placeholders that
// match the prior `capabilityLabel` strings; PR-D authors the `description` and
// optional `example` content. The `satisfies` assertion below makes the map
// exhaustive — a new CapabilityType added in capabilityTypes.ts will fail
// compilation here until it gets an entry.
export const CAPABILITY_DISPLAY = {
  text_recognition: { label: 'Tekst herkennen' },
  meaning_recall: { label: 'Betekenis ophalen' },
  l1_to_id_choice: { label: 'Indonesisch kiezen' },
  form_recall: { label: 'Indonesische vorm ophalen' },
  contextual_cloze: { label: 'Context invullen' },
  audio_recognition: { label: 'Luisterherkenning' },
  dictation: { label: 'Dictee' },
  podcast_gist: { label: 'Hoofdlijn beluisteren' },
  pattern_recognition: { label: 'Patroon herkennen' },
  pattern_contrast: { label: 'Patroon vergelijken' },
  root_derived_recognition: { label: 'Afgeleide vorm herkennen' },
  root_derived_recall: { label: 'Afgeleide vorm maken' },
} as const satisfies Record<CapabilityType, CapabilityDisplay>

const exerciseLabels: Partial<Record<ExerciseType, string>> = {
  recognition_mcq: 'Herkennen',
  meaning_recall: 'Betekenis ophalen',
  typed_recall: 'Typen uit herinnering',
  cued_recall: 'Ophalen met hint',
  cloze: 'Zin aanvullen',
  cloze_mcq: 'Zin aanvullen met keuze',
  contrast_pair: 'Verschil kiezen',
  sentence_transformation: 'Zin ombouwen',
  constrained_translation: 'Gericht vertalen',
  listening_mcq: 'Luisterkeuze',
  dictation: 'Dictee',
  speaking: 'Spreken',
}

const skillLabels: Partial<Record<SkillType, string>> = {
  recognition: 'herkennen',
  form_recall: 'vorm ophalen',
  meaning_recall: 'betekenis ophalen',
  spoken_production: 'uitspreken',
}

function fallbackLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

export function capabilityDisplay(type: CapabilityType): CapabilityDisplay {
  return CAPABILITY_DISPLAY[type]
}

export function exerciseLabel(type: ExerciseType): string {
  return exerciseLabels[type] ?? fallbackLabel(type)
}

export function skillLabel(type: SkillType): string {
  return skillLabels[type] ?? fallbackLabel(type)
}
