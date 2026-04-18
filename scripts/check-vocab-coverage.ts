#!/usr/bin/env bun
/**
 * check-vocab-coverage.ts — focused DB-side scanner.
 *
 * Flags grammar exercise variants in the DB whose Indonesian payload contains
 * words the learner has never been exposed to. Authoring rule (per
 * .claude/agents/grammar-exercise-creator.md:65): every candidate must use
 * vocabulary from the lesson pool.
 *
 * For staging-side checks see scripts/lint-staging.ts. The two scripts share
 * the affix module at scripts/lib/affix.ts.
 *
 * Usage:
 *   bun scripts/check-vocab-coverage.ts                # scan all variants
 *   bun scripts/check-vocab-coverage.ts --lesson 7     # one lesson
 *   bun scripts/check-vocab-coverage.ts --json
 *
 * Exits 0 when clean, 1 when any unknowns are found, 2 on error.
 */

import { createClient } from '@supabase/supabase-js'
import { stripAffixes, tokenize, FUNCTION_WORDS } from './lib/affix'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required')
  process.exit(2)
}

// Internal Step-CA on the homelab. Scoped: only this script's HTTPS calls
// (all to the homelab supabase) bypass cert validation.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// NEVER log the supabase client object — service-role JWT lives in client.headers.
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'indonesian' },
  auth: { persistSession: false },
})

// Supabase JS .select() defaults cap at 1000 rows. Beat the cap with
// page-by-1000. Pages are stabilised with .order('id') so .range() slices
// a consistent result set if a write lands mid-lint.
async function selectAllRows<T>(builder: any, orderColumn = 'id'): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  const ordered = builder.order(orderColumn, { ascending: true })
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ordered.range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}

async function loadKnownVocab(): Promise<Set<string>> {
  const known = new Set<string>()
  const items = await selectAllRows<{ normalized_text: string | null }>(
    supabase.from('learning_items').select('normalized_text'),
  )
  for (const it of items) {
    if (!it.normalized_text) continue
    for (const tok of tokenize(it.normalized_text)) {
      known.add(tok)
      known.add(stripAffixes(tok))
    }
  }
  const contexts = await selectAllRows<{ source_text: string | null }>(
    supabase.from('item_contexts').select('source_text'),
  )
  for (const ctx of contexts) {
    if (!ctx.source_text) continue
    for (const tok of tokenize(ctx.source_text)) {
      known.add(tok)
      known.add(stripAffixes(tok))
    }
  }
  return known
}

// Indonesian-bearing fields per exercise type. Other fields
// (sourceLanguageSentence, explanationText, transformationInstruction,
// promptText, targetMeaning) are Dutch and intentionally skipped.
function extractIndonesianText(payload: Record<string, unknown>, exerciseType: string): string[] {
  const out: string[] = []
  switch (exerciseType) {
    case 'constrained_translation':
      for (const a of (payload.acceptableAnswers as string[] | undefined) ?? []) out.push(a)
      break
    case 'sentence_transformation':
      if (typeof payload.sourceSentence === 'string') out.push(payload.sourceSentence)
      for (const a of (payload.acceptableAnswers as string[] | undefined) ?? []) out.push(a)
      break
    case 'contrast_pair':
      for (const opt of (payload.options as Array<{ text: string }> | undefined) ?? []) {
        if (typeof opt?.text === 'string') out.push(opt.text)
      }
      break
    case 'cloze_mcq':
      if (typeof payload.sentence === 'string') out.push(payload.sentence)
      for (const opt of (payload.options as string[] | undefined) ?? []) {
        if (typeof opt === 'string') out.push(opt)
      }
      break
  }
  return out
}

interface Finding {
  variant_id: string
  exercise_type: string
  pattern_slug: string | null
  lesson_order: number | null
  unknown_words: string[]
  sample_text: string
}

function parseArgs(args: string[]): { jsonOut: boolean; lessonFilter: number | null } {
  const jsonOut = args.includes('--json')
  let lessonFilter: number | null = null
  const lessonIdx = args.indexOf('--lesson')
  if (lessonIdx >= 0) {
    const raw = args[lessonIdx + 1]
    if (!raw) {
      console.error('--lesson requires a number')
      process.exit(2)
    }
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 1) {
      console.error(`--lesson expects a positive integer, got "${raw}"`)
      process.exit(2)
    }
    lessonFilter = n
  }
  return { jsonOut, lessonFilter }
}

async function main() {
  const { jsonOut, lessonFilter } = parseArgs(process.argv.slice(2))

  if (!jsonOut) console.log('Loading known vocabulary from DB…')
  const known = await loadKnownVocab()
  if (!jsonOut) console.log(`Known vocabulary: ${known.size} unique tokens`)

  const variants = await selectAllRows<any>(
    supabase
      .from('exercise_variants')
      .select('id, exercise_type, payload_json, grammar_pattern_id, grammar_patterns!inner(slug, introduced_by_lesson_id, lessons:introduced_by_lesson_id(order_index))')
      .not('grammar_pattern_id', 'is', null),
  )

  const findings: Finding[] = []
  for (const v of variants) {
    const gp = v.grammar_patterns as { slug?: string; lessons?: { order_index?: number } } | null
    const lessonOrder = gp?.lessons?.order_index ?? null
    if (lessonFilter !== null && lessonOrder !== lessonFilter) continue

    const indoTexts = extractIndonesianText(v.payload_json as Record<string, unknown>, v.exercise_type)
    if (indoTexts.length === 0) continue

    const unknown = new Set<string>()
    for (const text of indoTexts) {
      for (const raw of tokenize(text)) {
        if (raw.length < 3) continue
        if (FUNCTION_WORDS.has(raw)) continue
        const stripped = stripAffixes(raw)
        if (known.has(raw) || known.has(stripped)) continue
        if (FUNCTION_WORDS.has(stripped)) continue
        unknown.add(raw)
      }
    }

    if (unknown.size > 0) {
      findings.push({
        variant_id: v.id,
        exercise_type: v.exercise_type,
        pattern_slug: gp?.slug ?? null,
        lesson_order: lessonOrder,
        unknown_words: [...unknown].sort(),
        sample_text: indoTexts[0].slice(0, 100),
      })
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ count: findings.length, findings }, null, 2))
  } else if (findings.length === 0) {
    console.log('\nClean: every grammar exercise uses only known vocabulary.')
  } else {
    console.log(`\nFound ${findings.length} variant(s) with unknown vocabulary:\n`)
    for (const f of findings) {
      console.log(`Lesson ${f.lesson_order ?? '?'} · ${f.pattern_slug ?? '?'} · ${f.exercise_type}`)
      console.log(`  variant_id: ${f.variant_id}`)
      console.log(`  unknown:    ${f.unknown_words.join(', ')}`)
      console.log(`  sample:     "${f.sample_text}"`)
      console.log()
    }
  }

  process.exit(findings.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
