/**
 * capability-stage/generateItemDistractors.ts — in-stage curated distractor
 * generator for vocabulary exercises.
 *
 * Ports the quality rules from `.claude/agents/vocab-exercise-creator.md`
 * into an in-stage LLM call, replacing the per-lesson agent invocation.
 *
 * Contract:
 *   - Takes `items` (current lesson's typed item rows) + `pool` (cumulative
 *     prior-lesson items, same shape) as typed inputs. NO disk I/O.
 *   - Sends batches to Claude with the same quality rules the agent used.
 *   - Returns a per-item result keyed by `source_item_ref`, with exactly-3
 *     distractors for each of the three exercise types.
 *   - No-ops (returns empty result) when no `generateFn` is injected AND
 *     `ANTHROPIC_API_KEY` is absent — the safe dry-run / test seam.
 *
 * Caller (Task 6) is responsible for:
 *   - Supplying the pool from the DB (prior-lesson learning_items).
 *   - Mapping `source_item_ref` → `capability_id` and writing to the three
 *     distractor tables (recognition_mcq_distractors, cued_recall_distractors,
 *     cloze_mcq_item_distractors).
 *
 * Disk-I/O contract: this file contains NO disk reads or writes. It is
 * enforced by the noDiskReads.test.ts gate (existsFails flipped to false).
 *
 * Deferred validation: Distractor-equals-answer, intra-array duplicates, and
 * pool-membership are NOT validated in this generator — they are deferred to
 * the Task-7 Capability Gate (`validators/itemDistractors.ts`).
 *
 * Morphology rule hardened intentionally: The ported prompt hardens the source
 * agent's `cued_recall` morphology rule: the agent allowed "at most one
 * morphological distractor if it represents a real Dutch-speaker error"; this
 * port forbids morphological variants outright (stricter = safer for an
 * unreviewed automated generator).
 *
 * Forward-dependency for Task 6 (pool sourcing): The `pool` parameter requires
 * prior-lesson items with `item_type` + `indonesian_text` + `l1_translation`.
 * `loadFromDb` does NOT currently expose a full-field prior-lesson pool — its
 * `existingItemsByNormalizedText` map carries only `{id, normalized_text}`, and
 * `fetchItemRowsFromDb` is scoped to the current lesson. Task 6 must extend
 * `loadFromDb`/`fetchItemCapabilityState` (or add a dedicated cross-lesson
 * full-field pool fetch) to supply this.
 */

import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/**
 * A vocabulary item from the current lesson or the cumulative pool.
 * Matches the fields available from TypedItemRow in loadFromDb.ts.
 */
export interface DistractorInputItem {
  /** Slug / key from the staging file — unique within the lesson. */
  source_item_ref: string
  /** 'word' or 'phrase' — used for same-word-class rule. */
  item_type: 'word' | 'phrase'
  /** The Indonesian word/phrase being learned. */
  indonesian_text: string
  /** Dutch translation (L1) — shown in recognition_mcq. */
  l1_translation: string
}

/**
 * Curated distractors for one vocabulary item.
 * All three arrays have exactly 3 elements (enforced by parseResponse).
 */
export interface ItemDistractorSet {
  source_item_ref: string
  /** Wrong Dutch meanings for recognition_mcq (learner sees Indonesian, picks Dutch). */
  recognition_distractors_nl: [string, string, string]
  /** Wrong Indonesian words for cued_recall (learner sees Dutch, picks Indonesian). */
  cued_recall_distractors_id: [string, string, string]
  /** Wrong Indonesian filler words for cloze_mcq (learner fills blank in sentence). */
  cloze_distractors_id: [string, string, string]
}

/** Public result: only items that Claude returned valid distractor sets for. */
export interface DistractorGenerationResult {
  /** Keyed by source_item_ref. */
  distractorsBySourceItemRef: Map<string, ItemDistractorSet>
  generatedCount: number
  skippedCount: number
}

// ---------------------------------------------------------------------------
// Injectable generator function type (the test/injection seam)
// ---------------------------------------------------------------------------

/**
 * The shape of the injected generate function. In production this wraps a
 * real Claude call; in tests it returns canned JSON.
 *
 * Receives the prompt string and returns the raw text response.
 */
export type GenerateFn = (prompt: string) => Promise<string>

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const BATCH_SIZE = 20
const MODEL = 'claude-sonnet-4-6'

