/**
 * Slice 1 enforcement tests — anti-fold guardrails for the DB→DB spine.
 *
 * These tests fail if the legacy disk-read or legacy capability_artifacts
 * read paths survive the Slice 1 migration. They are written FIRST (TDD)
 * and made green by the implementation.
 *
 * Test 1 — capability-stage must NOT contain readStagingFile / writeFileSync
 *   once Slice 1 lands. The item path must read from the DB, not disk.
 *   Pattern: scan the source files for the banned symbols.
 *
 * Test 2 — src/ must NOT query capability_artifacts for item-sourced kinds.
 *   masteryModel.ts and session-builder/adapter.ts must not fetch
 *   capability_artifacts for all caps; they must skip item-sourced caps
 *   (whose required_artifacts is always [] so the fetch is always a no-op).
 */

/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Recursively collect .ts files under a directory, skipping __tests__ and node_modules. */
function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'lint' || entry.name === 'verify') continue
      result.push(...collectTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result.push(fullPath)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Test 1 — capability-stage may not use readStagingFile or writeFileSync
//           in any source file outside __tests__. This is the anti-fold
//           guardrail: those symbols are the disk-read path that Slice 1
//           replaces with DB reads.
// ---------------------------------------------------------------------------

describe('Slice 1 enforcement — no disk I/O in capability-stage sources', () => {
  const capStageDir = path.resolve(__dirname, '../../scripts/lib/pipeline/capability-stage')

  it('capability-stage source files do not call readStagingFile', () => {
    // Collect source files (excludes __tests__/ and verify/)
    const files = collectTsFiles(capStageDir)
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(capStageDir, file)
      const content = fs.readFileSync(file, 'utf8')
      // Match actual calls / function definitions of readStagingFile
      if (/readStagingFile/.test(content)) {
        violations.push(rel)
      }
    }
    expect(violations).toEqual([])
  })

  it('capability-stage source files do not call writeFileSync', () => {
    const files = collectTsFiles(capStageDir)
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(capStageDir, file)
      const content = fs.readFileSync(file, 'utf8')
      if (/writeFileSync/.test(content)) {
        violations.push(rel)
      }
    }
    expect(violations).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Test 2 — runtime src/ modules must not query capability_artifacts for
//           item-sourced capability kinds. After Slice 1 the masteryModel
//           and session-builder/adapter skip item caps when fetching
//           capability_artifacts (item required_artifacts is always []).
//           The exercise-content/adapter fetchArtifacts helper still exists
//           for grammar/dialogue kinds but must not be called for item caps.
// ---------------------------------------------------------------------------

describe('Slice 1 enforcement — runtime does not query capability_artifacts for item kind', () => {
  const srcDir = path.resolve(__dirname, '../')

  it('masteryModel.ts does not fetch capability_artifacts for all capability ids unconditionally', () => {
    const file = path.join(srcDir, 'lib/mastery/masteryModel.ts')
    const content = fs.readFileSync(file, 'utf8')
    // After Slice 1, the artifacts fetch must filter out item-sourced caps
    // (i.e. it must NOT pass all capabilityIds to the capability_artifacts query).
    // We detect this by asserting the file does NOT contain a chunkedIn call over
    // 'capability_artifacts' that does NOT also filter by source_kind.
    //
    // Negative pattern: `chunkedIn<...>(\n?...'capability_artifacts', 'capability_id', capabilityIds,`
    // where `capabilityIds` is the full unfiltered set.
    // After Slice 1 the call must either:
    //   (a) be absent entirely, OR
    //   (b) only pass non-item capability ids.
    //
    // We check that the literal pattern "capability_artifacts', 'capability_id', capabilityIds"
    // does NOT appear (the full-set call is retired).
    const hasUnfilteredItemFetch = /capability_artifacts['\s,]+capability_id['\s,]+capabilityIds/.test(content)
    expect(hasUnfilteredItemFetch).toBe(false)
  })

  it('session-builder/adapter.ts does not fetch capability_artifacts for all capability ids unconditionally', () => {
    const file = path.join(srcDir, 'lib/session-builder/adapter.ts')
    const content = fs.readFileSync(file, 'utf8')
    // Same invariant: after Slice 1, capabilityIds passed to capability_artifacts
    // must exclude item-sourced caps. The unfiltered call is retired.
    const hasUnfilteredItemFetch = /capability_artifacts['\s,]+capability_id['\s,]+capabilityIds/.test(content)
    expect(hasUnfilteredItemFetch).toBe(false)
  })

  it('exercise-content/byKind/item.ts does not query capability_artifacts', () => {
    const file = path.join(srcDir, 'lib/exercise-content/byKind/item.ts')
    const content = fs.readFileSync(file, 'utf8')
    // Item kind fetcher must not touch capability_artifacts at all.
    // (This should already pass post-PR-1; confirmed here as a regression guard.)
    const hasArtifactFetch = /\.from\(['"]capability_artifacts['"]\)/.test(content)
    expect(hasArtifactFetch).toBe(false)
  })
})
