import { describe, it, expect, vi } from 'vitest'

// lint-staging.ts has a top-level process.exit if SUPABASE_SERVICE_KEY is missing —
// set a dummy value before import so the pure checks can be loaded without a DB
// client (same pattern as substring-contrast.test.ts).
vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key-not-used')

const { checkClozeCoverage, checkClozeContextsFile } = await import('../lint-staging')

/**
 * FRESH-LESSON CANARY.
 *
 * Invariant: a freshly-staged lesson — canonical inputs only (learning-items,
 * grammar, dialogue), with NO authored cloze/distractor enrichments and no prior
 * DB rows — must pass the item-path staging pre-flight with ZERO CRITICALs. I.e.
 * a brand-new lesson must publish WITHOUT --skip-lint.
 *
 * Why this exists (2026-06-09): the `cloze-coverage-missing` CRITICAL went vestigial
 * when Slice 5b (#147) retired the vocab-cloze item_contexts writer, yet kept
 * CRITICAL-blocking every fresh lesson (L5/7/8/11/12). Each block was papered over
 * with --skip-lint, so the recurring "fresh lesson can't publish" signal never
 * accumulated into a fix. This canary makes that class of regression — a gate that
 * blocks bootstrapping — fail ONCE, loudly, in CI at the offending PR, instead of N
 * times, quietly, in production behind an escape hatch.
 *
 * As the lint-staging decomposition (#109) lands a single fresh-lesson-safe Lesson
 * Gate (ADR 0013), point this canary at that gate and widen ITEM_PATH_CHECKS.
 */

// A minimal bootstrapping lesson: vocab items present, but NO authored cloze
// contexts — the state every real lesson starts in before the cloze-creator runs.
const freshLesson = {
  n: 999,
  dir: '/fixture/lesson-999',
  exists: true,
  learningItems: [
    { item_type: 'word', base_text: 'rumah', pos: 'noun' },
    { item_type: 'phrase', base_text: 'selamat pagi', pos: 'expression' },
    { item_type: 'word', base_text: 'makan', pos: 'verb' },
    { item_type: 'word', base_text: 'Monas = Monumen Nasional', pos: 'noun' },
  ],
  clozeContexts: [], // fresh: cloze-creator has not run for this lesson
  clozeSkips: [],
  grammarPatterns: [],
  candidates: [],
}

// The staging-file checks that operate purely on a LessonCtx and could plausibly
// block a fresh lesson. Widen this as #109 folds more pre-flight here.
const ITEM_PATH_CHECKS = [checkClozeCoverage, checkClozeContextsFile]

describe('fresh-lesson canary — item-path staging pre-flight', () => {
  it('does NOT CRITICAL-block a fresh lesson with vocab items but no authored cloze contexts', () => {
    const findings = ITEM_PATH_CHECKS.flatMap(check => check(freshLesson as never))
    const criticals = findings.filter(f => f.severity === 'CRITICAL')
    expect(criticals).toEqual([])
  })

  it('still SURFACES the missing coverage as a non-blocking WARNING (breadcrumb, not a gate)', () => {
    const warnings = checkClozeCoverage(freshLesson as never).filter(f => f.severity === 'WARNING')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.every(f => f.rule.startsWith('cloze-coverage-missing'))).toBe(true)
  })
})
