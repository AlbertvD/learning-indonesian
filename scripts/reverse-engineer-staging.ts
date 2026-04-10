#!/usr/bin/env bun
/**
 * reverse-engineer-staging.ts
 *
 * Reconstructs staging files for legacy lessons (1-3) from live Supabase data.
 * Use this when a lesson has no sections-catalog.json but its content already
 * lives in lesson_sections and learning_items.
 *
 * Writes:
 *   sections-catalog.json  — primary input for linguist-creator
 *   lesson.ts              — full lesson with all sections from DB
 *   learning-items.ts      — vocabulary items from DB (Dutch translations)
 *
 * Usage:
 *   bun scripts/reverse-engineer-staging.ts <lesson-number>
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  return createClient(url, serviceKey)
}

// Render a grammar categories array back into readable Dutch text
function categoriesToRawText(categories: any[], intro?: string): string {
  const lines: string[] = []
  if (intro) lines.push(intro, '')
  for (const cat of categories || []) {
    if (cat.title) lines.push(`### ${cat.title}`)
    if (cat.rules) {
      for (const rule of cat.rules) lines.push(`- ${rule}`)
    }
    if (cat.examples) {
      for (const ex of cat.examples) {
        if (ex.indonesian && ex.dutch) lines.push(`  ${ex.indonesian} — ${ex.dutch}`)
        else if (ex.note) lines.push(`  [${ex.note}]`)
      }
    }
    if (cat.pairs) {
      for (const p of cat.pairs) {
        if (p.pos && p.neg) lines.push(`  ${p.pos} (${p.pos_dutch}) ↔ ${p.neg} (${p.neg_dutch})`)
      }
    }
    if (cat.table) {
      for (const row of cat.table) {
        if (Array.isArray(row)) lines.push('  ' + row.join(' | '))
        else lines.push('  ' + JSON.stringify(row))
      }
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

// Render exercises sections into raw text
function exerciseSectionsToRawText(sections: any[]): string {
  const lines: string[] = []
  for (const sec of sections || []) {
    lines.push(`## ${sec.title}`)
    if (sec.instruction) lines.push(sec.instruction)
    for (const item of sec.items || []) {
      if (item.dutch && item.indonesian) lines.push(`  ${item.dutch} — ${item.indonesian}`)
      else if (item.dutch) lines.push(`  ${item.dutch}`)
      else if (item.prompt && item.answer) lines.push(`  ${item.prompt} — ${item.answer}`)
      else if (item.prompt) lines.push(`  ${item.prompt}`)
      else if (item.question) lines.push(`  ${item.question}`)
      else if (item.sum && item.answer) lines.push(`  ${item.sum} = ${item.answer}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/reverse-engineer-staging.ts <lesson-number>')
    process.exit(1)
  }

  const supabase = createSupabaseClient()
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true })
  }

  // -------------------------------------------------------------------------
  // 1. Fetch lesson metadata
  // -------------------------------------------------------------------------
  const { data: lesson, error: lessonError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, title, description, level, module_id, order_index')
    .eq('order_index', lessonNumber)
    .single()

  if (lessonError || !lesson) {
    console.error('Could not find lesson:', lessonError?.message)
    process.exit(1)
  }
  console.log(`\nReverse-engineering staging for: ${lesson.title}`)

  // -------------------------------------------------------------------------
  // 2. Fetch lesson sections
  // -------------------------------------------------------------------------
  const { data: sections, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('title, order_index, content')
    .eq('lesson_id', lesson.id)
    .order('order_index')

  if (sectionsError || !sections) {
    console.error('Could not fetch sections:', sectionsError?.message)
    process.exit(1)
  }
  console.log(`  Found ${sections.length} lesson sections`)

  // -------------------------------------------------------------------------
  // 3. Fetch learning items (Dutch translations, unique per base_text+item_type)
  // -------------------------------------------------------------------------
  const { data: itemRows, error: itemsError } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select(`
      id,
      base_text,
      item_type,
      item_meanings!inner(translation_text, translation_language, is_primary),
      item_contexts!inner(context_type, source_lesson_id)
    `)
    .eq('item_contexts.source_lesson_id', lesson.id)
    .eq('item_meanings.translation_language', 'nl')
    .eq('is_active', true)

  if (itemsError) {
    console.error('Could not fetch learning items:', itemsError?.message)
    process.exit(1)
  }

  // Deduplicate: one entry per (base_text, item_type) with primary Dutch meaning
  const itemMap = new Map<string, any>()
  for (const row of itemRows || []) {
    const key = `${row.base_text}||${row.item_type}`
    if (!itemMap.has(key)) {
      const meanings = (row.item_meanings as any[]) || []
      const primary = meanings.find((m: any) => m.is_primary && m.translation_language === 'nl')
        ?? meanings.find((m: any) => m.translation_language === 'nl')
      const contexts = (row.item_contexts as any[]) || []
      const ctx = contexts[0]
      itemMap.set(key, {
        base_text: row.base_text,
        item_type: row.item_type,
        translation_nl: primary?.translation_text ?? '',
        context_type: ctx?.context_type ?? 'vocabulary_list',
        source_page: lessonNumber,
        review_status: 'published',
      })
    }
  }
  const learningItems = [...itemMap.values()]
  console.log(`  Found ${learningItems.length} unique learning items`)

  // Validate before writing
  const emptyNl = learningItems.filter((i: any) => !i.translation_nl?.trim())
  const emptyBase = learningItems.filter((i: any) => !i.base_text?.trim())

  if (emptyBase.length > 0) {
    console.error(`\n✗ ${emptyBase.length} items have empty base_text — DB data may be corrupted.`)
    process.exit(1)
  }
  if (emptyNl.length > 0) {
    console.warn(`\n⚠️ ${emptyNl.length}/${learningItems.length} items have no NL translation in DB.`)
    console.warn('   These items will be invisible to NL users in sessions.')
    console.warn('   Run repair-item-meanings.ts or re-seed before running linguist-creator.')
    // Warn but don't exit — the operator may want to proceed and fix afterwards
  }
  if (learningItems.length === 0) {
    console.error(`\n✗ No learning items found for lesson ${lessonNumber} in DB. Ensure publish-approved-content.ts was run first.`)
    process.exit(1)
  }

  // -------------------------------------------------------------------------
  // 4. Build sections-catalog.json
  // -------------------------------------------------------------------------
  const catalogSections: any[] = []

  for (const sec of sections) {
    const content = sec.content as any
    const sectionType = content.type

    if (['vocabulary', 'expressions', 'numbers'].includes(sectionType)) {
      // Items are already parsed — pass through directly
      catalogSections.push({
        section_type: sectionType,
        title: sec.title,
        order_index: sec.order_index,
        confidence: 1.0,
        source: 'db',
        items: content.items || [],
      })
    } else if (sectionType === 'grammar' || sectionType === 'reference_table') {
      // Already structured in DB — include both forms so creator can use either
      const rawText = categoriesToRawText(content.categories || [], content.intro)
      catalogSections.push({
        section_type: sectionType,
        title: sec.title,
        order_index: sec.order_index,
        confidence: 1.0,
        source: 'db',
        // structured_categories is already parsed — creator should use this directly
        structured_categories: content.categories || [],
        word_order: content.word_order ?? null,
        intro: content.intro ?? null,
        // raw_text for reference / fallback
        raw_text: rawText,
      })
    } else if (sectionType === 'exercises') {
      const rawText = exerciseSectionsToRawText(content.sections || [])
      catalogSections.push({
        section_type: 'exercises',
        title: sec.title,
        order_index: sec.order_index,
        confidence: 1.0,
        source: 'db',
        // structured_sections is already classified — creator should use this directly
        structured_sections: content.sections || [],
        raw_text: rawText,
      })
    } else if (sectionType === 'dialogue') {
      catalogSections.push({
        section_type: 'dialogue',
        title: sec.title,
        order_index: sec.order_index,
        confidence: 1.0,
        source: 'db',
        lines: content.lines || [],
      })
    } else {
      // text, pronunciation — display only
      catalogSections.push({
        section_type: sectionType,
        title: sec.title,
        order_index: sec.order_index,
        confidence: 1.0,
        source: 'db',
        raw_text: content.intro ?? content.body ?? '',
      })
    }
  }

  const catalog = {
    lesson_number: lessonNumber,
    lesson_title: lesson.title,
    level: lesson.level,
    source: 'reverse_engineered_from_db',
    note: 'Grammar and exercise sections are already fully structured (categories/sections arrays). The linguist-creator should use structured_categories / structured_sections directly — no re-parsing needed. raw_text is provided as a human-readable reference only.',
    sections: catalogSections,
  }

  // -------------------------------------------------------------------------
  // 5. Write lesson.ts (full sections from DB)
  // -------------------------------------------------------------------------
  const lessonTs = {
    title: lesson.title,
    description: lesson.description,
    level: lesson.level,
    module_id: lesson.module_id,
    order_index: lesson.order_index,
    sections: sections.map(sec => ({
      title: sec.title,
      order_index: sec.order_index,
      content: sec.content,
    })),
  }

  // -------------------------------------------------------------------------
  // 6. Write files
  // -------------------------------------------------------------------------
  const catalogPath = path.join(stagingDir, 'sections-catalog.json')
  const lessonPath = path.join(stagingDir, 'lesson.ts')
  const itemsPath = path.join(stagingDir, 'learning-items.ts')

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))
  console.log(`  ✓ sections-catalog.json written (${catalogSections.length} sections)`)

  fs.writeFileSync(
    lessonPath,
    `// Lesson ${lessonNumber} — reverse-engineered from DB by reverse-engineer-staging.ts\nexport const lesson = ${JSON.stringify(lessonTs, null, 2)}\n`
  )
  console.log(`  ✓ lesson.ts written (${sections.length} sections)`)

  fs.writeFileSync(
    itemsPath,
    `// Learning items for Lesson ${lessonNumber} — reverse-engineered from DB\nexport const learningItems = ${JSON.stringify(learningItems, null, 2)}\n`
  )
  console.log(`  ✓ learning-items.ts written (${learningItems.length} items)`)

  console.log(`\nDone. Run linguist-creator on lesson ${lessonNumber} next.`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
