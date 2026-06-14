// Collections membership resolution. Produces the set of capability source_refs
// that belong to a collection the learner has activated — the OR side of the
// session-builder lesson-activation gate (collections spec §5). For item caps the
// source_ref form is `learning_items/<normalized_text>` (the HC9 invariant), so a
// member word's caps match by source_ref without a denormalized FK.
import {
  fetchActivatedCollectionIds,
  fetchMemberNormalizedTexts,
  type CollectionsReadClient,
} from '@/lib/collections/adapter'
import { supabase } from '@/lib/supabase'

const ITEM_SOURCE_REF_PREFIX = 'learning_items/'

export async function resolveActivatedMemberRefs(
  userId: string,
  client: CollectionsReadClient = supabase,
): Promise<Set<string>> {
  const collectionIds = await fetchActivatedCollectionIds(userId, client)
  if (collectionIds.length === 0) return new Set()
  const normalizedTexts = await fetchMemberNormalizedTexts(collectionIds, client)
  return new Set(normalizedTexts.map(text => `${ITEM_SOURCE_REF_PREFIX}${text}`))
}
