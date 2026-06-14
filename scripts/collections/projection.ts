// Collections seed — the pure projection + resolve-or-create logic (collections
// spec §8 gate 1: "shared helper + unit tests"). No I/O here; the seed script
// (seed-collection.ts) and the unit tests both import these so the membership
// rule is defined exactly once.
//
//   frequency membership: an item is a member iff
//     frequency_rank != null AND frequency_rank <= rank_cutoff   (INCLUSIVE)
//   matching the DB CHECK + comment on collections.rank_cutoff
//   (migration.sql:3410-3416) and the get_collections_overview projection.
//
// resolve-or-create (spec §7) is expressed as a *classification* over the
// existing normalized_text set — never a blind insert. The seed script publishes
// gap words through the pipeline (which creates the learning_items + caps); this
// helper only tells it which incoming words are already present vs. missing, via
// the SAME slug contract the pipeline uses (itemSlug).
import { itemSlug } from '../../src/lib/capabilities/itemSlug'

export interface RankedItem {
  id: string
  /** learning_items.frequency_rank — NULL means unranked. */
  frequencyRank: number | null
}

/** The member item ids of a frequency band — `frequency_rank <= rankCutoff`. */
export function frequencyMembers(items: readonly RankedItem[], rankCutoff: number): string[] {
  return items
    .filter(item => item.frequencyRank != null && item.frequencyRank <= rankCutoff)
    .map(item => item.id)
}

export interface ProjectionViolation {
  kind: 'member-over-cutoff' | 'missing-eligible'
  itemId: string
  frequencyRank: number | null
}

/**
 * The §8 gate-2 *bidirectional* invariant, as a pure check over a snapshot:
 *   (a) every materialised member has frequency_rank <= cutoff, AND
 *   (b) every item with frequency_rank <= cutoff is a member.
 * Direction (b) is the one that catches a stale projection after a
 * `frequency_rank` update (spec §8 M3). Returns [] when consistent.
 */
export function projectionViolations(
  allItems: readonly RankedItem[],
  memberIds: ReadonlySet<string>,
  rankCutoff: number,
): ProjectionViolation[] {
  const violations: ProjectionViolation[] = []
  const eligible = new Set(frequencyMembers(allItems, rankCutoff))
  for (const id of memberIds) {
    if (!eligible.has(id)) {
      const item = allItems.find(i => i.id === id)
      violations.push({ kind: 'member-over-cutoff', itemId: id, frequencyRank: item?.frequencyRank ?? null })
    }
  }
  for (const item of allItems) {
    if (eligible.has(item.id) && !memberIds.has(item.id)) {
      violations.push({ kind: 'missing-eligible', itemId: item.id, frequencyRank: item.frequencyRank })
    }
  }
  return violations
}

export interface RankedWord {
  /** The source word (PBWL root / base_text), before normalization. */
  word: string
  /** 1-based frequency rank from the corpus. */
  rank: number
}

export interface ResolveOrCreatePartition {
  /** Words whose normalized form already exists as a learning_item. */
  resolved: Array<{ word: string; rank: number; normalizedText: string }>
  /** Words with no existing item — must be authored + published before seeding. */
  gaps: Array<{ word: string; rank: number; normalizedText: string }>
}

/**
 * Classify incoming ranked words against the existing `learning_items.normalized_text`
 * set using the canonical slug contract (itemSlug) — the SAME normalization the
 * lesson pipeline writes, so we never create a near-duplicate (spec §7, the single
 * biggest correctness item). Duplicate incoming words (same normalized form) collapse
 * to the lowest rank.
 */
export function partitionByExistence(
  words: readonly RankedWord[],
  existingNormalizedTexts: ReadonlySet<string>,
): ResolveOrCreatePartition {
  const bestByNorm = new Map<string, { word: string; rank: number; normalizedText: string }>()
  for (const { word, rank } of words) {
    const normalizedText = itemSlug(word)
    const prior = bestByNorm.get(normalizedText)
    if (!prior || rank < prior.rank) bestByNorm.set(normalizedText, { word, rank, normalizedText })
  }
  const resolved: ResolveOrCreatePartition['resolved'] = []
  const gaps: ResolveOrCreatePartition['gaps'] = []
  for (const entry of bestByNorm.values()) {
    ;(existingNormalizedTexts.has(entry.normalizedText) ? resolved : gaps).push(entry)
  }
  const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank
  return { resolved: resolved.sort(byRank), gaps: gaps.sort(byRank) }
}
