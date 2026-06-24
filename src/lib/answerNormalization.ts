// src/lib/answerNormalization.ts

import { splitAlternatives } from '@/lib/capabilities'

/**
 * Normalize a typed answer for comparison:
 * - Trim whitespace
 * - Case fold to lowercase
 * - Strip punctuation
 * - Remove parenthetical content
 */
export function normalizeAnswer(input: string): string {
  return input
    .replace(/\([^)]*\)/g, '')  // remove parentheticals
    .replace(/[^\w\s]/g, '')     // strip punctuation
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')       // collapse multiple spaces
}

/**
 * Standard Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/**
 * Restricted Damerau-Levenshtein distance (Optimal String Alignment distance)
 * between two strings. Handles transpositions as 1.
 */
function damerauLevenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2

  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))

  for (let i = 0; i <= a.length; i++) d[i][0] = i
  for (let j = 0; j <= b.length; j++) d[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost) // transposition
      }
    }
  }
  return d[a.length][b.length]
}

export interface AnswerCheckResult {
  isCorrect: boolean
  isFuzzy: boolean
}

/**
 * Check a user's answer against the canonical answer and known variants.
 * Applies normalization, exact matching, then fuzzy matching:
 * - Distance 1 for insertions, deletions, and transpositions.
 * - Substitutions are EXCLUDED (prevent minimal pair errors like membeli/memberi).
 *
 * Alternatives are split on BOTH sides using the shared `splitAlternatives`
 * (the single definition the CS19 gate + HC24 also consume): "/" is canonical,
 * ";" is split defensively for legacy values, and a COMMA is NEVER a separator
 * (it is part of one answer). N4 ordering: the split MUST run before
 * `normalizeAnswer`, which strips ";"/"/" along with other non-word chars —
 * splitting after would lose the boundaries.
 */
export function checkAnswer(
  userAnswer: string,
  canonicalAnswer: string,
  acceptedVariants: string[]
): AnswerCheckResult {
  const userNorms = Array.from(new Set(
    [userAnswer, ...splitAlternatives(userAnswer)]
      .map(normalizeAnswer)
      .filter(s => s.length > 0),
  ))

  const rawTargets = [canonicalAnswer, ...acceptedVariants]
  const targetSet = Array.from(new Set(
    [...rawTargets, ...rawTargets.flatMap(splitAlternatives)]
      .map(normalizeAnswer)
      .filter(s => s.length > 0),
  ))

  // Exact match
  if (userNorms.some(u => targetSet.includes(u))) {
    return { isCorrect: true, isFuzzy: false }
  }

  // Fuzzy match (Insertion/Deletion or Transposition)
  for (const u of userNorms) {
    for (const target of targetSet) {
      const dDist = damerauLevenshtein(u, target)
      const lDist = levenshtein(u, target)

      // Allowed if:
      // 1. Length differs by 1 and Levenshtein distance is 1 (Insertion/Deletion)
      // 2. Length is same, Damerau-Levenshtein is 1 AND Levenshtein is NOT 1 (Transposition)
      const isInsertionDeletion = Math.abs(u.length - target.length) === 1 && lDist === 1
      const isTransposition = u.length === target.length && dDist === 1 && lDist !== 1

      if (isInsertionDeletion || isTransposition) {
        return { isCorrect: true, isFuzzy: true }
      }
    }
  }

  return { isCorrect: false, isFuzzy: false }
}

/**
 * Detect a produce exercise the grader cannot actually grade ("ineffective").
 *
 * `checkAnswer`/`normalizeAnswer` lowercase, strip punctuation + parentheticals,
 * and split on "/"/";" as OR-alternatives — deliberate typo-forgiveness. The
 * side effect: a produce exercise whose ONLY difference from its prompt lives in
 * those erased characters is silently ungradeable, because the grader accepts the
 * unchanged prompt. Two shapes, both confirmed live (2026-06-24 audit):
 *   - `answer_equals_prompt` — an acceptable answer normalizes identically to the
 *     source, so copying the prompt passes. Covers capitalization-only fixes
 *     ("hari rabu"→"hari Rabu"), punctuation-only changes ("."→"?"), and a
 *     verbatim source accidentally listed as an accepted answer.
 *   - `slash_fragments_answer` — an acceptable answer contains "/", which the
 *     grader reads as "any of these alternatives", so a single fragment passes
 *     ("Saya / minum teh / di kamar." → "di kamar" is accepted).
 *
 * Uses the grader's OWN `normalizeAnswer`, so the guard sees exactly what the
 * grader sees — it cannot drift from the matching logic it protects.
 *
 * `source` is the same-language prompt the learner transforms (a transform's
 * `source_sentence`). Pass the cross-language prompt for constrained translation
 * too: the equals-prompt arm is then inert (a whole Dutch sentence never
 * normalizes to a whole Indonesian answer) and only the slash arm fires.
 *
 * Returns the first violation's reason code, or null when the exercise is
 * gradeable.
 */
export function findIneffectiveProduceReason(
  source: string,
  acceptableAnswers: readonly string[],
): 'answer_equals_prompt' | 'slash_fragments_answer' | null {
  for (const ans of acceptableAnswers) {
    if (ans.includes('/')) return 'slash_fragments_answer'
  }
  const normSource = normalizeAnswer(source)
  if (normSource.length > 0) {
    for (const ans of acceptableAnswers) {
      if (normalizeAnswer(ans) === normSource) return 'answer_equals_prompt'
    }
  }
  return null
}

/**
 * Normalize a raw exercise response for FSRS / review-event writes.
 *
 * Storage-side normalisation (lowercase + trim, with null guard) — distinct
 * from `normalizeAnswer` above, which is the aggressive comparison-side
 * normalisation. Storage stays faithful to user input modulo casing so that
 * punctuation and parentheticals are preserved on the review event row;
 * comparison strips those to maximise match recall.
 */
export function normalizeAnswerResponse(rawResponse: string | null | undefined): string | null {
  return rawResponse ? rawResponse.toLowerCase().trim() : null
}
