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

import Anthropic from '@anthropic-ai/sdk'
import { ANTHROPIC_MAX_RETRIES, GENERATION_THROTTLE_MS, sleep } from '../generationThrottle'

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

/** The valid structural skip reasons (the generator's own closed set). */
export type DialogueClozeSkipReason =
  | 'below_6_token_threshold'
  | 'above_max_token_threshold'
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
 * Maximum whitespace-token count for a dialogue line to be cloze-eligible.
 *
 * Cloze item-writing best practice: the gap belongs in ONE self-contained
 * sentence with enough local context to recover the answer, but not so much that
 * the learner is overwhelmed — lower-ability learners rely on the words
 * immediately around the gap (ICAL TEFL; Wikipedia "Cloze test"). A multi-sentence
 * dialogue *turn* (e.g. a 5-sentence directions paragraph) buries the target word
 * and reads as an unfocused translation, not a cloze. This restores the
 * cloze-creator's original rule — "do NOT blank full dialogue turns; they are
 * unnatural to blank" — which was dropped when only the ≥6-token floor was kept.
 *
 * 16 tokens comfortably fits a single sentence; the over-long lesson-10 carriers
 * that triggered this were 18–40 tokens, while the good ones were 6–8. Tunable.
 */
export const DIALOGUE_CLOZE_MAX_TOKENS = 16

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
 * The structural gates from the cloze-creator dialogue contract, in order:
 *   1. ≥6 whitespace tokens                       → else below_6_token_threshold
 *   1b. ≤16 whitespace tokens (single sentence)   → else above_max_token_threshold
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
  // Gate 1 — minimum token threshold (enough context to solve the gap).
  const tokens = line.text.split(/\s+/u).filter((t) => t.length > 0)
  if (tokens.length < DIALOGUE_CLOZE_MIN_TOKENS) {
    return { eligible: false, reason: 'below_6_token_threshold' }
  }

  // Gate 1b — single-sentence ceiling (cloze item-writing best practice). A
  // multi-sentence dialogue turn buries the target and overwhelms the learner;
  // skip it rather than blank one word in a whole paragraph. See
  // DIALOGUE_CLOZE_MAX_TOKENS.
  if (tokens.length > DIALOGUE_CLOZE_MAX_TOKENS) {
    return { eligible: false, reason: 'above_max_token_threshold' }
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

// ===========================================================================
// LLM-facing generator (Mode 2) — prompt builder, parser, sanitizer, orchestrator
// ===========================================================================

const MODEL = 'claude-sonnet-4-6'

/** The shape of the injected generate function (wraps Claude in production). */
export type GenerateFn = (prompt: string) => Promise<string>

/** One generated dialogue cloze, ready to become a `dialogue_clozes` row. */
export interface GeneratedDialogueCloze {
  dialogueLineId: string
  sourceLineRef: string
  sentenceWithBlank: string
  answerText: string
  /** Translations sourced from the DB line (R3) — NEVER the LLM. */
  translationText: string
  translationNl: string | null
  translationEn: string | null
}

/** A dialogue line intentionally skipped (structural ineligibility). */
export interface GeneratedClozeSkip {
  dialogueLineId: string
  sourceLineRef: string
  reason: DialogueClozeSkipReason
}

/** The orchestrator's result. */
export interface DialogueClozeResult {
  clozes: GeneratedDialogueCloze[]
  skips: GeneratedClozeSkip[]
  /**
   * Eligible lines whose LLM output failed defensive sanitization — DROPPED
   * (no cloze, no structural skip). The Task-8 coverage gate catches these as a
   * gap rather than the generator silently masking a generation failure as a
   * structural skip.
   */
  failedLineRefs: string[]
}

// ---------------------------------------------------------------------------
// buildDialogueClozePrompt (pure)
// ---------------------------------------------------------------------------

/**
 * Build the Claude prompt to blank ONE candidate word in a dialogue line.
 * Ports the cloze-creator dialogue blanking rules. The candidate list is the
 * eligibility-vetted set (pool words with ≥2 same-POS siblings) — the LLM may
 * only blank one of these, which the sanitizer re-checks defensively.
 */
export function buildDialogueClozePrompt(
  line: DialogueLineInput,
  candidates: ClozeCandidate[],
): string {
  const candidateList =
    candidates.map((c) => `- ${c.token} (${c.pos ?? 'unknown POS'})`).join('\n') ||
    '(none — should not happen; eligibility guarantees ≥1)'

  return `You create ONE fill-in-the-blank (cloze) exercise from a single Indonesian dialogue line, for a Dutch-L1 A1 course. Every rule below exists because a previous run violated it.

## The dialogue line (use VERBATIM — do NOT paraphrase, reorder, translate, or fix it)

"${line.text}"

## Choose the blank from these candidate words ONLY

${candidateList}

These are the vocab words in the line that have enough same-category distractors for the runtime MCQ. You MUST blank exactly one of them.

## Blanking rules

1. Replace exactly ONE candidate word with \`___\`. Every other character of the line stays identical (same words, order, casing, punctuation).
2. Prefer the content word that is the UNIQUE natural fit — a learner should not be able to fill the blank with a different candidate equally well. If two are equally good, prefer the more recently taught / more advanced word.
3. "answer" MUST be the exact token you replaced, as it appears in the line (preserve casing; you may drop a trailing period/comma so the bare word remains).
4. Never blank particles, pronouns, or proper nouns (the candidate list already excludes these — do not add your own).

## Output (JSON only — no prose, no markdown fences)

{ "answer": "<the exact word you blanked>", "sentence_with_blank": "<the line with that one word replaced by ___>" }
`
}

// ---------------------------------------------------------------------------
// parseDialogueClozeResponse (pure)
// ---------------------------------------------------------------------------

/**
 * Parse Claude's raw response into `{ answer, sentence_with_blank }`. Malformed
 * input, non-object, or missing/non-string fields → null (mirrors
 * generateGrammarExercises' safe-empty parse). Structural shape only; semantic
 * validity (one blank, faithful reconstruction, viable candidate) is the
 * sanitizer's job so the two concerns stay testable in isolation.
 */
export function parseDialogueClozeResponse(
  raw: string,
): { answer: string; sentence_with_blank: string } | null {
  const cleaned = raw.replace(/^```json\s*/u, '').replace(/\s*```\s*$/u, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const answer = (parsed as Record<string, unknown>).answer
    const swb = (parsed as Record<string, unknown>).sentence_with_blank
    if (typeof answer !== 'string' || answer.length === 0) return null
    if (typeof swb !== 'string' || swb.length === 0) return null
    return { answer, sentence_with_blank: swb }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// sanitizeGeneratedCloze (pure, defensive — Slice-1 Lesson #4)
// ---------------------------------------------------------------------------

/**
 * Defensively validate a parsed cloze against the dialogue line. Rejects (→ null)
 * unless ALL hold:
 *   - `sentence_with_blank` contains EXACTLY ONE `___`
 *   - the answer (normalized) is one of the eligibility-vetted candidates
 *   - filling the blank with the answer reconstructs `line.text` EXACTLY
 *     (defends against the LLM paraphrasing / editing the line)
 */
export function sanitizeGeneratedCloze(
  parsed: { answer: string; sentence_with_blank: string },
  line: DialogueLineInput,
  candidates: ClozeCandidate[],
): { sentenceWithBlank: string; answerText: string } | null {
  const sentenceWithBlank = parsed.sentence_with_blank
  const answerText = parsed.answer.trim()
  if (!answerText) return null

  const blanks = (sentenceWithBlank.match(/___/gu) ?? []).length
  if (blanks !== 1) return null

  const answerNorm = normalizeClozeToken(answerText)
  if (!candidates.some((c) => c.normalized === answerNorm)) return null

  // The blank, filled with the answer, must reproduce the original line exactly.
  if (sentenceWithBlank.replace('___', answerText) !== line.text) return null

  return { sentenceWithBlank, answerText }
}

// ---------------------------------------------------------------------------
// generateDialogueClozes — orchestrator (no-op seam + per-line gate)
// ---------------------------------------------------------------------------

/**
 * Generate dialogue clozes for every line. Per line: assess eligibility; an
 * ineligible line becomes a structural skip (NO LLM call); an eligible line is
 * sent to the LLM, parsed, and defensively sanitized. A sanitization failure
 * DROPS the line (recorded in `failedLineRefs` for the gate, not masked as a skip).
 *
 * Per-line seeded gate (R2 — the SOLE idempotency mechanism): a line whose id is
 * in `seededLineIds` already has a reviewed `dialogue_clozes` row, so the stage
 * runs NEITHER the generator NOR the writer for it (skipped silently — not a
 * structural skip; the DB-state coverage gate sees it covered). `regenerate`
 * bypasses the gate to force regeneration of even seeded lines.
 *
 * No-op conditions (return empty): no `lines`, or no `generateFn` injected AND
 * `ANTHROPIC_API_KEY` absent (safe dry-run / CI seam — mirrors the grammar gen).
 */
export async function generateDialogueClozes(
  lines: DialogueLineInput[],
  pool: ClozePoolItem[],
  options?: { generateFn?: GenerateFn; seededLineIds?: Set<string>; regenerate?: boolean },
): Promise<DialogueClozeResult> {
  const result: DialogueClozeResult = { clozes: [], skips: [], failedLineRefs: [] }
  if (lines.length === 0) return result

  // Per-line seeded gate (R2): drop already-seeded lines unless --regenerate.
  // This is what preserves L6/L9's reviewed clozes — they are never touched.
  const seededLineIds = options?.seededLineIds ?? new Set<string>()
  const linesToProcess = options?.regenerate
    ? lines
    : lines.filter((line) => !seededLineIds.has(line.id))
  if (linesToProcess.length === 0) return result

  let effectiveGenerateFn: GenerateFn
  if (options?.generateFn) {
    effectiveGenerateFn = options.generateFn
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn(
        `   ⚠ ANTHROPIC_API_KEY not set — skipping dialogue-cloze generation (${lines.length} lines)`,
      )
      return result
    }
    const claude = new Anthropic({ apiKey, maxRetries: ANTHROPIC_MAX_RETRIES })
    effectiveGenerateFn = async (prompt: string): Promise<string> => {
      await sleep(GENERATION_THROTTLE_MS)
      const response = await claude.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      if (block?.type !== 'text') return '{}'
      return block.text
    }
  }

  for (const line of linesToProcess) {
    const eligibility = assessDialogueLineEligibility(line, pool)
    if (!eligibility.eligible) {
      result.skips.push({
        dialogueLineId: line.id,
        sourceLineRef: line.sourceLineRef,
        reason: eligibility.reason!,
      })
      continue
    }

    const candidates = eligibility.candidates ?? []
    const raw = await effectiveGenerateFn(buildDialogueClozePrompt(line, candidates))
    const parsed = parseDialogueClozeResponse(raw)
    const sanitized = parsed ? sanitizeGeneratedCloze(parsed, line, candidates) : null
    if (!sanitized) {
      result.failedLineRefs.push(line.sourceLineRef)
      continue
    }

    result.clozes.push({
      dialogueLineId: line.id,
      sourceLineRef: line.sourceLineRef,
      sentenceWithBlank: sanitized.sentenceWithBlank,
      answerText: sanitized.answerText,
      translationText: line.translation,
      translationNl: line.translationNl,
      translationEn: line.translationEn,
    })
  }

  return result
}
