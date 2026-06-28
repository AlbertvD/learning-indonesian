#!/usr/bin/env bun
// Quality gate for story-podcast follow-along timings. Verifies that an episode's
// per-word timings are sane: monotonic starts, no "collapse runs" (≥3 words
// bunched into one instant — the signature of STT dropping a chunk, which makes
// the reader skip a sentence and hover). Long single-word holds are reported as
// warnings (a word legitimately staying lit through an inter-sentence pause).
//
// Usage:
//   bun scripts/podcasts/check-timings.ts [record.json ...]   # default: all generated records
// Exit 1 if any episode fails (collapse run or non-monotonic) — usable as a gate.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TranscriptSegment } from '@/services/podcastService'

const GENERATED_DIR = resolve('scripts/data/generated-podcasts')
const COLLAPSE_SPAN = 0.15 // seconds: ≥3 word-starts inside this window = a collapse
const COLLAPSE_MIN_WORDS = 3
const LONG_HOLD = 2.5 // seconds between consecutive word starts = a held word (warning)

export interface TimingReport {
  words: number
  durationS: number
  monotonic: boolean
  collapseRuns: number
  longHolds: number
  ok: boolean
}

/** Pure: analyse an episode's segments for follow-along timing health. */
export function analyzeTimings(segments: TranscriptSegment[]): TimingReport {
  const words = segments.flatMap((s) => s.words ?? [])
  const starts = words.map((w) => w.start)

  const monotonic = starts.every((s, i) => i === 0 || starts[i - 1] <= s)
  const longHolds = starts.filter((s, i) => i > 0 && s - starts[i - 1] > LONG_HOLD).length

  let collapseRuns = 0
  let i = 0
  while (i < starts.length) {
    let j = i
    while (j + 1 < starts.length && starts[j + 1] - starts[i] < COLLAPSE_SPAN) j++
    if (j - i + 1 >= COLLAPSE_MIN_WORDS) collapseRuns++
    i = j > i ? j + 1 : i + 1
  }

  return {
    words: words.length,
    durationS: words.length ? words[words.length - 1].end : 0,
    monotonic,
    collapseRuns,
    longHolds,
    ok: monotonic && collapseRuns === 0,
  }
}

function main() {
  const args = process.argv.slice(2)
  const files = args.length
    ? args
    : readdirSync(GENERATED_DIR).filter((f) => f.endsWith('.json')).map((f) => resolve(GENERATED_DIR, f))

  let failed = 0
  for (const file of files) {
    const record = JSON.parse(readFileSync(file, 'utf8')) as { transcript_segments?: TranscriptSegment[] | null }
    const r = analyzeTimings(record.transcript_segments ?? [])
    const name = file.split('/').pop()
    const flag = r.ok ? '✓' : '✗'
    const warn = r.longHolds ? ` (⚠ ${r.longHolds} holds>${LONG_HOLD}s)` : ''
    console.log(`  ${flag} ${name}  ${r.words}w ${r.durationS.toFixed(0)}s  collapse=${r.collapseRuns} mono=${r.monotonic}${warn}`)
    if (!r.ok) failed++
  }
  console.log(failed ? `\n✗ ${failed}/${files.length} episode(s) failed timing check` : `\n✓ all ${files.length} clean`)
  if (failed) process.exit(1)
}

if (import.meta.main) main()
