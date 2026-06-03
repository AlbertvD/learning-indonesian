/**
 * projectors/dialogueCloze.ts — Slice 3 Task 3: the DB→DB dialogue cloze
 * projector. Pure functions, no I/O.
 *
 * Replaces the staging-coupled dialogue path (the projectVocab cap-emission at
 * vocab.ts:173-209 + projectDialogueArtifacts) with two functions driven by the
 * in-stage Mode-2 generator output (GeneratedDialogueCloze[]):
 *
 *   - projectDialogueClozeCapabilities → the dialogue_line:contextual_cloze caps
 *     to upsert, one per generated cloze. The canonical_key is minted from the
 *     line's source_line_ref via the SAME recipe the legacy path used
 *     (sourceKind=dialogue_line, contextual_cloze, id_to_l1, text, none) — and
 *     the live-DB cap source_ref is byte-identical to lesson_dialogue_lines.
 *     source_line_ref, so existing FSRS state is preserved (no canonical-key
 *     churn). requiredArtifacts:[] (Decision R — the typed dialogue_clozes row +
 *     validateDialogueClozes + HC15 guarantee structure, no artifact bag).
 *
 *   - projectDialogueClozeRows → the dialogue_clozes rows to write (after cap
 *     upsert), one per cloze. Translations are carried from the DB line (R3),
 *     never re-derived. A cloze whose cap has no upserted id fails loud (CS10).
 *
 * The runner (Task 7) wires the generator → these projectors → the idempotent
 * writer, replacing the staging.clozeContexts feeds.
 */

import {
  buildCanonicalKey,
  normalizeLessonSourceRef,
  CAPABILITY_PROJECTION_VERSION,
} from '@/lib/capabilities'

import type { CapabilityInput, DialogueClozeInput } from '../adapter'
import type { ValidationFinding } from '../model'
import type { GeneratedDialogueCloze } from '../generateClozeContexts'

/**
 * One dialogue_line:contextual_cloze capability per generated cloze. The
 * canonical_key + source_ref match the legacy emission exactly so learner FSRS
 * state on the existing 43 caps is preserved.
 */
export function projectDialogueClozeCapabilities(
  clozes: ReadonlyArray<GeneratedDialogueCloze>,
  lessonId: string,
): CapabilityInput[] {
  return clozes.map((cloze) => {
    const sourceRef = normalizeLessonSourceRef(cloze.sourceLineRef)
    const canonicalKey = buildCanonicalKey({
      sourceKind: 'dialogue_line',
      sourceRef,
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
    })
    return {
      canonicalKey,
      sourceKind: 'dialogue_line',
      sourceRef,
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
      projectionVersion: CAPABILITY_PROJECTION_VERSION,
      // Decision 3b (ADR 0006): the projecting lesson introduces the cloze —
      // the runner runs per lesson, so this dialogue line's lesson is correct.
      lessonId,
      requiredArtifacts: [],
      prerequisiteKeys: [],
    }
  })
}

/**
 * One dialogue_clozes row per generated cloze, attached to its upserted
 * capability id. Fails loud (CS10) when a cloze's cap has no id in the upsert
 * result. Translations are carried verbatim from the DB line (R3) — the writer
 * (replaceDialogueClozes) persists translation_text + translation_nl/en.
 */
export function projectDialogueClozeRows(
  clozes: ReadonlyArray<GeneratedDialogueCloze>,
  capabilityIdsByKey: ReadonlyMap<string, string>,
): { dialogueClozes: DialogueClozeInput[]; findings: ValidationFinding[] } {
  const dialogueClozes: DialogueClozeInput[] = []
  const findings: ValidationFinding[] = []

  for (const cloze of clozes) {
    const sourceRef = normalizeLessonSourceRef(cloze.sourceLineRef)
    const canonicalKey = buildCanonicalKey({
      sourceKind: 'dialogue_line',
      sourceRef,
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
    })
    const capabilityId = capabilityIdsByKey.get(canonicalKey)
    if (!capabilityId) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line cloze for "${cloze.sourceLineRef}" has no upserted capability id (key "${canonicalKey}") — dialogue_clozes row skipped`,
        context: { capabilityKey: canonicalKey },
      })
      continue
    }

    dialogueClozes.push({
      capability_id: capabilityId,
      source_line_ref: cloze.sourceLineRef,
      sentence_with_blank: cloze.sentenceWithBlank,
      answer_text: cloze.answerText,
      translation_text: cloze.translationText,
      translation_nl: cloze.translationNl,
      translation_en: cloze.translationEn,
    })
  }

  return { dialogueClozes, findings }
}
