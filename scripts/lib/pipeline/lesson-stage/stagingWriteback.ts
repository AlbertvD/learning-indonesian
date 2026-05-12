/**
 * lesson-stage/stagingWriteback.ts — write enriched lesson.ts back to the
 * staging directory so subsequent Stage A runs skip the enrichment work.
 *
 * Mirrors the pattern used by capability-stage/stagingWriteback.ts. The
 * Stage A loader reads `lesson.ts` from disk every run; if an enricher
 * mutates `staging.lesson.sections` in-memory but doesn't persist the
 * change, the same LLM call fires on every re-run.
 */

import fs from 'node:fs'
import path from 'node:path'

export function writeLessonWithEnrichedSections(
  lessonNumber: number,
  lesson: Record<string, unknown>,
): void {
  const stagingDir = path.join(
    process.cwd(),
    'scripts',
    'data',
    'staging',
    `lesson-${lessonNumber}`,
  )
  // Only cache to disk when the staging directory already exists. In production
  // it always exists (the loader read lesson.ts from there). In tests with
  // synthetic in-memory staging, it doesn't — silently skip the cache write
  // rather than fabricating a directory.
  if (!fs.existsSync(stagingDir)) return
  fs.writeFileSync(
    path.join(stagingDir, 'lesson.ts'),
    `// Enriched by lesson-stage\nexport const lesson = ${JSON.stringify(lesson, null, 2)}\n`,
  )
}
