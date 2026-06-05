/**
 * projectors/vocab.ts — pure item projector.
 *
 * `projectItemsFromTypedRows` maps typed `lesson_section_item_rows` (loaded from
 * the DB) into per-item write plans (learning_items upsert + anchor context + the
 * 4 base caps, plus audio_recognition/dictation when an audio_clip exists).
 *
 * The legacy staging projector (`projectVocab` / `selectPublishableItems` + the
 * `contextual_cloze` dialogue emission) was retired in Slice 5b (#147): the runner
 * is DB-only and dialogue clozes are generated in-stage (projectors/dialogueCloze.ts).
 */

import {
  buildCanonicalKey,
  CAPABILITY_PROJECTION_VERSION,
  itemSlug,
} from '@/lib/capabilities'

import { normalizeTtsText } from '../../../tts-normalize'
import type { AudioClipMeta } from '../adapter'

import { sourceRefForLearningItem } from '../../../content-pipeline-output'

import type {
  CapabilityInput,
  LearningItemInput,
} from '../adapter'

// ---------------------------------------------------------------------------
// Task 4: projectItemsFromTypedRows — pure item projector from typed DB rows
// ---------------------------------------------------------------------------

import type { TypedItemRow } from '../loadFromDb'

/**
 * Per-item plan produced by `projectItemsFromTypedRows`.
 *
 * Extends the staging-path `PerItemPlan` with:
 *   - `normalizedText` — the stable identity key (itemSlug(indonesian_text))
 *   - `capabilities`   — the CapabilityInput rows for this item (4 base caps)
 *   - `sourceRef`      — `learning_items/<normalized_text>` (matches adapter.ts:upsertLearningItem)
 *
 * NOTE: `capabilities` are emitted for ALL items regardless of whether they
 * already exist in the DB. Skip-if-exists is the WRITER's responsibility (Task 6).
 * The projector stays pure: fixtures in → rows out, no I/O.
 */
export interface TypedItemPlan {
  row: TypedItemRow
  normalizedText: string
  sourceRef: string
  learningItemInput: LearningItemInput
  anchorContext: {
    context_type: string
    source_text: string
    translation_text: string | null
  }
  capabilities: CapabilityInput[]
}

export interface TypedItemProjectionInput {
  rows: TypedItemRow[]
  lessonId: string
  level: string
  /**
   * DB audio coverage map from loadStageAOutputsFromDb, keyed by
   * normalizeTtsText(base_text). Items whose normalized_text is present in this
   * map get 2 extra audio caps (audio_recognition + dictation) in addition to
   * the 4 base text caps. Items absent from the map get only 4 base caps.
   * Optional for backward compatibility (omitting = empty map = no audio caps).
   */
  audioClipsByNormalizedText?: ReadonlyMap<string, AudioClipMeta>
}

export interface TypedItemProjectionOutput {
  perItemPlans: TypedItemPlan[]
}

/**
 * Pure projector: typed DB item rows → capability write-plan.
 *
 * Projection rules:
 *   - `normalized_text` = itemSlug(indonesian_text) — lowercase + trim.
 *     Same formula as adapter.ts:upsertLearningItem:508 and
 *     content-pipeline-output.ts:sourceRefForLearningItem.
 *   - `sourceRef` = `learning_items/<normalized_text>` — stable across
 *     re-publishes, independent of row UUID. Matches the canonical key
 *     used by capabilityCatalog.ts and runner.ts:442-446.
 *   - Canonical keys: built by `buildCanonicalKey` with
 *     `sourceKind='item'`, matching the upstream catalog.
 *   - `context_type` on the anchor context = `'lesson_snippet'` (a valid
 *     item_contexts CHECK value; the anchor is the introducing lesson snippet).
 *
 * Each item emits 4 base capabilities (no audio — audio enrichment is a
 * separate pass that reads audio_clips from DB; not needed in this pure projector):
 *   1. text_recognition  (id_to_l1)
 *   2. l1_to_id_choice   (l1_to_id)
 *   3. meaning_recall    (id_to_l1)
 *   4. form_recall       (l1_to_id)
 *
 * Idempotency: the projector EMITS all items and their capabilities.
 * The writer (Task 6) checks `normalized_text` / `canonical_key` against
 * the existing-state maps and skips already-seeded rows. This keeps the
 * projector pure and the dedup logic in one place (the writer).
 */
