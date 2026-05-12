/**
 * capability-stage/enrichLevel.ts — fill missing `level` on staging items.
 *
 * Deterministic: every learning item inherits the lesson's level. No LLM
 * call needed. This is the dedicated counterpart to enrichPos for items
 * where the staging field is empty/missing — runs pre-validation so the
 * downstream paths see populated `level`.
 *
 * Caller is responsible for writing the updated learning-items.ts back to
 * staging so subsequent runs skip the same work.
 */

export interface LevelEnrichmentItem {
  base_text: string
  level?: string | null
}

export interface LevelEnrichmentResult {
  levelByBaseText: Map<string, string>
  filledCount: number
}

export function enrichMissingLevel(
  items: LevelEnrichmentItem[],
  lessonLevel: string,
): LevelEnrichmentResult {
  const out = new Map<string, string>()
  let filled = 0
  for (const item of items) {
    const hasLevel = typeof item.level === 'string' && item.level.trim().length > 0
    if (!hasLevel) {
      out.set(item.base_text, lessonLevel)
      filled++
    }
  }
  return { levelByBaseText: out, filledCount: filled }
}
