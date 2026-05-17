import type { CapabilityType } from '@/lib/capabilities/capabilityTypes'
import type { ExerciseType, SkillType } from '@/types/learning'

export interface CapabilityDisplay {
  label: string
  description: string
  example?: string
}

// Per-capability display copy. PR-A landed the structure with terse label-only
// placeholders; PR-D authored the descriptions and examples below. The
// `satisfies` assertion makes the map exhaustive — a new CapabilityType added
// in capabilityTypes.ts will fail compilation here until it gets an entry.
//
// Dutch terminology choices (verified against Dutch-Indonesian learning sources
// — Nitroburner, NT2 Utrecht, Coutinho Basiswoordenlijst):
//   - `stamwoord` is the standard term for *kata dasar* / root (not `wortel`).
//   - `afgeleide vorm` is the standard term for the affixed/derived form.
//   - `voorvoegsel` / `achtervoegsel` for prefix / suffix.
export const CAPABILITY_DISPLAY = {
  text_recognition: {
    label: 'Betekenis herkennen',
    description: 'Lees een Indonesisch woord of zin en kies de juiste Nederlandse betekenis.',
    example: 'makan → eten',
  },
  meaning_recall: {
    label: 'Betekenis ophalen',
    description: 'Lees een Indonesisch woord of zin en typ de Nederlandse betekenis.',
    example: "makan → typ 'eten'",
  },
  l1_to_id_choice: {
    label: 'Indonesisch kiezen',
    description: 'Lees een Nederlands woord of zin en kies de juiste Indonesische vertaling.',
    example: "eten → kies 'makan'",
  },
  form_recall: {
    label: 'Indonesisch ophalen',
    description: 'Lees een Nederlands woord of zin en typ de juiste Indonesische vertaling.',
    example: "eten → typ 'makan'",
  },
  contextual_cloze: {
    label: 'Zin aanvullen',
    description: 'Maak een Indonesische zin compleet met het juiste woord.',
    example: 'Saya ___ nasi → makan',
  },
  audio_recognition: {
    label: 'Luisterherkenning',
    description: 'Luister naar een Indonesisch woord of zin en kies de juiste Nederlandse betekenis.',
    example: "hoor 'makan' → eten",
  },
  dictation: {
    label: 'Dictee',
    description: 'Luister naar een Indonesisch woord of zin en typ het na.',
    example: "hoor 'makan' → typ 'makan'",
  },
  podcast_gist: {
    label: 'Hoofdlijn herkennen',
    description: 'Luister naar een Indonesisch podcastfragment en herken waar het over gaat.',
  },
  pattern_recognition: {
    label: 'Patroon herkennen',
    description: 'Vul een Indonesische zin aan volgens het juiste grammaticale patroon.',
  },
  pattern_contrast: {
    label: 'Patronen onderscheiden',
    description: 'Kies welke van twee bijna-gelijke Indonesische vormen past in de zin.',
    example: 'menulis vs ditulis → kies de actieve vorm',
  },
  root_derived_recognition: {
    label: 'Stamwoord herkennen',
    description: 'Lees een afgeleide Indonesische vorm en typ het stamwoord.',
    example: "menulis → typ 'tulis'",
  },
  root_derived_recall: {
    label: 'Afgeleide vorm maken',
    description: 'Lees een Indonesisch stamwoord en typ de juiste afgeleide vorm.',
    example: "tulis + meN- → typ 'menulis'",
  },
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
