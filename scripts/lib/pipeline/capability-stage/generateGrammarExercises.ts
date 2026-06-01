/**
 * capability-stage/generateGrammarExercises.ts — in-stage grammar-exercise
 * generator (Slice 2, Task 4).
 *
 * Ports the quality rules from `.claude/agents/grammar-exercise-creator.md`
 * into an in-stage LLM call, replacing the per-lesson agent invocation +
 * `candidates.ts` disk artifact. Mirrors `generateItemDistractors.ts` exactly:
 * a pure prompt builder, a pure parser, a thin injectable Claude call, an
 * `ANTHROPIC_API_KEY` no-op, and DEFENSIVE VALIDATION of LLM output.
 *
 * Contract:
 *   - Takes one `GrammarPatternInput` per pattern (category title + rules +
 *     examples + the Task-3 slug) and the cumulative vocab `pool` (current +
 *     prior lessons). NO disk I/O.
 *   - Sends ONE Claude call per pattern (each pattern needs focused attention to
 *     produce its full scaffolded set), with the agent's quality rules.
 *   - Returns candidate payloads `{exercise_type, grammar_pattern_slug, payload}`
 *     in the agent's camelCase payload shape, keyed by pattern slug.
 *   - No-ops (returns empty result) when no `generateFn` is injected AND
 *     `ANTHROPIC_API_KEY` is absent — the safe dry-run / test seam.
 *
 * Defensive validation (Lesson #2 + #4 from Slice 1): the live LLM violates
 * "never the answer / valid option id / required fields present". Every parsed
 * candidate is run through the SAME path the CS13 pre-write gate uses —
 * `buildGrammarExerciseRow` → the per-type `SCHEMA_BY_TYPE` Zod schema (which
 * shadows the typed tables' NOT-NULL / FK / jsonb-shape / option-id-match
 * constraints). A candidate that would violate a constraint is DROPPED, never
 * written (grammar exercises can't be mechanically repaired the way a distractor
 * array can be padded — drop-not-repair is the safe choice for an unreviewed
 * automated generator). A pattern that yields ZERO valid candidates is
 * warn-and-skipped (a rules-only reference category may produce nothing
 * drill-worthy — OQ2-5 CONTENT-QUALITY WATCH).
 *
 * Caller (Task 5/6) is responsible for:
 *   - Supplying the per-pattern inputs from the Task-3 projector + the cumulative
 *     vocab pool from the DB.
 *   - The pattern-level generation gate (skip already-seeded patterns) and
 *     writing the valid candidates to the 4 typed exercise tables.
 *
 * Disk-I/O contract: this file contains NO disk reads or writes. Enforced by
 * noDiskReads.test.ts (existsFails flipped to false for this file).
 */

import Anthropic from '@anthropic-ai/sdk'
import { buildGrammarExerciseRow } from './projectors/grammarExerciseRows'
import { extractAnswerKey } from './validators/candidatePayload'
import { SCHEMA_BY_TYPE } from './validators/grammarExercises'
import { ANTHROPIC_MAX_RETRIES, GENERATION_THROTTLE_MS, sleep } from '../generationThrottle'

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** The 4 grammar exercise types this generator emits (never `speaking`). */
export const GENERATED_EXERCISE_TYPES = [
  'contrast_pair',
  'sentence_transformation',
  'constrained_translation',
  'cloze_mcq',
] as const

export type GeneratedExerciseType = (typeof GENERATED_EXERCISE_TYPES)[number]

/** One worked example carried from `lesson_section_grammar_categories.examples`. */
export interface GrammarExampleInput {
  indonesian: string
  dutch: string | null
  english: string | null
}

/**
 * One grammar pattern to generate exercises for. Derived by the Task-3 pattern
 * projector from a typed grammar category (ONE CATEGORY = ONE PATTERN, OQ2-5).
 */
export interface GrammarPatternInput {
  /** `l{N}-{stableSlug(title)}` — the Task-3 slug; the candidate's pattern ref. */
  slug: string
  /** category.title — the human-readable pattern name. */
  title: string
  /** category.rules — the metalinguistic rules (may be the ONLY input). */
  rules: string[]
  /** category.examples — worked examples (may be empty for rules-only patterns). */
  examples: GrammarExampleInput[]
}

