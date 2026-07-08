// The deterministic affix-derivation engine (morphology authoring, Spec 2,
// docs/plans/2026-06-18-morphology-authoring-capability.md §3.1).
//
// Given a curated `(root, affix)` judgment, this fills the RULE-GOVERNED fields
// of an affixed-form pair — `derived`, `allomorphClass`, `allomorphRule`,
// `affixType`, `affixGloss`, `productive` — so the linguist authors only the
// judgment (which roots, which affix, which grammar category), never the
// rule-governed surface. The L13 meN- pilot's 14 hand-authored pairs are the
// golden fixture this engine reproduces (see __tests__/affixDerivation.test.ts).
//
// Lives in lib/capabilities — sibling to affixCatalog.ts, which it reads — because
// the generation script (scripts/) and the pipeline both import only from here
// (target-architecture.md:1159, the sole pipeline↔runtime shared seam). Pure, no I/O.
//
// SCOPE (ADR 0019): a single catalog-recipe composer. Every catalog entry carries
// a `composition` recipe — a left piece (nasalising meN-/peN- or a fixed prefix),
// a right piece (a fixed suffix), or `reduplicate` — and the engine reads it
// instead of branching per affix. This covers ALL prefixes, suffixes, and confixes
// (`prefix + suffix` present → the surface is spelled identically whether the
// confix is atomic like `ke-…-an` or stacked like `meN-…-kan`); reduplication is
// the one separate, non-concatenative path. The stored `affix` is carried
// explicitly on the authored pair, so forms round-trip cleanly. Only an affix with
// no recipe, an unknown affix, or a root whose nasalisation class can't be derived
// throws UnsupportedAffixError.

import { affixCatalogEntry, type AffixComposition, type AffixType } from './affixCatalog'

export interface DerivedAffixedForm {
  derived: string
  /** Non-null only for a BARE allomorphic (meN-/peN-) prefix; the chosen spelling.
   *  For a confix the nasalised left half lives in `circumfixLeft` instead, and
   *  this stays null (its documented scope is bare meN-/peN- only). */
  allomorphClass: string | null
  /** Short Dutch rule note shown on link/produce exercises. Begins with the
   *  canonical affix label. */
  allomorphRule: string
  affixType: AffixType
  /** From the catalog (English dev gloss; metadata only — not rendered to learners). */
  affixGloss: string
  productive: boolean
  /** The left surface piece of a confix (e.g. 'mem' for meN-…-kan, 'ke' for
   *  ke-…-an); null for non-confix affixes. */
  circumfixLeft: string | null
  /** The right surface piece of a confix (e.g. 'kan', 'an'); null otherwise. */
  circumfixRight: string | null
}

export class UnsupportedAffixError extends Error {
  constructor(affix: string, reason: string) {
    super(`deriveAffixedForm: affix "${affix}" is not supported this pass — ${reason}`)
    this.name = 'UnsupportedAffixError'
  }
}

/** Judgment-only authored input — the ONLY morphology shape a human/agent writes.
 *  See scripts/data/staging/lesson-N/morphology-roots.ts. */
export interface MorphologyRoot {
  /** Must already exist as a learning_item (the ADR-0018 root-vocab prereq). */
  root: string
  /** Canonical catalog affix label, e.g. 'meN-', 'ber-'. */
  affix: string
  /** The EXACT title of a grammar category authored in this lesson's lesson.ts
   *  content.categories. The generation script mints the pattern slug from it. */
  illustratesCategory: string
}

// ── Nasalisation (meN-/peN-) ────────────────────────────────────────────────
// The nasal "slot" a root-initial phoneme selects, and whether that initial
// consonant elides (K/P/S/T). Slot is affix-independent; the spelling per slot
// differs only in the leading vowel (me-/pe-), so we resolve it per affix below.

type NasalSlot = 'plain' | 'm' | 'n' | 'ny' | 'ng'

