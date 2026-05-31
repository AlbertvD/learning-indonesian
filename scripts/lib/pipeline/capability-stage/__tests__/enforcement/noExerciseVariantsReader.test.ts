/**
 * Enforcement gate (Slice 2, Task 1): no runtime code in `src/` may READ the
 * legacy `exercise_variants` table. PR 4 cut the exercise *renderers* over to
 * the 4 typed grammar-exercise tables, and exerciseReviewService already reads
 * the typed tables — the ONE remaining runtime reader is
 * `coverageService.ts:78` (grammar coverage counting). Slice 2 Task 8 repoints
 * it, after which the `exercise_variants` dual-write is stopped.
 *
 * STAGED until Task 8 (the OQ2-3 reader-repoint). The gate assertion below is
 * wrapped in `it.fails(...)`:
 *   - TODAY: `coverageService.ts` still reads `exercise_variants`, so the
 *     "zero readers" assertion FAILS → `it.fails` PASSES → suite stays green.
 *   - AFTER Task 8 repoints coverageService: the assertion PASSES → `it.fails`
 *     turns RED, which is the signal to flip `it.fails` → `it` (one-line
 *     change) so the gate becomes a hard, permanent enforcement.
 *
 * This mirrors the staged-then-active idiom in `noDiskReads.test.ts`.
 *
 * SCOPE: only `.from('exercise_variants')` / `.from("exercise_variants")` query
 * calls count as a "read" — the table NAME appearing in a type, comment, or
 * string literal does not. Tests are excluded (they may reference the table by
 * design). The build-time capability-stage WRITER (`adapter.ts`,
 * `runner.ts`) is out of scope — it is a writer, not a runtime reader, and the
 * write is retired separately in Task 8c.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// src/ root, relative to this test file:
// scripts/lib/pipeline/capability-stage/__tests__/enforcement/ → repo root → src/
const SRC_ROOT = path.resolve(__dirname, '../../../../../../src')

// A "read" is a PostgREST query against the table — match the .from(...) call
// with either quote style. The table name elsewhere (types, comments, string
// literals) is not a read.
const READ_MARKERS = [
  ".from('exercise_variants')",
  '.from("exercise_variants")',
]

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

function findExerciseVariantsReaders(): string[] {
  const offenders: string[] = []
  for (const filePath of collectTsFiles(SRC_ROOT)) {
    const source = fs.readFileSync(filePath, 'utf-8')
    if (READ_MARKERS.some((m) => source.includes(m))) {
      offenders.push(path.relative(SRC_ROOT, filePath))
    }
  }
  return offenders
}

describe('Slice 2 enforcement: no runtime exercise_variants reader', () => {
  // Sanity: SRC_ROOT resolves to the real src/ (guards against a path typo that
  // would make the scan silently scan nothing and the gate vacuously pass).
  it('resolves the src/ root', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'services')), `SRC_ROOT misresolved: ${SRC_ROOT}`).toBe(true)
  })

  // STAGED (it.fails): passes today because coverageService.ts:78 still reads
  // exercise_variants. When Task 8 repoints it, this assertion starts passing
  // and it.fails turns RED → flip `it.fails` → `it` to make the gate permanent.
  it.fails('no src/ runtime code reads exercise_variants (flip it.fails → it after Task 8)', () => {
    const offenders = findExerciseVariantsReaders()
    expect(
      offenders,
      `runtime exercise_variants readers must be repointed to the typed grammar tables: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
