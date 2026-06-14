// Collection activation write. Mirrors lib/lessons setLessonActivated: the write
// goes through the set_collection_activation RPC (SECURITY DEFINER) so the
// activation table stays SELECT-only for `authenticated`. This RPC is the future
// entitlement chokepoint (collections spec §4.3 / foundation doc §6).
import { supabase } from '@/lib/supabase'

interface CollectionsRpcClient {
  schema(schema: 'indonesian'): { rpc(fn: string, args: Record<string, unknown>): any }
}

export async function setCollectionActivated(
  userId: string,
  collectionId: string,
  activated: boolean,
  client: CollectionsRpcClient = supabase,
): Promise<void> {
  const { error } = await client
    .schema('indonesian')
    .rpc('set_collection_activation', {
      p_user_id: userId,
      p_collection_id: collectionId,
      p_activated: activated,
    })
  if (error) throw error
}
