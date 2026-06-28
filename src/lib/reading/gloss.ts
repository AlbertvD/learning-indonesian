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
import type { ItemMorphology, FamilyMember } from './adapter'

export interface ItemGloss {
  nl: string | null
  en: string | null
}

/** One related form in the word family, with its translation + affix (for the rule link). */
export interface FamilyGloss {
  form: string
  affix: string
  /** The form's exact meaning (NL-first), if known. */
  translation: string | null
}

/** The exploratory morphology detail shown in the popover (gloss-only; not drilled). */
export interface MorphologyGloss {
  /** Catalog affix label, e.g. 'meN-' (used for the Affix-Trainer link). */
  affix: string
  /** The base form, e.g. 'baca'. */
  root: string
  /** The root's own meaning (NL-first), if the root is a learning_item. */
  rootMeaning: string | null
  /** Related derived forms sharing the root, each with its translation. */
  family: FamilyGloss[]
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
  families: Map<string, FamilyMember[]>
  sentenceNl: string
}

/** NL-first translation of a family member (its stored derived gloss). */
function memberTranslation(m: FamilyMember): string | null {
  return m.glossNl ?? m.glossEn ?? null
}

function buildMorphology(m: ItemMorphology, surface: string, deps: GlossDeps): MorphologyGloss {
  const members = deps.families.get(m.root) ?? []
  return {
    affix: m.affix,
    root: m.root,
    rootMeaning: pickGloss(deps.glosses.get(m.root)),
    // exclude the tapped word itself from the family list (it's the popover headline)
    family: members
      .filter((mem) => mem.form !== surface)
      .map((mem) => ({ form: mem.form, affix: mem.affix, translation: memberTranslation(mem) })),
  }
}

export function resolveGloss(token: ReadingToken, deps: GlossDeps): GlossResult {
  if (!token.isWord) return { text: null, source: 'none' }
  if (token.isProperNoun) return { text: null, source: 'name' }

  const morph = deps.morphology.get(token.normalized)
  const morphology = morph ? buildMorphology(morph, token.normalized, deps) : undefined

  // 2. exact item match — precise meaning; attach morphology if the word is also affixed.
  const exact = pickGloss(deps.glosses.get(token.normalized))
  if (exact !== null) return { text: exact, source: 'item', morphology }

  // 3. morphology — show the derived form's OWN translation if known, else the root's.
  if (morph) {
    const derived = morph.glossNl ?? morph.glossEn ?? null
    return { text: derived ?? morphology!.rootMeaning, source: 'morphology', morphology }
  }

  // 4. sentence-translation fallback (meaning in context).
  return { text: deps.sentenceNl, source: 'sentence' }
}
