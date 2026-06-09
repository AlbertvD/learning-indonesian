#!/usr/bin/env bun
/**
 * capability-readback.ts — independent ground-truth read-back of what Stage B
 * (the capability stage) landed for one lesson.
 *
 * The Stage B JSON report's `counts` are already CS7-verified (DB >= declared),
 * but the project rule is "only ground-truth queries catch data-completeness
 * gaps" (memory/feedback_post_pr_verification). This corroborates the report
 * with a fresh outside query and — crucially — shows the *schedulable* state:
 * how many of the lesson's capabilities actually reached
 * readiness_status=ready / publication_status=published (the phase-13 promotion
 * step). A capability written but stuck in `draft` is a silent failure this
 * surfaces.
 *
 * Anchor: `learning_capabilities.lesson_id` (ADR 0006 — every lesson-derived
 * capability carries lesson_id). content_units + capability_artifacts have no
 * lesson column, so they are counted by capability-id membership via the
 * capability_content_units junction / capability_id FK. grammar_patterns is
 * keyed by introduced_by_lesson_id; exercise_variants by lesson_id.
 * learning_items has NO lesson_id (items dedup by normalized_text across
 * lessons), so its surface is represented by the item-kind capabilities instead.
 *
 * Env (auto-loaded from .env.local by bun): VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY.
 *
 * Usage:
 *   bun .claude/skills/capability-stage/scripts/capability-readback.ts <lessonNumber>
 *   bun .../capability-readback.ts <lessonNumber> --json   # machine-readable
 *   bun .../capability-readback.ts <lessonNumber> --gate   # ASSERT + write capture + 0/1 exit
 *
 * `--gate` is the hard DQ gate the Stop hook enforces. It runs the same
 * ground-truth read-back, then ASSERTS the capability surface is actually
 * schedulable — `total > 0`, ZERO active caps stuck in draft/null (the
 * `status: partial` silent failure: rows written but phase-13 promotion
 * skipped), and the read-back itself completed (no gateway ERR hiding a gap) —
 * writes the verdict to `.claude/data/capability-report-<N>.json`, and exits
 * non-zero if any assertion fails. A capability DQ gap cannot reach "done".
 */

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // homelab Step-CA cert

const lessonNumber = parseInt(process.argv[2], 10)
const asJson = process.argv.includes('--json')
const asGate = process.argv.includes('--gate')
if (isNaN(lessonNumber)) {
  console.error('Usage: bun capability-readback.ts <lessonNumber> [--json | --gate]')
  process.exit(2)
}
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (in .env.local).')
  process.exit(2)
}

const sb = createClient(url, key, { db: { schema: 'indonesian' }, auth: { persistSession: false } })

function tally(rows: Array<Record<string, unknown>>, col: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = String(r[col] ?? 'null')
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

// Keep .in() lists short: a long `in.(uuid,uuid,…)` URL trips Kong (502 "invalid
// response from upstream"). 50 UUIDs ≈ a 2KB URL — comfortably under the limit.
const CHUNK = 50

/** Retry a query once on a transient gateway error (Kong 502/empty-body). */
async function withRetry<T>(fn: () => Promise<{ data: T; error: { message?: string } | null }>) {
  let last = await fn()
  if (last.error) last = await fn()
  return last
}

/** Count a table where `col` IN a (possibly large) id list, chunked for URL limits. */
async function countByMembership(table: string, col: string, ids: string[]): Promise<number | string> {
  if (ids.length === 0) return 0
  let total = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error, count } = await withRetry(async () => {
      const r = await sb.from(table).select('*', { count: 'exact', head: true }).in(col, chunk)
      return { data: r.count ?? 0, error: r.error }
    }).then((r) => ({ error: r.error, count: r.data }))
    if (error) return `ERR ${error.message ?? 'gateway error'}`
    total += count ?? 0
  }
  return total
}

/** Distinct content_unit_ids referenced by this lesson's capabilities. */
async function distinctContentUnits(capIds: string[]): Promise<number | string> {
  if (capIds.length === 0) return 0
  const seen = new Set<string>()
  for (let i = 0; i < capIds.length; i += CHUNK) {
    const chunk = capIds.slice(i, i + CHUNK)
    const { data, error } = await withRetry(() =>
      sb.from('capability_content_units').select('content_unit_id').in('capability_id', chunk),
    )
    if (error) return `ERR ${error.message ?? 'gateway error'}`
    for (const r of (data as Array<{ content_unit_id?: unknown }> | null) ?? []) {
      if (r.content_unit_id) seen.add(String(r.content_unit_id))
    }
  }
  return seen.size
}

async function countForLesson(table: string, col: string, lessonId: string): Promise<number | string> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(col, lessonId)
  return error ? `ERR ${error.message}` : (count ?? 0)
}

