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
}

export async function getCollectionsOverview(
  userId: string,
  client: CollectionsRpcClient = supabase,
): Promise<CollectionOverview[]> {
  const { data, error } = await client
    .schema('indonesian')
    .rpc('get_collections_overview', { p_user_id: userId })
  if (error) throw error
  return ((data ?? []) as OverviewRow[]).map(row => ({
    collectionId: row.collection_id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    rankCutoff: row.rank_cutoff,
    isActivated: row.is_activated,
    totalWords: row.total_words,
    knownWords: row.known_words,
  }))
}
