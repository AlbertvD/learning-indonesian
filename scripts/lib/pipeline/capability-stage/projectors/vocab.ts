/**
 * projectors/vocab.ts — pure projection of staged learning-items + cloze
 * contexts into per-item write plans.
 *
 * Source-of-truth mapping (legacy → here):
 *   422–465 deferred-dialogue gate
 *   484–564 learning-items + meanings + anchor-contexts loop
 *
 * Decision 5b — `contextual_cloze` emission was removed from the shared
 * catalog (capabilityCatalog.ts lines 149–162) and is re-added here, keyed
 * by dialogue lines whose slug matches a staged cloze context. Source of
 * clozeContexts is the staging file (cloze-contexts.ts), same as legacy.
 */

import {
  buildCanonicalKey,
  CAPABILITY_PROJECTION_VERSION,
  itemSlug,
  normalizeLessonSourceRef,
} from '@/lib/capabilities'

import { normalizeTtsText } from '../../../tts-normalize'
import type { AudioClipMeta } from '../adapter'

import { sourceRefForLearningItem } from '../../../content-pipeline-output'

import type {
  CapabilityInput,
  LearningItemInput,
} from '../adapter'

export interface VocabStagingItem {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
  context_type: string
  translation_nl?: string | null
  translation_en?: string | null
  pos?: string | null
  level?: string | null
  review_status?: string
}

export interface VocabStagingClozeContext {
  learning_item_slug: string
  source_text: string
  translation_text: string
  difficulty?: number | null
  topic_tag?: string | null
  /**
   * The literal token that fills `___` in `source_text`. Required on
   * dialogue-line cloze entries (the `learning_item_slug` matches a dialogue
   * line text, not a vocab item); ignored on vocab-item cloze entries where
   * the answer derives from `learning_item.base_text` at render time.
   * Consumed by `projectDialogueArtifacts` to write the `cloze_answer`
   * artifact for dialogue_line:contextual_cloze capabilities.
   */
  cloze_answer?: string
}

export interface VocabProjectionInput {
  lessonNumber: number
  lessonId: string
  level: string
  sections: Array<{ id?: string; title: string; content: Record<string, unknown>; order_index: number }>
  learningItems: VocabStagingItem[]
  clozeContexts: VocabStagingClozeContext[]
}

export interface PerItemPlan {
  index: number
  item: VocabStagingItem
  learningItemInput: LearningItemInput
  anchorContext: {
    context_type: string
    source_text: string
    translation_text: string | null | undefined
  }
}

export interface VocabProjectionOutput {
  perItemPlans: PerItemPlan[]
  deferredDialogueKeys: Set<string>
  /** Decision 5b — contextual_cloze rows for dialogue lines with cloze contexts. */
  contextualClozeCapabilities: CapabilityInput[]
}

/**
 * Deferred-dialogue gate (legacy 422–465). A `dialogue_chunk` learning item
 * is publishable iff it has BOTH translation_nl AND a cloze context whose
 * `learning_item_slug` matches the item's slug.
 */
export function selectPublishableItems(input: {
  learningItems: VocabStagingItem[]
  clozeContexts: VocabStagingClozeContext[]
}): { publishable: VocabStagingItem[]; deferred: VocabStagingItem[]; deferredKeys: Set<string> } {
  const dialogueSlugsWithCloze = new Set(
    input.clozeContexts
      .filter((c) => typeof c?.learning_item_slug === 'string')
      .map((c) => itemSlug(String(c.learning_item_slug))),
  )

  const deferred: VocabStagingItem[] = []
  for (const item of input.learningItems) {
    if (item.item_type !== 'dialogue_chunk') continue
    const hasTranslation = Boolean((item.translation_nl ?? '').trim())
    const slug = itemSlug(String(item.base_text ?? ''))
    const hasCloze = dialogueSlugsWithCloze.has(slug)
    if (!(hasTranslation && hasCloze)) deferred.push(item)
  }
  const deferredKeys = new Set(deferred.map((d) => d.base_text))
  const publishable = input.learningItems.filter((item) => !deferredKeys.has(item.base_text))
  return { publishable, deferred, deferredKeys }
}

