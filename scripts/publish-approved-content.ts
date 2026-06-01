#!/usr/bin/env bun
/**
 * publish-approved-content.ts
 *
 * Thin CLI wrapper around runLessonStage (Stage A) + runCapabilityStage
 * (Stage B). The legacy `publishLegacyStageB` shim retired with the Phase 2
 * fold; Stage B is now `scripts/lib/pipeline/capability-stage/`.
 *
 * Usage:
 *   bun scripts/publish-approved-content.ts <lesson-number> [--dry-run] [--skip-lint]
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { runLessonStage } from './lib/pipeline/lesson-stage'
import {
  runCapabilityStage,
  buildLintStagingCommand,
} from './lib/pipeline/capability-stage'

export { buildLintStagingCommand }

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/publish-approved-content.ts <N> [--dry-run] [--skip-lint] [--regenerate <normalized_text> | --regenerate-pattern <pattern-slug>]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const skipLint = process.argv.includes('--skip-lint')

  // --regenerate <normalized_text>: destructive distractor regeneration for one item.
  //   Deletes existing distractor rows for the item (all 3 tables) then re-seeds.
  // --regenerate-pattern <pattern-slug>: destructive grammar-exercise regeneration
  //   for one pattern (deletes its rows across the 4 typed exercise tables, then
  //   regenerates — Slice 2 Task 5, OQ2-2).
  // These are the ONLY destructive paths — routine re-runs never delete seeded
  // rows — and are mutually exclusive (a single regenerate target).
  const regenIdx = process.argv.indexOf('--regenerate')
  const regenerateArg = regenIdx !== -1 ? (process.argv[regenIdx + 1] ?? null) : null
  const regenPatternIdx = process.argv.indexOf('--regenerate-pattern')
  const regeneratePatternArg = regenPatternIdx !== -1 ? (process.argv[regenPatternIdx + 1] ?? null) : null
  if (regenerateArg && regeneratePatternArg) {
    console.error('Use only one of --regenerate <item> or --regenerate-pattern <slug>, not both.')
    process.exit(1)
  }
  const regenerate:
    | { kind: 'item'; normalizedText: string }
    | { kind: 'pattern'; slug: string }
    | undefined = regeneratePatternArg
    ? { kind: 'pattern', slug: regeneratePatternArg }
    : regenerateArg
      ? { kind: 'item', normalizedText: regenerateArg }
      : undefined

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

  // Stage B — capability-stage (Phase 2 deep module).
  // Stage A returns lesson.id = '' on validation failure (lesson-stage
  // runner.ts:134). We already short-circuit above on stageA.status !== 'ok',
  // so a non-empty lessonId is guaranteed here.
  const stageB = await runCapabilityStage({
    lessonNumber,
    lessonId: stageA.lesson.id,
    dryRun,
    regenerate,
  })
  console.log(JSON.stringify(stageB, null, 2))
  if (stageB.status !== 'ok') {
    console.error(`\nStage B did not complete cleanly for lesson ${lessonNumber} (status=${stageB.status}).`)
    process.exit(1)
  }
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