/**
 * Build the Claude prompt encoding all quality rules from vocab-exercise-creator.md.
 *
 * @param items  Current-lesson items to generate distractors for.
 * @param pool   Cumulative prior-lesson items — the distractor pool.
 */
export function buildPrompt(
  items: DistractorInputItem[],
  pool: DistractorInputItem[],
): string {
  const poolSummary = pool.map((p) => ({
    source_item_ref: p.source_item_ref,
    item_type: p.item_type,
    indonesian_text: p.indonesian_text,
    dutch_translation: p.l1_translation,
  }))

  const itemsForClaude = items.map((i) => ({
    source_item_ref: i.source_item_ref,
    item_type: i.item_type,
    indonesian_text: i.indonesian_text,
    dutch_translation: i.l1_translation,
  }))

  return `You are generating curated distractor sets for Indonesian vocabulary exercises at A1-B1 level. Your output will directly replace random runtime distractors, so quality matters: wrong options must be plausible enough that the learner must know the word to answer correctly.

## Available distractor pool (prior-lesson + current-lesson vocabulary)

These are the words available to use as distractors. ONLY use words from this pool — never invent words the learner hasn't encountered.

${JSON.stringify(poolSummary, null, 2)}

## Items needing distractors

${JSON.stringify(itemsForClaude, null, 2)}

## Quality rules

### recognition_distractors_nl (wrong Dutch meanings shown in recognition MCQ)

The learner sees an Indonesian word and must pick the correct Dutch translation. Wrong options are Dutch.

Rules:
- Same part of speech as the correct answer (noun→noun, verb→verb, adjective→adjective). Use item_type for word-class filtering.
- Semantic near-misses: same semantic field, near-synonyms, or antonyms. For "murah" (goedkoop/cheap): use "duur" (expensive), "gratis" (free), "betaalbaar" (affordable) — NOT "huis" (house) or "fiets" (bicycle).
- At least one distractor a learner might actually confuse with the correct meaning.
- Never identical to the correct Dutch translation.
- Prioritize Dutch translations from the pool where the Indonesian word is known (the learner has seen both and must distinguish them).
- For culturally specific terms, fall back to category-level distractors (other food items, other place types, etc.).

### cued_recall_distractors_id (wrong Indonesian words shown in cued recall MCQ)

The learner sees a Dutch meaning and must pick the correct Indonesian word. Wrong options are Indonesian.

Rules:
- Phonetically or orthographically similar to the correct Indonesian word when possible: beli/beri, murah/marah, baru/biru.
- Same word class — use item_type from the pool.
- Only words from the pool (familiar to the learner).
- NEVER morphological variants of the correct answer. No "membeli"/"dibeli" when answer is "beli" — those test morphology, not vocabulary.
- If no phonetically similar pool word exists, use same-lesson words from the same category (other verbs, other adjectives, etc.).
- Vary these from the recognition_distractors_nl — they serve different skills.

### cloze_distractors_id (wrong Indonesian filler words shown in cloze MCQ)

The learner fills a blank in an Indonesian sentence. Wrong options are Indonesian.

Rules:
- Could plausibly fit the sentence grammatically but are semantically wrong. The context must rule them out — the learner must understand meaning, not just grammar.
- Same word class as the target — use item_type from the pool.
- Same semantic field preferred: murah ↔ mahal, makan ↔ minum, besar ↔ kecil.
- Only words from the pool (the learner should recognize all four options).
- For function words or particles (numbers, greetings), use other items of the same type from the pool.
- Vary these from the cued_recall_distractors_id.

## Common mistakes to avoid

1. All distractors from different semantic fields — at least one distractor must be semantically related.
2. Distractors the learner hasn't seen — stick to the pool.
3. Same distractor in all three arrays — vary across exercise types.
4. Ignoring item_type — a noun answer with verb distractors is trivially easy.

## Output format

Return ONLY a JSON array. No prose, no markdown fences. One object per input item. Each array must have EXACTLY 3 elements.

[
  {
    "source_item_ref": "...",
    "recognition_distractors_nl": ["...", "...", "..."],
    "cued_recall_distractors_id": ["...", "...", "..."],
    "cloze_distractors_id": ["...", "...", "..."]
  }
]
`
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse Claude's raw JSON response into validated ItemDistractorSet entries.
 * Malformed input → safe empty array (mirrors enrichPos.ts behaviour).
 * Items where any array lacks exactly 3 elements are silently dropped.
 */
export function parseResponse(raw: string): ItemDistractorSet[] {
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    const result: ItemDistractorSet[] = []
    for (const r of parsed) {
      if (
        typeof r !== 'object' ||
        r === null ||
        typeof r.source_item_ref !== 'string' ||
        !Array.isArray(r.recognition_distractors_nl) ||
        !Array.isArray(r.cued_recall_distractors_id) ||
        !Array.isArray(r.cloze_distractors_id)
      ) {
        continue
      }

      const rec = r.recognition_distractors_nl as unknown[]
      const cued = r.cued_recall_distractors_id as unknown[]
      const cloze = r.cloze_distractors_id as unknown[]

      // Each array must have exactly 3 string elements
      if (rec.length !== 3 || cued.length !== 3 || cloze.length !== 3) continue
      if (!rec.every((x) => typeof x === 'string')) continue
      if (!cued.every((x) => typeof x === 'string')) continue
      if (!cloze.every((x) => typeof x === 'string')) continue

      result.push({
        source_item_ref: r.source_item_ref,
        recognition_distractors_nl: rec as [string, string, string],
        cued_recall_distractors_id: cued as [string, string, string],
        cloze_distractors_id: cloze as [string, string, string],
      })
    }
    return result
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Batch caller (thin Claude call — production path)
// ---------------------------------------------------------------------------

async function generateBatch(
  generateFn: GenerateFn,
  items: DistractorInputItem[],
  pool: DistractorInputItem[],
): Promise<ItemDistractorSet[]> {
  const prompt = buildPrompt(items, pool)
  const raw = await generateFn(prompt)
  return parseResponse(raw)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate curated distractors for all items in the current lesson.
 *
 * No-op conditions:
 *   - No `generateFn` injected AND `ANTHROPIC_API_KEY` not set → return empty
 *     result. This is the safe dry-run / CI path — mirrors enrichPos.ts.
 *   - `items` is empty → return empty result without an API call.
 *
 * Injection seam for tests:
 *   Pass `generateFn` to bypass the API-key check and inject a fake response.
 *   This is the "per-agent hook seam" named in the epic: an injected async fn
 *   gives deterministic tests without needing ANTHROPIC_API_KEY to be set.
 *
 * @param items     Current-lesson items to generate distractors for.
 * @param pool      Cumulative prior-lesson items (the distractor pool).
 * @param options   Optional `generateFn` for injection.
 */
export async function generateItemDistractors(
  items: DistractorInputItem[],
  pool: DistractorInputItem[],
  options?: {
    /**
     * Inject a generate function for tests or dry runs. When provided,
     * bypasses the API-key check — the injected fn is always used.
     */
    generateFn?: GenerateFn
  },
): Promise<DistractorGenerationResult> {
  const empty: DistractorGenerationResult = {
    distractorsBySourceItemRef: new Map(),
    generatedCount: 0,
    skippedCount: 0,
  }

  if (items.length === 0) return empty

  // Resolve the generate function: injected fn takes priority over real Claude.
  let effectiveGenerateFn: GenerateFn

  if (options?.generateFn) {
    effectiveGenerateFn = options.generateFn
  } else {
    // Production path: require the API key.
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn(
        `   ⚠ ANTHROPIC_API_KEY not set — skipping distractor generation (${items.length} items will use runtime distractors)`,
      )
      return empty
    }

    const claude = new Anthropic({ apiKey })
    effectiveGenerateFn = async (prompt: string): Promise<string> => {
      const response = await claude.messages.create({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      if (block?.type !== 'text') return '[]'
      return block.text
    }
  }

  console.log(
    `   ► Generating distractors for ${items.length} items via Claude (${MODEL})...`,
  )

  const resultMap = new Map<string, ItemDistractorSet>()
  let skippedCount = 0

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const sets = await generateBatch(effectiveGenerateFn, batch, pool)

    for (const set of sets) {
      resultMap.set(set.source_item_ref, set)
    }

    // Any batch item not returned by Claude is skipped
    const skipped = batch.filter((item) => !resultMap.has(item.source_item_ref)).length
    skippedCount += skipped

    console.log(
      `     batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}: ${sets.length} generated, ${skipped} skipped`,
    )
  }

  console.log(
    `   ✓ Distractor generation: ${resultMap.size} items (${skippedCount} skipped)`,
  )

  return {
    distractorsBySourceItemRef: resultMap,
    generatedCount: resultMap.size,
    skippedCount,
  }
}
