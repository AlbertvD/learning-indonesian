/**
 * capability-stage/generateClozeContexts.ts — in-stage Mode-2 (dialogue line)
 * cloze generator. Ports the cloze-creator agent's dialogue contract
 * (.claude/agents/cloze-creator.md) into the Capability Stage, disk-free.
 *
 * Mirrors generateGrammarExercises.ts / generateItemDistractors.ts:
 *   - pure eligibility assessment (this file's deterministic core)
 *   - pure prompt builder + pure parser + defensive sanitization (added next)
 *   - thin Claude call behind an injectable `generateFn`, with an
 *     `ANTHROPIC_API_KEY` no-op seam for tests / dry-run
 *
 * Slice 3 is Mode-2 ONLY (dialogue lines). Mode-1 (item carrier sentences →
 * item_contexts(cloze)) is DEFERRED to the item-cloze slice (OQ3-3).
 *
 * NO disk I/O — enforced by noDiskReads.test.ts.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * One entry in the cumulative vocab pool (current + prior lessons), the
 * cross-reference set for the eligibility gates. Sourced from learning_items
 * (normalized_text / base_text / pos) by the loader at wiring time (Task 7).
 */
export interface ClozePoolItem {
  normalized_text: string
  base_text: string
  pos: string | null
}

/** A dialogue line to consider for cloze generation (from lesson_dialogue_lines). */
export interface DialogueLineInput {
  id: string
  sourceLineRef: string
  /** The Indonesian line exactly as it appears in the lesson. */
  text: string
  /** The NOT NULL translation leg (reader contract). */
  translation: string
  translationNl: string | null
  translationEn: string | null
  speaker: string | null
}

/** The valid skip reasons (must match lint-staging's VALID_SKIP_REASONS). */
export type DialogueClozeSkipReason =
  | 'below_6_token_threshold'
  | 'no_current_or_prior_vocab_in_line'
  | 'no_same_pos_distractors_in_pool'

/** A vocab word found in a dialogue line that is a candidate blank. */
export interface ClozeCandidate {
  /** The token as it appears in line.text (original casing/punctuation). */
  token: string
  /** normalizeClozeToken(token) — the pool match key. */
  normalized: string
  pos: string | null
}

/** The result of the deterministic eligibility assessment for one line. */
export interface EligibilityResult {
  eligible: boolean
  /** Set when not eligible — the skip reason code. */
  reason?: DialogueClozeSkipReason
  /** Set when eligible — the viable candidate blanks (≥2 same-POS siblings). */
  candidates?: ClozeCandidate[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum whitespace-token count for a dialogue line to be cloze-eligible. */
export const DIALOGUE_CLOZE_MIN_TOKENS = 6

/**
 * The same-POS rule needs ≥2 OTHER pool items sharing the candidate's POS, i.e.
 * ≥3 total pool items with that POS (the candidate is itself one of them).
 */
const MIN_SAME_POS_TOTAL = 3

// ---------------------------------------------------------------------------
// normalizeClozeToken
// ---------------------------------------------------------------------------

/**
 * Normalize a token to the publish-time `normalized_text` form so a dialogue
 * word matches the vocab pool: lowercase, trim, strip trailing sentence
 * punctuation. Internal hyphens and diacritics are preserved (mirrors the
 * cloze-creator spec + publish-approved-content.ts normalization).
 */
export function normalizeClozeToken(token: string): string {
  return token.toLowerCase().trim().replace(/[.,!?;:]+$/u, '')
}

// ---------------------------------------------------------------------------
// assessDialogueLineEligibility
// ---------------------------------------------------------------------------

/**
 * The three structural gates from the cloze-creator dialogue contract, in order:
 *   1. ≥6 whitespace tokens                       → else below_6_token_threshold
 *   2. ≥1 token matches a pool word (normalized)  → else no_current_or_prior_vocab_in_line
 *   3. ≥1 such word's POS has ≥2 OTHER pool items  → else no_same_pos_distractors_in_pool
 *
 * Pure — no I/O. The pool is injected (loaded from learning_items at wiring).
 * Returns the viable candidate blanks so the prompt builder can constrain the
 * LLM to a valid, distractor-supported blank.
 */
export function assessDialogueLineEligibility(
  line: DialogueLineInput,
  pool: ClozePoolItem[],
): EligibilityResult {
  // Gate 1 — token threshold.
  const tokens = line.text.split(/\s+/u).filter((t) => t.length > 0)
  if (tokens.length < DIALOGUE_CLOZE_MIN_TOKENS) {
    return { eligible: false, reason: 'below_6_token_threshold' }
  }

  // Build pool lookups: normalized_text → pos, and pos → count of pool items.
  const posByNormalized = new Map<string, string | null>()
  const countByPos = new Map<string, number>()
  for (const item of pool) {
    posByNormalized.set(item.normalized_text, item.pos)
    if (item.pos != null) {
      countByPos.set(item.pos, (countByPos.get(item.pos) ?? 0) + 1)
    }
  }

  // Gate 2 — at least one token is a pool vocab word (deduped by normalized).
  const candidatesByNormalized = new Map<string, ClozeCandidate>()
  for (const token of tokens) {
    const normalized = normalizeClozeToken(token)
    if (!posByNormalized.has(normalized)) continue
    if (candidatesByNormalized.has(normalized)) continue
    candidatesByNormalized.set(normalized, {
      token,
      normalized,
      pos: posByNormalized.get(normalized) ?? null,
    })
  }
  if (candidatesByNormalized.size === 0) {
    return { eligible: false, reason: 'no_current_or_prior_vocab_in_line' }
  }

  // Gate 3 — at least one candidate's POS has ≥2 OTHER pool items (≥3 total).
  const viable = [...candidatesByNormalized.values()].filter(
    (c) => c.pos != null && (countByPos.get(c.pos) ?? 0) >= MIN_SAME_POS_TOTAL,
  )
  if (viable.length === 0) {
    return { eligible: false, reason: 'no_same_pos_distractors_in_pool' }
  }

  return { eligible: true, candidates: viable }
}
