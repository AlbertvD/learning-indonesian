/**
 * produceAnswerCandidates.ts
 *
 * The GENERATE-step rule engine for the G4 grammar-produce-grader fix
 * (docs/plans/2026-07-09-g4-produce-grader-fix.md §2.2). Given a canonical
 * answer string (acceptable_answers[0] of a `multi_answer_free`-classified
 * exercise, per `produceAnswerFreedom.ts`), returns conservative candidate
 * variants — "attested word-order permutations, optional-particle presence,
 * clitic alternates" per spec §2.2 — never a new/invented translation.
 *
 * WHERE THE RULES COME FROM (this is the "one-time LLM" authoring pass,
 * done as data mining + linguistic vetting rather than 1,210 individual
 * per-row judgments — see the PR body for the full rationale): every rule
 * below is directly ATTESTED by pairs of sibling answers a human author
 * already put on the SAME exercise row somewhere in the live corpus (mined
 * via a pairwise token-diff over every exercise with >=2 acceptable_answers,
 * both tables, 2026-07-10). A rule is only included here if (a) it clears a
 * minimum attestation count (observed independently across many DIFFERENT
 * exercises, not a one-off), AND (b) manual review confirms it is
 * meaning-preserving in general, not just for the rows it was mined from.
 * Pairs that are semantically loaded and were EXCLUDED after review even
 * though they were frequent in the mined data:
 *   - ini <-> itu (near/far deixis — NOT synonyms; swapping can flip meaning)
 *   - kami <-> kita ("we" exclusive vs inclusive — grammatically distinct)
 *   - bapak <-> ibu, mahasiswa <-> mahasiswi (gender-specific nouns)
 *   - saya <-> aku (this is standard/informal PRONOUN register, which
 *     `scripts/data/register-pairs.ts` deliberately scopes OUT — "pronoun
 *     register is a grammatical system of its own"; not re-litigated here)
 *   - bukan <-> kan (tag-question particle vs. informal short-for-'akan';
 *     same surface token 'kan' can mean two different things — too risky
 *     to substitute blindly)
 *   - tetapi <-> tapi (ALREADY a `register-pairs.ts` formal/informal pair —
 *     the apply step's register expansion covers it; duplicating the rule
 *     here would be redundant, not wrong, but adds nothing)
 *   - oleh insertion/deletion (passive agent marker — SAFE to delete in
 *     general, but "where does an agent NP go without oleh" is genuinely
 *     position-dependent; left out to stay strictly conservative)
 *
 * Every transformation is applied ONCE, independently, to the canonical
 * answer — no combinatorial stacking (the register expansion at apply time
 * already owns combinatorial substitution; stacking two GENERATE rules
 * together risks producing an answer nobody has reviewed the shape of).
 */

/** Whole-token, bidirectional, meaning-preserving synonym pairs — standard
 *  (non-colloquial) Indonesian, so distinct from register-pairs.ts's
 *  formal/informal scope. Attested via mined sibling-answer pairs. */
export const SYNONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['dia', 'ia'],           // 3rd person singular — speech/writing register, both standard
  ['mau', 'ingin'],        // "want" — both standard, no register gap
  ['sudah', 'telah'],      // "already" (aspect) — telah slightly more written, both standard
  ['sesudah', 'setelah'],  // "after"
  ['karena', 'sebab'],     // "because"
]

/** One-directional substitution: attested ONLY as canonical->alt in the
 *  mined data (the reverse is not safe — "dari" alone doesn't imply the
 *  comparative sense "daripada" carries, so re-writing generic "dari" to
 *  "daripada" would be wrong; the reverse, dropping the comparative marker
 *  down to plain "dari", is the attested-safe direction). */
export const ONE_WAY_SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ['daripada', 'dari'],
]

/** Closed list of short, high-frequency predicate adjectives — scopes the
 *  itu-insertion rule (below) to the exact template it was mined from:
 *  "[subject NP, possibly with a yang-clause] [1-word adjective predicate]."
 *  Restricting to this list (rather than "insert itu before the last
 *  token" unconditionally) avoids misplacing itu inside a multi-word verb
 *  phrase predicate on a differently-shaped sentence. */
const SHORT_PREDICATE_ADJECTIVES = new Set([
  'enak', 'murah', 'mahal', 'bagus', 'baik', 'buruk', 'jelek', 'banyak', 'sedikit',
  'besar', 'kecil', 'tinggi', 'rendah', 'cepat', 'lambat', 'panas', 'dingin',
  'ramai', 'sepi', 'bersih', 'kotor', 'baru', 'lama', 'mudah', 'sulit', 'susah',
  'berat', 'ringan', 'penuh', 'kosong', 'cantik', 'jauh', 'dekat',
  'benar', 'betul', 'salah', 'tepat', 'terlarang', 'terkenal',
])

/** Negators that can never be the token right after Ini/Itu when
 *  adalah-insertion fires — "adalah" is a POSITIVE copula; "Ini adalah
 *  bukan rumah." (adalah + bukan together) is redundant/ungrammatical. */
