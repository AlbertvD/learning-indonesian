// lib/exercise-content/byKind/item — item-source-kind fetcher.
//
// PR 1 changes (Decision R + Q + G2, 2026-05-22):
// - Decision R: translations from learning_items.translation_{nl,en} directly
//   instead of joining item_meanings. item_meanings table stays (dropped in PR 7).
// - Decision Q: audio refs from capability_audio_refs table (not capability_artifacts).
//   The byType builders don't read artifactsByKind for audio (audio is resolved via
//   SessionAudioContext upstream); this table is populated for future use.
// - Decision G2 Group B: curated distractor tables populated but not yet wired
//   to builders (builders use poolMeaningsByItem fallback — same behaviour as today).
//
// Extracted from ../adapter.ts in PR 0 of
// docs/plans/2026-05-21-affixed-form-pair-runtime.md.

import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import { chunkedIn } from '@/lib/chunkedQuery'
import {
  type ItemBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  type CapabilityArtifactRow,
  makeFailContext,
} from '../adapter'

/**
 * Synthesise an ItemMeaning-shaped object from a LearningItem's inline translation
 * columns (Decision R). Returns null when the column is null or empty (pre-
 * first-republish state or item without a translation for this language).
 */
function syntheticMeaning(
  item: LearningItem,
  language: 'nl' | 'en',
): ItemMeaning | null {
  const text = language === 'nl' ? item.translation_nl : item.translation_en
  if (!text || text.trim().length === 0) return null
  return {
    // Synthetic id — not a real DB uuid, but only translation_text is consumed
    // by the exercise builders (they call .translation_text). The id is never
    // written back to the DB in this read path.
    id: `synthetic:${item.id}:${language}`,
    learning_item_id: item.id,
    translation_language: language,
    translation_text: text.trim(),
    sense_label: null,
    usage_note: item.usage_note ?? null,
    is_primary: true,
  }
}

/**
 * Build an ItemMeaning[] from the inline columns on a LearningItem (Decision R).
 * One row per language that has a value; mirrors the old item_meanings shape.
 */
function meaningsFromItem(item: LearningItem): ItemMeaning[] {
  const out: ItemMeaning[] = []
  const nl = syntheticMeaning(item, 'nl')
  if (nl) out.push(nl)
  const en = syntheticMeaning(item, 'en')
  if (en) out.push(en)
  return out
}

/**
 * Item bucket: wave-1 + wave-2 + distractor-pool pipeline. Item-not-found and
 * item-inactive failure cases are item-specific so they live inside this
 * fetcher. Mutates `result` so the per-block ordering matches the input bucket.
 */
