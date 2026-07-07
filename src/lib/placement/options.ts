// Placement probe MCQ option assembly (Bet-1 slice 2, docs/plans/2026-07-06-
// loanword-bridge-placement-onboarding.md §4.1). Pure logic — no React — so
// it lives alongside staircase.ts/result.ts rather than in the page
// (Instaptoets.tsx), which also keeps it out of react-refresh's
// only-export-components constraint on component files.
//
// Deterministic throughout: no Date.now()/Math.random(). Distractor pick and
// option order are both driven by `seedIndex` (the count of items already
// presented in the probe), never RNG.
import type { PlacementItemDetail } from '@/lib/placement/adapter'

/** Rotates by `seedIndex mod length` so the correct answer's on-screen
 *  position varies item-to-item without randomisation. */
function rotateDeterministic<T>(items: readonly T[], seedIndex: number): T[] {
  if (items.length === 0) return []
  const offset = seedIndex % items.length
  return [...items.slice(offset), ...items.slice(0, offset)]
}

/** Picks up to 3 Dutch distractor translations from OTHER items in the pool,
 *  walking deterministically from a seed-derived offset. Skips the correct
 *  answer + any duplicate gloss so no option repeats. */
export function pickDistractors(
  current: PlacementItemDetail,
  pool: readonly PlacementItemDetail[],
  seedIndex: number,
): string[] {
  const candidates = pool.filter(item => item.normalizedText !== current.normalizedText)
  if (candidates.length === 0) return []
  const seen = new Set<string>([current.translationNl.trim().toLowerCase()])
  const distractors: string[] = []
  const start = seedIndex % candidates.length
  for (let i = 0; i < candidates.length && distractors.length < 3; i++) {
    const candidate = candidates[(start + i) % candidates.length]
    const norm = candidate.translationNl.trim().toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    distractors.push(candidate.translationNl)
  }
  return distractors
}

/** Builds the MCQ options for one item — the correct answer + up to 3
 *  distractors (fewer if the pool is too small), rotated deterministically by
 *  `seedIndex` (the count of items already presented) so option position
 *  varies without randomisation. */
export function buildOptions(
  current: PlacementItemDetail,
  pool: readonly PlacementItemDetail[],
  seedIndex: number,
): string[] {
  const distractors = pickDistractors(current, pool, seedIndex)
  return rotateDeterministic([current.translationNl, ...distractors], seedIndex)
}
