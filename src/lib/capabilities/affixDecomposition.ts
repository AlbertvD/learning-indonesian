// The deterministic affix-DECOMPOSITION engine — the reverse of affixDerivation.ts.
//
// Given a surface word (e.g. `membaca`), recover its `{root, affix}` so the Lezen
// reader can show an *exploratory* morphological gloss (affix function + root meaning
// + word family). Reused by the build-time item_morphology population (slice 2) and
// unit-tested in isolation.
//
// Approach: STRIP-to-propose + DERIVE-to-verify. We never trust a strip: each
// candidate root proposed by reversing an affix's surface is VERIFIED by running the
// real forward engine (`deriveAffixedForm(candidate, affix).derived === surface`). So
// over-proposing is harmless — a wrong candidate simply fails verification. This is
// strictly better than the crude `lib/reading/affixStrip.ts` it replaces (which
// over-generated gloss-only candidates with no verification).
//
// An `isRoot` predicate is injected (a candidate must be a known root — a learning_item
// or catalog root — so the reader has a meaning to show). Pure, no I/O.
//
// Lives in lib/capabilities — sibling to affixDerivation.ts / affixCatalog.ts, the sole
// pipeline↔runtime shared seam (target-architecture.md) — because the build-time
// population script (scripts/) imports it.

import { AFFIX_CATALOG, type AffixCatalogEntry } from './affixCatalog'
import { deriveAffixedForm } from './affixDerivation'

export interface Decomposition {
  /** The surface word that was decomposed (lowercased). */
  surface: string
  /** The verified base form (a known root per the injected predicate). */
  root: string
  /** The catalog affix label, e.g. 'meN-', 'ber-', '-kan'. */
  affix: string
}

// Nasalising prefixes spell several surface forms; the elided initial consonant must
// be restored to propose the root. Maps a surface prefix spelling → the initials to try
// (incl. '' for the no-elision case). Mirrors nasalDecision() in affixDerivation.ts.
const NASAL_PROPOSALS: Record<string, string[]> = {
  // me-base (meN-)
  mem: ['', 'p'], men: ['', 't'], meny: ['s'], meng: ['', 'k'], menge: [''], me: [''],
  // pe-base (peN-)
  pem: ['', 'p'], pen: ['', 't'], peny: ['s'], peng: ['', 'k'], penge: [''], pe: [''],
}

/** Candidate roots proposed by reversing one affix off the surface (generous; verified later). */
function proposeRoots(surface: string, entry: AffixCatalogEntry): string[] {
  const comp = entry.composition
  if (!comp) return []
  const out = new Set<string>()

  // Nasalising prefix (meN-/peN-): strip a known spelling, restore the elided initial.
  if (comp.prefix && 'nasal' in comp.prefix) {
    for (const [spelling, initials] of Object.entries(NASAL_PROPOSALS)) {
      if (!surface.startsWith(spelling) || surface.length - spelling.length < 2) continue
      const rest = surface.slice(spelling.length)
      for (const initial of initials) out.add(initial + rest)
    }
    return [...out]
  }

  let body = surface
  let touched = false
  // Fixed prefix (ber-, di-, ter-, se-, per-, ke-…).
  if (comp.prefix && 'fixed' in comp.prefix && comp.prefix.fixed) {
    const p = comp.prefix.fixed
    if (!body.startsWith(p) || body.length - p.length < 2) return []
    body = body.slice(p.length)
    touched = true
  }
  // Fixed suffix (-kan, -an, -i).
  if (comp.suffix) {
    if (!body.endsWith(comp.suffix) || body.length - comp.suffix.length < 2) return []
    body = body.slice(0, body.length - comp.suffix.length)
    touched = true
  }
  if (touched) out.add(body)
  return [...out]
}

/**
 * All verified `{root, affix}` decompositions of a surface word. A decomposition is
 * returned only if (a) the candidate root passes `isRoot`, and (b) running the forward
 * engine on `(root, affix)` reproduces the surface exactly. Usually 0 or 1 result;
 * occasionally >1 (genuinely ambiguous), caller picks (e.g. by affix rank).
 */
export function decompose(surfaceRaw: string, isRoot: (candidate: string) => boolean): Decomposition[] {
  const surface = surfaceRaw.toLowerCase().trim()
  if (surface.length < 3) return []
  const results: Decomposition[] = []
  const seen = new Set<string>()

  for (const entry of AFFIX_CATALOG) {
    // Reduplication is non-concatenative; not proposed by this strip path (the curated
    // affixed_form_pairs projection covers reduplication forms — see population script).
    if (entry.affixType === 'reduplication') continue
    for (const root of proposeRoots(surface, entry)) {
      if (root === surface || !isRoot(root)) continue
      let derived: string
      try {
        derived = deriveAffixedForm(root, entry.affix).derived.toLowerCase()
      } catch {
        continue // UnsupportedAffixError (e.g. loanword cluster) → not this decomposition
      }
      if (derived !== surface) continue
      const key = `${root}|${entry.affix}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ surface, root, affix: entry.affix })
    }
  }
  return results
}
