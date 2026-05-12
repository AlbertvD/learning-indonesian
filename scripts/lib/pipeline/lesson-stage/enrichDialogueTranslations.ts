/**
 * lesson-stage/enrichDialogueTranslations.ts — fill empty dialogue line
 * `translation` fields via Claude.
 *
 * Why this lives in lesson-stage. Dialogue translations are data on
 * `lesson_sections.content.lines[].translation`. Stage A is the writer of
 * `lesson_sections` (`runner.ts:upsertLessonSections`). Filling the field
 * as part of Stage A means it lands in the same upsert that creates the
 * section row, instead of being patched downstream.
 *
 * Caller is responsible for:
 *   - Applying the returned translations to the lesson's dialogue sections
 *     in-memory so validators + the section upsert see populated values.
 *   - Writing the updated lesson.ts back to staging (so subsequent runs
 *     skip re-translating).
 *
 * Skipping:
 *   - `ANTHROPIC_API_KEY` not set → empty Map.
 *   - No empty translations found → empty Map without API call.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface DialogueLine {
  text: string
  speaker?: string
  translation?: string
}

export interface DialogueTranslationResult {
  /** Keyed by the dialogue line's Indonesian text. */
  translationsByText: Map<string, string>
  translatedCount: number
}

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH_SIZE = 25

function needsTranslation(line: DialogueLine): boolean {
  if (typeof line.text !== 'string' || line.text.trim().length === 0) return false
  return !line.translation || (typeof line.translation === 'string' && line.translation.trim() === '')
}

async function translateBatch(
  client: Anthropic,
  lines: DialogueLine[],
): Promise<Record<string, string>> {
  const numbered = lines
    .map((l, i) => (l.speaker ? `${i + 1}. ${l.speaker}: "${l.text}"` : `${i + 1}. "${l.text}"`))
    .join('\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Translate each Indonesian dialogue line to Dutch. Keep the translation natural and idiomatic — the kind of Dutch a speaker would actually say in the same context.
Return ONLY a JSON object mapping each number to the Dutch translation. No prose, no markdown fences.

${numbered}

Respond with only valid JSON, e.g.: {"1": "Goedemiddag, …", "2": "Nummer 215, …", ...}`,
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(match[0]) as Record<string, string>
  } catch {
    return {}
  }

  const result: Record<string, string> = {}
  lines.forEach((line, i) => {
    const t = parsed[String(i + 1)]
    if (typeof t === 'string' && t.trim().length > 0) {
      result[line.text] = t
    }
  })
  return result
}

export async function enrichMissingDialogueTranslations(
  lines: DialogueLine[],
): Promise<DialogueTranslationResult> {
  const toTranslate = lines.filter(needsTranslation)
  if (toTranslate.length === 0) {
    return { translationsByText: new Map(), translatedCount: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(`   ⚠ ANTHROPIC_API_KEY not set — skipping dialogue translation enrichment (${toTranslate.length} lines)`)
    return { translationsByText: new Map(), translatedCount: 0 }
  }

  console.log(`   ► Translating ${toTranslate.length} dialogue lines to Dutch via Claude (${MODEL})...`)
  const client = new Anthropic({ apiKey })
  const result = new Map<string, string>()

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE)
    const translations = await translateBatch(client, batch)
    for (const [text, nl] of Object.entries(translations)) {
      result.set(text, nl)
    }
    console.log(`     batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toTranslate.length / BATCH_SIZE)}: ${Object.keys(translations).length} translated`)
  }

  console.log(`   ✓ Dialogue translation enrichment: ${result.size}/${toTranslate.length} translated`)
  return { translationsByText: result, translatedCount: result.size }
}

/**
 * Walk the lesson's dialogue sections and collect every line into the
 * { text, speaker, translation } shape the enricher consumes.
 */
export function collectDialogueLines(
  sections: Array<{ content?: Record<string, unknown> }>,
): DialogueLine[] {
  const out: DialogueLine[] = []
  for (const sec of sections) {
    if (sec.content?.type !== 'dialogue') continue
    const lines = sec.content?.lines
    if (!Array.isArray(lines)) continue
    for (const line of lines as Array<{ text?: unknown; speaker?: unknown; translation?: unknown }>) {
      if (typeof line.text !== 'string') continue
      out.push({
        text: line.text,
        speaker: typeof line.speaker === 'string' ? line.speaker : undefined,
        translation: typeof line.translation === 'string' ? line.translation : undefined,
      })
    }
  }
  return out
}

/**
 * Apply translated lines back into the lesson's dialogue sections in
 * memory. Mutates `sections[*].content.lines[*].translation`.
 */
export function applyDialogueTranslationsToSections(
  sections: Array<{ content?: Record<string, unknown> }>,
  translationsByText: Map<string, string>,
): number {
  let applied = 0
  for (const sec of sections) {
    if (sec.content?.type !== 'dialogue') continue
    const lines = sec.content?.lines
    if (!Array.isArray(lines)) continue
    for (const line of lines as Array<{ text?: unknown; translation?: unknown }>) {
      if (typeof line.text !== 'string') continue
      const newTrans = translationsByText.get(line.text)
      if (newTrans) {
        ;(line as { translation: string }).translation = newTrans
        applied++
      }
    }
  }
  return applied
}