export function projectVocab(input: VocabProjectionInput): VocabProjectionOutput {
  const lessonSourceRef = `lesson-${input.lessonNumber}`

  // Include 'published' so re-publishes refresh DB rows with enriched data
  // (LLM-filled translations, POS, levels). Upserts are idempotent — rewriting
  // an unchanged row is a no-op in Postgres. The status field is kept for
  // human review state; it no longer gates the DB write.
  const approved = input.learningItems.filter((item) =>
    item.review_status === 'pending_review' ||
    item.review_status === 'approved' ||
    item.review_status === 'deferred_dialogue' ||
    item.review_status === 'published',
  )
  const { publishable, deferredKeys } = selectPublishableItems({
    learningItems: approved,
    clozeContexts: input.clozeContexts,
  })

  const perItemPlans: PerItemPlan[] = publishable.map((item, index) => {
    return {
      index,
      item,
      learningItemInput: {
        base_text: item.base_text,
        item_type: item.item_type,
        language: 'id',
        level: input.level,
        source_type: 'lesson',
        pos: item.pos ?? null,
        // Decision R (PR 1): translations live in learning_items inline columns.
        translation_nl: (item.translation_nl ?? '').trim() || null,
        translation_en: (item.translation_en ?? '').trim() || null,
      },
      anchorContext: {
        context_type: item.context_type ?? '',
        source_text: item.base_text,
        translation_text: item.translation_nl ?? null,
      },
    }
  })

  // ---- Decision 5b — contextual_cloze emission. -------------------------
  const dialogueLineSourceRefs = collectDialogueLineSourceRefsByText(input.sections, lessonSourceRef)
  const contextualClozeCapabilities: CapabilityInput[] = []
  for (const ctx of input.clozeContexts) {
    const slug = itemSlug(String(ctx.learning_item_slug ?? ''))
    const sourceRefs = dialogueLineSourceRefs.get(slug) ?? []
    for (const rawRef of sourceRefs) {
      const sourceRef = normalizeLessonSourceRef(rawRef)
      const draft = {
        sourceKind: 'dialogue_line' as const,
        sourceRef,
        capabilityType: 'contextual_cloze' as const,
        direction: 'id_to_l1' as const,
        modality: 'text' as const,
        learnerLanguage: 'none' as const,
      }
      contextualClozeCapabilities.push({
        canonicalKey: buildCanonicalKey(draft),
        sourceKind: draft.sourceKind,
        sourceRef,
        capabilityType: draft.capabilityType,
        direction: draft.direction,
        modality: draft.modality,
        learnerLanguage: draft.learnerLanguage,
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        // Decision 3b (ADR 0006): contextual_cloze caps inherit the projecting
        // lesson — the runner is invoked per lesson, so this dialogue line's
        // owning lesson IS the introducing lesson by construction.
        lessonId: input.lessonId,
        // PR 2 slice: dialogue_line caps render from the typed `dialogue_clozes`
        // table; structure is guaranteed by that table + validateDialogueClozes +
        // HC15, so no capability_artifacts are required (mirrors item, Decision R).
        requiredArtifacts: [],
        prerequisiteKeys: [],
      })
    }
  }

  return { perItemPlans, deferredDialogueKeys: deferredKeys, contextualClozeCapabilities }
}

function collectDialogueLineSourceRefsByText(
  sections: Array<{ content: Record<string, unknown>; order_index: number }>,
  lessonSourceRef: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const section of sections) {
    const type = section.content?.type
    if (type !== 'dialogue') continue
    const lines = section.content?.lines
    if (!Array.isArray(lines)) continue
    for (const [idx, raw] of (lines as Array<{ text?: unknown }>).entries()) {
      const text = typeof raw?.text === 'string' ? raw.text.trim() : ''
      if (!text) continue
      const key = itemSlug(text)
      const sourceRef = `${lessonSourceRef}/section-${section.order_index}/line-${idx}`
      const existing = map.get(key) ?? []
      existing.push(sourceRef)
      map.set(key, existing)
    }
  }
  return map
}

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
