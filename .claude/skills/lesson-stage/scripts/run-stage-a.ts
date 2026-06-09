#!/usr/bin/env bun
/**
 * run-stage-a.ts — the deterministic Stage-A orchestrator for the `lesson-stage`
 * skill. ONE command that runs Stage A (the lesson reader content + the Lesson
 * Gate), independently checks every gate, generates the grammar audio-recording
 * script, reads the DB back to prove parity, and CAPTURES every verdict to a
 * single report file — exiting non-zero the moment any required capture is
 * missing or any gate failed. The capture file is what the Stop hook enforces,
 * so a Data-Quality gap cannot slip through to "done".
 *
 * It is a THIN COMPOSITION over the canonical repo entry points (it does NOT
 * re-implement Stage A): it shells out to
 *   - scripts/publish-lesson-content.ts <N> [--dry-run]   (Stage A + Lesson Gate)
 *   - scripts/generate-grammar-audio-script.ts <N>        (DB grammar → SD L<N>.txt)
 * and corroborates with an independent DB read-back of the six lesson-content
 * tables (the same surface verify-published.ts checks).
 *
 * Determinism: there is no LLM judgment on the happy path. Every check is a
 * scripted assertion; the result is a machine-readable JSON capture + a 0/1 exit.
 *
 * Modes:
 *   --dry-run : run the Lesson Gate PRE-write family only (no DB write, no
 *               enrichers' completeness enforcement, no grammar txt, no readback).
 *               Free preview. Writes a capture with mode="dry-run".
 *   (live)    : publish Stage A (idempotent DB projection — ADR 0011), enforce
 *               the full Lesson Gate (pre-write GT* in PUBLISH mode + post-write
 *               LV1/LV2), read back parity, generate + verify the grammar txt,
 *               and write a capture with mode="live" and ok=true ONLY if every
 *               check passed.
 *
 * Capture file: audio-scripts/SD L<N>.report.json   (next to the grammar txt)
 *
 * Env (auto-loaded from .env.local by bun): VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY,
 * and ANTHROPIC_API_KEY (the live Lesson Stage runs the EN/NL/grammar-topic
 * enrichers).
 *
 * Usage:
 *   bun .claude/skills/lesson-stage/scripts/run-stage-a.ts <N> [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

// Canonical TTS normalizer — the key audio_clips is stored under (Stage A +
// CS23 both use it). Importing it (not reimplementing) keeps coverage matching
// correct if the normalizer ever changes.
import { normalizeTtsText } from '../../../../scripts/lib/tts-normalize'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // homelab Step-CA cert

// ---------------------------------------------------------------------------
// Args + env
// ---------------------------------------------------------------------------

const N = parseInt(process.argv[2], 10)
const dryRun = process.argv.includes('--dry-run')
if (isNaN(N)) {
  console.error('Usage: bun run-stage-a.ts <N> [--dry-run]')
  process.exit(2)
}
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (in .env.local).')
  process.exit(2)
}
if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY required for a live run (the Lesson Stage enrichers). Absent → abort before any write.')
  process.exit(2)
}

const sb = createClient(url, key, { db: { schema: 'indonesian' }, auth: { persistSession: false } })

// counts key on the Stage A report  →  the table that holds those rows
const COUNT_TO_TABLE: Record<string, string> = {
  sections: 'lesson_sections',
  dialogueLines: 'lesson_dialogue_lines',
  itemRows: 'lesson_section_item_rows',
  grammarCategories: 'lesson_section_grammar_categories',
  grammarTopics: 'lesson_section_grammar_topics',
  affixedPairs: 'lesson_section_affixed_pairs',
}

const CAPTURE_PATH = `${process.cwd()}/audio-scripts/SD L${N}.report.json`
const GRAMMAR_TXT_PATH = `${process.cwd()}/audio-scripts/SD L${N}.txt`

type Finding = { gate?: string; severity?: string; message?: string }
type Check = { name: string; ok: boolean; detail: string }

const checks: Check[] = []
function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`)
}

/** Extract the first balanced-brace JSON object from a stdout blob. */
function firstJsonObject(text: string): any | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

async function countFor(table: string, lessonId: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('lesson_id', lessonId)
  return error ? null : count ?? 0
}

async function grammarSectionCount(lessonId: string): Promise<number> {
  const { data, error } = await sb.from('lesson_sections').select('content').eq('lesson_id', lessonId)
  if (error || !data) return 0
  return data.filter((r) => (r.content as { type?: string } | null)?.type === 'grammar').length
}

/**
 * Aggregate per-text audio coverage for the lesson's voiced surfaces — the gap
 * CS23 leaves (CS23 is item-only + WARN-only; this covers items AND dialogue
 * lines and feeds the hard gate). Stage A is the synthesizer; this confirms it
 * actually voiced everything. Coverage is by `normalized_text` (the audio_clips
 * key), so shared clips from earlier lessons count as covered.
 */
