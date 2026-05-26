#!/usr/bin/env bun
/**
 * publish-lesson-content.ts — Stage-A-only publish (ADR 0013, the Lesson Gate).
 *
 * Runs ONLY the Lesson Stage (Stage A) plus its self-contained Lesson Gate
 * (the pre-write GT* validators + the new post-write LV1/LV2 verification).
 * Stage B (capability generation) is never invoked, and the monolithic
 * `lint-staging` pre-flight is NOT run — the Lesson Gate is Stage A's own
 * definition-of-done.
 *
 * Why a separate entry point (ADR 0011 regime split + ADR 0013 §5): lesson
 * content re-publishes freely, capability content is seeded once. A pipeline
 * operator must be able to publish or fix just a lesson's *content* without
 * dragging in capability generation. This is also the path a fresh lesson
 * (e.g. lesson 10) uses to publish its content without being refused by
 * `lint-staging`'s capability-side / post-publish-DB-state checks.
 *
 * Post-write failure → Stage A returns a non-`ok` status; there is NO rollback
 * (lesson content is a regenerable projection — re-publish is the fix; daily
 * backups are the safety net per ADR 0011).
 *
 * Usage:
 *   bun scripts/publish-lesson-content.ts <lesson-number> [--dry-run]
 *   Requires SUPABASE_SERVICE_KEY in .env.local (omit only for --dry-run).
 */

import { pathToFileURL } from 'node:url'

import { runLessonStage } from './lib/pipeline/lesson-stage'

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/publish-lesson-content.ts <N> [--dry-run]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')

  // Stage A only — the Lesson Gate (pre-write GT* + post-write LV1/LV2) runs
  // inside runLessonStage. Stage B is intentionally NOT imported or called.
  const stageA = await runLessonStage({ lessonNumber, dryRun })
  console.log(JSON.stringify(stageA, null, 2))

  if (stageA.status !== 'ok') {
    console.error(
      `\nLesson Gate did not pass for lesson ${lessonNumber} (status=${stageA.status}). ` +
        `Any partial write REMAINS in the DB (no rollback) — fix the cause and re-run; ` +
        `re-publishing is idempotent and overwrites it.`,
    )
    process.exit(1)
  }

  console.log(
    `\n✓ Lesson ${lessonNumber} content published via Stage A; the Lesson Gate passed. ` +
      `Stage B (capability generation) was not run.`,
  )
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch((err) => {
    console.error('Publish (lesson content only) failed:', err)
    process.exit(1)
  })
}
