// Placement probe read adapter (Bet-1 slice 2, docs/plans/2026-07-06-loanword-
// bridge-placement-onboarding.md §4.1). Fetches the probe's item pool: the
// 4-rung frequency-band ladder (top-100/300/500/1000) as PlacementBand[] +
// a bounded, deterministically-ordered sample of candidate items per rung.
//
// Bands are read as EXCLUSIVE frequency_rank ranges here, NOT the collections'
// own membership (which is CUMULATIVE — `collection_items` is the projection
// `frequency_rank <= rank_cutoff`, scripts/collections/seed-collection.ts:7 —
// so top-1000's members are a superset of top-100's). A staircase needs each
// rung to represent items AT that difficulty, not a pool dominated by the
// easiest words every time. This adapter derives the exclusive range from
// consecutive rank_cutoffs and reads `learning_items.frequency_rank` directly
// — collection_items is not read at all; frequency_rank is the same signal
// it projects from, one hop closer to the source (mirrors lib/collections/
// adapter.ts's error-wrap + narrow-client-interface style, per
// feedback_ui_default_to_existing_framework precedent for I/O seams).
import { orderBandsByRankCutoff, type PlacementBand } from '@/lib/placement/bands'
import type { PlacementItem } from '@/lib/placement/staircase'
import { supabase } from '@/lib/supabase'

const BAND_SLUGS = ['top-100', 'top-300', 'top-500', 'top-1000']

/** Candidate pool size per band — "a modest pool... so the staircase has
 *  choices" (spec §4.1's task breakdown), not the full band membership. */
const POOL_SIZE_PER_BAND = 15

/** Rendering detail for one candidate item — the Indonesian prompt + its
 *  Dutch answer — keyed by normalizedText for O(1) lookup during rendering
 *  and distractor sampling (Instaptoets.tsx). */
export interface PlacementItemDetail {
  normalizedText: string
  bandSlug: string
  baseText: string
  translationNl: string
}

export interface PlacementPool {
  /** Ascending by rankCutoff — see bands.ts. */
  bands: PlacementBand[]
  /** Staircase input shape (staircase.ts's selectNextItem). */
  itemsByBand: Map<string, PlacementItem[]>
  /** Every sampled item across all bands, in deterministic band-then-rank
   *  order — the corpus the page's distractor sampling draws from. */
  allItems: PlacementItemDetail[]
  detailsByNormalizedText: Map<string, PlacementItemDetail>
}

// Read-only client shape (mirrors lib/collections/adapter.ts). `from` returns
// the PostgREST builder, which is a thenable after the terminal filter; typing
// it as `any` keeps the narrow-mock pattern usable in tests.
export interface PlacementReadClient {
  schema(schema: 'indonesian'): { from(table: string): any }
}

interface CollectionRow {
  slug: string
  rank_cutoff: number | null
}

interface LearningItemRow {
  normalized_text: string
  base_text: string
  translation_nl: string | null
  frequency_rank: number | null
}

async function fetchBands(client: PlacementReadClient): Promise<PlacementBand[]> {
  const { data, error } = await client
    .schema('indonesian')
    .from('collections')
    .select('slug, rank_cutoff')
    .in('slug', BAND_SLUGS)
  if (error) throw error
  const bands = ((data ?? []) as CollectionRow[])
    .filter((row): row is CollectionRow & { rank_cutoff: number } => row.rank_cutoff !== null)
    .map(row => ({ slug: row.slug, rankCutoff: row.rank_cutoff }))
  return orderBandsByRankCutoff(bands)
}

/** Samples one rung's EXCLUSIVE frequency_rank range: (lowExclusive,
 *  band.rankCutoff]. The ladder's easiest rung has no lower bound below rank 1. */
async function fetchBandItems(
  band: PlacementBand,
  lowExclusive: number,
  client: PlacementReadClient,
): Promise<PlacementItemDetail[]> {
  const { data, error } = await client
    .schema('indonesian')
    .from('learning_items')
    .select('normalized_text, base_text, translation_nl, frequency_rank')
    .eq('is_active', true)
    .not('translation_nl', 'is', null)
    .gt('frequency_rank', lowExclusive)
    .lte('frequency_rank', band.rankCutoff)
    .order('frequency_rank', { ascending: true })
    .order('normalized_text', { ascending: true })
    .limit(POOL_SIZE_PER_BAND)
  if (error) throw error
  return ((data ?? []) as LearningItemRow[])
    .filter((row): row is LearningItemRow & { translation_nl: string } => Boolean(row.translation_nl))
    .map(row => ({
      normalizedText: row.normalized_text,
      bandSlug: band.slug,
      baseText: row.base_text,
      translationNl: row.translation_nl,
    }))
}

/**
 * Fetches the full placement pool: the band ladder + a bounded candidate
 * sample per band, ready for the staircase (staircase.ts) to drive and the
 * probe page (Instaptoets.tsx) to render. Errors are rethrown as-is — the
 * page owns user messaging (notifications.show + logError).
 */
export async function fetchPlacementPool(client: PlacementReadClient = supabase): Promise<PlacementPool> {
  const bands = await fetchBands(client)
  const detailLists = await Promise.all(
    bands.map((band, index) => fetchBandItems(band, index === 0 ? 0 : bands[index - 1].rankCutoff, client)),
  )

  const itemsByBand = new Map<string, PlacementItem[]>()
  const detailsByNormalizedText = new Map<string, PlacementItemDetail>()
  const allItems: PlacementItemDetail[] = []

  bands.forEach((band, index) => {
    const details = detailLists[index]
    itemsByBand.set(band.slug, details.map(d => ({ normalizedText: d.normalizedText, bandSlug: d.bandSlug })))
    for (const detail of details) {
      detailsByNormalizedText.set(detail.normalizedText, detail)
      allItems.push(detail)
    }
  })

  return { bands, itemsByBand, allItems, detailsByNormalizedText }
}