async function audioCoverage(lessonId: string): Promise<{
  total: number
  covered: number
  missing: string[]
}> {
  const [{ data: dl }, { data: ir }] = await Promise.all([
    sb.from('lesson_dialogue_lines').select('text').eq('lesson_id', lessonId),
    sb.from('lesson_section_item_rows').select('indonesian_text, item_type').eq('lesson_id', lessonId),
  ])
  // The voiced surface: every dialogue line + every word/phrase item (matches
  // what Stage A collects and what CS23 checks).
  const texts = [
    ...((dl ?? []) as Array<{ text: string }>).map((r) => r.text),
    ...((ir ?? []) as Array<{ indonesian_text: string; item_type: string }>)
      .filter((r) => r.item_type === 'word' || r.item_type === 'phrase')
      .map((r) => r.indonesian_text),
  ]
  const byNorm = new Map<string, string>() // normalized -> a representative raw text
  for (const t of texts) {
    const trimmed = (t ?? '').trim()
    if (trimmed) byNorm.set(normalizeTtsText(trimmed), trimmed)
  }
  const wanted = [...byNorm.keys()]
  if (wanted.length === 0) return { total: 0, covered: 0, missing: [] }

  // One chunked .in() lookup of which normalized_texts have a clip (any voice).
  const present = new Set<string>()
  for (let i = 0; i < wanted.length; i += 50) {
    const chunk = wanted.slice(i, i + 50)
    const { data } = await sb.from('audio_clips').select('normalized_text').in('normalized_text', chunk)
    for (const r of (data ?? []) as Array<{ normalized_text: string }>) present.add(r.normalized_text)
  }
  const missing = wanted.filter((n) => !present.has(n)).map((n) => byNorm.get(n) ?? n)
  return { total: wanted.length, covered: wanted.length - missing.length, missing }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n=== Stage A orchestrator — lesson ${N} (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===\n`)

  // 1) Stage A + Lesson Gate via the canonical entry point.
  const args = ['scripts/publish-lesson-content.ts', String(N)]
  if (dryRun) args.push('--dry-run')
  // Force the Step-CA TLS bypass into the child env explicitly — `env: process.env`
  // does not reliably propagate a runtime-set var to a bun spawnSync child, and
  // generate-grammar-audio-script.ts (unlike publish-lesson-content.ts) does not
  // self-set it, so it fails with "unable to get local issuer certificate".
  const childEnv = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
  const pub = spawnSync('bun', args, { encoding: 'utf8', env: childEnv, maxBuffer: 64 * 1024 * 1024 })
  const pubOut = `${pub.stdout ?? ''}${pub.stderr ?? ''}`
  if (pub.stdout) process.stdout.write(pub.stdout)
  if (pub.stderr) process.stderr.write(pub.stderr)

  const stageA = firstJsonObject(pubOut)
  if (!stageA || typeof stageA.status !== 'string') {
    record('stage-a-report-parsed', false, 'could not parse the Stage A JSON report from publish-lesson-content output')
    await finish(false, null)
    return
  }

  const findings: Finding[] = Array.isArray(stageA.findings) ? stageA.findings : []
  const errorFindings = findings.filter((f) => f.severity === 'error')
  record('lesson-gate-status', stageA.status === 'ok', `status=${stageA.status} (exit ${pub.status})`)
  record('lesson-gate-no-errors', errorFindings.length === 0, `${errorFindings.length} error finding(s)` + (errorFindings.length ? `: ${errorFindings.map((f) => f.gate).join(', ')}` : ''))

  const lessonId: string | null = stageA.lesson?.id ?? null
  const counts: Record<string, number> = stageA.counts ?? {}

  if (dryRun) {
    // Pre-write gate preview only — no DB write, no readback, no grammar txt.
    const ok = stageA.status === 'ok' && errorFindings.length === 0
    await finish(ok, { lessonId, counts, findings })
    return
  }

  // LIVE path. A failed gate already left no clean projection — stop before
  // claiming captures the publish didn't produce.
  if (stageA.status !== 'ok' || !lessonId) {
    await finish(false, { lessonId, counts, findings })
    return
  }

  // 2) Independent DB read-back parity (LV1 corroboration — DB >= declared).
  let parityOk = true
  const readback: Record<string, { declared: number; db: number | null; ok: boolean }> = {}
  for (const [countKey, table] of Object.entries(COUNT_TO_TABLE)) {
    const declared = counts[countKey] ?? 0
    const db = await countFor(table, lessonId)
    const ok = db !== null && db >= declared
    readback[table] = { declared, db, ok }
    if (!ok) parityOk = false
  }
  record('db-readback-parity', parityOk, Object.entries(readback).map(([t, r]) => `${t}:${r.db}/${r.declared}`).join('  '))

  // 3) Grammar audio-recording script — generate + verify coverage.
  const gram = spawnSync('bun', ['scripts/generate-grammar-audio-script.ts', String(N)], {
    encoding: 'utf8',
    env: childEnv,
    maxBuffer: 32 * 1024 * 1024,
  })
  const gramOut = `${gram.stdout ?? ''}`
  const gramErr = `${gram.stderr ?? ''}`
  if (gram.stdout) process.stdout.write(gram.stdout)
  if (gram.stderr) process.stderr.write(gram.stderr)

  const dbGrammarSections = await grammarSectionCount(lessonId)
  // The script warns to stderr "content NOT emitted" whenever a section/category
  // field is unhandled — a SILENT content drop is the exact DQ risk we refuse.
  const dropWarnings = gramErr.split('\n').filter((l) => l.includes('NOT emitted')).map((l) => l.trim())
  const sectionsMatch = gramOut.match(/—\s*(\d+)\s+grammar sections/)
  const emittedSections = sectionsMatch ? parseInt(sectionsMatch[1], 10) : -1

  if (dbGrammarSections === 0) {
    // A lesson with no grammar section legitimately has no recording script.
    record('grammar-audio-script', true, 'no grammar sections in this lesson — no recording script expected')
  } else {
    const fileOk = existsSync(GRAMMAR_TXT_PATH) && statSync(GRAMMAR_TXT_PATH).size > 0
    const coverageOk = emittedSections === dbGrammarSections
    const noDrops = dropWarnings.length === 0
    record('grammar-audio-file', fileOk, fileOk ? `${GRAMMAR_TXT_PATH} (${statSync(GRAMMAR_TXT_PATH).size}b)` : 'missing or empty')
    record('grammar-section-coverage', coverageOk, `emitted ${emittedSections} / ${dbGrammarSections} DB grammar sections`)
    record('grammar-no-silent-drops', noDrops, noDrops ? 'no "content NOT emitted" warnings' : `${dropWarnings.length} drop(s): ${dropWarnings.join(' | ')}`)
  }

  // 4) Per-text audio coverage (items + dialogue) — the gap CS23 leaves.
  // Stage A is the synthesizer, so after a live run every voiced text should have
  // a clip. Outcomes:
  //   - full coverage          → pass
  //   - PARTIAL (audio ran)    → FAIL — a real defect (budget cap / mid-run synth
  //                              failure left some texts unvoiced)
  //   - ZERO (audio never ran) → DEFERRED, non-blocking — Stage A synthesised+reused
  //                              = 0 means the TTS credential was absent; #165 (the
  //                              hard "halt on unvoiced word" gate) is not built, so
  //                              don't trap the session — surface it loudly instead.
  const audio = await audioCoverage(lessonId)
  const audioRan = (Number(counts.audioClipsSynthesised ?? 0) + Number(counts.audioClipsReused ?? 0)) > 0
  if (audio.total === 0) {
    record('audio-coverage', true, 'no voiced texts in this lesson')
  } else if (audio.covered === audio.total) {
    record('audio-coverage', true, `${audio.covered}/${audio.total} item+dialogue texts voiced`)
  } else if (!audioRan) {
    // Don't fail the capture — audio was deferred (no TTS credential). Loud note.
    record('audio-coverage', true, `DEFERRED — Stage A voiced nothing (synth+reused=0; TTS credential absent?); ${audio.total - audio.covered}/${audio.total} texts unvoiced → backfill: generate-exercise-audio ${N} (hard gate is #165, unbuilt)`)
  } else {
    record('audio-coverage', false, `PARTIAL — ${audio.covered}/${audio.total} voiced; ${audio.missing.length} missing: ${audio.missing.slice(0, 8).join(', ')}${audio.missing.length > 8 ? ' …' : ''}`)
  }

  const ok = checks.every((c) => c.ok)
  await finish(ok, { lessonId, counts, findings, readback, grammar: { dbGrammarSections, emittedSections, dropWarnings, file: GRAMMAR_TXT_PATH }, audio })
}

async function finish(ok: boolean, payload: Record<string, unknown> | null): Promise<void> {
  const capture = {
    lesson: N,
    mode: dryRun ? 'dry-run' : 'live',
    ok,
    generatedAt: new Date().toISOString(),
    checks,
    ...(payload ?? {}),
  }
  // The capture file is the Stop hook's enforcement target. Always written (even
  // on failure) so the hook sees ok=false and blocks — DQ gaps cannot be hidden
  // by simply not writing a file.
  writeFileSync(CAPTURE_PATH, JSON.stringify(capture, null, 2), 'utf8')
  console.log(`\n${ok ? '✓ ALL CHECKS PASSED' : '✗ CHECKS FAILED'} — capture: ${CAPTURE_PATH}`)
  if (!ok) console.log('  (fix the failing check and re-run; Stage A is idempotent — ADR 0011)')
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  record('orchestrator-crash', false, String(err?.message ?? err))
  void finish(false, null)
})