export async function fetchForItemBlocks(
  client: SupabaseSchemaClient,
  itemBlocks: ItemBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (itemBlocks.length === 0) return

  const db = () => client.schema('indonesian')

  // Items are looked up by `normalized_text` (the slug the catalog stores),
  // NOT by uuid `id`. See extractItemKey docstring in ../adapter.ts +
  // smoke-test 2026-05-02.
  async function fetchLearningItemsByKey(keys: string[]): Promise<LearningItem[]> {
    if (keys.length === 0) return []
    const { data, error } = await db().from('learning_items').select('*').in('normalized_text', keys)
    if (error) throw error
    return (data ?? []) as LearningItem[]
  }

  // Chunked: the distractor-pool path can pass several hundred ids (one per
  // item anchored to any touched lesson). A single IN clause overflows Kong's
  // 8 KB request-line buffer; the chunker holds each URL under ~2 KB.
  async function fetchLearningItemsById(ids: string[]): Promise<LearningItem[]> {
    return chunkedIn<LearningItem>('learning_items', 'id', ids, undefined, client)
  }

  async function fetchContexts(itemIds: string[]): Promise<ItemContext[]> {
    if (itemIds.length === 0) return []
    const { data, error } = await db().from('item_contexts').select('*').in('learning_item_id', itemIds)
    if (error) throw error
    return (data ?? []) as ItemContext[]
  }

  async function fetchAnswerVariants(itemIds: string[]): Promise<ItemAnswerVariant[]> {
    if (itemIds.length === 0) return []
    const { data, error } = await db().from('item_answer_variants').select('*').in('learning_item_id', itemIds)
    if (error) throw error
    return (data ?? []) as ItemAnswerVariant[]
  }

  async function fetchActiveVariants(itemIds: string[]): Promise<ExerciseVariant[]> {
    if (itemIds.length === 0) return []
    const { data, error } = await db()
      .from('exercise_variants')
      .select('*')
      .in('learning_item_id', itemIds)
      .eq('is_active', true)
    if (error) throw error
    return (data ?? []) as ExerciseVariant[]
  }

  async function fetchDistractorPool(lessonIds: string[]): Promise<LearningItem[]> {
    if (lessonIds.length === 0) return []
    // Items whose contexts anchor to any of the touched lessons.
    const { data: contextRows, error: cErr } = await db()
      .from('item_contexts')
      .select('learning_item_id')
      .in('source_lesson_id', lessonIds)
    if (cErr) throw cErr
    const itemIds = [...new Set(((contextRows ?? []) as Array<{ learning_item_id: string }>).map(r => r.learning_item_id))]
    if (itemIds.length === 0) return []
    const items = await fetchLearningItemsById(itemIds)
    return items.filter(i => i.is_active)
  }

  const itemKeys = [...new Set(itemBlocks.map(b => b.itemKey))]

  // Wave 1: resolve item slugs → rows.
  const items = await fetchLearningItemsByKey(itemKeys)

  // Wave 2: now that we have item uuids, fan out dependent reads.
  const itemIds = items.map(i => i.id)
  const [contexts, answerVariants, variants] = await Promise.all([
    fetchContexts(itemIds),
    fetchAnswerVariants(itemIds),
    fetchActiveVariants(itemIds),
  ])

  // Distractor pool: derived from the lessons the block items' contexts
  // anchor to. Run after wave 2 so lessonIds are known.
  const lessonIds = [...new Set(
    contexts.map(c => c.source_lesson_id).filter((x): x is string => x != null),
  )]
  const poolItems = await fetchDistractorPool(lessonIds)

  // Pool meanings: synthesised from inline columns (Decision R).
  // No longer reads item_meanings; uses translation_{nl,en} directly.
  const poolMeaningsByItem = new Map<string, ItemMeaning[]>()
  for (const item of poolItems) {
    const ms = meaningsFromItem(item)
    if (ms.length > 0) poolMeaningsByItem.set(item.id, ms)
  }

  // Indexes — both by uuid (for joins) and by key (for slug → row lookup).
  const itemByKey = new Map(items.map(i => [i.normalized_text, i]))

  const contextsByItem = new Map<string, ItemContext[]>()
  for (const c of contexts) {
    const list = contextsByItem.get(c.learning_item_id) ?? []
    list.push(c)
    contextsByItem.set(c.learning_item_id, list)
  }
  const answerVariantsByItem = new Map<string, ItemAnswerVariant[]>()
  for (const v of answerVariants) {
    const list = answerVariantsByItem.get(v.learning_item_id) ?? []
    list.push(v)
    answerVariantsByItem.set(v.learning_item_id, list)
  }
  // Variants indexed by (item_id, exercise_type) for cheap lookup.
  const variantByItemAndType = new Map<string, ExerciseVariant>()
  for (const v of variants) {
    if (v.learning_item_id) {
      variantByItemAndType.set(`${v.learning_item_id}:${v.exercise_type}`, v)
    }
  }

  // Per-block RawProjectorInput assembly. The item-not-found + item-inactive
  // failure cases are item-specific so they live inside this fetcher.
  for (const { block, itemKey } of itemBlocks) {
    const learningItem = itemByKey.get(itemKey) ?? null
    if (!learningItem) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'block_failed_db_fetch',
          `learning_item with normalized_text='${itemKey}' not in wave-1 fetch result`,
          { itemKey, capabilityId: block.capabilityId }),
      })
      continue
    }
    if (!learningItem.is_active) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'item_inactive',
          `learning_item ${learningItem.id} is_active=false`,
          { itemKey, itemId: learningItem.id }),
      })
      continue
    }

    const itemUuid = learningItem.id
    // Decision R: build meanings from inline columns instead of item_meanings.
    const meanings = meaningsFromItem(learningItem)

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem,
        dialogueLine: null,        // item bucket — projector's bucketing invariant
        affixedFormPair: null,     // item bucket — projector's bucketing invariant
        meanings,
        contexts: contextsByItem.get(itemUuid) ?? [],
        answerVariants: answerVariantsByItem.get(itemUuid) ?? [],
        variant: variantByItemAndType.get(`${itemUuid}:${block.renderPlan.exerciseType}`) ?? null,
        // Decision Q + G2: artifactsByKind is always empty for item caps after
        // PR 1. The byType builders never read artifactsByKind (verified by
        // grep); audio is resolved via SessionAudioContext upstream. The session-
        // builder/adapter.ts reads capability_audio_refs for planner readiness
        // instead. renderContracts.ts requiredArtifacts.item = [] so validateCapability
        // passes without artifact checks.
        artifactsByKind: new Map(),
        poolItems,
        poolMeaningsByItem,
        userLanguage,
      },
    })
  }
}

// Re-export the row type so siblings inside byKind/ that need it can pull it
// from this file's import surface if they later land. Today only adapter.ts
// owns the type; this is a forward-compatible re-export.
export type { CapabilityArtifactRow }
