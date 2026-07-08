/**
 * projectors/vocab.ts — pure item projector.
 *
 * `projectItemsFromTypedRows` maps typed `lesson_section_item_rows` (loaded from
 * the DB) into per-item write plans (learning_items upsert + anchor context + the
 * 3 vocabulary caps: recognise_meaning_from_text_cap, recognise_meaning_from_audio_cap,
 * produce_form_from_meaning_cap — ADR 0027 bounds the per-word mode set to these three).
 *
 * The legacy staging projector (`projectVocab` / `selectPublishableItems` + the
 * `produce_form_from_context_cap` dialogue emission) was retired in Slice 5b (#147): the runner
 * is DB-only and dialogue clozes are generated in-stage (projectors/dialogueCloze.ts).
 */

import {
  buildCanonicalKey,
  CAPABILITY_PROJECTION_VERSION,
  canonicaliseDutchSeparator,
  itemSlug,
  KEPT_VOCAB_CAP_TYPES,
} from '@/lib/capabilities'

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
 *   - `capabilities`   — the CapabilityInput rows for this item (3 vocab caps, ADR 0027)
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
   * normalizeTtsText(base_text). Retained for signature compatibility with
   * callers/tests; audio caps are emitted unconditionally regardless of map
   * membership (§0.8 below), so this map no longer gates emission.
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
 * ADR 0027 (vocabulary-mode-set-bounded): each item emits exactly the 3
 * capabilities in `KEPT_VOCAB_CAP_TYPES` (`@/lib/capabilities/vocabModeSet.ts`)
 * instead of the earlier 6 — modes #2 (recognise_form_from_meaning_cap),
 * #4 (recall_meaning_from_text_cap) and #5 (produce_form_from_audio_cap,
 * `DROPPED_VOCAB_CAP_TYPES`) are dropped from the model entirely:
 *   1. recognise_meaning_from_text_cap  (id_to_l1) — #1, root/scaffold, prerequisiteKeys: []
 *   2. recognise_meaning_from_audio_cap (audio_to_l1) — #3, aural, prereq #1
 *   3. produce_form_from_meaning_cap    (l1_to_id) — #6, productive frontier, prereq #1
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
      // Canonicalise the separator HERE: l1_translation comes from the
      // lesson-section display source (lesson_section_item_rows), which the
      // cutover left with legacy comma/";" OR-lists. This projector is the seam
      // where that display gloss becomes the graded answer surface
      // (learning_items.translation_nl), so the "/" convention must be applied
      // before it reaches CS19 + the runtime grader (#161 follow-up).
      translation_nl: row.l1_translation.trim()
        ? canonicaliseDutchSeparator(row.l1_translation.trim())
        : null,
      translation_en: row.l2_translation != null ? (row.l2_translation.trim() || null) : null,
      // Bet-1 §3.2: forward the loanword source through to learning_items.loan_source_nl.
      loan_source_nl: row.loan_source_nl?.trim() ? row.loan_source_nl.trim() : null,
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
      sourceKind: 'vocabulary_src' as const,
      sourceRef,
      capabilityType: 'recognise_meaning_from_text_cap' as const,
      direction: 'id_to_l1' as const,
      modality: 'text' as const,
      learnerLanguage: learnerLanguage as const,
    }
    const textRecognitionKey = buildCanonicalKey(textRecognitionDraft)

    // #1 — recognise_meaning_from_text_cap: root/scaffold, no prerequisites.
    const capabilities: CapabilityInput[] = [
      {
        canonicalKey: textRecognitionKey,
        sourceKind: 'vocabulary_src',
        sourceRef,
        capabilityType: 'recognise_meaning_from_text_cap',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [],
      },
      // #6 — produce_form_from_meaning_cap: productive frontier, never retired.
      // prerequisiteKeys points at #1 (ADR 0027 — was #2's key before the trim;
      // #2 no longer exists so every not-yet-introduced #6 would otherwise be
      // permanently unintroducible).
      {
        canonicalKey: buildCanonicalKey({
          sourceKind: 'vocabulary_src',
          sourceRef,
          capabilityType: 'produce_form_from_meaning_cap',
          direction: 'l1_to_id',
          modality: 'text',
          learnerLanguage,
        }),
        sourceKind: 'vocabulary_src',
        sourceRef,
        capabilityType: 'produce_form_from_meaning_cap',
        direction: 'l1_to_id',
        modality: 'text',
        learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [textRecognitionKey],
      },
    ]

    // ----- audio capability row -----
    // cap-v2 #161 (§0.8): the audio cap is emitted for EVERY word/phrase item —
    // audio is ASSUMED to exist (the Lesson Stage's ensureLessonAudio voices every
    // vocab/expressions/numbers word). A missing audio_clip is NOT silently skipped
    // here; it is flagged by the vocab gate's CS23 audio-coverage check, and the
    // hard Stage-A enforcement is #165. (The clip-existence gate that used to wrap
    // this block is removed.)
    //   recognise_meaning_from_audio_cap: direction=audio_to_l1, learnerLanguage=<meaning lang>
    // ADR 0027: the dictation mode (produce_form_from_audio_cap, #5) is dropped —
    // aural recognition + orthographic production overlap it (brief §3 guardrails).
    capabilities.push({
      canonicalKey: buildCanonicalKey({
        sourceKind: 'vocabulary_src',
        sourceRef,
        capabilityType: 'recognise_meaning_from_audio_cap',
        direction: 'audio_to_l1',
        modality: 'audio',
        learnerLanguage,
      }),
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recognise_meaning_from_audio_cap',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage,
      projectionVersion: CAPABILITY_PROJECTION_VERSION,
      lessonId: input.lessonId,
      requiredArtifacts: [],
      prerequisiteKeys: [textRecognitionKey],
    })

    // Invariant guard (ADR 0027): the emitted set must be EXACTLY
    // KEPT_VOCAB_CAP_TYPES — the shared constant both this projector and the
    // one-off retirement script / health checks import, so drift is caught
    // here rather than silently reappearing in a future edit.
    const emittedTypes = new Set(capabilities.map((c) => c.capabilityType))
    if (
      emittedTypes.size !== KEPT_VOCAB_CAP_TYPES.length ||
      !KEPT_VOCAB_CAP_TYPES.every((t) => emittedTypes.has(t))
    ) {
      throw new Error(
        `projectItemsFromTypedRows: emitted capability types [${[...emittedTypes].join(', ')}] `
        + `do not match KEPT_VOCAB_CAP_TYPES [${KEPT_VOCAB_CAP_TYPES.join(', ')}] (ADR 0027)`,
      )
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
