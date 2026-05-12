/**
 * capability-stage/enrichEnTranslations.ts — lifts the EN-translation
 * logic from `scripts/fill-english-translations.ts` so it runs as part of
 * capability-stage instead of being a separate manual step.
 *
 * Contract:
 *   - Takes staging.learningItems (in-memory).
 *   - Finds word/phrase/numbers items with empty/null `translation_en`
 *     (dialogue_chunk and sentence items are skipped — they're translated
 *     by the linguist-structurer agent in Step 7).
 *   - Sends them to Claude haiku in batches of 30, with NL as context.
 *   - Returns a Map<base_text, translation_en>.
 *
 * Caller is responsible for:
 *   - Applying the Map to staging.learningItems in-memory.
 *   - Writing the updated staging file to disk.
 *
 * Skipping:
 *   - ANTHROPIC_API_KEY not set → return empty Map.
 *   - No items with missing translation_en → return empty Map without API call.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface EnTranslationItem {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk' | 'numbers'
  translation_nl?: string | null
  translation_en?: string | null
}

const BATCH_SIZE = 30
const MODEL = 'claude-haiku-4-5-20251001'

function needsEnglish(item: EnTranslationItem): boolean {
  if (item.item_type === 'dialogue_chunk' || item.item_type === 'sentence') return false
  return !item.translation_en || (typeof item.translation_en === 'string' && item.translation_en.trim() === '')
}

async function translateBatch(
  client: Anthropic,
  items: Array<{ base_text: string; translation_nl: string }>,
): Promise<Record<string, string>> {
  const lines = items.map((it, i) =>
    `${i + 1}. Indonesian: "${it.base_text}" | Dutch: "${it.translation_nl}"`,
  ).join('\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Translate each Indonesian word/phrase to English. Use the Dutch translation as context to get the exact intended meaning.
Return ONLY a JSON object mapping each number to the English translation. Keep translations concise (same style as Dutch — short, no explanations).
For numbers, give the numeral word (e.g. "fourteen"). For phrases, give the natural English equivalent.

${lines}

Respond with only valid JSON, e.g.: {"1": "where?", "2": "fourteen", ...}`,
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  let numbered: Record<string, string>
  try {
    numbered = JSON.parse(jsonMatch[0]) as Record<string, string>
  } catch {
    return {}
  }

  const result: Record<string, string> = {}
  items.forEach((it, i) => {
    const en = numbered[String(i + 1)]
    if (typeof en === 'string' && en.trim().length > 0) {
      result[it.base_text] = en
    }
  })
  return result
}

export interface EnTranslationResult {
  translationsByBaseText: Map<string, string>
  translatedCount: number
}

export async function enrichMissingEnTranslations(
  items: EnTranslationItem[],
): Promise<EnTranslationResult> {
  const toTranslate = items.filter(needsEnglish)
  if (toTranslate.length === 0) {
    return { translationsByBaseText: new Map(), translatedCount: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(`   ⚠ ANTHROPIC_API_KEY not set — skipping EN translation enrichment (${toTranslate.length} items will publish without EN)`)
    return { translationsByBaseText: new Map(), translatedCount: 0 }
  }

  console.log(`   ► Translating ${toTranslate.length} items to EN via Claude (${MODEL})...`)
  const claude = new Anthropic({ apiKey })
  const result = new Map<string, string>()

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE)
    const translations = await translateBatch(
      claude,
      batch.map((it) => ({ base_text: it.base_text, translation_nl: it.translation_nl ?? '' })),
    )
    for (const [baseText, en] of Object.entries(translations)) {
      result.set(baseText, en)
    }
    console.log(`     batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toTranslate.length / BATCH_SIZE)}: ${Object.keys(translations).length} translated`)
  }

  console.log(`   ✓ EN translation enrichment: ${result.size}/${toTranslate.length} translated`)
  return { translationsByBaseText: result, translatedCount: result.size }
}
