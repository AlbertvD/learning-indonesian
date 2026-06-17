// The controlled vocabulary of Indonesian affixes the morphology application tier
// drills (capstone item A). Lives in lib/capabilities — NOT lib/morphology —
// because the pipeline (Layer-2 validator + Layer-3 HC) and the runtime
// (buildCuedRecall distractor packager + the future Affix Trainer) all read it,
// and the pipeline may import ONLY from lib/capabilities (target-architecture.md:1159,
// the sole pipeline↔runtime shared seam). Architect-CRITICAL, 2026-06-16.
//
// This is a code constant, not a DB table (omission test: no per-row authoring, no
// runtime writes — a frozen reference list the validator checks membership against).

export type AffixType = 'prefix' | 'suffix' | 'confix' | 'reduplication'

export interface AffixCatalogEntry {
  /** Canonical affix label, e.g. 'meN-', '-kan', 'ke-…-an'. Matches
   *  affixed_form_pairs.affix and lesson_section_affixed_pairs.affix. */
  affix: string
  affixType: AffixType
  /** Short gloss for the catalog UI / dev reference. */
  gloss: string
  /** Spelling variants of an allomorphic prefix (meN-/peN- nasalization). The
   *  prefix string that attaches to the root, e.g. ['me','mem','men','meny','meng','menge'].
   *  Present ONLY for allomorphic affixes. Nasalization is drilled at the rule tier
   *  (grammar_pattern_src, ADR 0017); this list also seeds the rule note + catalog HC. */
  allomorphClasses?: string[]
}

export const AFFIX_CATALOG: readonly AffixCatalogEntry[] = [
  // ── Verbal/nominal prefixes ────────────────────────────────────────────────
  {
    affix: 'meN-',
    affixType: 'prefix',
    gloss: 'active/agent verb-former (nasalising)',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
  },
  {
    affix: 'peN-',
    affixType: 'prefix',
    gloss: 'agent/instrument noun-former (nasalising)',
    allomorphClasses: ['pe', 'pem', 'pen', 'peny', 'peng', 'penge'],
  },
  { affix: 'ber-', affixType: 'prefix', gloss: 'intransitive / stative / possessive verb-former' },
  { affix: 'di-', affixType: 'prefix', gloss: 'passive verb-former' },
  { affix: 'ter-', affixType: 'prefix', gloss: 'accidental / resultative / superlative' },
  { affix: 'se-', affixType: 'prefix', gloss: 'one / same / as…as' },
  { affix: 'memper-', affixType: 'prefix', gloss: 'causative (intensifying)' },
  // ── Suffixes ───────────────────────────────────────────────────────────────
  { affix: '-kan', affixType: 'suffix', gloss: 'causative / benefactive transitiviser' },
  { affix: '-i', affixType: 'suffix', gloss: 'locative / repetitive transitiviser' },
  { affix: '-an', affixType: 'suffix', gloss: 'nominaliser (result / object)' },
  // ── Confixes (circumfixes) ──────────────────────────────────────────────────
  { affix: 'ke-…-an', affixType: 'confix', gloss: 'abstract noun / adversative state' },
  { affix: 'pe-…-an', affixType: 'confix', gloss: 'process / result nominaliser' },
  { affix: 'per-…-an', affixType: 'confix', gloss: 'collective / result nominaliser' },
  // ── Reduplication ───────────────────────────────────────────────────────────
  { affix: 'reduplication', affixType: 'reduplication', gloss: 'plurality / variety / intensity' },
] as const

const BY_AFFIX = new Map<string, AffixCatalogEntry>(AFFIX_CATALOG.map((e) => [e.affix, e]))

/** Every catalog affix label — the membership set the gate asserts against. */
export const AFFIX_SET: ReadonlySet<string> = new Set(BY_AFFIX.keys())

export function isCatalogAffix(affix: string): boolean {
  return BY_AFFIX.has(affix)
}

export function affixCatalogEntry(affix: string): AffixCatalogEntry | undefined {
  return BY_AFFIX.get(affix)
}

/** Allomorph classes for an affix (empty if it is not an allomorphic affix). */
export function allomorphClassesFor(affix: string): string[] {
  return BY_AFFIX.get(affix)?.allomorphClasses ?? []
}

/**
 * Distractor affixes for the recognise_word_form_link_cap MCQ ("pick the affix"):
 * other catalog affixes, same affix_type first (closer confusables), then the rest.
 * Deterministic order (catalog order) — the packager shuffles + slices.
 */
export function distractorAffixes(correctAffix: string): string[] {
  const entry = BY_AFFIX.get(correctAffix)
  const others = AFFIX_CATALOG.filter((e) => e.affix !== correctAffix)
  if (!entry) return others.map((e) => e.affix)
  const sameType = others.filter((e) => e.affixType === entry.affixType).map((e) => e.affix)
  const otherType = others.filter((e) => e.affixType !== entry.affixType).map((e) => e.affix)
  return [...sameType, ...otherType]
}
