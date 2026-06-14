// Collections overview read-model — STUB (TDD red).
import { supabase } from '@/lib/supabase'

export interface CollectionOverview {
  collectionId: string
  slug: string
  name: string
  kind: 'frequency' | 'theme'
  rankCutoff: number | null
  isActivated: boolean
  totalWords: number
  knownWords: number
  /** Member words already schedulable for this learner (lesson- or collection-
   *  activated). knownWords ⊆ eligibleNow ⊆ totalWords. */
  eligibleNow: number
  /** Words that would become NEWLY schedulable by activating this list
   *  (= totalWords − eligibleNow) — the marginal value of the toggle. */
  gain: number
}

interface CollectionsRpcClient {
  schema(schema: 'indonesian'): { rpc(fn: string, args: Record<string, unknown>): any }
}

interface OverviewRow {
  collection_id: string
  slug: string
  name: string
  kind: 'frequency' | 'theme'
  rank_cutoff: number | null
  is_activated: boolean
  total_words: number
  known_words: number
  eligible_words: number
}

export async function getCollectionsOverview(
  userId: string,
  client: CollectionsRpcClient = supabase,
): Promise<CollectionOverview[]> {
  const { data, error } = await client
    .schema('indonesian')
    .rpc('get_collections_overview', { p_user_id: userId })
  if (error) throw error
  return ((data ?? []) as OverviewRow[]).map(row => {
    const totalWords = row.total_words
    // Fallback keeps the UI sane if the RPC predates eligible_words.
    const eligibleNow = Math.min(totalWords, row.eligible_words ?? row.known_words)
    return {
      collectionId: row.collection_id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      rankCutoff: row.rank_cutoff,
      isActivated: row.is_activated,
      totalWords,
      knownWords: row.known_words,
      eligibleNow,
      gain: Math.max(0, totalWords - eligibleNow),
    }
  })
}
