// Audio-text harvest helper. Single source of truth for "which Indonesian-text
// fields on an ExerciseItem are candidates for audio playback."
//
// Used by:
//   - Legacy session path (src/pages/Session.tsx) — replaces the ad-hoc
//     collector at :378-398.
//   - Capability path (src/services/capabilityContentService.ts) — each builder
//     calls audibleTextFieldsOf(builtItem) to populate
//     BuilderResult.audibleTexts.
//
// See docs/plans/2026-05-02-capability-content-service-spec.md §6.3 + §8.

import type { ExerciseItem } from '@/types/learning'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import { normalizeTtsText } from '@/lib/ttsNormalize'

/**
 * Returns every Indonesian-language text field on a single ExerciseItem,
 * normalized for TTS lookup. Strict superset of the legacy collector at
 * Session.tsx:378-398.
 *
 * Texts are deduplicated and sorted lexicographically for stable testing.
 *
 * Texts NOT included (intentional):
 *   - meanings[].translation_text       — Dutch/English, not Indonesian
 *   - cuedRecallData.promptMeaningText  — Dutch/English prompt
 *   - contrastPairData.targetMeaning    — Dutch/English meaning
 *   - sentenceTransformationData.transformationInstruction — meta-text
 *   - constrainedTranslationData.sourceLanguageSentence    — source language
 *   - speakingData.promptText           — Dutch/English prompt
 *   - explanationText fields            — Dutch/English explanations
 */
export function audibleTextFieldsOf(item: ExerciseItem): string[] {
  const set = new Set<string>()
  const add = (s: string | undefined | null) => {
    if (s && s.trim().length > 0) set.add(normalizeTtsText(s))
  }

  if (item.learningItem?.base_text) add(item.learningItem.base_text)

  // Item-level contexts: example sentences, dialogue lines, cloze sources, etc.
  for (const ctx of item.contexts ?? []) {
    add(ctx.source_text)
  }

  // Cloze (typed): the cloze sentence + target word.
  if (item.clozeContext) {
    add(item.clozeContext.sentence)
    add(item.clozeContext.targetWord)
  }

  // Cloze MCQ: filled sentence (blank → correct option) + every option.
  if (item.clozeMcqData) {
    const filled = item.clozeMcqData.sentence.replace('___', item.clozeMcqData.correctOptionId)
    add(filled)
    for (const opt of item.clozeMcqData.options) add(opt)
  }

  // Cued recall: every option (Indonesian forms; the prompt is meaning).
  if (item.cuedRecallData) {
    for (const opt of item.cuedRecallData.options) add(opt)
  }

  // Contrast pair: both options are Indonesian.
  if (item.contrastPairData) {
    for (const opt of item.contrastPairData.options) add(opt)
  }

  // Sentence transformation: source + acceptable target sentences.
  if (item.sentenceTransformationData) {
    add(item.sentenceTransformationData.sourceSentence)
    for (const a of item.sentenceTransformationData.acceptableAnswers) add(a)
  }

  // Constrained translation: target Indonesian forms.
  if (item.constrainedTranslationData) {
    for (const a of item.constrainedTranslationData.acceptableAnswers) add(a)
    if (item.constrainedTranslationData.targetSentenceWithBlank) {
      add(item.constrainedTranslationData.targetSentenceWithBlank)
    }
    if (item.constrainedTranslationData.blankAcceptableAnswers) {
      for (const a of item.constrainedTranslationData.blankAcceptableAnswers) add(a)
    }
  }

  // Speaking: model utterance for imitation.
  if (item.speakingData?.targetPatternOrScenario) {
    add(item.speakingData.targetPatternOrScenario)
  }

  return [...set].sort()
}

/**
 * Legacy entry point. Replaces the ad-hoc collector at Session.tsx:378-398
 * during PR-2 of the capabilityContentService spec.
 */
export function collectAudibleTextsFromExerciseItems(items: Iterable<ExerciseItem>): string[] {
  const set = new Set<string>()
  for (const item of items) for (const t of audibleTextFieldsOf(item)) set.add(t)
  return [...set].sort()
}

/**
 * Capability-path entry point. Unions per-block `audibleTexts` from the
 * service's render contexts. Builders own per-block harvesting via
 * audibleTextFieldsOf; this helper just dedupes the union.
 */
export function collectAudibleTexts(contexts: Iterable<CapabilityRenderContext>): string[] {
  const set = new Set<string>()
  for (const ctx of contexts) {
    if (!ctx.exerciseItem) continue
    for (const t of ctx.audibleTexts) set.add(t)
  }
  return [...set].sort()
}
