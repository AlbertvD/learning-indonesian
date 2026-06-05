/**
 * Enforcement gate (Slice 5b, #147): no runtime code in the capability-stage
 * deep module may WRITE cloze `item_contexts` rows. projectCloze + the
 * `upsertClozeContext` adapter are retired — the authored cloze item_contexts
 * are DB-authoritative (ADR 0011 seed-once) and are #148's item-cloze substrate.
 * This stage must never re-seed them.
 *
 * The guard scans capability-stage source (excluding tests) for any reference to
 * the retired `upsertClozeContext` writer. A reappearance — import or call — is
 * an accidental re-seed of #148's substrate and fails this test. This mirrors
 * the grep-guard idiom in `noExerciseVariantsReader.test.ts` / `noDiskReads.test.ts`.
 *
 * SCOPE: the `upsertClozeContext` identifier in non-test capability-stage source.
 * The token appearing in a comment is the only allowed occurrence (the retirement
 * notes reference it by name), so the guard matches the identifier as a call or
 * import, not inside a line comment.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// capability-stage root, relative to this test file:
// scripts/lib/pipeline/capability-stage/__tests__/enforcement/ → capability-stage/
const STAGE_ROOT = path.resolve(__dirname, '../../')

function collectTsFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      result.push(...collectTsFiles(path.join(dir, entry.name)))
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.')
    ) {
      result.push(path.join(dir, entry.name))
    }
  }
  return result
}

// A reference is the identifier appearing on a non-comment line. We strip
// `//`-style line comments before matching so the retirement notes (which name
// the retired writer in prose) don't trip the guard.
function findClozeWriterReferences(): Array<{ file: string; line: number; text: string }> {
  const offenders: Array<{ file: string; line: number; text: string }> = []
  for (const file of collectTsFiles(STAGE_ROOT)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((raw, idx) => {
      // Strip `//` line comments AND JSDoc/block-comment lines (leading `*`)
      // so prose that names the retired writer doesn't trip the guard — only a
      // real call/import counts.
      if (/^\s*\*/.test(raw)) return
      const code = raw.replace(/\/\/.*$/, '')
      if (/\bupsertClozeContext\b/.test(code)) {
        offenders.push({ file: path.relative(STAGE_ROOT, file), line: idx + 1, text: raw.trim() })
      }
    })
  }
  return offenders
}

describe('enforcement: capability stage does not re-seed cloze item_contexts (#147)', () => {
  it('no capability-stage source imports or calls upsertClozeContext', () => {
    const offenders = findClozeWriterReferences()
    expect(
      offenders,
      `upsertClozeContext was retired in Slice 5b — the authored cloze item_contexts are ` +
        `#148's DB substrate and must not be re-seeded. Offending references:\n` +
        offenders.map((o) => `  ${o.file}:${o.line}  ${o.text}`).join('\n'),
    ).toEqual([])
  })
})
