// lib/exercise-content/adapter — Supabase reads, source-kind bucketing, and
// diagnostic helpers. This module's sole I/O seam. Sister file to ./resolver,
// which is pure orchestration with no SQL.
//
// PR-A step 3 of the lib/exercise-content fold extracted the bucketing seam
// here: bucketByDecodedSourceKind classifies blocks by source kind, and
// createAdapter().loadBlockData runs source-kind-specific fetchers in parallel
// via Promise.all. Today only the item bucket has a fetcher; future source
// kinds (dialogue_line in PR-B, affixed_form_pair next, podcasts after) plug
// in as additional per-kind branches inside loadBlockData without touching
// the resolver.
//
// See:
//   - docs/current-system/modules/exercise-content.md
//   - docs/plans/2026-05-21-lib-exercise-content-fold.md (D1, D3, D5)

import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { SessionBlock } from '@/lib/session-builder'
import {
  CAPABILITY_SOURCE_KINDS,
  type ArtifactKind,
  type CapabilityArtifact,
  type CapabilitySourceKind,
  type CapabilityRenderContext,
  type ResolutionDiagnostic,
} from '@/lib/capabilities'
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { RawProjectorInput } from './byType'
import { chunkedIn } from '@/lib/chunkedQuery'

// ─── Canonical-key decoding ─────────────────────────────────────────────────

const VALID_SOURCE_KINDS: ReadonlySet<CapabilitySourceKind> = new Set(CAPABILITY_SOURCE_KINDS)

export type DecodedKey =
  | { kind: 'ok'; sourceKind: CapabilitySourceKind; sourceRef: string }
  | { kind: 'malformed'; raw: string }

/**
 * Decode a canonical-key snapshot built by `buildCanonicalKey`. Format:
 *
 *   cap:v1:<sourceKind>:<encodedSourceRef>:<capabilityType>:<direction>:<modality>:<learnerLanguage>
 *
 * Where `<encodedSourceRef>` percent-encodes `:` to `%3A` (preserves `/`).
 * See src/lib/capabilities/canonicalKey.ts:18-40.
 */
export function decodeCanonicalKey(canonicalKeySnapshot: string): DecodedKey {
  const parts = canonicalKeySnapshot.split(':')
  if (parts.length < 4 || parts[0] !== 'cap' || parts[1] !== 'v1') {
    return { kind: 'malformed', raw: canonicalKeySnapshot }
  }
  if (!VALID_SOURCE_KINDS.has(parts[2] as CapabilitySourceKind)) {
    return { kind: 'malformed', raw: canonicalKeySnapshot }
  }
  return {
    kind: 'ok',
    sourceKind: parts[2] as CapabilitySourceKind,
    sourceRef: decodeURIComponent(parts[3]),
  }
}

/**
 * Extract the learning-item key from a sourceRef of form
 * `learning_items/<key>`. The key is the item's `normalized_text` (a UNIQUE
 * slug column in `learning_items`), NOT a UUID — the capability catalog at
 * `src/lib/capabilities/capabilityCatalog.ts:52` stores it that way:
 *
 *   for (const item of input.learningItems) {
 *     const sourceRef = `learning_items/${item.id}`  // item.id == base_text/normalized_text
 *
 * Verified against production data 2026-05-02: every item-source capability
 * row's source_ref is `learning_items/<slug>` (e.g. learning_items/akhir,
 * learning_items/pasar). Returns null if the ref shape doesn't match.
 */
export function extractItemKey(sourceRef: string): string | null {
  const m = /^learning_items\/(.+)$/.exec(sourceRef)
  return m ? m[1] : null
}

// ─── Source-kind bucketing ──────────────────────────────────────────────────

export interface ItemBucketEntry {
  block: SessionBlock
  itemKey: string
}

