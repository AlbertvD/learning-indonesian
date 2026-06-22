// lib/exercise-content/morphologyDistractors — deterministic distractor selection
// for the morphology MEANING card (ADR 0021).
//
// Priority cascade (richest discriminator first): the root's own bare meaning →
// same-root family siblings → a lesson-scoped backfill pool. The root meaning is
// the strongest distractor because it drills the affix's meaning-shift (jalan
// "road" vs berjalan "to walk"); family siblings force discriminating affixes by
// meaning. Answer-excluded + deduped (normalized) to avoid the answer-as-distractor
// / duplicate defects (project_capability_quality_salvage_not_rebuild). Pure: no DB.

export interface MeaningDistractorInput {
  /** The correct gloss (the answer) — never offered as a distractor. */
  correctGloss: string
  /** The root's bare meaning (user language), or null. */
  rootMeaning: string | null
  /** Same-root family glosses (preferred distractors). */
  siblingGlosses: string[]
  /** Other-root, lesson-scoped backfill glosses. */
  poolGlosses: string[]
}

/** Normalize for dedup + answer-exclusion: lowercase, trim, collapse whitespace,
 *  drop surrounding quotes and trailing sentence punctuation. */
function normalizeGloss(g: string): string {
  return g
    .toLowerCase()
    .replace(/["'""'']/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!?;,]+$/u, '')
    .trim()
}

/**
 * Up to 3 distractor glosses in priority order, answer-excluded + deduped. Returns
 * fewer than 3 ONLY when the candidate pool is genuinely exhausted — the caller
 * (the MCQ builder) then fails loud rather than rendering a <4-option MCQ.
 */
export function pickMeaningDistractors(input: MeaningDistractorInput): string[] {
  const answerKey = normalizeGloss(input.correctGloss)
  const candidates = [
    ...(input.rootMeaning ? [input.rootMeaning] : []),
    ...input.siblingGlosses,
    ...input.poolGlosses,
  ]

  const seen = new Set<string>([answerKey])
  const out: string[] = []
  for (const c of candidates) {
    const key = normalizeGloss(c)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length === 3) break
  }
  return out
}
