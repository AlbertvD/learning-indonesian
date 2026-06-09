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
 *   Slice 3 (re-scoped 2026-06-03) → dialogue cloze + affixed ROW DATA move to the
 *            DB, but Slice 3 removes NO staging reads (Option A, 2026-06-03):
 *            loader.ts STAYS allowlisted because both cloze-contexts.ts and
 *            morphology-patterns.ts still feed CAP emission through the
 *            staging-derived regeneration retired in Slice 5. The new dialogue/
 *            affixed code is disk-free (EXPECTED_ITEM_PATH_FILES + the walk).
 *   Slice 5  → retire the regeneration + stagingWriteback, remove the residual
 *            staging reads (cloze-contexts.ts, morphology-patterns.ts, …),
 *            de-allowlist loader.ts, and flip the GLOBAL no-file-I/O gate on.
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
const DISK_IO_ALLOWLIST = new Set<string>([
  // EMPTY as of Slice 5b (#147 5b.9) — the whole capability stage is disk-free.
  // History: stagingWriteback.ts deleted (5b.5); runner.ts de-allowlisted (5b.4–5b.5);
  // loader.ts went DB-only + de-allowlisted (5b.6). The globalNoFileIO gate below
  // (now `it`, no longer `it.skip`) asserts this set stays empty.
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
  // Task 7: Capability Gate item-kind validators (files created, existsFails flipped to false)
  // (generateItemDistractors.ts + validators/itemDistractors.ts retired in cap-v2 F1.)
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

  // --- cap-v2 Slice 1 (vocabulary strangler) — DB-native from line 1. ------
  // The new vocabulary module + shared embeddings service. Disk-free by
  // construction (the model cache lives inside transformers.js, not our code);
  // existsFails:true while a file is unbuilt so the suite stays green until it
  // lands. The non-allowlisted walk below enforces disk-freeness regardless.
  { relPath: 'vocabulary/selectDistractors.ts', task: 'cap-v2 Slice 1', existsFails: false },
  { relPath: 'vocabulary/planDistractors.ts', task: 'cap-v2 Slice 1', existsFails: false },
  { relPath: 'vocabulary/seedDistractors.ts', task: 'cap-v2 Slice 1 (writer)', existsFails: false },
  { relPath: 'shared/embeddings.ts', task: 'cap-v2 Slice 1', existsFails: false },
  { relPath: 'vocabulary/store.ts', task: 'cap-v2 Slice 1 (store impl)', existsFails: false },
  { relPath: 'orchestrate.ts', task: 'cap-v2 Slice 1 (populate seam)', existsFails: false },
  // cap-v2 vocabulary REBUILD (#161): the module that owns the item slice.
  { relPath: 'vocabulary/contentUnits.ts', task: 'cap-v2 rebuild (item content_units)', existsFails: false },
  { relPath: 'vocabulary/gate.ts', task: 'cap-v2 rebuild (vocab gate)', existsFails: false },
  { relPath: 'vocabulary/publish.ts', task: 'cap-v2 rebuild (module entry)', existsFails: false },
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
  // Slice 3 (re-scoped 2026-06-03; morphology read deferral 2026-06-03 — Option A):
  // Slice 3 removes NO staging reads. The dialogue cloze + affixed ROW DATA now
  // come from the DB, but BOTH source files stay read by loader.ts because their
  // CAPABILITY emission still flows through the staging-derived
  // buildCapabilityStagingFromContent regeneration (projectCapabilities), which
  // is retired in SLICE 5:
  //   - cloze-contexts.ts → still feeds the deferred item-cloze path (projectCloze).
  //   - morphology-patterns.ts → still feeds affixed CAP emission via the
  //     regeneration (removing it would emit zero affixed caps → soft-retired).
  // So loader.ts stays allowlisted and there is NO read-removal to assert in
  // Slice 3. The NEW dialogue/affixed code (generateClozeContexts.ts,
  // projectors/dialogueCloze.ts) is disk-free — enforced by the EXPECTED_ITEM_PATH_FILES
  // entries above + the non-allowlisted walk below. The global read-removal lands
  // in Slice 5 (the skipped globalNoFileIO placeholder at the end).
  // -------------------------------------------------------------------------

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
  // GLOBAL no-file-I/O gate (epic #98 User Story 10) — ACTIVE as of Slice 5b
  // (#147 5b.9). The whole legacy-projection retirement landed: the staging
  // regeneration + stagingWriteback + all loader staging reads are gone, so the
  // allowlist is empty and EVERY capability-stage source file is disk-free
  // (enforced by the non-allowlisted walk above). This assertion locks the
  // allowlist at zero — re-allowlisting a file to sneak in a disk read fails here.
  // -------------------------------------------------------------------------
  it('globalNoFileIO: the entire capability-stage allowlist is empty (Slice 5)', () => {
    expect(DISK_IO_ALLOWLIST.size).toBe(0)
  })
})
