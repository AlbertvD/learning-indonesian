#!/usr/bin/env bun
/**
 * publish-approved-content.ts
 *
 * Thin CLI wrapper around runLessonStage (Stage A — lessons module) +
 * publishLegacyStageB (Stage B — capability-stage-legacy.ts). After Phase 2,
 * Stage B moves to its own deep module and the legacy fallthrough retires.
 *
 * Usage:
 *   bun scripts/publish-approved-content.ts <lesson-number> [--dry-run] [--skip-lint]
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { runLessonStage } from './lib/pipeline/lesson-stage'
import {
  buildLintStagingCommand,
  publishCapabilityPipelineOutput,
  publishLegacyStageB,
} from './lib/pipeline/capability-stage-legacy'

// Re-export Stage B helpers so existing tests that import from this module
// keep working through the Phase 1 transition. Phase 2 moves the legacy
// module's exports into the proper capability-stage/ deep module and the
// re-exports retire.
export { publishCapabilityPipelineOutput, buildLintStagingCommand }

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/publish-approved-content.ts <N> [--dry-run] [--skip-lint]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const skipLint = process.argv.includes('--skip-lint')

  // Pre-flight lint gate (CRITICAL findings only) — refuse to publish until
  // staging is clean. Skipped during dry-run when no service key is set.
  if (!skipLint && !(dryRun && !process.env.SUPABASE_SERVICE_KEY)) {
    const lintCommand = buildLintStagingCommand(lessonNumber)
    const lint = spawnSync(lintCommand.command, lintCommand.args, { stdio: 'inherit' })
    if (lint.status !== 0) {
      console.error(
        `\nlint-staging found CRITICAL issues for lesson ${lessonNumber} — fix them and rerun, or use --skip-lint.`,
      )
      process.exit(1)
    }
  } else if (dryRun && !process.env.SUPABASE_SERVICE_KEY) {
    console.log('Skipping DB-backed lint during dry-run because SUPABASE_SERVICE_KEY is not set.')
  }

  // Stage A — runLessonStage owns lesson + sections + page-blocks + audio_clips.
  const stageA = await runLessonStage({ lessonNumber, dryRun })
  console.log(JSON.stringify(stageA, null, 2))
  if (stageA.status !== 'ok') {
    console.error(`\nStage A failed for lesson ${lessonNumber}.`)
    process.exit(1)
  }

  // Stage B — grammar patterns + learning items + meanings + contexts +
  // exercise variants + cloze contexts. Retires when Phase 2's
  // capability-stage/ module replaces it.
  await publishLegacyStageB({
    lessonNumber,
    lessonId: stageA.lesson.id,
    dryRun,
  })
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch((err) => {
    console.error('Publish failed:', err)
    process.exit(1)
  })
}
