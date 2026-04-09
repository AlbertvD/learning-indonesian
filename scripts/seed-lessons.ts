#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { lessons } from './data/lessons'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required. Run: make seed-lessons SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

// Validate: all sections must be fully structured before seeding.
// body is a parser intermediate artifact — must be enriched to structured format first.
const violations: string[] = []
for (const lesson of lessons) {
  for (const section of lesson.sections) {
    const c = section.content as Record<string, unknown>
    const loc = `  ${lesson.title} → "${section.title}"`

    if (c.type === 'grammar' && typeof c.body === 'string') {
      violations.push(`${loc} (type: grammar) has raw body string — enrich to categories array`)
    }
    if (c.type === 'exercises' && typeof c.body === 'string') {
      violations.push(`${loc} (type: exercises) has raw body string — enrich to sections array`)
    }
    if (c.type === 'grammar' && !Array.isArray(c.categories)) {
      violations.push(`${loc} (type: grammar) missing categories array`)
    }
    if (c.type === 'exercises' && !Array.isArray(c.sections)) {
      violations.push(`${loc} (type: exercises) missing sections array`)
    }
    if (c.type === 'vocabulary' || c.type === 'expressions' || c.type === 'numbers') {
      if (!Array.isArray(c.items)) {
        violations.push(`${loc} (type: ${c.type}) missing items array`)
      }
    }
    if (c.type === 'dialogue') {
      if (!Array.isArray(c.lines) || (c.lines as unknown[]).length === 0) {
        violations.push(`${loc} (type: dialogue) missing or empty lines array`)
      }
    }
    if (c.type === 'text') {
      const hasContent = Array.isArray(c.paragraphs) || Array.isArray(c.sentences) ||
        Array.isArray(c.examples) || Array.isArray(c.items) || typeof c.intro === 'string'
      if (!hasContent) {
        violations.push(`${loc} (type: text) has no content fields (paragraphs/sentences/examples/intro)`)
      }
    }
  }
}
if (violations.length > 0) {
  console.error('Seed aborted — sections are incomplete or still in parser intermediate format:')
  violations.forEach(v => console.error(v))
  console.error('\nAll sections must be fully structured before seeding.')
  process.exit(1)
}

// Pipeline path warning: this script only populates lesson_sections (display).
// Vocabulary in lessons.ts for lessons 4+ is display-only — it will NOT be schedulable.
// For lessons 4+, use: bun scripts/publish-approved-content.ts <N>
import { existsSync } from 'fs'
const pipelineWarnings: string[] = []
for (const lesson of lessons) {
  if (lesson.order_index < 4) continue
  const hasVocabSection = lesson.sections.some(s =>
    ['vocabulary', 'expressions', 'numbers'].includes((s.content as Record<string, unknown>).type as string)
  )
  if (hasVocabSection) {
    const stagingPath = new URL(`./data/staging/lesson-${lesson.order_index}/lesson.ts`, import.meta.url).pathname
    if (!existsSync(stagingPath)) {
      pipelineWarnings.push(`  ${lesson.title}: has vocabulary sections but no staging file — vocabulary will NOT be schedulable`)
    } else {
      pipelineWarnings.push(`  ${lesson.title}: vocabulary sections detected — run publish-approved-content.ts ${lesson.order_index} to make them schedulable`)
    }
  }
}
if (pipelineWarnings.length > 0) {
  console.warn('\nWARNING: Display-only vocabulary detected for pipeline lessons.')
  console.warn('seed-lessons.ts only populates lesson_sections. For vocabulary to be schedulable in review sessions,')
  console.warn('run: bun scripts/publish-approved-content.ts <lesson-number>')
  pipelineWarnings.forEach(w => console.warn(w))
  console.warn('')
}

for (const lesson of lessons) {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .upsert(
      {
        module_id: lesson.module_id,
        level: lesson.level,
        title: lesson.title,
        description: lesson.description,
        order_index: lesson.order_index,
        audio_path: lesson.audio_filename ? `lessons/${lesson.audio_filename}` : null,
        duration_seconds: lesson.duration_seconds ?? null,
        transcript_dutch: lesson.transcript_dutch ?? null,
        transcript_indonesian: lesson.transcript_indonesian ?? null,
        transcript_english: lesson.transcript_english ?? null,
      },
      { onConflict: 'module_id,order_index' },
    )
    .select('id')
    .single()
  if (error) {
    console.error('Failed lesson:', lesson.title, error.message)
    continue
  }
  console.log('Upserted lesson:', lesson.title, data.id)

  for (const section of lesson.sections) {
    const { error: sectionError } = await supabase
      .schema('indonesian')
      .from('lesson_sections')
      .upsert(
        {
          lesson_id: data.id,
          title: section.title,
          content: section.content,
          order_index: section.order_index,
        },
        { onConflict: 'lesson_id,order_index' },
      )
    if (sectionError) {
      console.error('  Section failed:', section.title, sectionError.message)
      continue
    }
    console.log('  Upserted section:', section.title)
  }
}

console.log('Done!')
