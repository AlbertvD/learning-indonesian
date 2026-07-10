#!/usr/bin/env bun
/**
 * audit-grammar-produce-answer-freedom.ts
 *
 * Read-only audit for docs/plans/2026-07-09-g4-produce-grader-fix.md, build
 * order step 1. Classifies every row of `sentence_transformation_exercises`
 * (761) and `constrained_translation_exercises` (955) as `single_element`
 * (one small, localized edit from the prompt — exact-match grading is fair)
 * or `multi_answer_free` (the false-negative surface: the enrichment
 * universe for step 2/3) using the deterministic token-level edit-footprint
 * classifier in `scripts/lib/produceAnswerFreedom.ts` (spec §2.1 — read that
 * file's header for the full algorithm rationale).
 *
 * NEVER writes to the DB. Writes ONE committed artifact:
 *   scripts/data/grammar-produce-answer-freedom-audit.json
 * — per-exercise id + classification + footprint stats + a summary block,
 * so the classification is human-reviewable before anything downstream
 * (the generate/apply steps, or the health checks) consumes it.
 *
 * Usage:
 *   bun scripts/audit-grammar-produce-answer-freedom.ts [--out <path>]
 *
 * Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL (.env.local) and, for
 * TLS against the self-signed homelab chain, NODE_EXTRA_CA_CERTS pointed at
 * the Duin Home root CA — never NODE_TLS_REJECT_UNAUTHORIZED=0.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { classifyProduceAnswerFreedom, type ProduceAnswerFreedomClass } from './lib/produceAnswerFreedom'

function loadEnv(): void {
  if (!fs.existsSync('.env.local')) return
  for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const DEFAULT_OUT_PATH = 'scripts/data/grammar-produce-answer-freedom-audit.json'

function requireEnv(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
  return { url, key }
}

type TableName = 'sentence_transformation_exercises' | 'constrained_translation_exercises'

export interface AuditedExercise {
  id: string
  table: TableName
  isActive: boolean
  lessonId: string
  grammarPatternId: string
  classification: ProduceAnswerFreedomClass
  acceptableAnswersCount: number
  sourceTokenCount: number
  answerTokenCount: number
  matchedTokenCount: number
  spanCount: number
}

export interface TableSummary {
  total: number
  singleElement: number
  multiAnswerFree: number
  majoritySingleElement: boolean
}

export interface AuditReport {
  generatedAt: string
  classifierVersion: 1
  tables: Record<TableName, TableSummary>
  overall: TableSummary
  exercises: AuditedExercise[]
}

/** Pure — builds the full report from already-fetched rows. Exported for
 *  unit testing without a live DB. */
export function buildAuditReport(
  sentenceTransformationRows: Array<{ id: string; is_active: boolean; lesson_id: string; grammar_pattern_id: string; source_sentence: string; acceptable_answers: string[] }>,
  constrainedTranslationRows: Array<{ id: string; is_active: boolean; lesson_id: string; grammar_pattern_id: string; source_language_sentence: string; acceptable_answers: string[] }>,
): AuditReport {
  const exercises: AuditedExercise[] = []

  for (const r of sentenceTransformationRows) {
    const canonical = r.acceptable_answers[0] ?? ''
    const { footprint, classification } = classifyProduceAnswerFreedom(r.source_sentence, canonical)
    exercises.push({
      id: r.id,
      table: 'sentence_transformation_exercises',
      isActive: r.is_active,
      lessonId: r.lesson_id,
      grammarPatternId: r.grammar_pattern_id,
      classification,
      acceptableAnswersCount: r.acceptable_answers.length,
      sourceTokenCount: footprint.sourceTokenCount,
      answerTokenCount: footprint.answerTokenCount,
      matchedTokenCount: footprint.matchedTokenCount,
      spanCount: footprint.spanCount,
    })
  }

  for (const r of constrainedTranslationRows) {
    const canonical = r.acceptable_answers[0] ?? ''
    const { footprint, classification } = classifyProduceAnswerFreedom(r.source_language_sentence, canonical)
    exercises.push({
      id: r.id,
      table: 'constrained_translation_exercises',
      isActive: r.is_active,
      lessonId: r.lesson_id,
      grammarPatternId: r.grammar_pattern_id,
      classification,
      acceptableAnswersCount: r.acceptable_answers.length,
      sourceTokenCount: footprint.sourceTokenCount,
      answerTokenCount: footprint.answerTokenCount,
      matchedTokenCount: footprint.matchedTokenCount,
      spanCount: footprint.spanCount,
    })
  }

  const summarize = (rows: AuditedExercise[]): TableSummary => {
    const singleElement = rows.filter((r) => r.classification === 'single_element').length
    const multiAnswerFree = rows.filter((r) => r.classification === 'multi_answer_free').length
    return { total: rows.length, singleElement, multiAnswerFree, majoritySingleElement: singleElement > multiAnswerFree }
  }

  const tables: Record<TableName, TableSummary> = {
    sentence_transformation_exercises: summarize(exercises.filter((r) => r.table === 'sentence_transformation_exercises')),
    constrained_translation_exercises: summarize(exercises.filter((r) => r.table === 'constrained_translation_exercises')),
  }

  return {
    generatedAt: new Date().toISOString(),
    classifierVersion: 1,
    tables,
    overall: summarize(exercises),
    exercises,
  }
}

async function main(): Promise<void> {
  const outPath = arg('out') ?? DEFAULT_OUT_PATH
  const { url, key } = requireEnv()
  const db = createClient(url, key).schema('indonesian')

  console.log(`Audit — reading sentence_transformation_exercises + constrained_translation_exercises (read-only)`)

  async function pageAll<T>(table: string, select: string): Promise<T[]> {
    const pageSize = 1000
    const all: T[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from(table).select(select).range(offset, offset + pageSize - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      const rows = (data ?? []) as T[]
      all.push(...rows)
      if (rows.length < pageSize) break
    }
    return all
  }

  const sentenceTransformationRows = await pageAll<{ id: string; is_active: boolean; lesson_id: string; grammar_pattern_id: string; source_sentence: string; acceptable_answers: string[] }>(
    'sentence_transformation_exercises', 'id, is_active, lesson_id, grammar_pattern_id, source_sentence, acceptable_answers',
  )
  const constrainedTranslationRows = await pageAll<{ id: string; is_active: boolean; lesson_id: string; grammar_pattern_id: string; source_language_sentence: string; acceptable_answers: string[] }>(
    'constrained_translation_exercises', 'id, is_active, lesson_id, grammar_pattern_id, source_language_sentence, acceptable_answers',
  )

  console.log(`  sentence_transformation_exercises: ${sentenceTransformationRows.length} row(s)`)
  console.log(`  constrained_translation_exercises: ${constrainedTranslationRows.length} row(s)`)

  const report = buildAuditReport(sentenceTransformationRows, constrainedTranslationRows)

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`\nWrote ${report.exercises.length} row(s) to ${outPath}\n`)

  for (const [table, summary] of Object.entries(report.tables)) {
    console.log(`${table}:`)
    console.log(`  total=${summary.total}  single_element=${summary.singleElement}  multi_answer_free=${summary.multiAnswerFree}  majority_single_element=${summary.majoritySingleElement}`)
  }
  console.log(`overall:`)
  console.log(`  total=${report.overall.total}  single_element=${report.overall.singleElement}  multi_answer_free=${report.overall.multiAnswerFree}  majority_single_element=${report.overall.majoritySingleElement}`)
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
