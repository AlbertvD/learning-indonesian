// Phase 2 — the language-specific instruction prompts handed to NotebookLM's
// audio-overview generation (via notebooklm-py). NOT translations of each other:
// the NL episode addresses Dutch speakers, the EN episode a general audience.
// Both carry the lesson's CEFR level so the hosts pitch to it, and both forbid
// naming any other product/source (the fix for the wrong/missing-app-name defect).

export type Lang = 'nl' | 'en'

export interface EpisodeMeta {
  lesson: number
  title: string
  level: string // A1 / A2 / B1 / B2
}

export function notebookTitle(meta: EpisodeMeta, lang: Lang): string {
  const langLabel = lang === 'nl' ? 'NL' : 'EN'
  return `Kamoe Bisa — Les ${meta.lesson} grammatica (${langLabel})`
}

export function instructionPrompt(meta: EpisodeMeta, lang: Lang): string {
  const { lesson, title, level } = meta
  // Lesson 1 is the learner's first-ever grammar explanation → "welcome";
  // every later lesson → "welcome back".
  const isFirst = lesson === 1
  if (lang === 'nl') {
    const greeting = isFirst ? 'Welkom bij Kamoe Bisa' : 'Welkom terug bij Kamoe Bisa'
    return [
      `Jullie zijn de twee presentatoren van de grammaticapodcast die hoort bij de Kamoe Bisa-app, die Nederlandstaligen helpt Indonesisch te leren.`,
      `Deze aflevering legt de grammatica uit van les ${lesson} ('${title}') in de app.`,
      `Open met '${greeting}' (spreek 'Kamoe Bisa' uit als ka-moe bie-sa) en maak meteen duidelijk dat deze podcast hoort bij de Kamoe Bisa-app en dat deze aflevering de grammatica van juist deze les in de app uitlegt.`,
      `Bespreek elk grammaticapunt uit het bronmateriaal helder en gedetailleerd, met de Indonesische voorbeelden.`,
      `Dit is niveau ${level} (ERK): houd uitleg, woordenschat en voorbeelden passend bij een ${level}-leerder; introduceer niets boven dat niveau.`,
      `Verwijs er kort naar dat de luisteraar deze punten in de oefeningen in de app kan oefenen.`,
      `Houd het warm en bemoedigend. Sla geen enkel punt over. Spreek volledig in het Nederlands. Noem Google, NotebookLM of andere product- of bronnamen niet.`,
    ].join(' ')
  }
  const greeting = isFirst ? 'Welcome to Kamoe Bisa' : 'Welcome back to Kamoe Bisa'
  return [
    `You are the two hosts of the grammar podcast that accompanies the Kamoe Bisa app, which helps people learn Indonesian.`,
    `This episode explains the grammar of Lesson ${lesson} ('${title}') in the app.`,
    `Open with '${greeting}' (pronounce 'Kamoe Bisa' as kah-moo bee-sah) and make clear right away that this podcast accompanies the Kamoe Bisa app and that this episode explains the grammar of this particular lesson in the app.`,
    `Discuss every grammar point in the source material clearly and in detail, with the Indonesian examples.`,
    `This is CEFR ${level}: keep the explanation, vocabulary and examples appropriate for a ${level} learner; introduce nothing beyond that level.`,
    `Briefly mention that the listener can practise these points in the app's exercises.`,
    `Keep it warm and encouraging. Don't skip any point. Speak entirely in English. Do not mention Google, NotebookLM, or any other product or source name.`,
  ].join(' ')
}
