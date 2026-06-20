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

/** CEFR band an affix is first taught at — curated catalog metadata for the
 *  Affix Trainer's per-affix level badge (capstone item A). Bare `string`
 *  elsewhere (lessons.level); typed here because the set is fixed + curated. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

/**
 * The deterministic composition recipe the derivation engine reads to build the
 * surface form (ADR 0019). One recipe per catalog entry replaces the engine's
 * former per-affix branching:
 *  - a left piece (`prefix`) — nasalising (`meN-`/`peN-` slot logic, base 'me'/'pe')
 *    or a fixed string ('di','ke','ber','per','ter','se','memper'), or absent;
 *  - a right piece (`suffix`) — a fixed string ('kan','i','an'), or absent;
 *  - `reduplicate` — the one non-concatenative path (copies the root, `root-root`).
 *
 * A `confix` is just "both prefix AND suffix present" (shape, not atomicity): the
 * engine fills `circumfix_left`/`circumfix_right` from the two pieces. Atomic
 * circumfixes (`ke-…-an`) and stacked affixes (`meN-…-kan`) spell identically and
 * share this composer; the difference is teaching metadata, not derivation.
 */
export interface AffixComposition {
  prefix?: { nasal: 'me' | 'pe' } | { fixed: string }
  suffix?: string
  reduplicate?: boolean
}

export interface AffixCatalogEntry {
  /** Canonical affix label, e.g. 'meN-', '-kan', 'ke-…-an'. Matches
   *  affixed_form_pairs.affix and lesson_section_affixed_pairs.affix. */
  affix: string
  affixType: AffixType
  /** Short gloss for the catalog UI / dev reference. */
  gloss: string
  /** Teaching-sequence rank (1-based) — the research's frequency × productivity ×
   *  transparency order (ber- → di- → meN- → -an → -kan → -i → ter- → se- →
   *  pe-/peN- → confixes → reduplication; docs/research/2026-06-15-affix-…).
   *  The Affix Trainer sorts the catalog grid by this; the pipeline ignores it
   *  (the validator checks membership only). Unique across the catalog. */
  rank: number
  /** CEFR band the affix is first introduced at — the per-affix level badge. */
  cefrLevel: CefrLevel
  /** Spelling variants of an allomorphic prefix (meN-/peN- nasalization). The
   *  prefix string that attaches to the root, e.g. ['me','mem','men','meny','meng','menge'].
   *  Present ONLY for allomorphic affixes. Nasalization is drilled at the rule tier
   *  (grammar_pattern_src, ADR 0017); this list also seeds the rule note + catalog HC. */
  allomorphClasses?: string[]
  /** How the engine derives the surface form (ADR 0019). Absent → engine cannot
   *  derive it (throws UnsupportedAffixError). */
  composition?: AffixComposition
}