export interface BucketingResult {
  /** Per-source-kind buckets. Today only `item` is populated; future source
   *  kinds (dialogue_line, affixed_form_pair, podcast_*) add their own
   *  bucket entries here without touching the resolver. */
  buckets: {
    item: ItemBucketEntry[]
  }
  /** Blocks whose canonical key was malformed or whose source kind has no
   *  fetcher yet. Pre-built fail contexts keyed by blockId. */
  failures: Map<string, CapabilityRenderContext>
}

/**
 * Decode + classify blocks by source kind. Pure function; no I/O. Malformed
 * canonical keys → `sourceref_unparseable`. Non-item source kinds →
 * `unsupported_source_kind` (until per-kind fetchers land — PR-B adds
 * dialogue_line). Unparseable item refs → `sourceref_unparseable`.
 */
export function bucketByDecodedSourceKind(blocks: SessionBlock[]): BucketingResult {
  const buckets: BucketingResult['buckets'] = { item: [] }
  const failures = new Map<string, CapabilityRenderContext>()

  for (const block of blocks) {
    const decoded = decodeCanonicalKey(block.canonicalKeySnapshot)
    if (decoded.kind === 'malformed') {
      failures.set(block.id, makeFailContext(block, 'sourceref_unparseable',
        `canonical key snapshot malformed`,
        { canonicalKeySnapshot: block.canonicalKeySnapshot }))
      continue
    }
    if (decoded.sourceKind !== 'item') {
      failures.set(block.id, makeFailContext(block, 'unsupported_source_kind',
        `sourceKind '${decoded.sourceKind}' is out of PR-2 scope`,
        { sourceKind: decoded.sourceKind, sourceRef: decoded.sourceRef }))
      continue
    }
    const itemKey = extractItemKey(decoded.sourceRef)
    if (!itemKey) {
      failures.set(block.id, makeFailContext(block, 'sourceref_unparseable',
        `cannot extract item key from sourceRef`,
        { sourceRef: decoded.sourceRef }))
      continue
    }
    buckets.item.push({ block, itemKey })
  }
  return { buckets, failures }
}

// ─── Diagnostic helpers ─────────────────────────────────────────────────────

const PAYLOAD_SNAPSHOT_BYTE_LIMIT = 4 * 1024  // 4 KB

function trimPayloadSnapshot(snapshot: unknown): unknown {
  if (snapshot == null) return {}
  const serialized = JSON.stringify(snapshot)
  if (serialized.length <= PAYLOAD_SNAPSHOT_BYTE_LIMIT) return snapshot
  return {
    _truncated: true,
    _originalSizeBytes: serialized.length,
    sample: serialized.slice(0, PAYLOAD_SNAPSHOT_BYTE_LIMIT - 200) + '…',
  }
}

/** Build a fail context for a block. Used by bucketing + per-bucket fetchers
 *  + the resolver's builder-fail path. Pure function; no I/O. */
export function makeFailContext(
  block: SessionBlock,
  reasonCode: ResolutionReasonCode,
  message: string,
  payloadSnapshot?: unknown,
): CapabilityRenderContext {
  return {
    blockId: block.id,
    capabilityId: block.capabilityId,
    exerciseItem: null,
    audibleTexts: [],
    diagnostic: {
      reasonCode,
      message,
      capabilityKey: block.canonicalKeySnapshot,
      capabilityId: block.capabilityId,
      exerciseType: block.renderPlan.exerciseType,
      blockId: block.id,
      payloadSnapshot,
    },
  }
}

// ─── Per-block resolution data ──────────────────────────────────────────────

/** What the adapter returns per block after the data fetch waves complete.
 *  The resolver consumes this and either dispatches the ok-shaped input to
 *  the appropriate byType packager, or surfaces the fail context as-is. */
export type BlockResolutionData =
  | { kind: 'ok'; block: SessionBlock; input: RawProjectorInput }
  | { kind: 'fail'; block: SessionBlock; context: CapabilityRenderContext }

// ─── Internal client type ───────────────────────────────────────────────────

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

interface CapabilityArtifactRow {
  capability_id: string
  artifact_kind: ArtifactKind
  quality_status: string
  artifact_json: unknown
}

// ─── Adapter interface ──────────────────────────────────────────────────────