interface NasalDecision {
  slot: NasalSlot
  drops: boolean
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Root-initial char → nasal slot + elision. Research §43 (standard meN-/peN-). */
function nasalDecision(firstChar: string): NasalDecision {
  // No change: liquids, nasals, glides (l, m, n, r, w, y; incl. ny/ng digraphs,
  // which begin with n).
  if ('lmnrwy'.includes(firstChar)) return { slot: 'plain', drops: false }
  // m-slot (mem-/pem-): b, f, v keep; p elides.
  if ('bfv'.includes(firstChar)) return { slot: 'm', drops: false }
  if (firstChar === 'p') return { slot: 'm', drops: true }
  // n-slot (men-/pen-): c, d, j, z keep; t elides.
  if ('cdjz'.includes(firstChar)) return { slot: 'n', drops: false }
  if (firstChar === 't') return { slot: 'n', drops: true }
  // ny-slot (meny-/peny-): s elides.
  if (firstChar === 's') return { slot: 'ny', drops: true }
  // ng-slot (meng-/peng-): vowels, g, h keep; k elides.
  if (firstChar === 'k') return { slot: 'ng', drops: true }
  if (firstChar === 'g' || firstChar === 'h' || VOWELS.has(firstChar)) {
    return { slot: 'ng', drops: false }
  }
  // Loanword clusters (kh-, sy-, …) and the like are curated exceptions; fail
  // loud so the generation-script cross-check surfaces them rather than minting
  // a wrong allomorph.
  throw new UnsupportedAffixError(
    'meN-/peN-',
    `cannot derive a nasalisation class for a root beginning with "${firstChar}" ` +
    '(loanword cluster or irregular — add it to the exception table)',
  )
}

/** Prefix spelling for a nasal slot, per affix base ('me' | 'pe'). */
function nasalSpelling(base: 'me' | 'pe', slot: NasalSlot): string {
  switch (slot) {
    case 'plain': return base // me / pe
    case 'm': return `${base}m` // mem / pem
    case 'n': return `${base}n` // men / pen
    case 'ny': return `${base}ny` // meny / peny
    case 'ng': return `${base}ng` // meng / peng
  }
}

function deriveNasalising(root: string, affix: 'meN-' | 'peN-'): { derived: string; allomorphClass: string; allomorphRule: string } {
  const base = affix === 'meN-' ? 'me' : 'pe'
  const firstChar = root[0]?.toLowerCase() ?? ''
  const { slot, drops } = nasalDecision(firstChar)
  const spelling = nasalSpelling(base, slot)
  const derived = spelling + (drops ? root.slice(1) : root)

  const letterLabel = VOWELS.has(firstChar) ? 'een klinker' : firstChar
  let allomorphRule: string
  if (slot === 'plain') {
    allomorphRule = `${affix} blijft ${spelling}- voor ${letterLabel}: ${root} → ${derived}.`
  } else if (drops) {
    allomorphRule = `${affix} wordt ${spelling}- voor ${firstChar}, en de ${firstChar} valt weg: ${root} → ${derived}.`
  } else {
    allomorphRule = `${affix} wordt ${spelling}- voor ${letterLabel}: ${root} → ${derived}.`
  }
  return { derived, allomorphClass: spelling, allomorphRule }
}

// ── Invariant prefixes (ber-, di-) ──────────────────────────────────────────

function deriveInvariantPrefix(root: string, affix: string): Pick<DerivedAffixedForm, 'derived' | 'allomorphClass' | 'allomorphRule'> {
  const base = affix.replace(/-$/, '') // 'ber-' → 'ber'
  const derived = base + root
  return {
    derived,
    allomorphClass: null,
    allomorphRule: `${affix} wordt voorgevoegd: ${root} → ${derived}.`,
  }
}

// ── Invariant suffixes (-an, -kan, -i) ──────────────────────────────────────
// Indonesian suffixes attach by plain concatenation; the morphophonemic detail
// that exists (e.g. some -i/-kan sandhi) is curated via the exception table, not
// rule-derived, for this controlled-root workflow.

function deriveSuffix(root: string, affix: string): Pick<DerivedAffixedForm, 'derived' | 'allomorphClass' | 'allomorphRule'> {
  const base = affix.replace(/^-/, '') // '-an' → 'an'
  const derived = root + base
  return {
    derived,
    allomorphClass: null,
    allomorphRule: `Achtervoegsel ${affix} bij ${root}: ${root} → ${derived}.`,
  }
}

// ── Confixes (prefix + suffix wrap-around) ──────────────────────────────────
// Composes the existing pieces: the left half is nasalising (reuse deriveNasalising)
// or fixed; the right half is a plain suffix. The nasalised left spelling lives in
// `circumfixLeft` (NOT allomorphClass — that column's scope is bare meN-/peN-).

type ConfixCore = Pick<DerivedAffixedForm, 'derived' | 'allomorphClass' | 'allomorphRule' | 'circumfixLeft' | 'circumfixRight'>

function deriveConfix(root: string, affix: string, prefix: { nasal: 'me' | 'pe' } | { fixed: string }, suffix: string): ConfixCore {
  let left: string
  let derived: string
  if ('nasal' in prefix) {
    const nas = deriveNasalising(root, prefix.nasal === 'me' ? 'meN-' : 'peN-')
    left = nas.allomorphClass // the chosen spelling, e.g. 'mem' / 'pen'
    derived = nas.derived + suffix // nas.derived is left+stem (with any elision) already
  } else {
    left = prefix.fixed
    derived = left + root + suffix
  }
  return {
    derived,
    allomorphClass: null,
    allomorphRule: `${affix}: voorvoegsel ${left}- met achtervoegsel -${suffix}: ${root} → ${derived}.`,
    circumfixLeft: left,
    circumfixRight: suffix,
  }
}

// ── Reduplication (the one non-concatenative base; ADR 0019, amended L22) ────
// Reduplication forms the base by doubling the root, then OPTIONALLY applies the
// recipe's FIXED prefix / FIXED suffix slots: full (anak-anak), redup+-an
// (sayur-sayuran), ke-…-an redup (kebiru-biruan). circumfix_left/right stay NULL —
// the invariant is "reduplication carries no circumfix"; decompose_word_ex re-derives
// the wrap pieces from the catalog recipe. Sound-change / lexicalised / asymmetric
// ME-redup forms are vocabulary, not rule-derived. A nasalising prefix over a
// reduplicated base has no book example → fail loud rather than guess.

function deriveReduplicated(root: string, affix: string, recipe: AffixComposition): ConfixCore {
  if (recipe.prefix && 'nasal' in recipe.prefix) {
    throw new UnsupportedAffixError(affix, 'nasalising prefix over a reduplicated base is not supported')
  }
  const base = `${root}-${root}`
  const left = recipe.prefix && 'fixed' in recipe.prefix ? recipe.prefix.fixed : ''
  const right = recipe.suffix ?? ''
  const derived = left + base + right

  let allomorphRule: string
  if (left && right) {
    allomorphRule = `${left}-…-${right} om de verdubbeling: ${root} → ${derived}.`
  } else if (right) {
    allomorphRule = `Verdubbeling + achtervoegsel -${right}: ${root} → ${derived}.`
  } else {
    allomorphRule = `Verdubbeling: ${root} → ${derived}.`
  }
  return { derived, allomorphClass: null, allomorphRule, circumfixLeft: null, circumfixRight: null }
}

// ── Static exception table (Spec 2 §3.1) ────────────────────────────────────
// Curated irregulars override the rule. Keyed `${affix}:${root}`. A
// curated-root workflow needs no auto-suspicion heuristic (staff-engineer);
// revisit only if 14-chapter bulk authoring shows silent misses.
const IRREGULAR: Record<string, Partial<DerivedAffixedForm>> = {
  'meN-:punya': {
    derived: 'mempunyai',
    allomorphClass: 'mem',
    allomorphRule: 'meN- + -i bij punya levert de onregelmatige vorm mempunyai op (de p valt niet weg): punya → mempunyai.',
  },
  'meN-:bom': {
    derived: 'mengebom',
    allomorphClass: 'menge',
    allomorphRule: 'meN- wordt menge- voor het eenlettergrepige bom: bom → mengebom.',
  },
  'ber-:ajar': {
    derived: 'belajar',
    allomorphRule: 'ber- wordt bel- voor ajar: ajar → belajar.',
  },
  'ber-:kerja': {
    derived: 'bekerja',
    allomorphRule: 'ber- wordt be- voor kerja: kerja → bekerja.',
  },
}

/**
 * Derive the rule-governed fields of an affixed-form pair from `(root, affix)`,
 * reading the affix's `composition` recipe from the catalog (ADR 0019).
 *
 * @throws UnsupportedAffixError for an affix not in the catalog, an affix with no
 *   composition recipe, and roots whose nasalisation class can't be rule-derived
 *   (curated irregulars must go in the exception table).
 */
export function deriveAffixedForm(root: string, affix: string): DerivedAffixedForm {
  const entry = affixCatalogEntry(affix)
  if (!entry) {
    throw new UnsupportedAffixError(affix, 'not in the affix catalog (lib/capabilities/affixCatalog.ts)')
  }
  const recipe: AffixComposition | undefined = entry.composition
  if (!recipe) {
    throw new UnsupportedAffixError(affix, 'has no composition recipe — the engine cannot derive it yet')
  }

  let core: ConfixCore
  if (recipe.reduplicate) {
    core = deriveReduplicated(root, affix, recipe)
  } else if (recipe.prefix && recipe.suffix !== undefined) {
    core = deriveConfix(root, affix, recipe.prefix, recipe.suffix)
  } else if (recipe.prefix) {
    const bare =
      'nasal' in recipe.prefix
        ? deriveNasalising(root, recipe.prefix.nasal === 'me' ? 'meN-' : 'peN-')
        : deriveInvariantPrefix(root, affix)
    core = { ...bare, circumfixLeft: null, circumfixRight: null }
  } else if (recipe.suffix !== undefined) {
    core = { ...deriveSuffix(root, affix), circumfixLeft: null, circumfixRight: null }
  } else {
    throw new UnsupportedAffixError(affix, 'has an empty composition recipe')
  }

  const base: DerivedAffixedForm = {
    ...core,
    affixType: entry.affixType,
    affixGloss: entry.gloss,
    productive: true,
  }

  const override = IRREGULAR[`${affix}:${root}`]
  return override ? { ...base, ...override } : base
}

/**
 * Blank the derived form in a carrier sentence as a WHOLE WORD (ADR 0019 option B).
 * Returns the carrier with the first whole-word occurrence of `derived` replaced by
 * `placeholder`, or null if `derived` does not occur as a standalone token — so a
 * clitic-attached surface like `dinaikkannya` does NOT match `dinaikkan` (it would
 * mis-blank to `___nya` with a naive substring replace). The comparison is
 * CASE-INSENSITIVE (a sentence-initial capitalised token like `Ikuti` still matches
 * lowercase `derived` `ikuti`), but the token's ACTUAL case (and any surrounding
 * punctuation) is what gets replaced, so `tok.replace(core, placeholder)` — not the
 * (possibly differently-cased) `derived` — substitutes cleanly. Internal hyphens are
 * kept (reduplication forms like `anak-anak` are one token). The harvest gate and the
 * runtime render share this ONE definition so they can never drift.
 */
export function blankDerivedInCarrier(carrier: string, derived: string, placeholder = '___'): string | null {
  const parts = carrier.split(/(\s+)/u) // keep whitespace runs so we can rejoin verbatim
  let done = false
  const out = parts.map((tok) => {
    if (done) return tok
    const core = tok.replace(/^[^\p{L}-]+/u, '').replace(/[^\p{L}-]+$/u, '')
    if (core.toLowerCase() === derived.toLowerCase()) {
      done = true
      return tok.replace(core, placeholder)
    }
    return tok
  })
  return done ? out.join('') : null
}