const LEADING_NEGATORS = new Set(['bukan', 'tidak', 'tak'])

/** Tokens that form a TIGHT constituent with a following adjective —
 *  negators, coordinators, and comparative/superlative/intensifier markers.
 *  If one of these directly precedes the final predicate adjective, itu
 *  cannot be inserted there without splitting that constituent (2026-07-10
 *  review caught 4 more real counter-examples: "Yang mahal tidak baik." ->
 *  "...tidak itu baik." breaks the negator+adjective; "... yang besar dan
 *  bersih" -> "...dan itu bersih" breaks the coordination; "... yang lebih
 *  mahal"/"... yang paling bagus" -> "...lebih itu mahal"/"...paling itu
 *  bagus" break the comparative/superlative marker). */
const PRE_ADJECTIVE_BLOCKLIST = new Set([
  'tidak', 'bukan', 'tak', 'belum',                    // negators
  'dan', 'atau', 'tetapi', 'tapi', 'serta',             // coordinators
  'lebih', 'paling', 'kurang', 'ter',                   // comparative/superlative
  'sangat', 'sekali', 'amat', 'terlalu', 'cukup', 'agak', // intensifiers
])

/** Max token count for the (positionally riskier) itu-insertion rule — the
 *  mined "subject [yang-clause] PREDICATE." template is always short; a
 *  longer sentence increases the chance the last token isn't the true
 *  predicate boundary even when it happens to be in the adjective list. */
const ITU_INSERTION_MAX_TOKENS = 6

function tokenizeKeepingCase(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}

function stripTrailingPunctuation(token: string): { core: string; trailing: string } {
  const m = token.match(/^(.*?)([.,!?;:]*)$/)
  return m ? { core: m[1], trailing: m[2] } : { core: token, trailing: '' }
}

/** Rebuild a token array back into a sentence, single-spaced. */
function join(tokens: string[]): string {
  return tokens.join(' ')
}

/** True if `token` (case-insensitively, ignoring trailing punctuation)
 *  equals `word`. */
function tokenIs(token: string, word: string): boolean {
  return stripTrailingPunctuation(token).core.toLowerCase() === word
}

/** Tokens after which "itu" is NOT a droppable post-nominal definiteness
 *  marker, but an irreplaceable part of a fixed idiom/connector ("sesudah
 *  itu"/"setelah itu"/"karena itu" = "after that"/"therefore" -- dropping
 *  itu there either breaks the idiom or flips a causal-connector's
 *  meaning) or the subject slot of a question particle ("apakah itu?" =
 *  "what is that?" -- "apakah?" alone is a sentence fragment). Found via
 *  2026-07-10 review of the first live-DB generate run. */
const PRE_ITU_IMMOVABLE_HOSTS = new Set(['sesudah', 'setelah', 'karena', 'sebelum', 'kemudian', 'apakah'])

/**
 * Generate conservative candidate variants of a canonical answer. Pure —
 * no I/O, no randomness. Returns a de-duplicated list (candidates may
 * overlap between rules); does NOT filter against the exercise's existing
 * acceptable_answers — the caller does that (this function knows nothing
 * about what's already accepted).
 */
