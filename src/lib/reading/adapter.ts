/**
 * Data access for the Lezen reader — the only I/O in `lib/reading/`. Wraps the
 * `get_text_coverage` RPC (per-learner known tokens) and the `learning_items` gloss
 * fetch. Reads LIVE state only (never staging snapshots — the trap from the design
 * grill). `textService` remains the source for the texts themselves.
 */
import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import type { ItemGloss } from './gloss'

interface CoverageRpcResult {
  known_tokens: string[] | null
}

/**
 * The subset of `contentTokens` the learner "knows" (recognition cap, practiced),
 * via the server-side composite predicate. Returns a Set for O(1) coverage lookup.
 */
export async function fetchCoverageKnownTokens(
  userId: string,
  contentTokens: string[],
): Promise<Set<string>> {
  if (contentTokens.length === 0) return new Set()
  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_text_coverage', { p_user_id: userId, p_tokens: contentTokens })
  if (error) throw error
  const result = data as CoverageRpcResult | null
  return new Set(result?.known_tokens ?? [])
}

export interface ItemMorphology {
  root: string
  affix: string
}

/**
 * The {root, affix} decomposition for each given surface word that has one (ADR 0024
 * pre-compute). Keyed by `normalized_text`. Words with no row are monomorphemic /
 * unknown-root — the reader falls through to the plain item gloss.
 */
export async function fetchItemMorphology(
  tokens: string[],
): Promise<Map<string, ItemMorphology>> {
  const map = new Map<string, ItemMorphology>()
  if (tokens.length === 0) return map
  const rows = await chunkedIn<{ normalized_text: string; root: string; affix: string }>(
    'item_morphology',
    'normalized_text',
    [...new Set(tokens)],
    (b) => b.select('normalized_text, root, affix'),
  )
  for (const row of rows) map.set(row.normalized_text, { root: row.root, affix: row.affix })
  return map
}

/**
 * The word family for each given root: every surface form that decomposes to it
 * (ADR 0024 `family` = join over shared root), plus the root itself.
 */
export async function fetchMorphologyFamilies(
  roots: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (roots.length === 0) return map
  const rows = await chunkedIn<{ normalized_text: string; root: string }>(
    'item_morphology',
    'root',
    [...new Set(roots)],
    (b) => b.select('normalized_text, root'),
  )
  for (const row of rows) {
    const fam = map.get(row.root) ?? [row.root]
    if (!fam.includes(row.normalized_text)) fam.push(row.normalized_text)
    map.set(row.root, fam)
  }
  return map
}

interface ItemGlossRow {
  normalized_text: string
  translation_nl: string | null
  translation_en: string | null
}

/**
 * Glosses for the given normalized forms (pass surface tokens AND their morphology
 * roots so the root-meaning lookup has data). Keyed by `normalized_text`.
 */
export async function fetchItemGlosses(
  lookupTokens: string[],
): Promise<Map<string, ItemGloss>> {
  const map = new Map<string, ItemGloss>()
  if (lookupTokens.length === 0) return map
  const rows = await chunkedIn<ItemGlossRow>(
    'learning_items',
    'normalized_text',
    [...new Set(lookupTokens)],
    (b) => b.select('normalized_text, translation_nl, translation_en'),
  )
  for (const row of rows) {
    map.set(row.normalized_text, { nl: row.translation_nl, en: row.translation_en })
  }
  return map
}