// `rank` follows the research teaching sequence (frequency × productivity ×
// transparency): the nine core affixes first (ber- → di- → meN- → -an → -kan →
// -i → ter- → se- → peN-), then memper-, then confixes, stacked affixes, and
// reduplication. The array stays grouped by AffixType (distractorAffixes +
// BY_AFFIX determinism depend on insertion order); the trainer sorts by `rank`.
export const AFFIX_CATALOG: readonly AffixCatalogEntry[] = [
  // ── Verbal/nominal prefixes ────────────────────────────────────────────────
  {
    affix: 'meN-',
    affixType: 'prefix',
    gloss: 'active/agent verb-former (nasalising)',
    rank: 3,
    cefrLevel: 'A2',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' } },
  },
  {
    affix: 'peN-',
    affixType: 'prefix',
    gloss: 'agent/instrument noun-former (nasalising)',
    rank: 9,
    cefrLevel: 'B1',
    allomorphClasses: ['pe', 'pem', 'pen', 'peny', 'peng', 'penge'],
    composition: { prefix: { nasal: 'pe' } },
  },
  { affix: 'ber-', affixType: 'prefix', gloss: 'intransitive / stative / possessive verb-former', rank: 1, cefrLevel: 'A2', composition: { prefix: { fixed: 'ber' } } },
  { affix: 'di-', affixType: 'prefix', gloss: 'passive verb-former', rank: 2, cefrLevel: 'A2', composition: { prefix: { fixed: 'di' } } },
  { affix: 'ter-', affixType: 'prefix', gloss: 'accidental / resultative / superlative', rank: 7, cefrLevel: 'B1', composition: { prefix: { fixed: 'ter' } } },
  { affix: 'se-', affixType: 'prefix', gloss: 'one / same / as…as', rank: 8, cefrLevel: 'A2', composition: { prefix: { fixed: 'se' } } },
  { affix: 'memper-', affixType: 'prefix', gloss: 'causative (intensifying)', rank: 10, cefrLevel: 'B2', composition: { prefix: { fixed: 'memper' } } },
  // ── Suffixes ───────────────────────────────────────────────────────────────
  { affix: '-kan', affixType: 'suffix', gloss: 'causative / benefactive transitiviser', rank: 5, cefrLevel: 'B1', composition: { suffix: 'kan' } },
  { affix: '-i', affixType: 'suffix', gloss: 'locative / repetitive transitiviser', rank: 6, cefrLevel: 'B1', composition: { suffix: 'i' } },
  { affix: '-an', affixType: 'suffix', gloss: 'nominaliser (result / object)', rank: 4, cefrLevel: 'A2', composition: { suffix: 'an' } },
  // ── Confixes (circumfixes) ── shape = prefix + suffix (ADR 0019; atomicity is teaching metadata)
  { affix: 'ke-…-an', affixType: 'confix', gloss: 'abstract noun / adversative state', rank: 11, cefrLevel: 'B1', composition: { prefix: { fixed: 'ke' }, suffix: 'an' } },
  {
    affix: 'pe-…-an',
    affixType: 'confix',
    gloss: 'process / result nominaliser',
    rank: 12,
    cefrLevel: 'B1',
    allomorphClasses: ['pe', 'pem', 'pen', 'peny', 'peng', 'penge'],
    composition: { prefix: { nasal: 'pe' }, suffix: 'an' },
  },
  { affix: 'per-…-an', affixType: 'confix', gloss: 'collective / result nominaliser', rank: 13, cefrLevel: 'B2', composition: { prefix: { fixed: 'per' }, suffix: 'an' } },
  // ── Stacked affixes (prefix + suffix co-occurring; left half allomorphic for meN-) ──
  {
    affix: 'meN-…-kan',
    affixType: 'confix',
    gloss: 'active benefactive/causative transitiviser',
    rank: 14,
    cefrLevel: 'B1',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' }, suffix: 'kan' },
  },
  { affix: 'di-…-kan', affixType: 'confix', gloss: 'passive benefactive/causative transitiviser', rank: 15, cefrLevel: 'B1', composition: { prefix: { fixed: 'di' }, suffix: 'kan' } },
  {
    affix: 'meN-…-i',
    affixType: 'confix',
    gloss: 'active locative/repetitive transitiviser',
    rank: 16,
    cefrLevel: 'B1',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' }, suffix: 'i' },
  },
  { affix: 'di-…-i', affixType: 'confix', gloss: 'passive locative/repetitive transitiviser', rank: 17, cefrLevel: 'B2', composition: { prefix: { fixed: 'di' }, suffix: 'i' } },
  { affix: 'memper-…-kan', affixType: 'confix', gloss: 'causative transitiviser (intensifying)', rank: 18, cefrLevel: 'B2', composition: { prefix: { fixed: 'memper' }, suffix: 'kan' } },
  // ── Reduplication ───────────────────────────────────────────────────────────
  // Base modifier (ADR 0019, amended L22): double the root, then OPTIONALLY apply the
  // fixed prefix / fixed suffix slots. circumfix_left/right stay null on the row;
  // decompose_word_ex re-derives the wrap pieces from these recipes. The U+2026 in
  // `ke-…-an-reduplication` matches the confix `ke-…-an` char, but the `-reduplication`
  // tail keeps it a distinct key in BY_AFFIX (no collision).
  { affix: 'reduplication', affixType: 'reduplication', gloss: 'plurality / variety / intensity', rank: 19, cefrLevel: 'A2', composition: { reduplicate: true } },
  { affix: 'reduplication-an', affixType: 'reduplication', gloss: 'collective/variety reduplication + -an', rank: 20, cefrLevel: 'B1', composition: { reduplicate: true, suffix: 'an' } },
  { affix: 'ke-…-an-reduplication', affixType: 'reduplication', gloss: 'approximative ("-ish") colour reduplication', rank: 21, cefrLevel: 'B2', composition: { prefix: { fixed: 'ke' }, reduplicate: true, suffix: 'an' } },
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