export function generateCandidates(canonicalAnswer: string): string[] {
  const tokens = tokenizeKeepingCase(canonicalAnswer)
  if (tokens.length === 0) return []
  const candidates = new Set<string>()

  // -- Rule: itu-deletion. Safe when itu is a POST-NOMINAL definiteness
  //    marker ("Buku itu bagus." -> "Buku bagus."); NOT safe when itu IS
  //    the sentence's subject pronoun (2026-07-10 review: "Itu benar." ->
  //    "benar." drops the subject entirely -- sentence-initial itu is
  //    never a droppable modifier) or sits in a fixed
  //    idiom/question-particle slot (PRE_ITU_IMMOVABLE_HOSTS above). ---------
  tokens.forEach((tok, i) => {
    const precedingCore = i > 0 ? stripTrailingPunctuation(tokens[i - 1]).core.toLowerCase() : ''
    const isSentenceInitialSubject = i === 0
    const isImmovableHostSlot = PRE_ITU_IMMOVABLE_HOSTS.has(precedingCore)
    if (tokenIs(tok, 'itu') && !isSentenceInitialSubject && !isImmovableHostSlot) {
      const without = [...tokens]
      // Carry trailing punctuation forward onto the previous token so
      // "... murah itu." -> "... murah." not "... murah ."
      const { trailing } = stripTrailingPunctuation(tok)
      without.splice(i, 1)
      if (trailing && without.length > 0) {
        const prevIdx = i - 1 >= 0 ? i - 1 : without.length - 1
        const prevStripped = stripTrailingPunctuation(without[prevIdx])
        without[prevIdx] = prevStripped.core + trailing
      }
      const rebuilt = join(without)
      if (rebuilt.trim().length > 0) candidates.add(rebuilt)
    }
  })

  // -- Rule: itu-insertion, scoped to "[NP yang CLAUSE] [short adjective
  //    predicate]." (mined position: immediately before the final predicate
  //    adjective, e.g. "Nanas yang murah enak." -> "...murah itu enak.").
  //    Three preconditions, all required (2026-07-10 review caught the first
  //    real counter-example without them: "Ini kursi besar yang baru." has
  //    its closed-list adjective as the LAST token too, but "yang" directly
  //    precedes it there -- inserting itu mid-relative-clause produced
  //    "...yang itu baru.", not real Indonesian):
  //      1. a 'yang' token is present (every verified-safe mined example has
  //         one -- this is a yang-clause-subject template, not a general
  //         "any short sentence" rule),
  //      2. 'yang' does NOT directly precede the final predicate token (if it
  //         did, the final adjective is INSIDE the yang-clause, not a
  //         separate predicate -- there is no safe insertion point there),
  //      3. the sentence does not open with a bare Ini/Itu topic pronoun
  //         (that shape's predicate is the WHOLE remainder including any
  //         yang-clause -- same "no separate predicate boundary" problem). --
  if (tokens.length <= ITU_INSERTION_MAX_TOKENS) {
    const lastIdx = tokens.length - 1
    const { core: lastCore } = stripTrailingPunctuation(tokens[lastIdx])
    const alreadyHasItu = tokens.some((t) => tokenIs(t, 'itu'))
    const yangIdx = tokens.findIndex((t) => tokenIs(t, 'yang'))
    const yangDirectlyPrecedesLast = yangIdx === lastIdx - 1
    const opensWithIniItu = tokenIs(tokens[0], 'ini') || tokenIs(tokens[0], 'itu')
    const tokenBeforeLast = lastIdx > 0 ? stripTrailingPunctuation(tokens[lastIdx - 1]).core.toLowerCase() : ''
    const precededByBlockedModifier = PRE_ADJECTIVE_BLOCKLIST.has(tokenBeforeLast)
    if (
      !alreadyHasItu &&
      SHORT_PREDICATE_ADJECTIVES.has(lastCore.toLowerCase()) &&
      lastIdx > 0 &&
      yangIdx !== -1 &&
      !yangDirectlyPrecedesLast &&
      !opensWithIniItu &&
      !precededByBlockedModifier
    ) {
      const withItu = [...tokens.slice(0, lastIdx), 'itu', tokens[lastIdx]]
      candidates.add(join(withItu))
    }
  }

  // -- Rule: adalah-insertion after a leading Ini/Itu topic pronoun. Only
  //    fires when the predicate is a NOUN PHRASE ("Itu pasar." -> "Itu
  //    adalah pasar.") -- "adalah" is Indonesian's copula for noun-phrase
  //    predicates. It does NOT belong before an adjective predicate or a
  //    negator (2026-07-10 review caught real counter-examples: "Itu
  //    benar." -> "Itu adalah benar." and "Ini bukan rumah, tetapi
  //    kantor." -> "Ini adalah bukan rumah..." are both not natural
  //    Indonesian), so both are blocked by checking the token immediately
  //    after Ini/Itu. -------------------------------------------------------
  if (tokens.length >= 2 && (tokenIs(tokens[0], 'ini') || tokenIs(tokens[0], 'itu'))) {
    const hasAdalah = tokens.some((t) => tokenIs(t, 'adalah'))
    const { core: nextCore } = stripTrailingPunctuation(tokens[1])
    const nextIsNegatorOrAdjective =
      LEADING_NEGATORS.has(nextCore.toLowerCase()) || SHORT_PREDICATE_ADJECTIVES.has(nextCore.toLowerCase())
    if (!hasAdalah && !nextIsNegatorOrAdjective) {
      const withAdalah = [tokens[0], 'adalah', ...tokens.slice(1)]
      candidates.add(join(withAdalah))
    }
  }

  // -- Rule: adalah-deletion (copula is optional in equational sentences). --
  tokens.forEach((tok, i) => {
    if (tokenIs(tok, 'adalah')) {
      const without = [...tokens]
      without.splice(i, 1)
      const rebuilt = join(without)
      if (rebuilt.trim().length > 0) candidates.add(rebuilt)
    }
  })

  // -- Rule: bidirectional whole-token synonym substitution. ----------------
  for (const [a, b] of SYNONYM_PAIRS) {
    tokens.forEach((tok, i) => {
      const { core, trailing } = stripTrailingPunctuation(tok)
      const lower = core.toLowerCase()
      if (lower === a || lower === b) {
        const replacement = lower === a ? b : a
        const swapped = [...tokens]
        swapped[i] = replacement + trailing
        candidates.add(join(swapped))
      }
    })
  }

  // -- Rule: one-way whole-token substitution. -------------------------------
  for (const [from, to] of ONE_WAY_SUBSTITUTIONS) {
    tokens.forEach((tok, i) => {
      const { core, trailing } = stripTrailingPunctuation(tok)
      if (core.toLowerCase() === from) {
        const swapped = [...tokens]
        swapped[i] = to + trailing
        candidates.add(join(swapped))
      }
    })
  }

  candidates.delete(canonicalAnswer)
  return [...candidates]
}