/** A cumulative-pool vocabulary item — the sentences-must-use-pool material. */
export interface GrammarVocabPoolItem {
  indonesian_text: string
  l1_translation: string
  item_type: 'word' | 'phrase'
}

/** One generated grammar exercise candidate (agent camelCase payload shape). */
export interface GrammarExerciseCandidate {
  exercise_type: GeneratedExerciseType
  grammar_pattern_slug: string
  payload: Record<string, unknown>
}

/** Public result: only patterns + candidates that passed defensive validation. */
export interface GrammarGenerationResult {
  /** Keyed by pattern slug → its valid candidates. */
  candidatesByPatternSlug: Map<string, GrammarExerciseCandidate[]>
  /** Total valid candidates across all patterns. */
  generatedCount: number
  /** Candidates parsed but dropped by defensive validation. */
  droppedCount: number
  /** Patterns that yielded zero valid candidates (warn-and-skipped). */
  skippedPatternSlugs: string[]
}

/**
 * The shape of the injected generate function. In production this wraps a real
 * Claude call; in tests it returns canned JSON. Receives the prompt and returns
 * the raw text response.
 */
export type GenerateFn = (prompt: string) => Promise<string>

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6'

/**
 * Build the Claude prompt for ONE grammar pattern, encoding the quality rules
 * from grammar-exercise-creator.md. The pattern's `rules` are the primary
 * source; `examples` are starting points to adapt with pool words. Sentences
 * must draw ONLY from `pool` (don't surprise the learner with unseen words).
 */
