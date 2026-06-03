/**
 * Enforcement gate: the item-kind path through the Capability Stage must be
 * entirely disk-free (no `readFileSync`, `writeFileSync`, `existsSync`,
 * `readStagingFile`). This is the hard contract ADR 0011/0012 demands — the
 * Capability Stage's external interface is the database, not staging files.
 *
 * Strategy: shape (a) — enumerate the EXPECTED item-path module files and
 * assert each one EXISTS and contains no disk-I/O markers.
 *
 * Suite lifecycle:
 *   - "File exists" assertions are `it.fails(...)` today because the item-path
 *     files don't exist yet (Tasks 2–7). `it.fails` means: "I expect this to
 *     fail right now; if it unexpectedly passes, that is the real test error."
 *     When a task lands its file, flip `existsFails: true` → `false` for that
 *     entry — the existence check becomes a plain `it` that enforces presence.
 *     The suite stays green (exit 0) throughout.
 *   - "No disk I/O" assertions are plain `it(...)` — they are a no-op while the
 *     file doesn't exist (guarded by the fs.existsSync check inside the body)
 *     and become the hard enforcement once the file lands.
 *   - The "non-allowlisted existing files" group is always plain `it(...)` —
 *     those files exist today and must never acquire disk I/O.
 *
 * The allowlist below names the still-disk-coupled files that ARE permitted to
 * contain disk I/O today. These entries SHRINK as the redesign progresses:
 *   Slice 1  → item path is disk-free (existsFails flips to false for item modules)
 *   Slice 2  → pattern path is disk-free (loader.ts + runner.ts item refs removed)
 *   Slice 3 (re-scoped 2026-06-03) → dialogue + affixed paths disk-free. loader.ts
 *            STAYS allowlisted (still reads cloze-contexts.ts for the DEFERRED
 *            item-cloze path + the other staging files); only the affixed read
 *            (morphology-patterns.ts) is removed — asserted by an explicit
 *            positive-removal test, not by de-allowlisting loader.ts.
 *   Item-cloze slice → removes cloze-contexts.ts read + de-allowlists loader.ts.
 *   Slice 5  → stagingWriteback.ts retired + the GLOBAL no-file-I/O gate flips on.
 * When the last entry is removed, the allowlist comment can be deleted.
 *
 * DISK-I/O MARKERS scanned: `readStagingFile`, `readFileSync`, `writeFileSync`,
 * `existsSync` (bare import, subsumes `fs.existsSync`), and `file://` (the
 * dynamic-import disk idiom: `await import(\`file://${filePath}\`)` is the
 * stage's canonical way to read a staging .ts file — see loader.ts:117). The
 * `file://` marker closes the bypass hole: a future non-allowlisted file could
 * read disk via `await import('file://...')` without using `readFileSync`, and
 * the old marker list would miss it. A bare `import(` would false-positive on
 * legitimate non-disk dynamic imports, so the narrower `file://` substring is
 * used instead. All markers match anywhere in the source including comments —
 * a comment describing disk I/O is a red flag too.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Allowlist — currently-permitted disk-coupled files.
// These shrink as the redesign progresses; the item path must NEVER appear here.
// ---------------------------------------------------------------------------
const DISK_IO_ALLOWLIST = new Set([
  'loader.ts',           // still reads all staging files; item read removed in Task 3
  'stagingWriteback.ts', // still writes candidates.ts + learning-items.ts; retired in Slice 3
  'runner.ts',           // still calls writeLearningItemsWithEnrichedPos + writeFileSync snapshots; item writes removed in Tasks 4-6
])

// ---------------------------------------------------------------------------
// Disk-I/O markers — any occurrence in a non-allowlisted file is a violation.
// ---------------------------------------------------------------------------
const DISK_IO_MARKERS = [
  'readStagingFile',
  'readFileSync',
  'writeFileSync',
  'existsSync',
  'file://',
]

// ---------------------------------------------------------------------------
// Expected item-path files — these MUST exist AND be disk-free.
// `existsFails: true` means the file doesn't exist yet (it.fails in use).
// Flip to `false` when the task lands — changes the test from it.fails → it.
// ---------------------------------------------------------------------------
const CAPABILITY_STAGE_ROOT = path.resolve(
  __dirname,
  '../../', // capability-stage/
)

interface ExpectedFile {
  relPath: string
  task: string
  /**
   * Set true while the file does not yet exist so the "exists" assertion uses
   * `it.fails(...)` (suite stays green while documenting the missing file).
   * Flip to false when the task ships the file — the test becomes a plain `it`.
   */
  existsFails: boolean
}

