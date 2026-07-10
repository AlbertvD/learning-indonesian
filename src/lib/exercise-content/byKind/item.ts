// lib/exercise-content/byKind/item — item-source-kind fetcher.
//
// PR 1 changes (Decision R + Q + G2, 2026-05-22):
// - Decision R: translations from learning_items.translation_{nl,en} directly
//   instead of joining item_meanings. item_meanings table stays (dropped in PR 7).
// - Decision Q: capability_audio_refs table was retired unwired (pre-cloud
//   hardening, 2026-07-02) — it never had a writer. Audio resolves via
//   audioService.fetchSessionAudioMap -> get_audio_clips RPC keyed by
//   (text, voice_id), independent of item source-kind.
// - Decision G2 Group B: curated distractor tables populated but not yet wired
//   to builders (builders use poolMeaningsByItem fallback — same behaviour as today).
//
// Extracted from ../adapter.ts in PR 0 of
// docs/plans/2026-05-21-affixed-form-pair-runtime.md.

import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
} from '@/types/learning'
import { chunkedIn } from '@/lib/chunkedQuery'
import { itemSlug } from '@/lib/capabilities'
import {
  type ItemBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
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
 * Resolve curated distractor pointer rows into the two `capability_id → string[]`
 * maps the builders consume (cap-v2). A pointer's string form depends on the
 * capability type: meaning MCQs (recognise_meaning_from_text_cap, recognise_meaning_from_audio_cap) render the
 * distractor item's L1 gloss (userLanguage); choose_form_ex (recognise_form_from_meaning_cap)
 * renders its Indonesian form. Pure — no I/O; the fetcher supplies the looked-up
 * rows so this stays unit-testable.
 */
export function resolveDistractorMaps(
  rows: ReadonlyArray<{ capability_id: string; item_id: string }>,
  capTypeById: ReadonlyMap<string, string>,
  itemById: ReadonlyMap<string, { base_text: string; translation_nl: string | null; translation_en: string | null }>,
  userLanguage: 'nl' | 'en',
): { curatedRecognitionDistractors: Map<string, string[]>; curatedCuedRecallDistractors: Map<string, string[]> } {
  const curatedRecognitionDistractors = new Map<string, string[]>()
  const curatedCuedRecallDistractors = new Map<string, string[]>()
  const push = (m: Map<string, string[]>, key: string, val: string): void => {
    const list = m.get(key) ?? []
    list.push(val)
    m.set(key, list)
  }
  for (const { capability_id, item_id } of rows) {
    const type = capTypeById.get(capability_id)
    const item = itemById.get(item_id)
    if (!type || !item) continue
    if (type === 'recognise_meaning_from_text_cap' || type === 'recognise_meaning_from_audio_cap') {
      const meaning = (userLanguage === 'nl' ? item.translation_nl : item.translation_en)?.trim()
      if (meaning) push(curatedRecognitionDistractors, capability_id, meaning)
    } else if (type === 'recognise_form_from_meaning_cap') {
      const form = item.base_text?.trim()
      if (form) push(curatedCuedRecallDistractors, capability_id, form)
    }
  }
  return { curatedRecognitionDistractors, curatedCuedRecallDistractors }
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

  // Curated distractors (cap-v2): read the `distractors` pointer table and the
  // capability types, then resolve each item_id pointer to the wrong-option
  // string the builder renders — the L1 gloss for meaning MCQs
  // (recognise_meaning_from_text_cap + recognise_meaning_from_audio_cap) or the Indonesian form for choose_form_ex
  // (recognise_form_from_meaning_cap). Replaces the old text-array tables
  // (recognition_mcq_distractors / cued_recall_distractors), dropped in the
  // vocabulary cutover. Chunked through chunkedIn (Kong 8 KB request-line guard).
  async function fetchDistractorPointerRows(capabilityIds: string[]): Promise<Array<{capability_id: string; item_id: string}>> {
    return chunkedIn<{capability_id: string; item_id: string}>(
      'distractors', 'capability_id', capabilityIds, q => q.select('capability_id, item_id'), client,
    )
  }

  async function fetchCapabilityTypes(capabilityIds: string[]): Promise<Array<{id: string; capability_type: string}>> {
    return chunkedIn<{id: string; capability_type: string}>(
      'learning_capabilities', 'id', capabilityIds, q => q.select('id, capability_type'), client,
    )
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
  const itemByKey = new Map(items.map(i => [i.normalized_text, i]))

  // Register-pair reader union (spec docs/plans/2026-07-09-spreektaal-lesson-
  // woven-core.md §7): an informal item's typed-NL recall grades against its
  // own item_answer_variants row set PLUS the formal twin's — informal items
  // never get their own copy (a copied variant set would be a second, unsynced
  // instance that drifts the moment the formal item's variants are corrected
  // via flag→review). Resolve register_counterpart through itemSlug (the
  // canonical base_text mint — capability-stage/projectors/vocab.ts:119, never
  // a bespoke lowercase/trim) and fetch the formal item alongside the requested
  // batch when it isn't already in it. Inert until the register/
  // register_counterpart columns exist (both are `undefined` on every row until
  // then, so this loop finds nothing to resolve).
  const counterpartKeysNeeded = [...new Set(
    items
      .map(i => (i.register === 'informal' ? i.register_counterpart : null))
      .filter((text): text is string => !!text)
      .map(text => itemSlug(text))
      .filter(key => !itemByKey.has(key)),
  )]
  const counterpartItems = counterpartKeysNeeded.length > 0
    ? await fetchLearningItemsByKey(counterpartKeysNeeded)
    : []
  for (const c of counterpartItems) itemByKey.set(c.normalized_text, c)

  // itemUuid → formal-twin uuid, only for informal items whose counterpart
  // resolved to a live item. Phrase-anchored rows (§3.1) whose counterpart is
  // text-only and doesn't resolve to an item are absent from this map — the
  // union no-ops for them (data-architect r3 addendum): the informal item
  // grades against its own (possibly empty) variant set plus its clean
  // translation_nl.
  const counterpartUuidByItemUuid = new Map<string, string>()
  for (const i of items) {
    const counterpartText = i.register === 'informal' ? i.register_counterpart : null
    if (!counterpartText) continue
    const counterpart = itemByKey.get(itemSlug(counterpartText))
    if (counterpart) counterpartUuidByItemUuid.set(i.id, counterpart.id)
  }

  // Wave 2: now that we have item uuids (incl. any resolved formal twin), fan
  // out dependent reads.
  const itemIds = [...new Set([...items.map(i => i.id), ...counterpartItems.map(i => i.id)])]
  // Collect capability_ids from all item blocks for curated-distractor fetch.
  const capabilityIds = [...new Set(itemBlocks.map(b => b.block.capabilityId))]
  const [contexts, answerVariants, distractorRows, capTypeRows] = await Promise.all([
    fetchContexts(itemIds),
    fetchAnswerVariants(itemIds),
    fetchDistractorPointerRows(capabilityIds),
    fetchCapabilityTypes(capabilityIds),
  ])

  // Resolve distractor pointers → wrong-option strings (cap-v2). Fetch the
  // pointed-at items, then map each pointer to the gloss or form per cap type.
  const distractorItemIds = [...new Set(distractorRows.map(r => r.item_id))]
  const distractorItems = await fetchLearningItemsById(distractorItemIds)
  const capTypeById = new Map(capTypeRows.map(r => [r.id, r.capability_type]))
  const distractorItemById = new Map(distractorItems.map(i => [i.id, i]))
  const { curatedRecognitionDistractors, curatedCuedRecallDistractors } = resolveDistractorMaps(
    distractorRows, capTypeById, distractorItemById, userLanguage,
  )

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

  // Indexes — by uuid (for joins). itemByKey (slug → row) was already built
  // above, ahead of the register-pair counterpart resolution.
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
    // Register-pair reader union (spec §7): union in the formal twin's variants
    // when this item is informal and its counterpart resolved to a live item;
    // own set only otherwise (formal items are unaffected — they have no
    // counterpart entry in the map).
    const counterpartUuid = counterpartUuidByItemUuid.get(itemUuid)
    const answerVariantsForItem = counterpartUuid
      ? [...(answerVariantsByItem.get(itemUuid) ?? []), ...(answerVariantsByItem.get(counterpartUuid) ?? [])]
      : (answerVariantsByItem.get(itemUuid) ?? [])

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem,
        dialogueLine: null,        // item bucket — projector's bucketing invariant
        affixedFormPair: null,     // item bucket — projector's bucketing invariant
        patternExercise: null,     // item bucket — projector's bucketing invariant
        meanings,
        contexts: contextsByItem.get(itemUuid) ?? [],
        answerVariants: answerVariantsForItem,
        // Slice 4b: the capability_artifacts bag is gone. Audio is resolved via
        // SessionAudioContext upstream; readiness is decided by renderContracts
        // routing (requiredArtifacts collapsed to []), not an artifact bag.
        poolItems,
        poolMeaningsByItem,
        userLanguage,
        // Task 8 / #99: curated-distractor maps. Non-empty when the pipeline
        // has seeded the distractor tables for this item's caps. Builders
        // prefer these and fall back to pickDistractorCascade when absent.
        curatedRecognitionDistractors,
        curatedCuedRecallDistractors,
      },
    })
  }
}
