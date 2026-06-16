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
import { publishVocabulary } from './lib/pipeline/capability-stage/vocabulary/publish'

export { buildLintStagingCommand }

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/publish-approved-content.ts <N> [--dry-run] [--skip-lint] [--regenerate <normalized_text> | --regenerate-pattern <slug> | --regenerate-dialogue | --regenerate-distractors]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const skipLint = process.argv.includes('--skip-lint')

  // Destructive regeneration flags — the ONLY paths that delete seeded rows
  // (routine re-runs never do — ADR 0011). Mutually exclusive (one target):
  //   --regenerate <normalized_text>   one item's distractors (delete + re-seed)
  //   --regenerate-pattern <slug>      one grammar pattern's exercises (4 tables)
  //   --regenerate-dialogue            ALL dialogue clozes for the lesson (F5)
  //   --regenerate-distractors         ALL item distractors for the lesson (F5)
  // F5: the two lesson-scoped flags fix EXISTING lessons after the F1/F2 generator
  // fixes — a plain re-publish skips seeded clozes/distractors (ADR 0011 seed-once).
  const regenIdx = process.argv.indexOf('--regenerate')
  const regenerateArg = regenIdx !== -1 ? (process.argv[regenIdx + 1] ?? null) : null
  const regenPatternIdx = process.argv.indexOf('--regenerate-pattern')
  const regeneratePatternArg = regenPatternIdx !== -1 ? (process.argv[regenPatternIdx + 1] ?? null) : null
  type RegenTarget =
    | { kind: 'item'; normalizedText: string }
    | { kind: 'pattern'; slug: string }
    | { kind: 'dialogue' }
    | { kind: 'distractors' }
  const regenTargets: RegenTarget[] = []
  if (regeneratePatternArg) regenTargets.push({ kind: 'pattern', slug: regeneratePatternArg })
  if (regenerateArg) regenTargets.push({ kind: 'item', normalizedText: regenerateArg })
  if (process.argv.includes('--regenerate-dialogue')) regenTargets.push({ kind: 'dialogue' })
  if (process.argv.includes('--regenerate-distractors')) regenTargets.push({ kind: 'distractors' })
  if (regenTargets.length > 1) {
    console.error('Use only ONE regenerate flag (--regenerate / --regenerate-pattern / --regenerate-dialogue / --regenerate-distractors).')
    process.exit(1)
  }
  const regenerate: RegenTarget | undefined = regenTargets[0]

  // Slice 5b (#147): the Capability Stage (Stage B) is DB-only. A meaningful
  // Stage B dry-run must read DB state that ONLY a live Stage A produces, so:
  //   - dry-run runs Stage A LIVE (lesson content is the DB projection of staging
  //     — idempotent + FSRS-safe to re-write) and runs Stage B in DRY-RUN
  //     (pre-write validation only; no capability/distractor/grammar writes).
  //   - dry-run therefore REQUIRES SUPABASE_SERVICE_KEY (DB access). The old
  //     "staging-only dry-run without a service key" mode is gone (loadLessonForDryRun
  //     deleted). Validate staging shape offline with `lint-staging.ts` instead.
  if (dryRun && !process.env.SUPABASE_SERVICE_KEY) {
    console.error(
      '\n--dry-run is DB-only (Slice 5b #147) and requires SUPABASE_SERVICE_KEY in .env.local.\n' +
      'Run scripts/lint-staging.ts directly for an offline staging-shape check.',
    )
    process.exit(1)
  }

  // Pre-flight lint gate (CRITICAL findings only) — refuse to publish until
  // staging is clean.
  if (!skipLint) {
    const lintCommand = buildLintStagingCommand(lessonNumber)
    const lint = spawnSync(lintCommand.command, lintCommand.args, { stdio: 'inherit' })
    if (lint.status !== 0) {
      console.error(
        `\nlint-staging found CRITICAL issues for lesson ${lessonNumber} — fix them and rerun, or use --skip-lint.`,
      )
      process.exit(1)
    }
  }

  if (dryRun) {
    console.log(
      '\n[DRY RUN] Stage A runs LIVE (lesson content = DB projection, idempotent); ' +
      'Stage B previews capability seeding only (no capability writes).',
    )
  }

  // Stage A — runLessonStage owns lesson + sections + page-blocks + audio_clips.
  // Always live: dry-run previews Stage B only (see the contract note above), and
  // Stage B reads the DB Stage A wrote.
  const stageA = await runLessonStage({ lessonNumber, dryRun: false })
  console.log(JSON.stringify(stageA, null, 2))
  if (stageA.status !== 'ok') {
    console.error(`\nStage A failed for lesson ${lessonNumber}.`)
    process.exit(1)
  }

  // Stage B — capability-stage (Phase 2 deep module).
  // Stage A returns lesson.id = '' on validation failure (lesson-stage
  // runner.ts:134). We already short-circuit above on stageA.status !== 'ok',
  // so a non-empty lessonId is guaranteed here (required by Stage B dry-run too).
  // Stage B — capability-stage runner: the NON-ITEM kinds (dialogue_line, pattern,
  // word_form_pair_src). cap-v2 #161 amputated its item branch into the vocab module.
  const stageB = await runCapabilityStage({
    lessonNumber,
    lessonId: stageA.lesson.id,
    dryRun,
    regenerate,
  })
  console.log(JSON.stringify(stageB, null, 2))
  // 'validation_failed' = a HARD pre-write gate failure → abort. 'partial' is
  // GRACEFUL (e.g. a CS22 dialogue-cloze coverage gap: some lines produced no
  // cloze) — it must NOT block publishVocabulary, whose item/distractor slice is
  // independent of Stage B's dialogue/pattern/affixed output. (Before this, a
  // single un-clozeable line blocked the whole lesson's distractor reseed.)
  if (stageB.status === 'validation_failed') {
    console.error(`\nStage B validation FAILED for lesson ${lessonNumber} (hard pre-write gate) — aborting before publishVocabulary.`)
    process.exit(1)
  }
  if (stageB.status !== 'ok') {
    console.warn(`\n⚠ Stage B for lesson ${lessonNumber} completed with status=${stageB.status} (graceful — e.g. CS22 cloze coverage gaps). Continuing to publishVocabulary (item/distractor slice is independent).`)
  }

  // Stage Vocabulary (cap-v2 #161) — the new vocab module owns the item slice
  // end-to-end: item caps + learning_items + POS + anchor contexts + item
  // content_units + junction + item produce_form_from_context_cap + curated distractors.
  // Runs AFTER the runner (runner-first, §5a). Handles dryRun internally (returns
  // before writes). Idempotent (seed-once, ADR 0011).
  const stageVoc = await publishVocabulary({
    lessonId: stageA.lesson.id,
    lessonNumber,
    dryRun,
    regenerate,
  })
  console.log('Stage Vocabulary:', JSON.stringify({ status: stageVoc.status, counts: stageVoc.counts }, null, 2))
  if (stageVoc.status === 'validation_failed') {
    console.error(`\nStage Vocabulary failed validation for lesson ${lessonNumber}.`)
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
