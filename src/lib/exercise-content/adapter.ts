// lib/exercise-content/adapter — Supabase reads, source-kind bucketing, and
// diagnostic helpers. This module's I/O seam. Sister files in ./byKind/ own
// per-source-kind fetchers; this file owns bucketing + the shared artifact
// fetch + diagnostic helpers + the factory that wires them together.
//
// PR-A step 3 of the lib/exercise-content fold (2026-05-21) extracted the
// bucketing seam here. PR 0 of the affixed-form-pair plan (today) moved the
// per-source-kind fetchers into ./byKind/<sourceKind>.ts as the third source
// kind triggers the split named in §6 of the module spec.
//
// See:
//   - docs/current-system/modules/exercise-content.md
//   - docs/plans/2026-05-21-lib-exercise-content-fold.md (D1, D3, D5)
//   - docs/plans/2026-05-21-affixed-form-pair-runtime.md (PR 0)

import type { SessionBlock } from '@/lib/session-builder'
import {
  CAPABILITY_SOURCE_KINDS,
  type ArtifactKind,
  type CapabilitySourceKind,
  type CapabilityRenderContext,
  type ResolutionDiagnostic,
} from '@/lib/capabilities'
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { RawProjectorInput } from './byType'
import { fetchForItemBlocks } from './byKind/item'
import { fetchForDialogueLineBlocks } from './byKind/dialogueLine'

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

export interface DialogueLineBucketEntry {
  block: SessionBlock
  sourceRef: string  // shape: lesson-N/section-M/line-K
}

export interface BucketingResult {
  /** Per-source-kind buckets. `item` and `dialogue_line` are populated today;
   *  future source kinds (affixed_form_pair, podcast_*) add their own bucket
   *  entries here without touching the resolver. */
  buckets: {
    item: ItemBucketEntry[]
    dialogue_line: DialogueLineBucketEntry[]
  }
  /** Blocks whose canonical key was malformed or whose source kind has no
   *  fetcher yet. Pre-built fail contexts keyed by blockId. */
  failures: Map<string, CapabilityRenderContext>
}

// Source ref of shape `lesson-N/section-M/line-K`. Validated cheaply at
// bucketing time so a malformed ref fails fast with a clear reason code.
const DIALOGUE_LINE_REF_RE = /^lesson-\d+\/section-\d+\/line-\d+$/u

/**
 * Decode + classify blocks by source kind. Pure function; no I/O. Malformed
 * canonical keys → `sourceref_unparseable`. Source kinds without a fetcher
 * yet (pattern, affixed_form_pair, podcast_*) → `unsupported_source_kind`.
 * Unparseable item refs → `sourceref_unparseable`. Unparseable dialogue_line
 * refs → `dialogue_line_ref_unparseable`.
 */
export function bucketByDecodedSourceKind(blocks: SessionBlock[]): BucketingResult {
  const buckets: BucketingResult['buckets'] = { item: [], dialogue_line: [] }
  const failures = new Map<string, CapabilityRenderContext>()

  for (const block of blocks) {
    const decoded = decodeCanonicalKey(block.canonicalKeySnapshot)
    if (decoded.kind === 'malformed') {
      failures.set(block.id, makeFailContext(block, 'sourceref_unparseable',
        `canonical key snapshot malformed`,
        { canonicalKeySnapshot: block.canonicalKeySnapshot }))
      continue
    }

    if (decoded.sourceKind === 'item') {
      const itemKey = extractItemKey(decoded.sourceRef)
      if (!itemKey) {
        failures.set(block.id, makeFailContext(block, 'sourceref_unparseable',
          `cannot extract item key from sourceRef`,
          { sourceRef: decoded.sourceRef }))
        continue
      }
      buckets.item.push({ block, itemKey })
      continue
    }

    if (decoded.sourceKind === 'dialogue_line') {
      if (!DIALOGUE_LINE_REF_RE.test(decoded.sourceRef)) {
        failures.set(block.id, makeFailContext(block, 'dialogue_line_ref_unparseable',
          `dialogue_line sourceRef "${decoded.sourceRef}" does not match lesson-N/section-M/line-K`,
          { sourceRef: decoded.sourceRef }))
        continue
      }
      buckets.dialogue_line.push({ block, sourceRef: decoded.sourceRef })
      continue
    }

    // Other source kinds (pattern, affixed_form_pair, podcast_segment,
    // podcast_phrase) have no fetcher yet. Caps with these source kinds
    // should already be marked blocked by validateCapability — this is a
    // belt-and-braces guard in case a stale block reaches the resolver.
    failures.set(block.id, makeFailContext(block, 'unsupported_source_kind',
      `sourceKind '${decoded.sourceKind}' has no fetcher in lib/exercise-content/adapter yet`,
      { sourceKind: decoded.sourceKind, sourceRef: decoded.sourceRef }))
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

// ─── Shared internal types (exported for byKind/*) ──────────────────────────

export interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

export interface CapabilityArtifactRow {
  capability_id: string
  artifact_kind: ArtifactKind
  quality_status: string
  artifact_json: unknown
}

// ─── Shared artifact fetch (used by every per-kind fetcher) ─────────────────

/** Fetch approved capability_artifacts for a set of capability ids. Shared
 *  by every per-source-kind fetcher in ./byKind. */
export async function fetchArtifacts(
  client: SupabaseSchemaClient,
  capabilityIds: string[],
): Promise<CapabilityArtifactRow[]> {
  if (capabilityIds.length === 0) return []
  const { data, error } = await client.schema('indonesian')
    .from('capability_artifacts')
    .select('capability_id, artifact_kind, quality_status, artifact_json')
    .in('capability_id', capabilityIds)
    .eq('quality_status', 'approved')
  if (error) throw error
  return (data ?? []) as CapabilityArtifactRow[]
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

  return {
    async loadBlockData(buckets, options) {
      const result = new Map<string, BlockResolutionData>()
      // Per-source-kind fetchers run in parallel. item + dialogue_line populated
      // today; affixed_form_pair follows, then podcasts.
      await Promise.all([
        fetchForItemBlocks(client, buckets.item, options.userLanguage, result),
        fetchForDialogueLineBlocks(client, buckets.dialogue_line, options.userLanguage, result),
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
