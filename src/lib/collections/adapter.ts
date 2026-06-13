// Collections I/O seam. Hides the `indonesian` schema, the two-step activated
// → members read, the FK embed shape, and the snake_case columns. Internal to
// the module — callers go through the public functions in membership.ts.
import { supabase } from '@/lib/supabase'

// Read-only client shape (mirrors lessons/activation.ts). `from` returns the
// PostgREST builder, which is a thenable after a terminal `.eq`/`.in`; typing it
// as `any` keeps the narrow-mock pattern usable in tests.
export interface CollectionsReadClient {
  schema(schema: 'indonesian'): { from(table: string): any }
}

// The collection_ids the learner has activated.
export async function fetchActivatedCollectionIds(
  userId: string,
  client: CollectionsReadClient = supabase,
): Promise<string[]> {
  const { data, error } = await client
    .schema('indonesian')
    .from('learner_collection_activation')
    .select('collection_id')
    .eq('user_id', userId)
  if (error) throw error
  return ((data ?? []) as Array<{ collection_id: string }>).map(row => row.collection_id)
}

// The normalized_texts of every learning_item that is a member of any of the
// given collections (one FK embed: collection_items → learning_items).
export async function fetchMemberNormalizedTexts(
  collectionIds: readonly string[],
  client: CollectionsReadClient = supabase,
): Promise<string[]> {
  const { data, error } = await client
    .schema('indonesian')
    .from('collection_items')
    .select('learning_items(normalized_text)')
    .in('collection_id', collectionIds as string[])
  if (error) throw error
  return ((data ?? []) as Array<{ learning_items: { normalized_text: string } | null }>)
    .map(row => row.learning_items?.normalized_text)
    .filter((text): text is string => Boolean(text))
}
