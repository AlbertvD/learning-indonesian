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
// SCOPE (this pass): allomorphic prefixes meN-/peN- (nasalisation) + invariant
// prefixes ber-/di-. Suffixes (-an) and confixes/reduplication THROW
// UnsupportedAffixError: a suffix's canonical label carries a LEADING hyphen
// (`-an`), which the lesson stage's `deriveAffix` (projectSections.ts:142-148)
// cannot recover (its regex `^([A-Za-z]+-)` only yields trailing-hyphen tokens),
// so a suffix pair would silently fail HC31's `affix ∈ catalog` check. Supporting
// suffixes needs a writer-contract change Spec 2 explicitly defers; until then the
// engine fails loud rather than emit unpublishable data. Confix/reduplication
// derivation is likewise deferred to their book-2 chapters (matches Task 6).

import { affixCatalogEntry, type AffixType } from './affixCatalog'

export interface DerivedAffixedForm {
  derived: string
  /** Non-null only for allomorphic (meN-/peN-) affixes; the chosen prefix spelling. */
  allomorphClass: string | null
  /** Short Dutch rule note shown on link/produce exercises. MUST begin with the
   *  canonical affix label so the lesson stage's `deriveAffix` recovers a
   *  catalog-valid affix (HC31). */
  allomorphRule: string
  affixType: AffixType
  /** From the catalog (English dev gloss; metadata only — not rendered to learners). */
  affixGloss: string
  productive: boolean
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

function deriveNasalising(root: string, affix: 'meN-' | 'peN-'): Pick<DerivedAffixedForm, 'derived' | 'allomorphClass' | 'allomorphRule'> {
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
 * Derive the rule-governed fields of an affixed-form pair from `(root, affix)`.
 *
 * @throws UnsupportedAffixError for unknown affixes, suffixes, confixes,
 *   reduplication, and roots whose nasalisation class can't be rule-derived
 *   (curated irregulars must go in the exception table).
 */
export function deriveAffixedForm(root: string, affix: string): DerivedAffixedForm {
  const entry = affixCatalogEntry(affix)
  if (!entry) {
    throw new UnsupportedAffixError(affix, 'not in the affix catalog (lib/capabilities/affixCatalog.ts)')
  }
  if (entry.affixType === 'confix' || entry.affixType === 'reduplication') {
    throw new UnsupportedAffixError(affix, `${entry.affixType} derivation is deferred to its book-2 chapter (Task 6)`)
  }
  if (entry.affixType === 'suffix') {
    throw new UnsupportedAffixError(
      affix,
      'suffix derivation is deferred — the leading-hyphen label cannot round-trip through the ' +
      'lesson stage deriveAffix (HC31), which needs a writer-contract change Spec 2 defers',
    )
  }

  const ruleGoverned =
    affix === 'meN-' || affix === 'peN-'
      ? deriveNasalising(root, affix)
      : deriveInvariantPrefix(root, affix)

  const base: DerivedAffixedForm = {
    ...ruleGoverned,
    affixType: entry.affixType,
    affixGloss: entry.gloss,
    productive: true,
  }

  const override = IRREGULAR[`${affix}:${root}`]
  return override ? { ...base, ...override } : base
}
