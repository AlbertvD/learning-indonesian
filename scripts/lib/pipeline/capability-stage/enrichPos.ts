/**
 * capability-stage/enrichPos.ts — lifts the POS-classification logic from
 * `scripts/backfill-pos.ts` so it runs as part of capability-stage instead
 * of being a separate manual step.
 *
 * Contract:
 *   - Takes staging.learningItems (in-memory).
 *   - Finds word/phrase items with empty/null `pos`.
 *   - Sends them to Claude in batches of 40 with the same prompt
 *     backfill-pos.ts uses.
 *   - Validates returned POS against the 12-value whitelist (VALID_POS).
 *   - Returns a Map<base_text, pos> of valid classifications.
 *
 * Caller is responsible for:
 *   - Applying the Map to staging.learningItems in-memory.
 *   - Writing the updated staging file to disk (so subsequent runs skip
 *     re-classifying).
 *   - Validation + DB writes (the upsert will then pass the populated pos).
 *
 * Skipping conditions:
 *   - ANTHROPIC_API_KEY not set → log warning, return empty Map (no-op).
 *   - No items with missing pos → return empty Map without an API call.
 */

import Anthropic from '@anthropic-ai/sdk'
import { VALID_POS } from '../../validate-pos'
import { ANTHROPIC_MAX_RETRIES } from '../generationThrottle'

export interface PosEnrichmentItem {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
  translation_nl?: string | null
  translation_en?: string | null
  pos?: string | null
}

const BATCH_SIZE = 40
// POS tagging is a simple closed-set classification — Haiku is plenty (every
// other enricher already uses it), and it moves these calls OFF the Sonnet
// rate limit, which the in-stage exercise generators contend for. (Rate-limit
// hardening 2026-06-01.)
const MODEL = 'claude-haiku-4-5-20251001'

function buildPrompt(items: PosEnrichmentItem[]): string {
  return `You are classifying Indonesian learning items by part of speech for an A1-B1 beginner curriculum.

Tag each item with exactly one of these 12 values:

  verb, noun, adjective, adverb, pronoun, numeral,
  classifier, preposition, conjunction, particle,
  question_word, greeting

Rules:
- Use the POS of the primary Dutch translation's meaning. If "makan" is taught as "to eat" → verb. If taught as "meal" → noun.
- For phrase items, use the head-word's POS (e.g. "selamat pagi" → "greeting"; "buah jeruk" → "noun" because jeruk is the head).
- Classifiers (orang, ekor, buah, batang used as counters) → "classifier", not "noun".
- Question words (apa, siapa, mana, kapan, bagaimana, berapa) → "question_word".
- Greetings and courteous formulas → "greeting".
- Aspect/discourse particles (sudah, belum, akan, sedang, juga, saja, pun, kah, lah) → "particle".

Examples:
- "makan" (eten/to eat) → verb
- "rumah" (huis/house) → noun
- "orang" (as classifier for persons) → classifier
- "apa" (wat/what) → question_word
- "sudah" (al/already) → particle
- "selamat pagi" (goedemorgen) → greeting

Return ONLY a JSON array. No prose, no markdown fences. Exactly one object per input item:

[{"base_text": "...", "pos": "..."}]

Items to classify:

${JSON.stringify(items.map((i) => ({
  base_text: i.base_text,
  item_type: i.item_type,
  translation_nl: i.translation_nl ?? '',
  translation_en: i.translation_en ?? '',
})), null, 2)}
`
}

function parseResponse(raw: string): Array<{ base_text: string; pos: string | null }> {
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r: unknown): r is { base_text: unknown; pos: unknown } =>
        typeof r === 'object' && r !== null && 'base_text' in r && 'pos' in r,
      )
      .map((r) => ({
        base_text: String(r.base_text),
        pos: typeof r.pos === 'string' ? r.pos : null,
      }))
  } catch {
    return []
  }
}

async function classifyBatch(
  claude: Anthropic,
  batch: PosEnrichmentItem[],
): Promise<Array<{ base_text: string; pos: string | null }>> {
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildPrompt(batch) }],
  })
  const block = response.content[0]
  if (block?.type !== 'text') return []
  return parseResponse(block.text)
}

export interface PosEnrichmentResult {
  /** base_text → valid POS string. Only entries where Claude returned a valid POS. */
  posByBaseText: Map<string, string>
  classifiedCount: number
  invalidCount: number
}

export async function enrichMissingPos(
  items: PosEnrichmentItem[],
): Promise<PosEnrichmentResult> {
  const needsClassification = items.filter((i) =>
    (i.item_type === 'word' || i.item_type === 'phrase') &&
    (!i.pos || (typeof i.pos === 'string' && i.pos.trim() === '')),
  )
  if (needsClassification.length === 0) {
    return { posByBaseText: new Map(), classifiedCount: 0, invalidCount: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(`   ⚠ ANTHROPIC_API_KEY not set — skipping POS enrichment (${needsClassification.length} items will publish without POS)`)
    return { posByBaseText: new Map(), classifiedCount: 0, invalidCount: 0 }
  }

  console.log(`   ► Classifying POS for ${needsClassification.length} items via Claude (${MODEL})...`)
  const claude = new Anthropic({ apiKey, maxRetries: ANTHROPIC_MAX_RETRIES })
  const result = new Map<string, string>()
  let invalidCount = 0

  for (let i = 0; i < needsClassification.length; i += BATCH_SIZE) {
    const batch = needsClassification.slice(i, i + BATCH_SIZE)
    const classifications = await classifyBatch(claude, batch)
    for (const c of classifications) {
      if (c.pos && VALID_POS.has(c.pos)) {
        result.set(c.base_text, c.pos)
      } else if (c.pos) {
        invalidCount++
      }
    }
    console.log(`     batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsClassification.length / BATCH_SIZE)}: ${classifications.length} classified`)
  }

  console.log(`   ✓ POS enrichment: ${result.size} valid (${invalidCount} invalid skipped)`)
  return { posByBaseText: result, classifiedCount: result.size, invalidCount }
}