export function buildPrompt(
  pattern: GrammarPatternInput,
  pool: GrammarVocabPoolItem[],
): string {
  const poolSummary = pool.map((p) => ({
    item_type: p.item_type,
    indonesian_text: p.indonesian_text,
    dutch_translation: p.l1_translation,
  }))

  const examplesBlock =
    pattern.examples.length > 0
      ? JSON.stringify(
          pattern.examples.map((e) => ({ indonesian: e.indonesian, dutch: e.dutch })),
          null,
          2,
        )
      : '(none — work from the rules above)'

  return `You generate grammar exercise candidates for an Indonesian course (Dutch L1, A1-B1 level). Your one job: high-quality grammar exercises for ONE grammar pattern. Every rule below exists because a previous run violated it.

## Grammar pattern

- pattern slug: ${pattern.slug}
- pattern name: ${pattern.title}

### Rules (the metalinguistic content the exercises must drill)

${pattern.rules.map((r) => `- ${r}`).join('\n') || '(no explicit rules — infer the pattern from the name + examples)'}

### Worked examples (starting points — adapt with pool words)

${examplesBlock}

## Available vocabulary pool (current + prior lessons)

Every candidate sentence must use ONLY words from this pool. Never introduce a word the learner hasn't encountered — vocabulary is taught on its own pages, not inside grammar exercises. Beyond the pool-membership rule, pick words for whatever makes the grammar exercise work.

${JSON.stringify(poolSummary, null, 2)}

## What to generate

Generate a scaffolded set for this ONE pattern, recognition → production:
- 3 cloze_mcq (recognition)
- 3 contrast_pair (noticing)
- 4 sentence_transformation (bridged production)
- 5 constrained_translation (free production)

At least 8 total, ideally 15. If the pattern is a reference list (e.g. a duration or day-parts table) that yields nothing genuinely drill-worthy, return an empty array \`[]\` rather than mechanical filler.

## Payload contracts (camelCase — exactly these keys)

### contrast_pair
\`{ promptText (Dutch context, NEVER reveals the answer), targetMeaning (Dutch gloss 3-10 words), options: [{id,text},{id,text}] (exactly 2; set id === text === the Indonesian word), correctOptionId (=== the correct option's id), explanationText (Dutch — teach the WHY) }\`

### sentence_transformation
\`{ sourceSentence (Indonesian), transformationInstruction (Dutch — never gives away the target form), acceptableAnswers: string[] (non-empty; include punctuation variants), hintText (string|null — must not reveal the answer), explanationText (Dutch) }\`

### constrained_translation
\`{ sourceLanguageSentence (Dutch to translate), requiredTargetPattern (MUST equal the pattern slug "${pattern.slug}" exactly), acceptableAnswers: string[] (full Indonesian sentences, non-empty), disallowedShortcutForms: string[] (may be empty), explanationText (Dutch) }\`

### cloze_mcq
\`{ sentence (Indonesian with one ___), translation (Dutch, shown before answering), options: [string,string,string,string] (exactly 4), correctOptionId (=== one of the options), explanationText (Dutch) }\`

## Quality rules (most-violated)

1. NO pre-answer spoilers: promptText, sourceSentence, sourceLanguageSentence, sentence-with-blank, translation, hintText, transformationInstruction must NOT reveal the answer.
2. contrast_pair: the wrong option must be the mistake a Dutch speaker would actually make — not a random word. options ids MUST equal their text (never "a"/"b").
3. cloze_mcq: choose the blank deliberately; distractors are same-category words, never morphological variants of the answer; correctOptionId MUST be one of the 4 options.
4. explanationText must teach the rule + contrast (the primary teaching moment shown after a wrong answer), not just confirm the answer.
5. CEFR consistency — simple vocabulary + short sentences for A1.

## Output format

Return ONLY a JSON array. No prose, no markdown fences. One object per candidate:

[
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "${pattern.slug}",
    "payload": { /* fields per the contract above */ }
  }
]
`
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const GENERATED_TYPE_SET = new Set<string>(GENERATED_EXERCISE_TYPES)

/**
 * Parse Claude's raw JSON response into shape-checked candidate objects.
 * Malformed input → safe empty array (mirrors generateItemDistractors). Only
 * structural shape is checked here (recognized exercise_type + object payload +
 * string slug); per-type DDL-constraint validity is enforced separately by
 * `validateCandidate` so the two concerns stay testable in isolation.
 */
export function parseResponse(raw: string): GrammarExerciseCandidate[] {
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    const result: GrammarExerciseCandidate[] = []
    for (const c of parsed) {
      if (typeof c !== 'object' || c === null) continue
      const exerciseType = (c as Record<string, unknown>).exercise_type
      const slug = (c as Record<string, unknown>).grammar_pattern_slug
      const payload = (c as Record<string, unknown>).payload
      if (typeof exerciseType !== 'string' || !GENERATED_TYPE_SET.has(exerciseType)) continue
      if (typeof slug !== 'string' || slug.length === 0) continue
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) continue
      result.push({
        exercise_type: exerciseType as GeneratedExerciseType,
        grammar_pattern_slug: slug,
        payload: payload as Record<string, unknown>,
      })
    }
    return result
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Defensive validation (Lesson #2 + #4) — the constraint-validity binding
// ---------------------------------------------------------------------------

/**
 * Validate one candidate against the typed-table DDL constraints, via the EXACT
 * same path the CS13 pre-write gate uses: map the camelCase payload to typed
 * columns (`buildGrammarExerciseRow`) then run the per-type `SCHEMA_BY_TYPE`
 * Zod schema (which shadows NOT-NULL / FK / jsonb-shape / option-id-match). A
 * candidate that fails would crash Stage B's typed-table insert on the first
 * live publish — so it is dropped here. Returns true iff constraint-valid.
 */
export function validateCandidate(candidate: GrammarExerciseCandidate): boolean {
  const { exercise_type, payload } = candidate
  const schema = SCHEMA_BY_TYPE[exercise_type]
  if (!schema) return false
  const answerKey = extractAnswerKey(exercise_type, payload)
  const built = buildGrammarExerciseRow(exercise_type, payload, answerKey)
  if (!built) return false
  return schema.safeParse(built.columns).success
}

// ---------------------------------------------------------------------------
// Per-pattern caller (thin Claude call — production path)
// ---------------------------------------------------------------------------

/**
 * Generate + parse + defensively validate the candidates for ONE pattern.
 * Returns the valid candidates (slug forced to the pattern's own slug so an LLM
 * slug-hallucination can't mis-route a candidate) + the dropped count.
 */
async function generateForPattern(
  generateFn: GenerateFn,
  pattern: GrammarPatternInput,
  pool: GrammarVocabPoolItem[],
): Promise<{ valid: GrammarExerciseCandidate[]; dropped: number }> {
  const prompt = buildPrompt(pattern, pool)
  const raw = await generateFn(prompt)
  const parsed = parseResponse(raw)
  const valid: GrammarExerciseCandidate[] = []
  let dropped = 0
  for (const candidate of parsed) {
    // Force the slug to this pattern's slug — the candidate is generated FOR
    // this pattern; trust the call context over the LLM's echoed value.
    const normalized: GrammarExerciseCandidate = {
      ...candidate,
      grammar_pattern_slug: pattern.slug,
    }
    if (validateCandidate(normalized)) {
      valid.push(normalized)
    } else {
      dropped += 1
    }
  }
  return { valid, dropped }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate grammar exercises for every pattern in `patterns`.
 *
 * No-op conditions:
 *   - No `generateFn` injected AND `ANTHROPIC_API_KEY` not set → return empty
 *     result (safe dry-run / CI path — mirrors generateItemDistractors).
 *   - `patterns` is empty → return empty result without an API call.
 *
 * @param patterns  Per-pattern inputs from the Task-3 projector.
 * @param pool      Cumulative vocab pool (current + prior lessons).
 * @param options   Optional `generateFn` for test/dry-run injection.
 */
export async function generateGrammarExercises(
  patterns: GrammarPatternInput[],
  pool: GrammarVocabPoolItem[],
  options?: { generateFn?: GenerateFn },
): Promise<GrammarGenerationResult> {
  const empty: GrammarGenerationResult = {
    candidatesByPatternSlug: new Map(),
    generatedCount: 0,
    droppedCount: 0,
    skippedPatternSlugs: [],
  }

  if (patterns.length === 0) return empty

  // Resolve the generate function: injected fn takes priority over real Claude.
  let effectiveGenerateFn: GenerateFn

  if (options?.generateFn) {
    effectiveGenerateFn = options.generateFn
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn(
        `   ⚠ ANTHROPIC_API_KEY not set — skipping grammar-exercise generation (${patterns.length} patterns)`,
      )
      return empty
    }

    const claude = new Anthropic({ apiKey, maxRetries: ANTHROPIC_MAX_RETRIES })
    effectiveGenerateFn = async (prompt: string): Promise<string> => {
      // Anti-burst pacing — one call per pattern; real-API path only (tests
      // inject generateFn and never reach here, so they stay fast).
      await sleep(GENERATION_THROTTLE_MS)
      const response = await claude.messages.create({
        model: MODEL,
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      if (block?.type !== 'text') return '[]'
      return block.text
    }
  }

  console.log(
    `   ► Generating grammar exercises for ${patterns.length} patterns via Claude (${MODEL})...`,
  )

  const candidatesByPatternSlug = new Map<string, GrammarExerciseCandidate[]>()
  const skippedPatternSlugs: string[] = []
  let generatedCount = 0
  let droppedCount = 0

  for (const pattern of patterns) {
    const { valid, dropped } = await generateForPattern(effectiveGenerateFn, pattern, pool)
    droppedCount += dropped
    if (valid.length === 0) {
      skippedPatternSlugs.push(pattern.slug)
      console.warn(
        `     ⚠ pattern "${pattern.slug}" yielded 0 valid exercises (${dropped} dropped) — skipped`,
      )
      continue
    }
    candidatesByPatternSlug.set(pattern.slug, valid)
    generatedCount += valid.length
    console.log(`     ${pattern.slug}: ${valid.length} valid (${dropped} dropped)`)
  }

  console.log(
    `   ✓ Grammar-exercise generation: ${generatedCount} candidates across ${candidatesByPatternSlug.size} patterns (${droppedCount} dropped, ${skippedPatternSlugs.length} patterns skipped)`,
  )

  return {
    candidatesByPatternSlug,
    generatedCount,
    droppedCount,
    skippedPatternSlugs,
  }
}
