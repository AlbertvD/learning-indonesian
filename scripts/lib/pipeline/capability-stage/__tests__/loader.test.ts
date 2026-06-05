/**
 * loader.test.ts — guards the Slice 5b (#147) DB-only loader contract.
 *
 * The capability-stage loader used to read every downstream input off staging
 * files (learning-items / grammar-patterns / candidates / cloze-contexts /
 * content-units / capabilities / exercise-assets) via `fs` + `await
 * import('file://…')`. Slice 5b removed all of it: the loader now reads ONLY the
 * DB (Stage A's outputs). This test is the regression guard that the loader
 * never re-acquires a disk coupling — it complements the directory-wide
 * noDiskReads gate (which de-allowlists loader.ts in 5b.9) with a loader-specific
 * static assertion that fails loudly the moment a staging read sneaks back in.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const LOADER_PATH = path.resolve(__dirname, '../loader.ts')
const LOADER_SOURCE = fs.readFileSync(LOADER_PATH, 'utf-8')

describe('capability-stage loader is DB-only (Slice 5b #147)', () => {
  it('imports neither node:fs nor node:path', () => {
    // The loader no longer touches the filesystem, so it must not import the
    // disk modules. (These same tokens in THIS test file are fine — the no-disk
    // gate skips __tests__.)
    expect(LOADER_SOURCE).not.toMatch(/from\s+['"]node:fs['"]/)
    expect(LOADER_SOURCE).not.toMatch(/from\s+['"]node:path['"]/)
  })

  it('contains no disk-I/O markers', () => {
    // Same marker set the directory-wide noDiskReads gate scans.
    const markers = ['readStagingFile', 'readFileSync', 'writeFileSync', 'existsSync', 'file://']
    const found = markers.filter((m) => LOADER_SOURCE.includes(m))
    expect(found, `loader.ts must be disk-free but contains: ${found.join(', ')}`).toEqual([])
  })

  it('no longer exports the retired staging readers', () => {
    // loadStagingFiles / loadLessonForDryRun / readStagingFile / LoadedStaging
    // were deleted in 5b.6 — their re-introduction would resurrect the disk read.
    expect(LOADER_SOURCE).not.toContain('loadStagingFiles')
    expect(LOADER_SOURCE).not.toContain('loadLessonForDryRun')
    expect(LOADER_SOURCE).not.toContain('LoadedStaging')
  })
})
