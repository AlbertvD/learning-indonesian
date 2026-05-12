#!/usr/bin/env bun
/**
 * One-off invocation: run Stage A (lesson-stage) for a given lesson without
 * Stage B (capability-stage). Useful for testing Stage A in isolation.
 */

import { runLessonStage } from './lib/pipeline/lesson-stage'

const lessonNumber = parseInt(process.argv[2] ?? '', 10)
if (Number.isNaN(lessonNumber)) {
  console.error('Usage: bun scripts/run-lesson-stage-only.ts <lesson-number>')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')

const result = await runLessonStage({ lessonNumber, dryRun })
console.log(JSON.stringify(result, null, 2))
if (result.status !== 'ok') {
  console.error(`\nLesson-stage failed for lesson ${lessonNumber} (status=${result.status})`)
  process.exit(1)
}
console.log(`\n✓ Lesson-stage completed for lesson ${lessonNumber}`)
