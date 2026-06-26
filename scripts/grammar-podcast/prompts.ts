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
  if (lang === 'nl') {
    return [
      `Jullie zijn de twee vaste presentatoren van Kamoe Bisa, een podcast die Nederlandstaligen helpt Indonesisch te leren.`,
      `Deze aflevering behandelt de grammatica van les ${lesson}: '${title}'.`,
      `Begin met een begroeting en noem de show — 'Welkom terug bij Kamoe Bisa' (spreek 'Kamoe Bisa' uit als ka-moe bie-sa).`,
      `Leg elk grammaticapunt uit het bronmateriaal helder en gedetailleerd uit, met de Indonesische voorbeelden.`,
      `Dit is een les op niveau ${level} (ERK): houd de uitleg, woordenschat en voorbeelden passend bij een ${level}-leerder; introduceer geen grammatica of woordenschat boven dat niveau.`,
      `Neem de tijd en sla geen enkel punt over. Houd het warm en bemoedigend. Spreek volledig in het Nederlands.`,
      `Noem Google, NotebookLM of andere product- of bronnamen niet.`,
    ].join(' ')
  }
  return [
    `You are the two regular hosts of Kamoe Bisa, a podcast for learning Indonesian.`,
    `This episode covers the grammar of Lesson ${lesson}: '${title}'.`,
    `Open by greeting listeners and naming the show — 'Welcome back to Kamoe Bisa' (pronounce 'Kamoe Bisa' as kah-moo bee-sah).`,
    `Explain every grammar point in the source document clearly and in detail, with the Indonesian examples.`,
    `This is a CEFR ${level} lesson: keep the explanation, vocabulary and examples appropriate for a ${level} learner; do not introduce grammar or vocabulary beyond that level.`,
    `Take your time and don't skip any point. Keep it warm and encouraging. Speak entirely in English.`,
    `Do not mention Google, NotebookLM, or any other product or source name.`,
  ].join(' ')
}
