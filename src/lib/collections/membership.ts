// Collections membership resolution. Produces the set of capability source_refs
// that belong to a collection the learner has activated — the OR side of the
// session-builder lesson-activation gate (collections spec §5). For item caps the
// source_ref form is `learning_items/<normalized_text>` (the HC9 invariant), so a
// member word's caps match by source_ref without a denormalized FK.
import {
  fetchActivatedCollectionIds,
  fetchHarvestedNormalizedTexts,
  fetchMemberNormalizedTexts,
  type CollectionsReadClient,
} from '@/lib/collections/adapter'
import { supabase } from '@/lib/supabase'

const ITEM_SOURCE_REF_PREFIX = 'learning_items/'

// The normalized_texts of every word the learner has activated for scheduling via
// a collection (collection_items of an activated collection). Empty set ⇒ skip the
// members read entirely (no collection ids to query).
async function activatedCollectionTexts(
  userId: string,
  client: CollectionsReadClient,
): Promise<string[]> {
  const collectionIds = await fetchActivatedCollectionIds(userId, client)
  if (collectionIds.length === 0) return []
  return fetchMemberNormalizedTexts(collectionIds, client)
}

// The OR side of the session-builder lesson-activation gate (collections spec §5 +
// reader §4): the source_refs the learner has activated for scheduling — the UNION
// of (a) words in any activated collection and (b) words harvested in the Lezen
// reader. Both resolve to the item source_ref form `learning_items/<normalized_text>`
// (the HC9 invariant), so a member word's caps match without a denormalized FK.
// Harvest is independent of collections (a harvested word is eligible even with no
// collection activated), so the two reads always both run.
export async function resolveActivatedMemberRefs(
  userId: string,
  client: CollectionsReadClient = supabase,
): Promise<Set<string>> {
  const [collectionTexts, harvestedTexts] = await Promise.all([
    activatedCollectionTexts(userId, client),
    fetchHarvestedNormalizedTexts(userId, client),
  ])
  const refs = new Set<string>()
  for (const text of collectionTexts) refs.add(`${ITEM_SOURCE_REF_PREFIX}${text}`)
  for (const text of harvestedTexts) refs.add(`${ITEM_SOURCE_REF_PREFIX}${text}`)
  return refs
}
