/**
 * Gloss resolution for the Lezen reader — the tap-to-reveal cascade (Q4/Q6, NL-first):
 *
 *   1. proper noun           → no gloss (names aren't glossed)
 *   2. exact learning_item   → its NL gloss (EN fallback)
 *   3. morphology-root        → the gloss of an affix-stripped candidate that IS an item
 *   4. sentence fallback      → the segment's Dutch translation (always available)
 *
 * Pure — glosses + candidate generator are injected, so it is fully unit-testable.
 * The bundled dictionary (a further step before the sentence fallback) is Phase 2.
 */
import type { ReadingToken } from './readableText'

export interface ItemGloss {
  nl: string | null
  en: string | null
}

export type GlossSource = 'item' | 'morphology' | 'sentence' | 'name' | 'none'

export interface GlossResult {
  /** What to show; null for a proper noun (render e.g. "(naam)" or nothing). */
  text: string | null
  source: GlossSource
}

/** NL-first: a learner reads in Dutch by default (Kim et al. 2024). */
function pickGloss(g: ItemGloss | undefined): string | null {
  if (!g) return null
  return g.nl ?? g.en ?? null
}

export function resolveGloss(
  token: ReadingToken,
  opts: {
    glosses: Map<string, ItemGloss>
    sentenceNl: string
    affixCandidates: (word: string) => string[]
  },
): GlossResult {
  if (!token.isWord) return { text: null, source: 'none' }
  if (token.isProperNoun) return { text: null, source: 'name' }

  // 2. exact item match
  const exact = pickGloss(opts.glosses.get(token.normalized))
  if (exact !== null) return { text: exact, source: 'item' }

  // 3. morphology-root: try affix-stripped candidates (skip the surface form itself)
  for (const cand of opts.affixCandidates(token.normalized)) {
    if (cand === token.normalized) continue
    const rootGloss = pickGloss(opts.glosses.get(cand))
    if (rootGloss !== null) return { text: rootGloss, source: 'morphology' }
  }

  // 4. sentence-translation fallback (meaning in context)
  return { text: opts.sentenceNl, source: 'sentence' }
}
