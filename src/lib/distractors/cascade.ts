import { STRUCTURALLY_SIMILAR_TYPES } from './structuralTypes'
import { sharesMeaningfulWord } from './options'

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Candidate in the distractor pool for pickDistractorCascade. */
export interface DistractorCandidate {
  id: string
  option: string          // the displayed option text (translation or base_text)
  itemType: string
  pos: string | null
  level: string
  semanticGroup: string | null
}

/**
 * Shared 6-tier distractor cascade used by runtime MCQ builders
 * (makeRecognitionMCQ, makeCuedRecall, makeClozeMcq, and the new
 * capability-path builders in src/lib/exercises/builders/).
 *
 * Tiers (strict → lenient):
 *   0. same item_type + same POS + same semantic group
 *   1. same item_type + same POS + same level
 *   2. same item_type + same POS (any level, any group)
 *   3. same item_type + same semantic group (POS relaxed)
 *   4. same item_type + same level (POS relaxed)
 *   5. full pool fallback (no filters)
 *
 * Null POS on target skips Tiers 0–2 (they require target POS).
 * Candidate with null POS never appears in Tiers 0–2 when target has POS.
 * Dedupe by candidate id, exact option text, AND substring-overlap against
 * already-selected options (prevents karena/sebab-style "omdat" / "omdat, de
 * reden is" visual duplicates).
 *
 * @param targetOption  the correct answer's displayed option text — included
 *                      in the selected-set for substring dedup so candidates
 *                      whose option overlaps the correct answer get rejected.
 */
export function pickDistractorCascade(
  target: { itemType: string; pos: string | null; level: string; semanticGroup: string | null },
  pool: DistractorCandidate[],
  count: number,
  targetOption: string = '',
): string[] {
  const allowedTypes = STRUCTURALLY_SIMILAR_TYPES[target.itemType] ?? [target.itemType]
  const structuralPool = pool.filter(c => allowedTypes.includes(c.itemType))

  const selectedIds = new Set<string>()
  const selectedOptions = new Set<string>()
  if (targetOption) selectedOptions.add(targetOption)
  const result: string[] = []

  const addFromTier = (candidates: DistractorCandidate[]) => {
    for (const c of shuffle([...candidates])) {
      if (result.length >= count) return
      if (selectedIds.has(c.id)) continue
      if (selectedOptions.has(c.option)) continue
      if (sharesMeaningfulWord(c.option, selectedOptions)) continue
      selectedIds.add(c.id)
      selectedOptions.add(c.option)
      result.push(c.option)
    }
  }

  const tier0 = target.pos && target.semanticGroup
    ? structuralPool.filter(c => c.pos === target.pos && c.semanticGroup === target.semanticGroup)
    : []
  const tier1 = target.pos
    ? structuralPool.filter(c => c.pos === target.pos && c.level === target.level)
    : []
  const tier2 = target.pos
    ? structuralPool.filter(c => c.pos === target.pos)
    : []
  const tier3 = target.semanticGroup
    ? structuralPool.filter(c => c.semanticGroup === target.semanticGroup)
    : []
  const tier4 = structuralPool.filter(c => c.level === target.level)
  const tier5 = pool  // full pool fallback, ignores structural filter

  addFromTier(tier0)
  addFromTier(tier1)
  addFromTier(tier2)
  addFromTier(tier3)
  addFromTier(tier4)
  addFromTier(tier5)

  return result
}
