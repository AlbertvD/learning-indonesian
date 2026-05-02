// capabilityContentService — resolves SessionBlock[] into render-ready
// ExerciseItems for the new ExperiencePlayer dispatcher.
//
// See docs/plans/2026-05-02-capability-content-service-spec.md.

import type {
  ExerciseItem, ExerciseType,
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { ArtifactKind } from '@/lib/capabilities/capabilityTypes'
import type { CapabilityArtifact } from '@/lib/capabilities/artifactRegistry'
import { decodeCanonicalKey, extractItemKey } from './capabilityContentService.internal'
import { buildForExerciseType } from '@/lib/exercises/builders'
import type { BuilderInput } from '@/lib/exercises/builders'

// ─── Reason codes ───────────────────────────────────────────────────────────

export type ResolutionReasonCode =
  // Source-ref / capability-shape problems
  | 'unsupported_source_kind'
  | 'sourceref_unparseable'
  | 'item_not_found'
  | 'item_inactive'
  // Content-data gaps
  | 'no_active_variant'
  | 'no_meaning_in_lang'
  | 'malformed_cloze'
  | 'malformed_payload'
  | 'no_distractor_candidates'
  | 'missing_required_artifact'
  // Defensive
  | 'unsupported_exercise_type'
  | 'block_failed_db_fetch'

// ─── Diagnostic ──────────────────────────────────────────────────────────────

export interface ResolutionDiagnostic {
  reasonCode: ResolutionReasonCode
  message: string
  capabilityKey: string
  capabilityId: string
  exerciseType: ExerciseType
  blockId: string
  payloadSnapshot?: unknown
}

// ─── Render context ─────────────────────────────────────────────────────────

export interface CapabilityRenderContext {
  blockId: string
  capabilityId: string
  exerciseItem: ExerciseItem | null
  audibleTexts: string[]
  diagnostic: ResolutionDiagnostic | null
}

// ─── Service interface ──────────────────────────────────────────────────────

export interface ResolveOptions {
  userId: string
  userLanguage: 'nl' | 'en'
  sessionId: string
}

export interface CapabilityContentService {
  resolveBlocks(
    blocks: SessionBlock[],
    options: ResolveOptions,
  ): Promise<Map<string, CapabilityRenderContext>>
}

// ─── Internal types ──────────────────────────────────────────────────────────

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

// ─── Factory ────────────────────────────────────────────────────────────────

export function createCapabilityContentService(client: SupabaseSchemaClient): CapabilityContentService {
  const db = () => client.schema('indonesian')

  // Items are looked up by `normalized_text` (the slug the catalog stores),
  // NOT by uuid `id`. See extractItemKey docstring + smoke-test 2026-05-02.
  async function fetchLearningItemsByKey(keys: string[]): Promise<LearningItem[]> {
    if (keys.length === 0) return []
    const { data, error } = await db().from('learning_items').select('*').in('normalized_text', keys)
    if (error) throw error
    return (data ?? []) as LearningItem[]
  }

  async function fetchLearningItemsById(ids: string[]): Promise<LearningItem[]> {
    if (ids.length === 0) return []
    const { data, error } = await db().from('learning_items').select('*').in('id', ids)
    if (error) throw error
    return (data ?? []) as LearningItem[]
  }

  async function fetchMeanings(itemIds: string[]): Promise<ItemMeaning[]> {
    if (itemIds.length === 0) return []
    const { data, error } = await db().from('item_meanings').select('*').in('learning_item_id', itemIds)
    if (error) throw error
    return (data ?? []) as ItemMeaning[]
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

  async function logResolutionFailure(
    diagnostic: ResolutionDiagnostic,
    options: ResolveOptions,
  ): Promise<void> {
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
  }

  function makeFailContext(
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

  // ─── resolveBlocks ────────────────────────────────────────────────────────

  return {
    async resolveBlocks(blocks, options) {
      const result = new Map<string, CapabilityRenderContext>()
      if (blocks.length === 0) return result

      // Pass 1: decode canonical keys, collect item keys (slugs), route unsupported kinds
      const itemBlocks: Array<{ block: SessionBlock; itemKey: string }> = []
      for (const block of blocks) {
        const decoded = decodeCanonicalKey(block.canonicalKeySnapshot)
        if (decoded.kind === 'malformed') {
          result.set(block.id, makeFailContext(block, 'sourceref_unparseable',
            `canonical key snapshot malformed`,
            { canonicalKeySnapshot: block.canonicalKeySnapshot }))
          continue
        }
        if (decoded.sourceKind !== 'item') {
          result.set(block.id, makeFailContext(block, 'unsupported_source_kind',
            `sourceKind '${decoded.sourceKind}' is out of PR-2 scope`,
            { sourceKind: decoded.sourceKind, sourceRef: decoded.sourceRef }))
          continue
        }
        const itemKey = extractItemKey(decoded.sourceRef)
        if (!itemKey) {
          result.set(block.id, makeFailContext(block, 'sourceref_unparseable',
            `cannot extract item key from sourceRef`,
            { sourceRef: decoded.sourceRef }))
          continue
        }
        itemBlocks.push({ block, itemKey })
      }

      if (itemBlocks.length === 0) {
        for (const ctx of result.values()) if (ctx.diagnostic) void logResolutionFailure(ctx.diagnostic, options)
        return result
      }

      const itemKeys = [...new Set(itemBlocks.map(b => b.itemKey))]
      const capabilityIds = [...new Set(itemBlocks.map(b => b.block.capabilityId))]

      // Wave 1: resolve item slugs → rows (with uuids) + fetch artifacts in parallel.
      // Items are keyed by normalized_text (slug) because the catalog stores
      // source_ref as `learning_items/<slug>` — see extractItemKey docstring.
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

      // Distractor pool: derived from the lessons that the block items' contexts
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

      // Pass 2: per-block builder dispatch
      for (const { block, itemKey } of itemBlocks) {
        const learningItem = itemByKey.get(itemKey) ?? null
        if (!learningItem) {
          result.set(block.id, makeFailContext(block, 'block_failed_db_fetch',
            `learning_item with normalized_text='${itemKey}' not in wave-1 fetch result`,
            { itemKey, capabilityId: block.capabilityId }))
          continue
        }
        if (!learningItem.is_active) {
          result.set(block.id, makeFailContext(block, 'item_inactive',
            `learning_item ${learningItem.id} is_active=false`,
            { itemKey, itemId: learningItem.id }))
          continue
        }

        const itemUuid = learningItem.id
        const builderInput: BuilderInput = {
          block,
          learningItem,
          meanings: meaningsByItem.get(itemUuid) ?? [],
          contexts: contextsByItem.get(itemUuid) ?? [],
          answerVariants: answerVariantsByItem.get(itemUuid) ?? [],
          variant: variantByItemAndType.get(`${itemUuid}:${block.renderPlan.exerciseType}`) ?? null,
          artifactsByKind: artifactsByCapability.get(block.capabilityId) ?? new Map(),
          poolItems: pool.items,
          poolMeaningsByItem,
          userLanguage: options.userLanguage,
        }

        const built = buildForExerciseType(block.renderPlan.exerciseType, builderInput)
        if (built.kind === 'ok') {
          result.set(block.id, {
            blockId: block.id,
            capabilityId: block.capabilityId,
            exerciseItem: built.exerciseItem,
            audibleTexts: built.audibleTexts,
            diagnostic: null,
          })
        } else {
          result.set(block.id, makeFailContext(
            block, built.reasonCode, built.message, built.payloadSnapshot,
          ))
        }
      }

      // Fire-and-forget log every diagnostic.
      for (const ctx of result.values()) {
        if (ctx.diagnostic) void logResolutionFailure(ctx.diagnostic, options)
      }

      return result
    },
  }
}

async function defaultService(): Promise<CapabilityContentService> {
  const { supabase } = await import('@/lib/supabase')
  return createCapabilityContentService(supabase)
}

/** Convenience entry point used by ExperiencePlayer's host page. */
export async function resolveCapabilityBlocks(
  blocks: SessionBlock[],
  options: ResolveOptions,
): Promise<Map<string, CapabilityRenderContext>> {
  const service = await defaultService()
  return service.resolveBlocks(blocks, options)
}
