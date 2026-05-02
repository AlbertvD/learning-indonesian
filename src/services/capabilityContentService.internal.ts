// Internal helpers for capabilityContentService. Kept in a sibling file so the
// main service file stays focused on resolveBlocks orchestration.
//
// See docs/plans/2026-05-02-capability-content-service-spec.md §4.3.

import type { CapabilitySourceKind } from '@/lib/capabilities/capabilityTypes'
import { CAPABILITY_SOURCE_KINDS } from '@/lib/capabilities/capabilityTypes'

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