async function main() {
  // Resolve the lesson uuid from its 1-based order_index (the "lesson number").
  const { data: lesson, error: lerr } = await sb
    .from('lessons')
    .select('id, title, level, order_index')
    .eq('order_index', lessonNumber)
    .maybeSingle()
  if (lerr) {
    console.error('Failed to read lessons row:', lerr.message)
    process.exit(1)
  }
  if (!lesson) {
    console.error(`No lessons row with order_index=${lessonNumber} — Stage A may not have run yet.`)
    process.exit(1)
  }
  const lessonId = lesson.id as string

  // The spine: every capability for this lesson, with its promotion state.
  // retired_at is included so soft-retired caps (e.g. legacy pattern caps the
  // pattern-path cutover replaced) are excluded from the active/schedulable
  // surface — they are correctly retired, NOT stuck-draft. Counting them in the
  // "draft" total falsely reads as an unschedulable backlog.
  const { data: caps, error: cerr } = await sb
    .from('learning_capabilities')
    .select('id, source_kind, readiness_status, publication_status, retired_at')
    .eq('lesson_id', lessonId)
  if (cerr) {
    console.error('Failed to read learning_capabilities:', cerr.message)
    process.exit(1)
  }
  const allRows = caps ?? []
  const capRows = allRows.filter((c) => !c.retired_at) // active surface
  const retiredCount = allRows.length - capRows.length
  const capIds = capRows.map((c) => String(c.id))

  const report = {
    lesson: { id: lessonId, title: lesson.title, level: lesson.level, number: lesson.order_index },
    capabilities: {
      total: capRows.length,
      retired: retiredCount,
      bySourceKind: tally(capRows, 'source_kind'),
      byReadiness: tally(capRows, 'readiness_status'),
      byPublication: tally(capRows, 'publication_status'),
    },
    contentUnits: await distinctContentUnits(capIds),
    capabilityArtifacts: await countByMembership('capability_artifacts', 'capability_id', capIds),
    grammarPatterns: await countForLesson('grammar_patterns', 'introduced_by_lesson_id', lessonId),
    exerciseVariants: await countForLesson('exercise_variants', 'lesson_id', lessonId),
  }

  if (asGate) {
    const draft = (report.capabilities.byPublication['draft'] ?? 0) + (report.capabilities.byPublication['null'] ?? 0)
    // A string value means a count query returned an ERR (gateway/Kong) — the
    // read-back is incomplete and could be HIDING a gap, so it fails the gate.
    const errCounts = (['contentUnits', 'capabilityArtifacts', 'grammarPatterns', 'exerciseVariants'] as const)
      .filter((k) => typeof report[k] === 'string')
    const checks = [
      { name: 'capabilities-exist', ok: report.capabilities.total > 0, detail: `${report.capabilities.total} active capabilities` },
      { name: 'no-stuck-drafts', ok: draft === 0, detail: draft === 0 ? 'every active capability is published/schedulable' : `${draft} active cap(s) draft/null — phase-13 promotion did not land (status=partial?)` },
      { name: 'readback-complete', ok: errCounts.length === 0, detail: errCounts.length === 0 ? 'all count queries succeeded' : `gateway ERR on: ${errCounts.join(', ')}` },
    ]
    const ok = checks.every((c) => c.ok)
    for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`)
    const capturePath = `${process.cwd()}/.claude/data/capability-report-${lessonNumber}.json`
    mkdirSync(`${process.cwd()}/.claude/data`, { recursive: true })
    writeFileSync(capturePath, JSON.stringify({ lesson: lessonNumber, mode: 'gate', ok, generatedAt: new Date().toISOString(), checks, report }, null, 2), 'utf8')
    console.log(`\n${ok ? '✓ CAPABILITY GATE PASSED' : '✗ CAPABILITY GATE FAILED'} — capture: ${capturePath}`)
    if (!ok) console.log('  (re-publish to promote stuck drafts, or --regenerate the bad item/pattern, then re-run the gate; idempotent — ADR 0011)')
    process.exit(ok ? 0 : 1)
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(0)
  }

  console.log(`lesson ${report.lesson.number}: "${report.lesson.title}" (${report.lesson.level}) — ${lessonId}`)
  console.log(`\nlearning_capabilities (active, lesson_id): ${report.capabilities.total}${retiredCount > 0 ? ` (+${retiredCount} soft-retired, excluded)` : ''}`)
  console.log(`  by source_kind:  ${JSON.stringify(report.capabilities.bySourceKind)}`)
  console.log(`  by readiness:    ${JSON.stringify(report.capabilities.byReadiness)}`)
  console.log(`  by publication:  ${JSON.stringify(report.capabilities.byPublication)}`)
  const draft = (report.capabilities.byPublication['draft'] ?? 0) + (report.capabilities.byPublication['null'] ?? 0)
  if (draft > 0) {
    console.log(`  ⚠ ${draft} ACTIVE capabilit${draft === 1 ? 'y is' : 'ies are'} NOT published (draft/null, not retired) — phase-13 promotion did not land them; written but NOT schedulable.`)
  } else {
    console.log(`  ✓ every active capability is published/schedulable.`)
  }
  console.log(`\ncontent_units (via junction):    ${report.contentUnits}`)
  console.log(`capability_artifacts (by cap_id): ${report.capabilityArtifacts}`)
  console.log(`grammar_patterns (introduced_by): ${report.grammarPatterns}`)
  console.log(`exercise_variants (lesson_id):    ${report.exerciseVariants}`)
  console.log(`\nCompare these against the Stage B report's \`counts\` (parse-report.ts). Divergence = a flag.`)
  process.exit(0)
}

main()
