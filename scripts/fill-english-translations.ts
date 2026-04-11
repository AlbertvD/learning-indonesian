#!/usr/bin/env bun
/**
 * fill-english-translations.ts
 *
 * Fills in missing/empty translation_en fields in staging learning-items.ts files
 * using the Anthropic API. Translates Indonesian → English using Dutch as context.
 *
 * Usage:
 *   bun scripts/fill-english-translations.ts 2 3 4 6 7   # specific lessons
 *   bun scripts/fill-english-translations.ts --all        # all lessons
 *   bun scripts/fill-english-translations.ts --dry-run 6  # preview only
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

const client = new Anthropic()

function needsEnglish(item: any): boolean {
  return !item.translation_en || item.translation_en.trim() === ''
}

async function translateBatch(items: Array<{ base_text: string; translation_nl: string }>): Promise<Record<string, string>> {
  const lines = items.map((it, i) =>
    `${i + 1}. Indonesian: "${it.base_text}" | Dutch: "${it.translation_nl}"`
  ).join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Translate each Indonesian word/phrase to English. Use the Dutch translation as context to get the exact intended meaning.
Return ONLY a JSON object mapping each number to the English translation. Keep translations concise (same style as Dutch — short, no explanations).
For numbers, give the numeral word (e.g. "fourteen"). For phrases, give the natural English equivalent.

${lines}

Respond with only valid JSON, e.g.: {"1": "where?", "2": "fourteen", ...}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${text}`)
  const numbered = JSON.parse(jsonMatch[0]) as Record<string, string>

  const result: Record<string, string> = {}
  items.forEach((it, i) => {
    result[it.base_text] = numbered[String(i + 1)] ?? ''
  })
  return result
}

async function processLesson(lessonNumber: number, dryRun: boolean) {
  const itemsPath = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`, 'learning-items.ts')
  if (!fs.existsSync(itemsPath)) {
    console.log(`  Lesson ${lessonNumber}: no learning-items.ts, skipping`)
    return
  }

  const module = await import(`file://${itemsPath}`)
  const items: any[] = Object.values(module)[0] as any[]
  if (!items?.length) {
    console.log(`  Lesson ${lessonNumber}: empty, skipping`)
    return
  }

  const toTranslate = items.filter(needsEnglish).filter(it => it.item_type !== 'dialogue_chunk' && it.item_type !== 'sentence')
  console.log(`  Lesson ${lessonNumber}: ${toTranslate.length} items need English (${items.length} total)`)

  if (toTranslate.length === 0) {
    console.log(`  Lesson ${lessonNumber}: already complete`)
    return
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would translate: ${toTranslate.slice(0, 5).map(i => i.base_text).join(', ')}...`)
    return
  }

  // Translate in batches of 30 to keep prompts manageable
  const BATCH = 30
  const translations: Record<string, string> = {}
  for (let i = 0; i < toTranslate.length; i += BATCH) {
    const batch = toTranslate.slice(i, i + BATCH)
    console.log(`    Translating batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(toTranslate.length / BATCH)} (${batch.length} items)...`)
    const result = await translateBatch(batch.map(it => ({ base_text: it.base_text, translation_nl: it.translation_nl })))
    Object.assign(translations, result)
  }

  // Apply translations to items array
  const updated = items.map(item => {
    if (needsEnglish(item) && translations[item.base_text]) {
      return { ...item, translation_en: translations[item.base_text] }
    }
    return item
  })

  // Write back — preserve the export name from the original file
  const exportName = Object.keys(module)[0]
  const content = `// Learning items for Lesson ${lessonNumber} — EN translations added by fill-english-translations.ts\nexport const ${exportName} = ${JSON.stringify(updated, null, 2)}\n`
  fs.writeFileSync(itemsPath, content)
  console.log(`  Lesson ${lessonNumber}: ✓ wrote ${Object.keys(translations).length} EN translations`)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filtered = args.filter(a => a !== '--dry-run' && a !== '--all')
  const allMode = args.includes('--all')

  const stagingBase = path.join(process.cwd(), 'scripts', 'data', 'staging')
  const allLessons = fs.readdirSync(stagingBase)
    .filter(d => /^lesson-\d+$/.test(d))
    .map(d => parseInt(d.replace('lesson-', ''), 10))
    .sort((a, b) => a - b)

  const lessons = allMode
    ? allLessons
    : filtered.length > 0
      ? filtered.map(a => parseInt(a, 10)).filter(n => !isNaN(n))
      : allLessons

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Filling English translations for lessons: ${lessons.join(', ')}\n`)

  for (const n of lessons) {
    await processLesson(n, dryRun)
  }

  console.log('\nDone. Run repair-item-meanings.ts to push EN meanings to DB.')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
