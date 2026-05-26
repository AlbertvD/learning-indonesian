#!/usr/bin/env bun
/**
 * parse-report.ts — summarise a publish run's JSON stage report(s).
 *
 * The publish CLIs (`publish-lesson-content.ts`, `publish-approved-content.ts`)
 * print human text interleaved with one or two pretty-printed JSON stage
 * reports. This extracts every balanced top-level `{…}` JSON object that looks
 * like a stage report (`status` + `counts`) and prints a compact summary:
 * status, counts, and findings grouped by gate/severity. Saves every pipeline
 * run from hand-rolling a brace-matching extractor (which is easy to get wrong).
 *
 * Usage:
 *   bun .../scripts/parse-report.ts <file>     # parse a saved publish stdout
 *   <command> | bun .../scripts/parse-report.ts  # or pipe stdin
 */

import { readFileSync } from 'fs'

function readInput(): string {
  const arg = process.argv[2]
  if (arg) return readFileSync(arg, 'utf8')
  return readFileSync(0, 'utf8') // stdin
}

/** Extract every balanced top-level {...} block and JSON.parse what we can. */
function extractJsonObjects(text: string): any[] {
  const objs: any[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          objs.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          /* not valid JSON — skip */
        }
        start = -1
      }
    }
  }
  return objs
}

function main() {
  const text = readInput()
  const stages = extractJsonObjects(text).filter((o) => o && o.status && o.counts)
  if (stages.length === 0) {
    console.log('No stage report found in input. (Publish may have failed before printing one — check stderr.)')
    process.exit(2)
  }
  const names = ['Stage A (Lesson Gate)', 'Stage B (capability gate)']
  let anyError = false
  stages.forEach((o, i) => {
    const by: Record<string, number> = {}
    for (const f of o.findings ?? []) by[`${f.gate}/${f.severity}`] = (by[`${f.gate}/${f.severity}`] ?? 0) + 1
    const errors = (o.findings ?? []).filter((f: any) => f.severity === 'error')
    if (errors.length) anyError = true
    console.log(`\n${names[i] ?? `stage ${i}`}: status=${o.status}`)
    if (o.lesson) console.log(`  lesson: ${JSON.stringify(o.lesson)}`)
    console.log(`  counts: ${JSON.stringify(o.counts)}`)
    console.log(`  findings: ${(o.findings ?? []).length}${Object.keys(by).length ? ` → ${JSON.stringify(by)}` : ''}`)
    // Audio coverage flag — a lesson with dialogue/vocab but 0 clips needs the
    // separate audio pipeline (see SKILL.md).
    if (o.counts && 'audioClipsSynthesised' in o.counts) {
      const total = (o.counts.audioClipsSynthesised ?? 0) + (o.counts.audioClipsReused ?? 0)
      if (total === 0) console.log('  ⚠ audio: 0 clips — run the audio pipeline (needs GOOGLE_TTS_API_KEY + voices).')
    }
    for (const f of errors.slice(0, 8)) console.log(`    ✗ ${f.gate}: ${f.message}`)
  })
  process.exit(anyError ? 1 : 0)
}

main()
