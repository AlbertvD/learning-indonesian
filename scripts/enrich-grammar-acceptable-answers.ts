#!/usr/bin/env bun
/**
 * enrich-grammar-acceptable-answers.ts
 *
 * Standalone maintenance script that seeds `sentence_transformation_
 * exercises.acceptable_answers` / `constrained_translation_exercises.
 * acceptable_answers` — the grammar-produce-grader false-negative fix
 * (docs/plans/2026-07-09-g4-produce-grader-fix.md §2.2-2.3). Both tables
 * are DB-authoritative-after-seeding (ADR 0011): this is a NEW sibling
 * maintenance script to `scripts/enrich-answer-variants.ts` (v4) — same
 * generate/apply shape, different tables, because these two exercise
 * types have no per-publish writer of their own (grep confirms: only the
 * capability stage's ONE-TIME seed at authoring time, never touched again).
 *
 * TWO PHASES:
 *
 *   generate — reads the committed audit artifact (`scripts/audit-grammar-
 *              produce-answer-freedom.ts`'s output) to find the
 *              `multi_answer_free` universe, fetches those rows' current
 *              acceptable_answers, and runs the deterministic candidate rule
 *              engine (`scripts/lib/produceAnswerCandidates.ts` — see that
 *              file's header for why this is deterministic rule-mining
 *              rather than a live LLM call, and exactly which "attested
 *              word-order permutations, optional-particle presence, clitic
 *              alternates" rules it applies). Writes a COMMITTED,
 *              human-reviewable artifact keyed by exercise id. An exercise
 *              whose canonical answer matches none of the rules is marked
 *              `restructureNeeded: true` (spec's explicit escape valve —
 *              "if any exercise resists enumeration, mark it
 *              restructure-needed instead of guessing") rather than
 *              fabricated.
 *
 *   apply    — deterministic, DB-writing, NEVER invents new content. Reads
 *              the generate artifact + `scripts/data/register-pairs.ts`
 *              (Spreektaal spec §3.1) and, for EVERY row of BOTH tables
 *              (not just the multi_answer_free universe — register
 *              acceptance is a general requirement, spec §2.3), computes
 *              the FULL target set = canonical (current DB value) ∪
 *              generate-artifact additions ∪ register expansion of every
 *              answer in that union. Performs a value-guarded
 *              `UPDATE … SET acceptable_answers = <computed>` — skipped
 *              when the computed array already equals the DB value
 *              (data-architect r2 MAJOR: `text[]` has no per-element
 *              uniqueness, so nothing is idempotent for free; apply must
 *              own the WHOLE array's contents, never append, for re-runs to
 *              be exact no-ops). `acceptable_answers[0]` is NEVER
 *              reordered — the runtime grader
 *              (SentenceTransformationExercise.tsx /
 *              ConstrainedTranslationExercise.tsx) reads it as the
 *              canonical target string, so it always stays the human-
 *              authored original at position 0.
 *
 * Usage:
 *   bun scripts/enrich-grammar-acceptable-answers.ts generate [--audit <path>] [--out <path>]
 *   bun scripts/enrich-grammar-acceptable-answers.ts apply [--in <path>] [--dry-run] [--csv <path>]
 *
 * generate requires SUPABASE_SERVICE_KEY (.env.local) — reads the DB, never
 * calls an LLM. apply requires SUPABASE_SERVICE_KEY (.env.local) —
 * --dry-run still reads the DB to produce an accurate report, never writes.
 * Both require, for TLS against the self-signed homelab chain,
 * NODE_EXTRA_CA_CERTS pointed at the Duin Home root CA — never
 * NODE_TLS_REJECT_UNAUTHORIZED=0.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { generateCandidates } from './lib/produceAnswerCandidates'
import { expandRegister, hasInformalToken, type RegisterPairLite } from './lib/registerExpansion'
import { registerPairs } from './data/register-pairs'
import type { AuditReport } from './audit-grammar-produce-answer-freedom'

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

const DEFAULT_AUDIT_PATH = 'scripts/data/grammar-produce-answer-freedom-audit.json'
const DEFAULT_GENERATE_PATH = 'scripts/data/grammar-acceptable-answers-generate.json'

function requireEnv(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
  return { url, key }
}

type TableName = 'sentence_transformation_exercises' | 'constrained_translation_exercises'

export interface GenerateArtifactEntry {
  id: string
  table: TableName
  additionalAnswers: string[]
  restructureNeeded: boolean
}

// ============================================================================
// GENERATE — deterministic rule engine. Reads the DB; NEVER calls an LLM.
// ============================================================================

async function pageAll<T>(db: ReturnType<typeof createClient>, table: string, select: string): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.schema('indonesian').from(table).select(select).range(offset, offset + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

async function runGenerate(): Promise<void> {
  const auditPath = arg('audit') ?? DEFAULT_AUDIT_PATH
  const outPath = arg('out') ?? DEFAULT_GENERATE_PATH
  if (!fs.existsSync(auditPath)) {
    throw new Error(`Audit artifact not found: ${auditPath} — run scripts/audit-grammar-produce-answer-freedom.ts first.`)
  }
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as AuditReport
  const multiAnswerFree = audit.exercises.filter((e) => e.classification === 'multi_answer_free')
  console.log(`Generate — ${multiAnswerFree.length} multi_answer_free exercise(s) from ${auditPath}`)

  const { url, key } = requireEnv()
  const db = createClient(url, key)

  const idsByTable: Record<TableName, string[]> = {
    sentence_transformation_exercises: multiAnswerFree.filter((e) => e.table === 'sentence_transformation_exercises').map((e) => e.id),
    constrained_translation_exercises: multiAnswerFree.filter((e) => e.table === 'constrained_translation_exercises').map((e) => e.id),
  }

  const entries: GenerateArtifactEntry[] = []
  for (const table of Object.keys(idsByTable) as TableName[]) {
    const ids = idsByTable[table]
    if (ids.length === 0) continue
    // Chunk .in() — mirrors enrich-answer-variants.ts / chunkedQuery.ts
    // (Kong's ~8KB request-line ceiling overflows well before 1000 uuids).
    const rows: Array<{ id: string; acceptable_answers: string[] }> = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const { data, error } = await db.schema('indonesian').from(table).select('id, acceptable_answers').in('id', chunk)
      if (error) throw new Error(`${table}: ${error.message}`)
      rows.push(...((data ?? []) as Array<{ id: string; acceptable_answers: string[] }>))
    }
    for (const row of rows) {
      const canonical = row.acceptable_answers[0] ?? ''
      const candidates = generateCandidates(canonical).filter((c) => !row.acceptable_answers.includes(c))
      entries.push({
        id: row.id,
        table,
        additionalAnswers: candidates,
        restructureNeeded: candidates.length === 0,
      })
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n')

  const withCandidates = entries.filter((e) => !e.restructureNeeded)
  const restructureNeeded = entries.filter((e) => e.restructureNeeded)
  console.log(`Wrote ${entries.length} entrie(s) to ${outPath}`)
  console.log(`  ${withCandidates.length} exercise(s) got >=1 candidate answer (total ${withCandidates.reduce((n, e) => n + e.additionalAnswers.length, 0)} candidates)`)
  console.log(`  ${restructureNeeded.length} exercise(s) marked restructureNeeded (no rule matched — step 4, out of scope here)`)
  for (const table of Object.keys(idsByTable) as TableName[]) {
    const tableEntries = entries.filter((e) => e.table === table)
    const tableWith = tableEntries.filter((e) => !e.restructureNeeded).length
    console.log(`  ${table}: ${tableWith}/${tableEntries.length} covered`)
  }
}

// ============================================================================
// APPLY — deterministic. Reads the generate artifact + register-pairs.ts;
// NEVER calls an LLM. Value-guarded full-array UPDATE.
// ============================================================================

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Pure — computes the full target acceptable_answers array for one row.
 *  Exported for unit testing without a live DB.
 *
 *  IDEMPOTENCY NOTE (found via a live-DB re-run 2026-07-10, before this
 *  guard existed): register expansion must NEVER be re-run on an answer
 *  that is already itself a (fully or partially) register-substituted
 *  string — `canonical` on a SECOND apply run is the DB's CURRENT value,
 *  which already contains the FIRST run's register additions mixed in as
 *  ordinary array elements. For an answer with >3 substitutable tokens,
 *  round 1 only ever writes the bounded fallback (substitute-all +
 *  substitute-each-singly, spec §2.3) — but a SINGLY-substituted result
 *  has only (n-1) formal tokens left. Re-expanding it on round 2 can drop
 *  it to <=3 remaining formal tokens, which unlocks the FULL 2^n-1
 *  combination branch for a starting point round 1 never used that branch
 *  for — producing genuinely new combinations every re-run and breaking
 *  the "re-runs are exact no-op" guarantee. Guard: skip expanding any
 *  baseSet element that `hasInformalToken` — i.e., only ever expand
 *  answers that are still fully in the ORIGINAL (formal) register. */