const EXPECTED_ITEM_PATH_FILES: ExpectedFile[] = [
  // Task 2: Capability Gate skeleton
  { relPath: 'gate.ts', task: 'Task 2', existsFails: false },
  // Task 3: typed item import seam (loadFromDb)
  { relPath: 'loadFromDb.ts', task: 'Task 3', existsFails: false },
  // Task 4: pure item projector (already exists; must stay disk-free)
  { relPath: 'projectors/vocab.ts', task: 'Task 4', existsFails: false },
  // Task 5: in-stage curated-distractor generator
  { relPath: 'generateItemDistractors.ts', task: 'Task 5', existsFails: false },
  // Task 7: Capability Gate item-kind validators (files created, existsFails flipped to false)
  { relPath: 'validators/itemDistractors.ts', task: 'Task 7', existsFails: false },
  { relPath: 'validators/itemCoverage.ts', task: 'Task 7', existsFails: false },
  { relPath: 'validators/itemPos.ts', task: 'Task 7', existsFails: false },
  { relPath: 'validators/itemDuplicates.ts', task: 'Task 7', existsFails: false },
  // Note: adapter.ts (Task 6) exists today. The idempotent write additions must
  // not introduce disk I/O — covered by the "non-allowlisted existing files"
  // group below rather than a separate entry here.

  // --- Slice 2 (pattern path) — disk-free by construction. -----------------
  // existsFails:true while unbuilt (it.fails keeps the suite green + documents
  // the missing file); flip to false when the named task ships it. Disk-free is
  // ALSO enforced automatically the moment any of these lands, via the
  // "non-allowlisted existing files" walk below — this entry adds the existence
  // contract + task label on top of that. Task 3/7 pattern projector + gate-
  // validator filenames are settled in their own tasks (names TBD); their
  // disk-free contract is already covered by the walk regardless.
  { relPath: 'generateGrammarExercises.ts', task: 'Task 4 (Slice 2)', existsFails: false },

  // --- Slice 3 (re-scoped) — dialogue cloze generator, disk-free. ----------
  // Shipped in Task 4 (existsFails flipped true → false). Mode-2 (dialogue)
  // ONLY — the Mode-1 item carrier generator defers to the item-cloze slice.
  { relPath: 'generateClozeContexts.ts', task: 'Task 4 (Slice 3)', existsFails: false },
]

// ---------------------------------------------------------------------------
// Existing files that are NOT in the allowlist and must NEVER acquire disk I/O
// (they exist today and must stay clean as the redesign adds item-path code).
// ---------------------------------------------------------------------------
function getAllCapabilityStageFiles(): string[] {
  const result: string[] = []
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Skip __tests__ — test files themselves may read files by design
        if (entry.name === '__tests__') continue
        walk(path.join(dir, entry.name))
      } else if (entry.name.endsWith('.ts')) {
        result.push(path.join(dir, entry.name))
      }
    }
  }
  walk(CAPABILITY_STAGE_ROOT)
  return result
}