export function projectItemsFromTypedRows(
  input: TypedItemProjectionInput,
): TypedItemProjectionOutput {
  const perItemPlans: TypedItemPlan[] = input.rows.map((row) => {
    const normalizedText = itemSlug(row.indonesian_text)
    const sourceRef = sourceRefForLearningItem(row.indonesian_text)

    // ----- learning_items upsert input -----
    const learningItemInput: LearningItemInput = {
      base_text: row.indonesian_text,
      item_type: row.item_type,
      language: 'id',
      level: input.level,
      source_type: 'lesson',
      pos: null,
      translation_nl: row.l1_translation.trim() || null,
      translation_en: row.l2_translation != null ? (row.l2_translation.trim() || null) : null,
    }

    // ----- anchor context (item_contexts row, is_anchor_context=true) -----
    // context_type MUST be one of the item_contexts CHECK values
    // ('example_sentence','dialogue','cloze','lesson_snippet','vocabulary_list',
    // 'exercise_prompt'). The anchor is the lesson snippet where the item is
    // introduced → 'lesson_snippet' (matches the legacy projectVocab value +
    // existing prod rows). NOT section_kind — 'vocabulary'/'expressions'/
    // 'numbers' are NOT valid context_type values and violate the DB CHECK.
    const anchorContext = {
      context_type: 'lesson_snippet',
      source_text: row.indonesian_text,
      translation_text: row.l1_translation || null,
    }

    // ----- item capability rows -----
    // The learner language is 'nl' because l1_translation is Dutch (NL).
    // This mirrors capabilityCatalog.ts:54 which reads the first meaning's language.
    // For typed DB rows, l1_translation is always NL per the migration constraint.
    const learnerLanguage = 'nl'

    const textRecognitionDraft = {
      sourceKind: 'item' as const,
      sourceRef,
      capabilityType: 'text_recognition' as const,
      direction: 'id_to_l1' as const,
      modality: 'text' as const,
      learnerLanguage: learnerLanguage as const,
    }
    const textRecognitionKey = buildCanonicalKey(textRecognitionDraft)

    const l1ToIdChoiceDraft = {
      sourceKind: 'item' as const,
      sourceRef,
      capabilityType: 'l1_to_id_choice' as const,
      direction: 'l1_to_id' as const,
      modality: 'text' as const,
      learnerLanguage: learnerLanguage as const,
    }
    const l1ToIdChoiceKey = buildCanonicalKey(l1ToIdChoiceDraft)

    const capabilities: CapabilityInput[] = [
      {
        canonicalKey: textRecognitionKey,
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'text_recognition',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [],
      },
      {
        canonicalKey: l1ToIdChoiceKey,
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'l1_to_id_choice',
        direction: 'l1_to_id',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [textRecognitionKey],
      },
      {
        canonicalKey: buildCanonicalKey({
          sourceKind: 'item',
          sourceRef,
          capabilityType: 'meaning_recall',
          direction: 'id_to_l1',
          modality: 'text',
          learnerLanguage,
        }),
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'meaning_recall',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [textRecognitionKey],
      },
      {
        canonicalKey: buildCanonicalKey({
          sourceKind: 'item',
          sourceRef,
          capabilityType: 'form_recall',
          direction: 'l1_to_id',
          modality: 'text',
          learnerLanguage,
        }),
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'form_recall',
        direction: 'l1_to_id',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [l1ToIdChoiceKey],
      },
    ]

    // ----- audio capability rows -----
    // Emit audio_recognition + dictation if an audio_clip exists for this item.
    // The lookup uses normalizeTtsText (toLowerCase + trim + collapse internal
    // whitespace — see tts-normalize.ts; NOT lower+trim only) to match the key
    // used by Stage A when writing audio_clips.normalized_text (adapter.ts:fetchLessonAudioCoverage).
    // This mirrors capabilityCatalog.ts:93–116 exactly:
    //   audio_recognition: direction=audio_to_l1, learnerLanguage=<first meaning lang>
    //   dictation:         direction=audio_to_id, learnerLanguage='none' (hardcoded)
    const audioKey = normalizeTtsText(row.indonesian_text)
    const audioMap = input.audioClipsByNormalizedText ?? new Map()
    if (audioMap.has(audioKey)) {
      capabilities.push({
        canonicalKey: buildCanonicalKey({
          sourceKind: 'item',
          sourceRef,
          capabilityType: 'audio_recognition',
          direction: 'audio_to_l1',
          modality: 'audio',
          learnerLanguage,
        }),
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'audio_recognition',
        direction: 'audio_to_l1',
        modality: 'audio',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [textRecognitionKey],
      })
      capabilities.push({
        canonicalKey: buildCanonicalKey({
          sourceKind: 'item',
          sourceRef,
          capabilityType: 'dictation',
          direction: 'audio_to_id',
          modality: 'audio',
          learnerLanguage: 'none',
        }),
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'dictation',
        direction: 'audio_to_id',
        modality: 'audio',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [textRecognitionKey],
      })
    }

    return {
      row,
      normalizedText,
      sourceRef,
      learningItemInput,
      anchorContext,
      capabilities,
    }
  })

  return { perItemPlans }
}