export function computeFullTargetSet(
  canonical: readonly string[],
  generateAdditions: readonly string[],
  registerPairsList: ReadonlyArray<RegisterPairLite>,
): string[] {
  const baseSet = [...canonical]
  for (const a of generateAdditions) if (!baseSet.includes(a)) baseSet.push(a)

  const registerAdditions: string[] = []
  for (const answer of baseSet) {
    if (hasInformalToken(answer, registerPairsList)) continue
    for (const variant of expandRegister(answer, registerPairsList)) {
      if (!baseSet.includes(variant) && !registerAdditions.includes(variant)) registerAdditions.push(variant)
    }
  }
  return [...baseSet, ...registerAdditions]
}

async function runApply(): Promise<void> {
  const inPath = arg('in') ?? DEFAULT_GENERATE_PATH
  const csvPath = arg('csv')
  const dryRun = process.argv.includes('--dry-run')

  if (!fs.existsSync(inPath)) {
    throw new Error(`Generate artifact not found: ${inPath} — run "generate" first, or point --in at a reviewed artifact.`)
  }
  const generateEntries = JSON.parse(fs.readFileSync(inPath, 'utf-8')) as GenerateArtifactEntry[]
  const generateByKey = new Map(generateEntries.map((e) => [`${e.table}/${e.id}`, e]))
  console.log(`Apply — dry-run=${dryRun}, in=${inPath} (${generateEntries.length} generate entrie(s))`)

  const { url, key } = requireEnv()
  const db = createClient(url, key)

  const registerPairsLite: RegisterPairLite[] = (registerPairs as ReadonlyArray<{ formal: string; informal: string }>).map(
    (p) => ({ formal: p.formal, informal: p.informal }),
  )
  console.log(`  ${registerPairsLite.length} register pair(s) loaded from scripts/data/register-pairs.ts`)

  const tables: TableName[] = ['sentence_transformation_exercises', 'constrained_translation_exercises']
  let totalRows = 0
  let totalUpdated = 0
  let totalSkippedNoOp = 0
  const csvRows: string[] = ['table,id,action,before_count,after_count']

  for (const table of tables) {
    const rows = await pageAll<{ id: string; acceptable_answers: string[] }>(db, table, 'id, acceptable_answers')
    totalRows += rows.length
    let updatedThisTable = 0

    for (const row of rows) {
      const generateEntry = generateByKey.get(`${table}/${row.id}`)
      const generateAdditions = generateEntry?.additionalAnswers ?? []
      const fullTarget = computeFullTargetSet(row.acceptable_answers, generateAdditions, registerPairsLite)

      if (arraysEqual(fullTarget, row.acceptable_answers)) {
        totalSkippedNoOp++
        continue
      }

      csvRows.push(`${table},${row.id},${dryRun ? 'would_update' : 'updated'},${row.acceptable_answers.length},${fullTarget.length}`)
      updatedThisTable++
      totalUpdated++

      if (!dryRun) {
        const { error } = await db.schema('indonesian').from(table).update({ acceptable_answers: fullTarget }).eq('id', row.id)
        if (error) throw new Error(`${table}/${row.id}: ${error.message}`)
      }
    }
    console.log(`  ${table}: ${rows.length} row(s) checked, ${updatedThisTable} ${dryRun ? 'would be updated' : 'updated'}`)
  }

  if (csvPath) {
    fs.writeFileSync(csvPath, csvRows.join('\n'))
    console.log(`  Wrote report to ${csvPath}`)
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total: ${totalRows} row(s) checked, ${totalUpdated} ${dryRun ? 'would be' : ''} updated, ${totalSkippedNoOp} already-converged (skipped, value-guard).`)
}

// ── CLI entry ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = process.argv[2]
  if (mode === 'generate') {
    await runGenerate()
  } else if (mode === 'apply') {
    await runApply()
  } else {
    console.error('Usage:')
    console.error('  bun scripts/enrich-grammar-acceptable-answers.ts generate [--audit <path>] [--out <path>]')
    console.error('  bun scripts/enrich-grammar-acceptable-answers.ts apply [--in <path>] [--dry-run] [--csv <path>]')
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
