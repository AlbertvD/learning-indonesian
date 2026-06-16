/**
 * capability-stage/patternSeeding.ts — the OQ2-2 (option B) pattern-level
 * generation gate, pure logic (Slice 2, Task 5).
 *
 * The four typed grammar-exercise tables have only a surrogate `id` PK and NO
 * natural key, so the Slice-1 per-row skip-if-exists is impossible. A
 * PATTERN-LEVEL signal is the only thing preventing the legacy
 * INSERT-duplication bug on re-run. This module turns the loader's
 * `exerciseCoverageByPatternId` map (which types currently have >=1 ACTIVE row)
 * into a per-pattern decision: skip / delete-first-then-regenerate / generate.
 *
 * SEEDED SIGNAL (the crux): a pattern is `seeded` iff it has >=1 active row for
 * EVERY required exercise type (count DISTINCT types, not rows). This is what
 * makes the mid-write crash crash-safe: a crash BETWEEN typed tables (e.g.
 * after table 2, before table 3) leaves the pattern with a STRICT SUBSET of the
 * required types → classified `partial` → the runner deletes the stragglers and
 * regenerates the full set. A weaker "≥1 row of any type" signal would
 * mis-classify that crash as seeded and strand the pattern forever — which is
 * the exact bug the mandated partial-failure test guards against.
 *
 * `required` = all 4 generated exercise types. Tradeoff (documented, accepted in
 * the plan): a pattern the generator can only ever produce a strict subset for
 * would re-generate every publish. The generator is designed to emit all 4 for
 * any genuine pattern; a pattern that yields NOTHING drill-worthy is the
 * warn-and-skip `absent` (0 rows) case, not a 3-of-4 case. The runner treats
 * `absent` as "generate" (writing whatever the generator produces, possibly
 * nothing) — so a chronically-declining pattern re-attempts generation but never
 * deletes/duplicates rows.
 */

import type { GrammarExerciseType } from './loadFromDb'

/** The exercise types a fully-seeded pattern must cover (the generator target). */
export const REQUIRED_PATTERN_EXERCISE_TYPES: readonly GrammarExerciseType[] = [
  'choose_correct_form_ex',
  'transform_sentence_ex',
  'translate_sentence_ex',
  'choose_missing_word_ex',
]

/**
 * - `seeded`  — covers every required type → skip generation (idempotent).
 * - `partial` — has >=1 type but NOT all required → delete-first + regenerate.
 * - `absent`  — has no active rows → generate (no delete needed).
 */
export type PatternSeedState = 'seeded' | 'partial' | 'absent'

/**
 * Classify a pattern's seed state from its active-type coverage set. `covered`
 * is `exerciseCoverageByPatternId.get(grammarPatternId)` (undefined when the
 * pattern has no active exercise rows at all).
 */
export function classifyPatternSeedState(
  covered: ReadonlySet<GrammarExerciseType> | undefined,
  required: readonly GrammarExerciseType[] = REQUIRED_PATTERN_EXERCISE_TYPES,
): PatternSeedState {
  if (!covered || covered.size === 0) return 'absent'
  const allPresent = required.every((t) => covered.has(t))
  return allPresent ? 'seeded' : 'partial'
}

/** True iff the pattern needs (re)generation — i.e. not fully seeded. */
export function patternNeedsGeneration(
  covered: ReadonlySet<GrammarExerciseType> | undefined,
  required: readonly GrammarExerciseType[] = REQUIRED_PATTERN_EXERCISE_TYPES,
): boolean {
  return classifyPatternSeedState(covered, required) !== 'seeded'
}

/** True iff the (re)generation must delete existing rows first (partial state). */
export function patternNeedsDeleteFirst(
  covered: ReadonlySet<GrammarExerciseType> | undefined,
  required: readonly GrammarExerciseType[] = REQUIRED_PATTERN_EXERCISE_TYPES,
): boolean {
  return classifyPatternSeedState(covered, required) === 'partial'
}
