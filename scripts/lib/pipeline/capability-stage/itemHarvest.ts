/**
 * capability-stage/itemHarvest.ts — the productive-ceiling harvest rule
 * (ADR 0014; plan §1a). The SINGLE definition of "which item kinds are
 * harvested as learning capabilities", shared by:
 *
 *   - the runner's legacy-bundle filter (Fix 1a) — stops EMITTING
 *     sentence/dialogue_chunk item caps on every publish;
 *   - the one-off retire backfill (Fix 1b) — retires the already-published
 *     over-harvested caps now.
 *
 * Co-location prevents the two surfaces from drifting on what "over-harvested"
 * means (the project's three-gates / one-definition discipline).
 *
 * ADR 0014: item-harvest is restricted to lexical chunks — only `word`/`phrase`
 * become learning capabilities. `sentence` and `dialogue_chunk` are over-harvest
 * (verbatim full-sentence recall/dictation = undesirable difficulty) and produce
 * NO item capabilities. KIND is the gate; a >=6-token word/phrase is a secondary
 * "likely mis-tag" smell (warn-only — long fixed expressions like
 * `terima kasih kembali` are legitimate), never a rule on its own.
 *
 * Terminology guard: this kills the `dialogue_chunk` *item_type* (the
 * over-harvested item). It never touches the `dialogue_line` *source_kind* cloze
 * caps (CONTEXT.md:35) — those are not item caps and flow through a separate
 * projector (`vocab.contextualClozeCapabilities`), not the legacy item bundle.
 */

export const HARVESTED_ITEM_TYPES = ['word', 'phrase'] as const
export const NON_HARVESTED_ITEM_TYPES = ['sentence', 'dialogue_chunk'] as const

/** The single pinned threshold across ADR 0014 / the plan / CONTEXT.md. A
 *  word/phrase running this many whitespace tokens or more emits the
 *  length-guard warning (likely mis-tagged sentence). */
export const LENGTH_GUARD_TOKEN_THRESHOLD = 6

const ITEM_REF_PREFIX = 'learning_items/'

/** The slug component of an `item`-kind cap's source_ref, or null when the
 *  source_ref is not an item ref (a dialogue_line / pattern / podcast cap). */
export function extractItemSlug(sourceRef: string): string | null {
  if (!sourceRef.startsWith(ITEM_REF_PREFIX)) return null
  return sourceRef.slice(ITEM_REF_PREFIX.length)
}

export function isNonHarvestedItemType(itemType: string): boolean {
  return (NON_HARVESTED_ITEM_TYPES as readonly string[]).includes(itemType)
}

export function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * True when `cap` is an item capability whose source resolves to a
 * sentence/dialogue_chunk learning item — i.e. an over-harvested cap that must
 * not be emitted (Fix 1a) and must be retired (Fix 1b).
 *
 * A cap whose source_ref resolves to NO item row in `itemTypeBySlug` is KEPT
 * (false) — it is a non-item cap (dialogue_line cloze, pattern, podcast) that
 * happens to flow through the same bundle; the item-kind ceiling does not apply
 * to it. `validateItemSourceRefResolvability` separately guarantees that a
 * genuine item cap always resolves, so a true item cap is never silently kept by
 * this fall-through.
 */
export function isOverHarvestedItemCap(
  cap: { sourceKind: string; sourceRef: string },
  itemTypeBySlug: ReadonlyMap<string, string>,
): boolean {
  if (cap.sourceKind !== 'item') return false
  const slug = extractItemSlug(cap.sourceRef)
  if (slug == null) return false
  const itemType = itemTypeBySlug.get(slug)
  if (itemType == null) return false
  return isNonHarvestedItemType(itemType)
}
