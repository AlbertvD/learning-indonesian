/**
 * registerExpansion.ts
 *
 * The apply-time colloquial-acceptance mechanism for the G4 grammar-produce
 * grader fix (docs/plans/2026-07-09-g4-produce-grader-fix.md §2.3): every
 * accepted answer of a grammar produce exercise (`sentence_transformation_
 * exercises` / `constrained_translation_exercises`) is expanded with
 * register substitutions from the shared `scripts/data/register-pairs.ts`
 * artifact (Spreektaal spec §3.1) — token-level formal->informal
 * substitution over the closed pair list, so a typed *nggak* is accepted
 * wherever the authored answer says *tidak*.
 *
 * Combinatorics (spec §2.3, staff-engineer r1): the FULL combination set
 * when an answer contains <=3 substitutable tokens (<=8 combos — covers
 * virtually all rows and closes the mixed-register hole a
 * substitute-all-or-nothing cap would leave, e.g. "tidak ... sudah ...
 * saja" needs the "nggak ... sudah ... saja" MIXED form accepted, not just
 * all-informal or all-formal); above 3 tokens, substitute-all +
 * substitute-each-singly (a bounded, still-useful subset — the residual
 * mixed-register rejections above 3 tokens are accepted flag->review
 * territory per spec, not silently dropped).
 *
 * Pure — no I/O. The caller supplies the register-pairs list (loaded once
 * from the committed artifact) and gets back a de-duplicated list of NEW
 * candidate strings (never includes the input answer itself).
 */

export interface RegisterPairLite {
  formal: string
  informal: string
}

function tokenizeKeepingCase(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}

function stripTrailingPunctuation(token: string): { core: string; trailing: string } {
  const m = token.match(/^(.*?)([.,!?;:]*)$/)
  return m ? { core: m[1], trailing: m[2] } : { core: token, trailing: '' }
}

/** Match the FIRST letter's case of `original` onto `replacement` — a
 *  sentence-initial formal token capitalizes its informal substitute the
 *  same way ("Tidak ada apa-apa." -> "Nggak ada apa-apa."). */
function matchLeadingCase(original: string, replacement: string): string {
  if (original.length === 0 || replacement.length === 0) return replacement
  const firstChar = original[0]
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/** Token indices in `answer` whose (case-folded, punctuation-stripped) form
 *  matches a pair's `formal` value exactly (whole-word match). */
export function findSubstitutablePositions(answer: string, pairs: ReadonlyArray<RegisterPairLite>): number[] {
  const tokens = tokenizeKeepingCase(answer)
  const positions: number[] = []
  tokens.forEach((tok, i) => {
    const core = stripTrailingPunctuation(tok).core.toLowerCase()
    if (pairs.some((p) => p.formal.toLowerCase() === core)) positions.push(i)
  })
  return positions
}

/** True if `answer` already contains an INFORMAL token from the pair list
 *  — i.e., it is itself a (fully or partially) register-substituted
 *  DERIVED string, not an original formal-register answer. Used to stop
 *  the apply pass from re-expanding its own prior output (see
 *  `computeFullTargetSet`'s doc comment for the idempotency bug this
 *  guards: a partially-substituted string can drop from >3 remaining
 *  formal tokens to <=3, which would unlock the FULL 2^n-1 combination
 *  branch a fresh re-run of expandRegister was never entitled to for the
 *  original >3-token answer — an infinite-looking (in practice: two-round)
 *  growth that broke the "re-runs are exact no-op" guarantee, caught via
 *  a live-DB re-run 2026-07-10). */
export function hasInformalToken(answer: string, pairs: ReadonlyArray<RegisterPairLite>): boolean {
  const tokens = tokenizeKeepingCase(answer)
  return tokens.some((tok) => {
    const core = stripTrailingPunctuation(tok).core.toLowerCase()
    return pairs.some((p) => p.informal.toLowerCase() === core)
  })
}

function substituteAt(tokens: readonly string[], positions: readonly number[], pairs: ReadonlyArray<RegisterPairLite>): string {
  const out = [...tokens]
  for (const i of positions) {
    const { core, trailing } = stripTrailingPunctuation(out[i])
    const pair = pairs.find((p) => p.formal.toLowerCase() === core.toLowerCase())
    if (pair) out[i] = matchLeadingCase(core, pair.informal) + trailing
  }
  return out.join(' ')
}

/**
 * The single "everything substituted" rendering of `answer` — every
 * substitutable token replaced with its informal counterpart in one pass.
 * Returns null when no token matches (nothing to substitute). This is
 * ALWAYS one of `expandRegister`'s returned combos (the all-bits-set mask
 * in the <=3-token branch; the explicit first entry in the >3-token
 * fallback) — exported separately because the health-check predicate
 * (check-supabase-deep.ts HC51) needs one well-defined target string per
 * answer to assert presence of, not the whole combination set.
 */
export function substituteAllFormal(answer: string, pairs: ReadonlyArray<RegisterPairLite>): string | null {
  const tokens = tokenizeKeepingCase(answer)
  if (tokens.length === 0) return null
  const positions = findSubstitutablePositions(answer, pairs)
  if (positions.length === 0) return null
  return substituteAt(tokens, positions, pairs)
}

/**
 * Expand one answer string into its register-substituted variants. Returns
 * [] when no token in `answer` matches a formal register-pair entry.
 */
export function expandRegister(answer: string, pairs: ReadonlyArray<RegisterPairLite>): string[] {
  const tokens = tokenizeKeepingCase(answer)
  if (tokens.length === 0) return []
  const positions = findSubstitutablePositions(answer, pairs)
  if (positions.length === 0) return []

  const results = new Set<string>()
  if (positions.length <= 3) {
    // Full combination set: every NON-EMPTY subset of substitutable
    // positions gets substituted (mixed-register forms included).
    const n = positions.length
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset = positions.filter((_, idx) => (mask & (1 << idx)) !== 0)
      results.add(substituteAt(tokens, subset, pairs))
    }
  } else {
    // Bounded fallback: substitute-all, then substitute-each-singly.
    results.add(substituteAt(tokens, positions, pairs))
    for (const p of positions) results.add(substituteAt(tokens, [p], pairs))
  }
  results.delete(answer)
  return [...results]
}
