#!/usr/bin/env bun
// Curate a StoryWeaver (or similar) PDF into a clean source .txt for the story
// podcast pipeline's adapt mode. Strips the cover header, N/M page-number
// markers, the "This book was made possible…" credits block, and any non-
// narrative appendix (glossary / bulleted facts) — leaving only the story prose,
// one paragraph per page spread. See the `story-podcast` skill for the workflow.
//
// Usage: bun scripts/podcasts/curate-source.ts <input.pdf> <output.txt>
// Requires `pdftotext` (poppler: `brew install poppler`).

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const HEADER = /^(Author|Illustrator|Translator|Original Publisher|Publisher)\s*:/i
const PAGE_NUM = /^\s*\d+\s*\/\s*\d+\s*$/
const CREDITS = 'This book was made possible'

/**
 * Pure: turn raw `pdftotext` output into clean story prose. Cuts the credits
 * block and any glossary/bulleted appendix, drops the cover header and page
 * numbers, and joins wrapped lines into page-delimited paragraphs.
 */
export function curateSourceText(raw: string): string {
  let lines = raw.split('\n')

  // Cut everything from the credits boilerplate onward.
  const creditsAt = lines.findIndex((l) => l.includes(CREDITS))
  if (creditsAt >= 0) lines = lines.slice(0, creditsAt)

  // Story starts after the last cover-header line (Author/Illustrator/…) near the top.
  let lastHeader = -1
  lines.slice(0, 12).forEach((l, i) => {
    if (HEADER.test(l.trim())) lastHeader = i
  })
  // The title sits just above the header block; drop both. With no recognizable
  // header, keep every line (don't guess that line 0 is a throwaway title).
  const story = lastHeader >= 0 ? lines.slice(lastHeader + 1) : lines

  const paragraphs: string[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length) paragraphs.push(cur.join(' '))
    cur = []
  }
  for (const line of story) {
    const s = line.trim()
    if (!s) continue
    // Stop at a non-narrative appendix (glossary or bulleted facts).
    if (/^Glosarium/i.test(s) || s.startsWith('•')) break
    if (PAGE_NUM.test(s)) { flush(); continue } // page boundary → paragraph break
    cur.push(s)
  }
  flush()

  return paragraphs.join('\n\n').trim() + '\n'
}

function main() {
  const [pdf, out] = [process.argv[2], process.argv[3]]
  if (!pdf || !out) {
    console.error('Usage: bun scripts/podcasts/curate-source.ts <input.pdf> <output.txt>')
    process.exit(2)
  }
  const raw = execFileSync('pdftotext', ['-nopgbrk', pdf, '-'], { encoding: 'utf8' })
  const text = curateSourceText(raw)
  writeFileSync(out, text)
  console.log(`${out}: ${text.split('\n\n').length} paragraphs, ${text.split(/\s+/).filter(Boolean).length} words`)
}

if (import.meta.main) main()
