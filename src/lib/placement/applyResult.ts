// Placement probe RPC-call adapter (Bet-1 slice 2, ADR 0026 §4.2). One RPC,
// two server-side effects: resolve the cleared band slugs to collection
// activations (via the existing set_collection_activation RPC, server-side —
// never a second hand-rolled activation writer) and seed FSRS state for the
// judged-known words (§4.3 seed shape). auth.uid()-scoped — no user_id
// argument. Mirrors lib/collections/activation.ts's write pattern exactly.
import { supabase } from '@/lib/supabase'

interface PlacementRpcClient {
  schema(schema: 'indonesian'): { rpc(fn: string, args: Record<string, unknown>): any }
}

export async function applyPlacementResult(
  bandSlugs: string[],
  knownTexts: string[],
  client: PlacementRpcClient = supabase,
): Promise<void> {
  const { error } = await client
    .schema('indonesian')
    .rpc('apply_placement_result', {
      p_band_slugs: bandSlugs,
      p_known_texts: knownTexts,
    })
  if (error) throw error
}