function hasDiskIo(filePath: string): { found: boolean; markers: string[] } {
  const source = fs.readFileSync(filePath, 'utf-8')
  const found: string[] = []
  for (const marker of DISK_IO_MARKERS) {
    if (source.includes(marker)) found.push(marker)
  }
  return { found: found.length > 0, markers: found }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('capability-stage item path: disk-I/O enforcement', () => {
  describe('expected item-path files exist and are disk-free', () => {
    for (const { relPath, task, existsFails } of EXPECTED_ITEM_PATH_FILES) {
      const absPath = path.join(CAPABILITY_STAGE_ROOT, relPath)
      const fileName = path.basename(relPath)

      // Use it.fails when the file doesn't exist yet — documents the intent
      // without making the suite red. Flip existsFails to false when the task
      // ships its file; the test becomes a plain `it` that enforces presence.
      const existsTest = existsFails ? it.fails : it

      existsTest(`${fileName} exists (${task})`, () => {
        expect(
          fs.existsSync(absPath),
          `${relPath} does not exist yet — lands in ${task}`,
        ).toBe(true)
      })

      it(`${fileName} contains no disk I/O (${task})`, () => {
        if (!fs.existsSync(absPath)) {
          // File doesn't exist → skip the content check (the existence test above
          // already documents the failure; don't double-report with a misleading
          // "disk I/O found" message)
          return
        }
        const { found, markers } = hasDiskIo(absPath)
        expect(
          found,
          `${relPath} must not use disk I/O but contains: ${markers.join(', ')}`,
        ).toBe(false)
      })
    }
  })

  // -------------------------------------------------------------------------
  // Slice 3 (re-scoped 2026-06-03): dialogue + affixed paths are disk-free.
  // loader.ts stays allowlisted (it still reads cloze-contexts.ts for the
  // DEFERRED item-cloze path + the other staging files), so the allowlist walk
  // below CANNOT observe the affixed read removal. This explicit positive-
  // removal assertion proves the morphology-patterns.ts read is gone.
  //   - RED now: loader.ts still reads it (removed in Task 9) → it.fails.
  //   - Task 9 flips it.fails → it once loader.ts:141 is deleted.
  // cloze-contexts.ts is NOT asserted here — it stays (deferred item path);
  // its removal + loader.ts de-allowlisting move to the item-cloze slice.
  // -------------------------------------------------------------------------
  describe('Slice 3: dialogue + affixed paths read no staging file', () => {
    const loaderPath = path.join(CAPABILITY_STAGE_ROOT, 'loader.ts')

    // it.fails today (loader.ts still reads morphology-patterns.ts) — Task 9
    // deletes loader.ts:141 and flips this it.fails → it.
    it.fails('loader.ts no longer reads morphology-patterns.ts (affixed → DB; removed Task 9)', () => {
      const source = fs.readFileSync(loaderPath, 'utf-8')
      expect(
        source.includes('morphology-patterns.ts'),
        'loader.ts must stop reading morphology-patterns.ts — affixed_form_pairs are now sourced from lesson_section_affixed_pairs in the DB (Task 9)',
      ).toBe(false)
    })
  })

  describe('non-allowlisted existing files must not acquire disk I/O', () => {
    // Walk all current capability-stage .ts files. Any that are NOT in the
    // allowlist must never have disk I/O — they are either already clean or
    // new item-path files that must be built disk-free from the start.
    const existingFiles = getAllCapabilityStageFiles()

    for (const absPath of existingFiles) {
      const fileName = path.relative(CAPABILITY_STAGE_ROOT, absPath)

      // Skip allowlisted files — they are permitted to have disk I/O today
      if (DISK_IO_ALLOWLIST.has(path.basename(absPath))) continue

      it(`${fileName} has no disk I/O (not in allowlist)`, () => {
        const { found, markers } = hasDiskIo(absPath)
        expect(
          found,
          `${fileName} is not allowlisted but uses disk I/O: ${markers.join(', ')} — ` +
          'either add it to the allowlist with a Slice comment, or remove the disk read',
        ).toBe(false)
      })
    }
  })

  // -------------------------------------------------------------------------
  // GLOBAL no-file-I/O placeholder (epic #98 User Story 10) — OWNED BY SLICE 5.
  // The Capability Stage's scoped no-disk gate (above) covers item + pattern +
  // dialogue + affixed. It CANNOT pass globally yet: loader.ts still reads
  // learning-items.ts / grammar-patterns.ts / candidates.ts / cloze-contexts.ts,
  // and stagingWriteback.ts still writes. Slice 5 (legacy-projection retirement)
  // empties the allowlist and flips this it.skip → it. Kept visible so the
  // residual disk coupling is documented, not silently forgotten.
  // -------------------------------------------------------------------------
  it.skip('globalNoFileIO: the entire capability-stage allowlist is empty (Slice 5)', () => {
    expect(DISK_IO_ALLOWLIST.size).toBe(0)
  })
})
