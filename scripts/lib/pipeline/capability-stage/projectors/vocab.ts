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
  CAPABILITY_PROJECTION_VERSION,
} from '../../../../../src/lib/capabilities/capabilityTypes'
import { buildCanonicalKey, normalizeLessonSourceRef } from '../../../../../src/lib/capabilities/canonicalKey'

import type {
  CapabilityInput,
  LearningItemInput,
  MeaningInput,
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
  meanings: MeaningInput[]
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

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
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
      .map((c) => String(c.learning_item_slug).toLowerCase().trim()),
  )

  const deferred: VocabStagingItem[] = []
  for (const item of input.learningItems) {
    if (item.item_type !== 'dialogue_chunk') continue
    const hasTranslation = Boolean((item.translation_nl ?? '').trim())
    const slug = String(item.base_text ?? '').toLowerCase().trim()
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
    const meanings: MeaningInput[] = []
    if ((item.translation_nl ?? '').trim()) {
      meanings.push({
        learning_item_id: '',
        translation_language: 'nl',
        translation_text: (item.translation_nl ?? '').trim(),
        is_primary: true,
      })
    }
    if ((item.translation_en ?? '').trim()) {
      meanings.push({
        learning_item_id: '',
        translation_language: 'en',
        translation_text: (item.translation_en ?? '').trim(),
        is_primary: true,
      })
    }
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
      },
      meanings,
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
    const slug = String(ctx.learning_item_slug ?? '').toLowerCase().trim()
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
        sourceFingerprint: fingerprint({ sourceKind: draft.sourceKind, sourceRef }),
        artifactFingerprint: fingerprint(['cloze_context', 'cloze_answer', 'translation:l1']),
        // Decision 3b (ADR 0006): contextual_cloze caps inherit the projecting
        // lesson — the runner is invoked per lesson, so this dialogue line's
        // owning lesson IS the introducing lesson by construction.
        lessonId: input.lessonId,
        metadata: {
          skillType: 'form_recall',
          requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
          prerequisiteKeys: [],
          difficultyLevel: 3,
          goalTags: [],
        },
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
      const key = text.toLowerCase()
      const sourceRef = `${lessonSourceRef}/section-${section.order_index}/line-${idx}`
      const existing = map.get(key) ?? []
      existing.push(sourceRef)
      map.set(key, existing)
    }
  }
  return map
}
