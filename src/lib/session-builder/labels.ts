import type { CapabilityType } from '@/lib/capabilities'
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
  recognise_meaning_from_text_cap: {
    label: 'Betekenis herkennen',
    description: 'Lees een Indonesisch woord of zin en kies de juiste Nederlandse betekenis.',
    example: 'makan → eten',
  },
  recall_meaning_from_text_cap: {
    label: 'Betekenis ophalen',
    description: 'Lees een Indonesisch woord of zin en typ de Nederlandse betekenis.',
    example: "makan → typ 'eten'",
  },
  recognise_form_from_meaning_cap: {
    label: 'Indonesisch kiezen',
    description: 'Lees een Nederlands woord of zin en kies de juiste Indonesische vertaling.',
    example: "eten → kies 'makan'",
  },
  produce_form_from_meaning_cap: {
    label: 'Indonesisch ophalen',
    description: 'Lees een Nederlands woord of zin en typ de juiste Indonesische vertaling.',
    example: "eten → typ 'makan'",
  },
  produce_form_from_context_cap: {
    label: 'Zin aanvullen',
    description: 'Maak een Indonesische zin compleet met het juiste woord.',
    example: 'Saya ___ nasi → makan',
  },
  recognise_meaning_from_audio_cap: {
    label: 'Luisterherkenning',
    description: 'Luister naar een Indonesisch woord of zin en kies de juiste Nederlandse betekenis.',
    example: "hoor 'makan' → eten",
  },
  produce_form_from_audio_cap: {
    label: 'Dictee',
    description: 'Luister naar een Indonesisch woord of zin en typ het na.',
    example: "hoor 'makan' → typ 'makan'",
  },
  recognise_gist_from_audio_cap: {
    label: 'Hoofdlijn herkennen',
    description: 'Luister naar een Indonesisch podcastfragment en herken waar het over gaat.',
  },
  recognise_grammar_pattern_cap: {
    label: 'Patroon herkennen',
    description: 'Vul een Indonesische zin aan volgens het juiste grammaticale patroon.',
  },
  contrast_grammar_pattern_cap: {
    label: 'Patronen onderscheiden',
    description: 'Kies welke van twee bijna-gelijke Indonesische vormen past in de zin.',
    example: 'menulis vs ditulis → kies de actieve vorm',
  },
  recognise_word_form_link_cap: {
    label: 'Stamwoord herkennen',
    description: 'Lees een afgeleide Indonesische vorm en typ het stamwoord.',
    example: "menulis → typ 'tulis'",
  },
  produce_derived_form_cap: {
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
