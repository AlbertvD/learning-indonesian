import type { CapabilityType } from '@/lib/capabilities/capabilityTypes'
import type { ExerciseType, SkillType } from '@/types/learning'

const capabilityLabels: Partial<Record<CapabilityType, string>> = {
  text_recognition: 'Tekst herkennen',
  meaning_recall: 'Betekenis ophalen',
  form_recall: 'Indonesische vorm ophalen',
  contextual_cloze: 'Context invullen',
  audio_recognition: 'Luisterherkenning',
  dictation: 'Dictee',
  podcast_gist: 'Hoofdlijn beluisteren',
  pattern_recognition: 'Patroon herkennen',
  pattern_contrast: 'Patroon vergelijken',
  root_derived_recognition: 'Afgeleide vorm herkennen',
  root_derived_recall: 'Afgeleide vorm maken',
}

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

export function capabilityLabel(type: CapabilityType): string {
  return capabilityLabels[type] ?? fallbackLabel(type)
}

export function exerciseLabel(type: ExerciseType): string {
  return exerciseLabels[type] ?? fallbackLabel(type)
}

export function skillLabel(type: SkillType): string {
  return skillLabels[type] ?? fallbackLabel(type)
}