export interface Adapter {
  /** Run source-kind-specific fetchers in parallel; return per-block data. */
  loadBlockData(
    buckets: BucketingResult['buckets'],
    options: { userLanguage: 'nl' | 'en' },
  ): Promise<Map<string, BlockResolutionData>>

  /** Fire-and-forget audit log insert for a resolution failure. */
  logResolutionFailure(
    diagnostic: ResolutionDiagnostic,
    options: { userId: string; sessionId: string },
  ): Promise<void>
}

// ─── Adapter factory ────────────────────────────────────────────────────────

export function createAdapter(client: SupabaseSchemaClient): Adapter {
  const db = () => client.schema('indonesian')

  // Items are looked up by `normalized_text` (the slug the catalog stores),
  // NOT by uuid `id`. See extractItemKey docstring + smoke-test 2026-05-02.
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

  async function fetchArtifacts(capabilityIds: string[]): Promise<CapabilityArtifactRow[]> {
    if (capabilityIds.length === 0) return []
    const { data, error } = await db()
      .from('capability_artifacts')
      .select('capability_id, artifact_kind, quality_status, artifact_json')
      .in('capability_id', capabilityIds)
      .eq('quality_status', 'approved')
    if (error) throw error
    return (data ?? []) as CapabilityArtifactRow[]
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

  // ─── Per-source-kind fetchers ────────────────────────────────────────────

  /**
   * Item bucket: today's wave-1 + wave-2 + distractor-pool pipeline,
   * transplanted verbatim with per-block RawProjectorInput assembly inside.
   * Mutates `result` so the per-block ordering matches the input bucket.
   */
  async function fetchForItemBlocks(
    itemBlocks: ItemBucketEntry[],
    userLanguage: 'nl' | 'en',
    result: Map<string, BlockResolutionData>,
  ): Promise<void> {
    if (itemBlocks.length === 0) return

    const itemKeys = [...new Set(itemBlocks.map(b => b.itemKey))]
    const capabilityIds = [...new Set(itemBlocks.map(b => b.block.capabilityId))]

    // Wave 1: resolve item slugs → rows (with uuids) + fetch artifacts in parallel.
    const [items, artifactRows] = await Promise.all([
      fetchLearningItemsByKey(itemKeys),
      fetchArtifacts(capabilityIds),
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
      const input: RawProjectorInput = {
        block,
        learningItem,
        meanings: meaningsByItem.get(itemUuid) ?? [],
        contexts: contextsByItem.get(itemUuid) ?? [],
        answerVariants: answerVariantsByItem.get(itemUuid) ?? [],
        variant: variantByItemAndType.get(`${itemUuid}:${block.renderPlan.exerciseType}`) ?? null,
        artifactsByKind: artifactsByCapability.get(block.capabilityId) ?? new Map(),
        poolItems: pool.items,
        poolMeaningsByItem,
        userLanguage,
      }
      result.set(block.id, { kind: 'ok', block, input })
    }
  }

  // ─── Public surface ──────────────────────────────────────────────────────

  return {
    async loadBlockData(buckets, options) {
      const result = new Map<string, BlockResolutionData>()
      // Per-source-kind fetchers run in parallel. Only item populated today;
      // PR-B adds dialogue_line, affixed_form_pair follows, then podcasts.
      await Promise.all([
        fetchForItemBlocks(buckets.item, options.userLanguage, result),
      ])
      return result
    },

    async logResolutionFailure(diagnostic, options) {
      try {
        await db().from('capability_resolution_failure_events').insert({
          capability_id: diagnostic.capabilityId,
          capability_key: diagnostic.capabilityKey,
          reason_code: diagnostic.reasonCode,
          exercise_type: diagnostic.exerciseType,
          user_id: options.userId,
          session_id: options.sessionId,
          block_id: diagnostic.blockId,
          payload_json: trimPayloadSnapshot(diagnostic.payloadSnapshot),
        })
      } catch {
        // Swallowed. Resolution result is unaffected.
      }
    },
  }
}
