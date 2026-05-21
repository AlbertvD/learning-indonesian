// lib/exercise-content/byKind/item — item-source-kind fetcher.
//
// Reads the full item bag: learning_items (by normalized_text slug), meanings,
// contexts, answer variants, active exercise variants, plus a lesson-anchored
// distractor pool. Sister files in byKind/ cover the other source kinds
// (dialogueLine, affixedFormPair). Shared concerns (artifact fetch, fail-
// context construction, types) stay in ../adapter.
//
// Extracted from ../adapter.ts in PR 0 of
// docs/plans/2026-05-21-affixed-form-pair-runtime.md (the trigger §6 of
// docs/current-system/modules/exercise-content.md names).

import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { ArtifactKind, CapabilityArtifact } from '@/lib/capabilities'
import { chunkedIn } from '@/lib/chunkedQuery'
import {
  type ItemBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  type CapabilityArtifactRow,
  fetchArtifacts,
  makeFailContext,
} from '../adapter'

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

  async function fetchMeanings(itemIds: string[]): Promise<ItemMeaning[]> {
    return chunkedIn<ItemMeaning>('item_meanings', 'learning_item_id', itemIds, undefined, client)
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

  async function fetchDistractorPool(lessonIds: string[]): Promise<{ items: LearningItem[]; meanings: ItemMeaning[] }> {
    if (lessonIds.length === 0) return { items: [], meanings: [] }
    // Items whose contexts anchor to any of the touched lessons.
    const { data: contextRows, error: cErr } = await db()
      .from('item_contexts')
      .select('learning_item_id')
      .in('source_lesson_id', lessonIds)
    if (cErr) throw cErr
    const itemIds = [...new Set(((contextRows ?? []) as Array<{ learning_item_id: string }>).map(r => r.learning_item_id))]
    if (itemIds.length === 0) return { items: [], meanings: [] }
    const [items, meanings] = await Promise.all([
      fetchLearningItemsById(itemIds),
      fetchMeanings(itemIds),
    ])
    return { items: items.filter(i => i.is_active), meanings }
  }

  const itemKeys = [...new Set(itemBlocks.map(b => b.itemKey))]
  const capabilityIds = [...new Set(itemBlocks.map(b => b.block.capabilityId))]

  // Wave 1: resolve item slugs → rows (with uuids) + fetch artifacts in parallel.
  const [items, artifactRows] = await Promise.all([
    fetchLearningItemsByKey(itemKeys),
    fetchArtifacts(client, capabilityIds),
  ])

  // Wave 2: now that we have item uuids, fan out dependent reads.
  const itemIds = items.map(i => i.id)
  const [meanings, contexts, answerVariants, variants] = await Promise.all([
    fetchMeanings(itemIds),
    fetchContexts(itemIds),
    fetchAnswerVariants(itemIds),
    fetchActiveVariants(itemIds),
  ])

  // Distractor pool: derived from the lessons the block items' contexts
  // anchor to. Run after wave 2 so lessonIds are known.
  const lessonIds = [...new Set(
    contexts.map(c => c.source_lesson_id).filter((x): x is string => x != null),
  )]
  const pool = await fetchDistractorPool(lessonIds)
  const poolMeaningsByItem = new Map<string, ItemMeaning[]>()
  for (const m of pool.meanings) {
    const list = poolMeaningsByItem.get(m.learning_item_id) ?? []
    list.push(m)
    poolMeaningsByItem.set(m.learning_item_id, list)
  }

  // Indexes — both by uuid (for joins) and by key (for slug → row lookup).
  const itemByKey = new Map(items.map(i => [i.normalized_text, i]))
  const meaningsByItem = new Map<string, ItemMeaning[]>()
  for (const m of meanings) {
    const list = meaningsByItem.get(m.learning_item_id) ?? []
    list.push(m)
    meaningsByItem.set(m.learning_item_id, list)
  }
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
  // Artifacts indexed by capability_id → Map<kind, artifact>.
  const artifactsByCapability = new Map<string, Map<ArtifactKind, CapabilityArtifact>>()
  for (const row of artifactRows) {
    const inner = artifactsByCapability.get(row.capability_id) ?? new Map<ArtifactKind, CapabilityArtifact>()
    inner.set(row.artifact_kind, {
      qualityStatus: 'approved',
      value: row.artifact_json,
    })
    artifactsByCapability.set(row.capability_id, inner)
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
    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem,
        dialogueLine: null,        // item bucket — projector's bucketing invariant
        affixedFormPair: null,     // item bucket — projector's bucketing invariant
        meanings: meaningsByItem.get(itemUuid) ?? [],
        contexts: contextsByItem.get(itemUuid) ?? [],
        answerVariants: answerVariantsByItem.get(itemUuid) ?? [],
        variant: variantByItemAndType.get(`${itemUuid}:${block.renderPlan.exerciseType}`) ?? null,
        artifactsByKind: artifactsByCapability.get(block.capabilityId) ?? new Map(),
        poolItems: pool.items,
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
