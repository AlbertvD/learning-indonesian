/**
 * Gloss resolution for the Lezen reader — the tap-to-reveal cascade (Q4/Q6, NL-first):
 *
 *   1. proper noun           → no gloss (names aren't glossed)
 *   2. exact learning_item   → its NL gloss (EN fallback); + morphology payload if any
 *   3. morphology            → the root's gloss (the word decomposes to a known root),
 *                              with the exploratory affix + family payload (ADR 0024)
 *   4. sentence fallback     → the segment's Dutch translation (always available)
 *
 * Pure — glosses, the morphology decomposition map, families, and the affix-function
 * lookup are all injected, so it is fully unit-testable. The morphology step is a pure
 * RETRIEVE of the build-time `item_morphology` pre-compute (it replaces the old crude
 * `affixStrip` strip-to-root). The bundled dictionary step is a build-time gloss source
 * for the pre-seed, not a runtime layer.
 */
import type { ReadingToken } from './readableText'
import type { ItemMorphology } from './adapter'

export interface ItemGloss {
  nl: string | null
  en: string | null
}

/** The exploratory morphology detail shown in the popover (gloss-only; not drilled). */
export interface MorphologyGloss {
  /** Catalog affix label, e.g. 'meN-'. */
  affix: string
  /** Learner-facing affix function (Dutch), from the static AFFIX_CATALOG. */
  affixFunctionNl: string
  /** The base form, e.g. 'baca'. */
  root: string
  /** The root's own meaning (NL-first), if the root is a learning_item. */
  rootMeaning: string | null
  /** Related forms sharing the root (incl. the root), for the "word family" display. */
  family: string[]
}

export type GlossSource = 'item' | 'morphology' | 'sentence' | 'name' | 'none'

export interface GlossResult {
  /** What to show; null for a proper noun. */
  text: string | null
  source: GlossSource
  /** Present whenever the word has a morphology decomposition (any source). */
  morphology?: MorphologyGloss
}

/** NL-first: a learner reads in Dutch by default (Kim et al. 2024). */
function pickGloss(g: ItemGloss | undefined): string | null {
  if (!g) return null
  return g.nl ?? g.en ?? null
}

export interface GlossDeps {
  glosses: Map<string, ItemGloss>
  morphology: Map<string, ItemMorphology>
  families: Map<string, string[]>
  /** affix label → learner-facing Dutch function (from AFFIX_CATALOG). */
  affixFunctionNl: (affix: string) => string
  sentenceNl: string
}

function buildMorphology(m: ItemMorphology, deps: GlossDeps): MorphologyGloss {
  return {
    affix: m.affix,
    affixFunctionNl: deps.affixFunctionNl(m.affix),
    root: m.root,
    rootMeaning: pickGloss(deps.glosses.get(m.root)),
    family: deps.families.get(m.root) ?? [m.root],
  }
}

export function resolveGloss(token: ReadingToken, deps: GlossDeps): GlossResult {
  if (!token.isWord) return { text: null, source: 'none' }
  if (token.isProperNoun) return { text: null, source: 'name' }

  const morph = deps.morphology.get(token.normalized)
  const morphology = morph ? buildMorphology(morph, deps) : undefined

  // 2. exact item match — precise meaning; attach morphology if the word is also affixed.
  const exact = pickGloss(deps.glosses.get(token.normalized))
  if (exact !== null) return { text: exact, source: 'item', morphology }

  // 3. morphology — the word decomposes to a known root; show the root's meaning + detail.
  if (morphology) return { text: morphology.rootMeaning, source: 'morphology', morphology }

  // 4. sentence-translation fallback (meaning in context).
  return { text: deps.sentenceNl, source: 'sentence' }
}
