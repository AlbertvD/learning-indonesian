# Retention-First V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace SM-2 flashcard system with FSRS-6 retention-first learning system — new schema, session engine, exercise components, and updated pages.

**Architecture:** Frontend-only React app talking to Supabase. FSRS scheduling runs client-side via `ts-fsrs`. Session engine assembles queues in-memory. All learner state persisted to Supabase after each interaction.

**Tech Stack:** React 19 + TypeScript + Vite, Mantine v8, ts-fsrs, Zustand 5, Supabase JS v2

**Design doc:** `docs/plans/2026-03-30-retention-first-v2-design.md`

---

## Phase 1: Cleanup Old Card System

Remove all card/SM-2 code first so we're working from a clean slate. This is safe — the design doc confirms no user data to preserve.

### Task 1.1: Delete old card files

**Files to delete:**
- `src/lib/sm2.ts`
- `src/services/cardService.ts`
- `src/stores/cardStore.ts`
- `src/types/cards.ts`
- `src/pages/Cards.tsx`
- `src/pages/Sets.tsx`
- `src/pages/Set.tsx`
- `src/pages/Review.tsx`
- `src/components/ShareCardSetModal.tsx`
- `src/__tests__/sm2.test.ts`
- `src/__tests__/cardService.test.ts`
- `src/__tests__/sharing.test.ts`
- `scripts/seed-flashcards.ts`

**Step 1:** Delete all files listed above.

**Step 2:** Remove card-related routes from `src/App.tsx`. Remove these imports and route blocks:
- `import { Cards }` and the `/cards` route
- `import { Sets }` and the `/sets` route
- `import { Set }` and the `/sets/:setId` route
- `import { Review }` and the `/review` route

**Step 3:** Update `src/components/Sidebar.tsx` — remove the Flashcards nav item:
```typescript
// Remove this line from navItems:
{ label: T.nav.flashcards, icon: <IconCards size={17} />, path: '/sets' },
```
Remove the `IconCards` import.

**Step 4:** Update `src/pages/Dashboard.tsx` — remove `cardService` import and `dueCardsCount` state/fetch. Remove the "Cards Due" stat card. The dashboard will be rebuilt in Phase 8 but we need it to compile now. Replace the due cards fetch with a placeholder:
```typescript
// Remove: import { cardService } from '@/services/cardService'
// Remove: const [dueCardsCount, setDueCardsCount] = useState(0)
// Remove: cardService.getDueCards(user.id) from the Promise.all
// Remove: setDueCardsCount(dueCards.length)
// Remove: the stat card that shows dueCardsCount
```

**Step 5:** Run `bun run build` — verify no TypeScript errors.

**Step 6:** Run `bun run test` — verify all remaining tests pass. Delete or fix any tests that reference removed card code.

**Step 7:** Commit:
```bash
git add -A
git commit -m "chore: remove old card/SM-2 system (replaced by retention-first V2)"
```

### Task 1.2: Delete old progress service references

**Files:**
- Modify: `src/services/progressService.ts`
- Modify: `src/types/progress.ts`
- Delete: `src/__tests__/progressService.test.ts`

**Step 1:** Remove `getUserProgress` and `upsertProgress` from `progressService.ts`. Keep `markLessonComplete` — it's still used by the lesson page. The `user_progress` table is being dropped, but `lesson_progress` is staying.

**Step 2:** Remove the `UserProgress` interface from `src/types/progress.ts`. Keep `LessonProgress`.

**Step 3:** Update `src/pages/Profile.tsx`:
- Remove the `progressService.getUserProgress()` call and related state (`progress`)
- Remove the "Level" display row that shows `progress?.current_level`
- Remove the `UserProgress` import

**Step 4:** Run `bun run build` to verify no TypeScript errors.

**Step 5:** Run `bun run test` — delete `progressService.test.ts` if it only tests removed functions.

**Step 6:** Commit:
```bash
git add -A
git commit -m "chore: remove user_progress references (level/grammar mastery no longer tracked)"
```

---

## Phase 2: Foundation — Types, ts-fsrs, Answer Normalization

### Task 2.1: Install ts-fsrs and add new types

**Files:**
- Create: `src/types/learning.ts`
- Modify: `package.json`

**Step 1:** Install ts-fsrs:
```bash
bun add ts-fsrs
```

**Step 2:** Create `src/types/learning.ts` with all new types:

```typescript
// src/types/learning.ts

// === Content types ===

export type ItemType = 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
export type SourceType = 'lesson' | 'podcast' | 'flashcard' | 'manual'
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet'
export type VariantType = 'alternative_translation' | 'informal' | 'with_prefix' | 'without_prefix'

export interface LearningItem {
  id: string
  item_type: ItemType
  base_text: string
  normalized_text: string
  language: string
  level: string
  source_type: SourceType
  source_vocabulary_id: string | null
  source_card_id: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ItemMeaning {
  id: string
  learning_item_id: string
  translation_language: 'en' | 'nl'
  translation_text: string
  sense_label: string | null
  usage_note: string | null
  is_primary: boolean
}

export interface ItemContext {
  id: string
  learning_item_id: string
  context_type: ContextType
  source_text: string
  translation_text: string | null
  difficulty: string | null
  topic_tag: string | null
  is_anchor_context: boolean
  source_lesson_id: string | null
  source_section_id: string | null
}

export interface ItemAnswerVariant {
  id: string
  learning_item_id: string
  variant_text: string
  variant_type: VariantType
  language: string
  is_accepted: boolean
  notes: string | null
}

// === Learner state types ===

export type LearnerStage = 'new' | 'anchoring' | 'retrieving' | 'productive' | 'maintenance'
export type SkillType = 'recognition' | 'recall'

export interface LearnerItemState {
  id: string
  user_id: string
  learning_item_id: string
  stage: LearnerStage
  introduced_at: string | null
  last_seen_at: string | null
  priority: number | null
  origin: string | null
  times_seen: number
  is_leech: boolean
  suspended: boolean
  gate_check_passed: boolean | null
  updated_at: string
}

export interface LearnerSkillState {
  id: string
  user_id: string
  learning_item_id: string
  skill_type: SkillType
  stability: number
  difficulty: number
  retrievability: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  success_count: number
  failure_count: number
  lapse_count: number
  consecutive_failures: number
  mean_latency_ms: number | null
  hint_rate: number | null
  updated_at: string
}

export interface ReviewEvent {
  id: string
  user_id: string
  learning_item_id: string
  skill_type: SkillType
  exercise_type: ExerciseType
  session_id: string
  was_correct: boolean
  score: number | null
  latency_ms: number | null
  hint_used: boolean
  attempt_number: number
  raw_response: string | null
  normalized_response: string | null
  feedback_type: string | null
  scheduler_snapshot: Record<string, unknown> | null
  created_at: string
}

// === Exercise types ===

export type ExerciseType = 'recognition_mcq' | 'typed_recall' | 'cloze'

export interface ExerciseItem {
  learningItem: LearningItem
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  skillType: SkillType
  exerciseType: ExerciseType
  /** For MCQ: distractor options */
  distractors?: string[]
  /** For cloze: the sentence with blank and the target word */
  clozeContext?: {
    sentence: string
    targetWord: string
    translation: string | null
  }
}

export interface SessionQueueItem {
  exerciseItem: ExerciseItem
  learnerItemState: LearnerItemState | null
  learnerSkillState: LearnerSkillState | null
}

// === Session types ===

export type SessionType = 'lesson' | 'learning' | 'podcast' | 'practice'

// === Leaderboard types ===

export type LeaderboardMetric = 'total_seconds_spent' | 'lessons_completed' | 'items_learned' | 'days_active'

export interface LeaderboardEntry {
  user_id: string
  display_name: string | null
  items_learned: number
  lessons_completed: number
  total_seconds_spent: number
  days_active: number
}
```

**Step 3:** Run `bun run build` — verify no TypeScript errors.

**Step 4:** Commit:
```bash
git add package.json bun.lockb src/types/learning.ts
git commit -m "feat: add ts-fsrs dependency and V2 learning system types"
```

### Task 2.2: Answer normalization library

**Files:**
- Create: `src/lib/answerNormalization.ts`
- Create: `src/__tests__/answerNormalization.test.ts`

**Step 1:** Write the failing tests first in `src/__tests__/answerNormalization.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeAnswer, checkAnswer } from '@/lib/answerNormalization'

describe('normalizeAnswer', () => {
  it('trims whitespace', () => {
    expect(normalizeAnswer('  rumah  ')).toBe('rumah')
  })

  it('folds case', () => {
    expect(normalizeAnswer('Rumah')).toBe('rumah')
  })

  it('strips punctuation', () => {
    expect(normalizeAnswer('rumah!')).toBe('rumah')
    expect(normalizeAnswer('rumah.')).toBe('rumah')
    expect(normalizeAnswer("it's")).toBe('its')
  })

  it('removes parentheticals', () => {
    expect(normalizeAnswer('house (building)')).toBe('house')
  })

  it('handles combined transforms', () => {
    expect(normalizeAnswer('  Rumah Besar!  ')).toBe('rumah besar')
  })
})

describe('checkAnswer', () => {
  it('matches exact canonical answer', () => {
    const result = checkAnswer('rumah', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('matches with normalization', () => {
    const result = checkAnswer('  Rumah  ', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('matches a known variant', () => {
    const result = checkAnswer('home', 'house', ['home', 'dwelling'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('accepts typo within Levenshtein distance 1 of canonical', () => {
    const result = checkAnswer('rumha', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('accepts typo within Levenshtein distance 1 of variant', () => {
    const result = checkAnswer('hom', 'house', ['home'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('rejects wrong answers', () => {
    const result = checkAnswer('kucing', 'rumah', [])
    expect(result.isCorrect).toBe(false)
    expect(result.isFuzzy).toBe(false)
  })

  it('rejects answers beyond Levenshtein distance 1', () => {
    const result = checkAnswer('membeli', 'memberi', [])
    expect(result.isCorrect).toBe(false)
  })
})
```

**Step 2:** Run tests to verify they fail:
```bash
bun run test src/__tests__/answerNormalization.test.ts
```
Expected: FAIL — module not found.

**Step 3:** Implement `src/lib/answerNormalization.ts`:

```typescript
// src/lib/answerNormalization.ts

/**
 * Normalize a typed answer for comparison:
 * - Trim whitespace
 * - Case fold to lowercase
 * - Strip punctuation
 * - Remove parenthetical content
 */
export function normalizeAnswer(input: string): string {
  return input
    .replace(/\([^)]*\)/g, '')  // remove parentheticals
    .replace(/[^\w\s]/g, '')     // strip punctuation
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')       // collapse multiple spaces
}

/**
 * Levenshtein distance between two strings.
 * Early-exits if distance exceeds maxDistance.
 */
function levenshtein(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      rowMin = Math.min(rowMin, curr[j])
    }
    if (rowMin > maxDistance) return maxDistance + 1
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

export interface AnswerCheckResult {
  isCorrect: boolean
  isFuzzy: boolean
}

/**
 * Check a user's answer against the canonical answer and known variants.
 * Applies normalization, exact matching, then Levenshtein ≤ 1 fuzzy matching.
 */
export function checkAnswer(
  userAnswer: string,
  canonicalAnswer: string,
  acceptedVariants: string[]
): AnswerCheckResult {
  const normalized = normalizeAnswer(userAnswer)
  const normalizedCanonical = normalizeAnswer(canonicalAnswer)
  const normalizedVariants = acceptedVariants.map(normalizeAnswer)

  // Exact match against canonical or any variant
  if (normalized === normalizedCanonical || normalizedVariants.includes(normalized)) {
    return { isCorrect: true, isFuzzy: false }
  }

  // Fuzzy match (Levenshtein ≤ 1) against canonical and variants
  const allTargets = [normalizedCanonical, ...normalizedVariants]
  for (const target of allTargets) {
    if (levenshtein(normalized, target, 1) <= 1) {
      return { isCorrect: true, isFuzzy: true }
    }
  }

  return { isCorrect: false, isFuzzy: false }
}
```

**Step 4:** Run tests:
```bash
bun run test src/__tests__/answerNormalization.test.ts
```
Expected: ALL PASS.

**Step 5:** Commit:
```bash
git add src/lib/answerNormalization.ts src/__tests__/answerNormalization.test.ts
git commit -m "feat: add answer normalization with fuzzy matching for typed recall"
```

### Task 2.3: FSRS wrapper

**Files:**
- Create: `src/lib/fsrs.ts`
- Create: `src/__tests__/fsrs.test.ts`

**Step 1:** Write failing tests in `src/__tests__/fsrs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Rating } from 'ts-fsrs'
import { computeNextState, inferRating, type ReviewOutcome } from '@/lib/fsrs'

describe('inferRating', () => {
  it('returns Again for incorrect answers', () => {
    expect(inferRating({ wasCorrect: false, hintUsed: false, isFuzzy: false })).toBe(Rating.Again)
  })

  it('returns Hard for correct with hint', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: true, isFuzzy: false })).toBe(Rating.Hard)
  })

  it('returns Hard for correct with fuzzy match', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: false, isFuzzy: true })).toBe(Rating.Hard)
  })

  it('returns Good for clean correct answer', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: false, isFuzzy: false })).toBe(Rating.Good)
  })
})

describe('computeNextState', () => {
  it('returns valid FSRS state for a first review', () => {
    const result = computeNextState(null, Rating.Good)
    expect(result.stability).toBeGreaterThan(0)
    expect(result.difficulty).toBeGreaterThan(0)
    expect(result.nextDueAt).toBeInstanceOf(Date)
  })

  it('increases stability on Good rating', () => {
    const first = computeNextState(null, Rating.Good)
    const second = computeNextState(
      { stability: first.stability, difficulty: first.difficulty, lastReviewedAt: new Date() },
      Rating.Good
    )
    expect(second.stability).toBeGreaterThan(first.stability)
  })

  it('decreases stability on Again rating', () => {
    const first = computeNextState(null, Rating.Good)
    const lapsed = computeNextState(
      { stability: first.stability, difficulty: first.difficulty, lastReviewedAt: new Date() },
      Rating.Again
    )
    expect(lapsed.stability).toBeLessThan(first.stability)
  })
})
```

**Step 2:** Run tests to verify they fail:
```bash
bun run test src/__tests__/fsrs.test.ts
```

**Step 3:** Implement `src/lib/fsrs.ts`:

```typescript
// src/lib/fsrs.ts
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs'

const params = generatorParameters()
const scheduler = fsrs(params)

export { Rating }

export interface ReviewOutcome {
  wasCorrect: boolean
  hintUsed: boolean
  isFuzzy: boolean
}

export interface FSRSState {
  stability: number
  difficulty: number
  lastReviewedAt: Date | null
}

export interface FSRSResult {
  stability: number
  difficulty: number
  retrievability: number
  nextDueAt: Date
}

/**
 * Map exercise outcome to FSRS rating.
 * No Easy rating at launch — only Again/Hard/Good.
 */
export function inferRating(outcome: ReviewOutcome): Grade {
  if (!outcome.wasCorrect) return Rating.Again
  if (outcome.hintUsed || outcome.isFuzzy) return Rating.Hard
  return Rating.Good
}

/**
 * Compute next FSRS state after a review.
 * Pass null for currentState on first review of a new skill.
 */
export function computeNextState(currentState: FSRSState | null, rating: Grade): FSRSResult {
  const now = new Date()

  let card: Card
  if (currentState) {
    card = {
      ...createEmptyCard(now),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      last_review: currentState.lastReviewedAt ?? undefined,
    } as Card
  } else {
    card = createEmptyCard(now)
  }

  const result = scheduler.next(card, now, rating)
  const scheduled = result[rating]

  return {
    stability: scheduled.card.stability,
    difficulty: scheduled.card.difficulty,
    retrievability: scheduled.card.last_review ? (scheduler as any).get_retrievability(scheduled.card, now) ?? 1 : 1,
    nextDueAt: scheduled.card.due,
  }
}

/**
 * Compute current retrievability for a skill state.
 * Returns a number between 0 and 1.
 */
export function getRetrievability(stability: number, lastReviewedAt: Date): number {
  const now = new Date()
  const elapsedDays = (now.getTime() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
  if (elapsedDays <= 0) return 1
  // FSRS power forgetting curve: R = (1 + t / (9 * s))^(-1)
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}
```

**Step 4:** Run tests:
```bash
bun run test src/__tests__/fsrs.test.ts
```
Expected: ALL PASS. If `ts-fsrs` API differs from expected, adjust the wrapper accordingly — the test expectations (stability increases on Good, decreases on Again) are the invariants.

**Step 5:** Commit:
```bash
git add src/lib/fsrs.ts src/__tests__/fsrs.test.ts
git commit -m "feat: add FSRS-6 wrapper with rating inference from exercise outcomes"
```

### Task 2.4: Stage promotion/demotion logic

**Files:**
- Create: `src/lib/stages.ts`
- Create: `src/__tests__/stages.test.ts`

**Step 1:** Write failing tests in `src/__tests__/stages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { checkPromotion, checkDemotion } from '@/lib/stages'
import type { LearnerItemState, LearnerSkillState } from '@/types/learning'

// Helpers to build minimal test state
function makeItemState(overrides: Partial<LearnerItemState>): LearnerItemState {
  return {
    id: '1', user_id: 'u1', learning_item_id: 'li1',
    stage: 'new', introduced_at: null, last_seen_at: null,
    priority: null, origin: null, times_seen: 0,
    is_leech: false, suspended: false, gate_check_passed: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeSkillState(overrides: Partial<LearnerSkillState>): LearnerSkillState {
  return {
    id: '1', user_id: 'u1', learning_item_id: 'li1',
    skill_type: 'recognition',
    stability: 0, difficulty: 5, retrievability: null,
    last_reviewed_at: null, next_due_at: null,
    success_count: 0, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('checkPromotion', () => {
  it('promotes new → anchoring on first presentation', () => {
    const item = makeItemState({ stage: 'new' })
    expect(checkPromotion(item, null, null)).toBe('anchoring')
  })

  it('promotes anchoring → retrieving when recognition threshold met', () => {
    const item = makeItemState({ stage: 'anchoring', gate_check_passed: true })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 3 })
    expect(checkPromotion(item, recognition, null)).toBe('retrieving')
  })

  it('does not promote anchoring without enough recognition success', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 2 })
    expect(checkPromotion(item, recognition, null)).toBeNull()
  })

  it('promotes retrieving → productive with gate_check_passed=true (lower threshold)', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: true })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 3 })
    const recall = makeSkillState({ skill_type: 'recall', stability: 6, success_count: 3 })
    expect(checkPromotion(item, recognition, recall)).toBe('productive')
  })

  it('requires higher threshold for retrieving → productive when gate_check_passed=false', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: false })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 4 })
    const recall = makeSkillState({ skill_type: 'recall', stability: 6, success_count: 4 })
    // 4 successes < 5 required when gate check failed
    expect(checkPromotion(item, recognition, recall)).toBeNull()
  })

  it('promotes productive → maintenance when stability high and no recent lapses', () => {
    const item = makeItemState({ stage: 'productive' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 22, success_count: 10, lapse_count: 0 })
    const recall = makeSkillState({ skill_type: 'recall', stability: 22, success_count: 10, lapse_count: 0 })
    expect(checkPromotion(item, recognition, recall)).toBe('maintenance')
  })
})

describe('checkDemotion', () => {
  it('demotes on 2 consecutive failures', () => {
    const item = makeItemState({ stage: 'productive' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBe('retrieving')
  })

  it('does not demote on 1 failure', () => {
    const item = makeItemState({ stage: 'productive' })
    const skill = makeSkillState({ consecutive_failures: 1 })
    expect(checkDemotion(item, skill)).toBeNull()
  })

  it('floors demotion at anchoring', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBeNull()
  })

  it('demotes retrieving → anchoring', () => {
    const item = makeItemState({ stage: 'retrieving' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBe('anchoring')
  })
})
```

**Step 2:** Run tests to verify failure:
```bash
bun run test src/__tests__/stages.test.ts
```

**Step 3:** Implement `src/lib/stages.ts`:

```typescript
// src/lib/stages.ts
import type { LearnerItemState, LearnerSkillState, LearnerStage } from '@/types/learning'

// Promotion thresholds (tunable)
const ANCHORING_RECOGNITION_STABILITY = 2.0
const ANCHORING_RECOGNITION_SUCCESS = 3
const RETRIEVING_STABILITY = 5.0
const RETRIEVING_SUCCESS_GATE_PASSED = 3
const RETRIEVING_SUCCESS_GATE_FAILED = 5
const PRODUCTIVE_STABILITY = 21.0

const STAGE_ORDER: LearnerStage[] = ['new', 'anchoring', 'retrieving', 'productive', 'maintenance']

/**
 * Check if an item should be promoted to a higher stage.
 * Returns the new stage, or null if no promotion.
 */
export function checkPromotion(
  item: LearnerItemState,
  recognition: LearnerSkillState | null,
  recall: LearnerSkillState | null,
): LearnerStage | null {
  switch (item.stage) {
    case 'new':
      return 'anchoring'

    case 'anchoring': {
      if (!recognition) return null
      if (recognition.stability >= ANCHORING_RECOGNITION_STABILITY && recognition.success_count >= ANCHORING_RECOGNITION_SUCCESS) {
        return 'retrieving'
      }
      return null
    }

    case 'retrieving': {
      if (!recognition || !recall) return null
      const threshold = item.gate_check_passed ? RETRIEVING_SUCCESS_GATE_PASSED : RETRIEVING_SUCCESS_GATE_FAILED
      if (
        recognition.stability >= RETRIEVING_STABILITY &&
        recognition.success_count >= threshold &&
        recall.stability >= RETRIEVING_STABILITY &&
        recall.success_count >= threshold
      ) {
        return 'productive'
      }
      return null
    }

    case 'productive': {
      if (!recognition || !recall) return null
      if (
        recognition.stability >= PRODUCTIVE_STABILITY &&
        recognition.lapse_count === 0 &&
        recall.stability >= PRODUCTIVE_STABILITY &&
        recall.lapse_count === 0
      ) {
        return 'maintenance'
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Check if an item should be demoted due to consecutive failures.
 * Returns the new stage, or null if no demotion.
 * Demotion floors at anchoring — items never go back to new.
 */
export function checkDemotion(
  item: LearnerItemState,
  skill: LearnerSkillState,
): LearnerStage | null {
  if (skill.consecutive_failures < 2) return null

  const currentIndex = STAGE_ORDER.indexOf(item.stage)
  // Floor at anchoring (index 1)
  if (currentIndex <= 1) return null

  return STAGE_ORDER[currentIndex - 1]
}
```

**Step 4:** Run tests:
```bash
bun run test src/__tests__/stages.test.ts
```
Expected: ALL PASS.

**Step 5:** Commit:
```bash
git add src/lib/stages.ts src/__tests__/stages.test.ts
git commit -m "feat: add stage promotion/demotion logic with tunable thresholds"
```

---

## Phase 3: Database Migration

### Task 3.1: Write the V2 migration SQL

**Files:**
- Modify: `scripts/migration.sql`

This task modifies the existing migration SQL to be a complete, idempotent V2 schema. The migration script (`scripts/migrate.ts`) runs the entire file, so we need the complete state.

**Step 1:** Update `scripts/migration.sql`. Keep all existing tables that are retained (profiles, user_roles, lessons, lesson_sections, podcasts, lesson_progress, learning_sessions, error_logs). Make the following changes:

**Section A — Drop old view and tables (add before new table creates):**

```sql
-- V2 migration: drop old tables
DROP VIEW IF EXISTS indonesian.leaderboard;
DROP FUNCTION IF EXISTS indonesian.is_shared_with_current_user(uuid);
DROP FUNCTION IF EXISTS indonesian.current_user_owns_card_set(uuid);

-- Migrate existing review sessions before constraint change
UPDATE indonesian.learning_sessions SET session_type = 'practice' WHERE session_type = 'review';

DROP TABLE IF EXISTS indonesian.card_reviews CASCADE;
DROP TABLE IF EXISTS indonesian.anki_cards CASCADE;
DROP TABLE IF EXISTS indonesian.card_set_shares CASCADE;
DROP TABLE IF EXISTS indonesian.card_sets CASCADE;
DROP TABLE IF EXISTS indonesian.user_vocabulary CASCADE;
DROP TABLE IF EXISTS indonesian.user_progress CASCADE;
DROP TABLE IF EXISTS indonesian.vocabulary CASCADE;
```

**Section B — Update learning_sessions CHECK constraint:**

```sql
-- Update session type constraint for V2
ALTER TABLE indonesian.learning_sessions DROP CONSTRAINT IF EXISTS learning_sessions_session_type_check;
ALTER TABLE indonesian.learning_sessions ADD CONSTRAINT learning_sessions_session_type_check
  CHECK (session_type IN ('lesson', 'learning', 'podcast', 'practice'));
```

**Section C — Add preferred_session_size to profiles:**

```sql
ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS preferred_session_size integer NOT NULL DEFAULT 15;
```

**Section D — New content tables:**

```sql
-- Learning items (canonical teachable unit)
CREATE TABLE IF NOT EXISTS indonesian.learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('word', 'phrase', 'sentence', 'dialogue_chunk')),
  base_text text NOT NULL,
  normalized_text text NOT NULL,
  language text NOT NULL DEFAULT 'id',
  level text NOT NULL DEFAULT 'A1',
  source_type text NOT NULL DEFAULT 'lesson' CHECK (source_type IN ('lesson', 'podcast', 'flashcard', 'manual')),
  source_vocabulary_id uuid,
  source_card_id uuid,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(normalized_text, item_type)
);

-- Translations per item
CREATE TABLE IF NOT EXISTS indonesian.item_meanings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  translation_language text NOT NULL CHECK (translation_language IN ('en', 'nl')),
  translation_text text NOT NULL,
  sense_label text,
  usage_note text,
  is_primary boolean NOT NULL DEFAULT false
);

-- Example sentences and dialogue snippets
CREATE TABLE IF NOT EXISTS indonesian.item_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  context_type text NOT NULL CHECK (context_type IN ('example_sentence', 'dialogue', 'cloze', 'lesson_snippet')),
  source_text text NOT NULL,
  translation_text text,
  difficulty text,
  topic_tag text,
  is_anchor_context boolean NOT NULL DEFAULT false,
  source_lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL,
  source_section_id uuid REFERENCES indonesian.lesson_sections(id) ON DELETE SET NULL
);

-- Accepted alternative answers for typed recall
CREATE TABLE IF NOT EXISTS indonesian.item_answer_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  variant_text text NOT NULL,
  variant_type text NOT NULL CHECK (variant_type IN ('alternative_translation', 'informal', 'with_prefix', 'without_prefix')),
  language text NOT NULL DEFAULT 'id',
  is_accepted boolean NOT NULL DEFAULT true,
  notes text
);
```

**Section E — New learner tables:**

```sql
-- Per-user item lifecycle state
CREATE TABLE IF NOT EXISTS indonesian.learner_item_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  introduced_at timestamptz,
  last_seen_at timestamptz,
  priority integer,
  origin text,
  times_seen integer NOT NULL DEFAULT 0,
  is_leech boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  gate_check_passed boolean,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, learning_item_id)
);

-- Per-skill FSRS state per user per item
CREATE TABLE IF NOT EXISTS indonesian.learner_skill_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'recall')),
  stability numeric NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 0,
  retrievability numeric,
  last_reviewed_at timestamptz,
  next_due_at timestamptz,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  lapse_count integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  mean_latency_ms integer,
  hint_rate numeric,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, learning_item_id, skill_type)
);

-- Immutable review event log
CREATE TABLE IF NOT EXISTS indonesian.review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  skill_type text NOT NULL CHECK (skill_type IN ('recognition', 'recall')),
  exercise_type text NOT NULL CHECK (exercise_type IN ('recognition_mcq', 'typed_recall', 'cloze')),
  session_id uuid REFERENCES indonesian.learning_sessions(id) ON DELETE SET NULL,
  was_correct boolean NOT NULL,
  score numeric,
  latency_ms integer,
  hint_used boolean NOT NULL DEFAULT false,
  attempt_number integer NOT NULL DEFAULT 1,
  raw_response text,
  normalized_response text,
  feedback_type text,
  scheduler_snapshot jsonb,
  created_at timestamptz DEFAULT now()
);
```

**Section F — Indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_item_contexts_lesson ON indonesian.item_contexts(source_lesson_id);
CREATE INDEX IF NOT EXISTS idx_item_contexts_item_anchor ON indonesian.item_contexts(learning_item_id, is_anchor_context);
CREATE INDEX IF NOT EXISTS idx_learner_item_state_stage ON indonesian.learner_item_state(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_learner_skill_state_due ON indonesian.learner_skill_state(user_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_review_events_user_time ON indonesian.review_events(user_id, created_at);
```

**Section G — RLS for new tables:**

```sql
ALTER TABLE indonesian.learning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_meanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.item_answer_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_item_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.learner_skill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE indonesian.review_events ENABLE ROW LEVEL SECURITY;

-- Content tables: all authenticated can read
CREATE POLICY "learning_items_read" ON indonesian.learning_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_meanings_read" ON indonesian.item_meanings FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_contexts_read" ON indonesian.item_contexts FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_answer_variants_read" ON indonesian.item_answer_variants FOR SELECT TO authenticated USING (true);

-- Content tables: admin write
CREATE POLICY "learning_items_admin_write" ON indonesian.learning_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "item_meanings_admin_write" ON indonesian.item_meanings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "item_contexts_admin_write" ON indonesian.item_contexts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "item_answer_variants_admin_write" ON indonesian.item_answer_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Learner tables: owner-only
CREATE POLICY "learner_item_state_owner" ON indonesian.learner_item_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "learner_skill_state_owner" ON indonesian.learner_skill_state FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Review events: owner can SELECT + INSERT only (append-only)
CREATE POLICY "review_events_read" ON indonesian.review_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "review_events_insert" ON indonesian.review_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
```

**Section H — Grants for new tables:**

```sql
GRANT SELECT ON indonesian.learning_items TO authenticated;
GRANT SELECT ON indonesian.item_meanings TO authenticated;
GRANT SELECT ON indonesian.item_contexts TO authenticated;
GRANT SELECT ON indonesian.item_answer_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_item_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON indonesian.learner_skill_state TO authenticated;
GRANT SELECT, INSERT ON indonesian.review_events TO authenticated;
```

**Section I — Updated leaderboard view:**

```sql
CREATE OR REPLACE VIEW indonesian.leaderboard AS
SELECT
  p.id AS user_id,
  p.display_name,
  COALESCE(lis.items_learned, 0) AS items_learned,
  COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL) AS lessons_completed,
  COALESCE(SUM(ls.duration_seconds) FILTER (WHERE ls.duration_seconds IS NOT NULL), 0) AS total_seconds_spent,
  COUNT(DISTINCT DATE(ls.started_at)) FILTER (WHERE ls.duration_seconds IS NOT NULL OR ls.started_at > now() - interval '2 hours') AS days_active
FROM indonesian.profiles p
LEFT JOIN (
  SELECT user_id, COUNT(*) AS items_learned
  FROM indonesian.learner_item_state
  WHERE stage IN ('retrieving', 'productive', 'maintenance')
  GROUP BY user_id
) lis ON lis.user_id = p.id
LEFT JOIN indonesian.lesson_progress lp ON lp.user_id = p.id
LEFT JOIN indonesian.learning_sessions ls ON ls.user_id = p.id
  AND (ls.ended_at IS NOT NULL OR ls.started_at > now() - interval '2 hours')
GROUP BY p.id, p.display_name, lis.items_learned;

GRANT SELECT ON indonesian.leaderboard TO authenticated;
```

**Section J — Remove old grants (clean up references to dropped tables):**

Remove all `GRANT` lines for: `vocabulary`, `user_progress`, `user_vocabulary`, `card_sets`, `card_set_shares`, `anki_cards`, `card_reviews`.

Remove all RLS enable and policy lines for these dropped tables.

**Step 2:** Run `make migrate` to apply. Verify no SQL errors.

**Step 3:** Run `make check-supabase-deep` to verify schema state.

**Step 4:** Commit:
```bash
git add scripts/migration.sql
git commit -m "feat(db): V2 schema — learning items, FSRS state, review events, updated leaderboard"
```

### Task 3.2: Update health checks

**Files:**
- Modify: `scripts/check-supabase-deep.ts`

**Step 1:** Update the deep health check to verify:
- New tables exist: `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `learner_item_state`, `learner_skill_state`, `review_events`
- Old tables do NOT exist: `vocabulary`, `card_sets`, `anki_cards`, `card_reviews`, `card_set_shares`, `user_progress`, `user_vocabulary`
- RLS is enabled on all new tables
- Grants are correct for new tables

**Step 2:** Remove checks for dropped tables.

**Step 3:** Run `make check-supabase-deep` to verify all checks pass.

**Step 4:** Commit:
```bash
git add scripts/check-supabase-deep.ts
git commit -m "chore: update deep health checks for V2 schema"
```

---

## Phase 4: Services

### Task 4.1: Learning items service

**Files:**
- Create: `src/services/learningItemService.ts`
- Create: `src/__tests__/learningItemService.test.ts`

**Step 1:** Write failing tests:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { learningItemService } from '@/services/learningItemService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: [{ id: '1', base_text: 'rumah', item_type: 'word' }],
            error: null,
          })),
          order: vi.fn(() => ({
            data: [{ id: '1', base_text: 'rumah' }],
            error: null,
          })),
        })),
      })),
    })),
  },
}))

describe('learningItemService', () => {
  it('getLearningItems returns items', async () => {
    const items = await learningItemService.getLearningItems()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].base_text).toBe('rumah')
  })

  it('getItemsByLesson calls with correct lesson filter', async () => {
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: [{ id: '1', learning_item_id: 'li1', source_lesson_id: 'L1' }],
          error: null,
        })),
      })),
    }))
    vi.mocked(supabase.schema).mockReturnValue({ from: fromMock } as any)

    await learningItemService.getItemContextsByLesson('L1')
    expect(fromMock).toHaveBeenCalledWith('item_contexts')
  })
})
```

**Step 2:** Run tests to verify failure.

**Step 3:** Implement `src/services/learningItemService.ts`:

```typescript
// src/services/learningItemService.ts
import { supabase } from '@/lib/supabase'
import type { LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant } from '@/types/learning'

export const learningItemService = {
  async getLearningItems(): Promise<LearningItem[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('*')
      .eq('is_active', true)
      .order('base_text')
    if (error) throw error
    return data
  },

  async getLearningItem(id: string): Promise<LearningItem> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async getMeanings(itemId: string): Promise<ItemMeaning[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('*')
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getMeaningsBatch(itemIds: string[]): Promise<ItemMeaning[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('*')
      .in('learning_item_id', itemIds)
    if (error) throw error
    return data
  },

  async getContexts(itemId: string): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getContextsBatch(itemIds: string[]): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .in('learning_item_id', itemIds)
    if (error) throw error
    return data
  },

  async getItemContextsByLesson(lessonId: string): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .eq('source_lesson_id', lessonId)
    if (error) throw error
    return data
  },

  async getAnswerVariants(itemId: string): Promise<ItemAnswerVariant[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_answer_variants')
      .select('*')
      .eq('learning_item_id', itemId)
      .eq('is_accepted', true)
    if (error) throw error
    return data
  },

  async getAnswerVariantsBatch(itemIds: string[]): Promise<ItemAnswerVariant[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_answer_variants')
      .select('*')
      .in('learning_item_id', itemIds)
      .eq('is_accepted', true)
    if (error) throw error
    return data
  },
}
```

**Step 4:** Run tests. Expected: PASS.

**Step 5:** Commit:
```bash
git add src/services/learningItemService.ts src/__tests__/learningItemService.test.ts
git commit -m "feat: add learning items service for content queries"
```

### Task 4.2: Learner state service

**Files:**
- Create: `src/services/learnerStateService.ts`
- Create: `src/__tests__/learnerStateService.test.ts`

**Step 1:** Write failing tests:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { learnerStateService } from '@/services/learnerStateService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({ data: { id: '1' }, error: null })),
          })),
          error: null,
          data: null,
        })),
      })),
    })),
  },
}))

describe('learnerStateService', () => {
  it('getItemStates returns array', async () => {
    const states = await learnerStateService.getItemStates('user1')
    expect(Array.isArray(states)).toBe(true)
  })

  it('getDueSkills queries by user and due date', async () => {
    const selectMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    }))
    const fromMock = vi.fn(() => ({ select: selectMock }))
    vi.mocked(supabase.schema).mockReturnValue({ from: fromMock } as any)

    await learnerStateService.getDueSkills('user1')
    expect(fromMock).toHaveBeenCalledWith('learner_skill_state')
  })
})
```

**Step 2:** Run tests to verify failure.

**Step 3:** Implement `src/services/learnerStateService.ts`:

```typescript
// src/services/learnerStateService.ts
import { supabase } from '@/lib/supabase'
import type { LearnerItemState, LearnerSkillState, SkillType } from '@/types/learning'

export const learnerStateService = {
  async getItemStates(userId: string): Promise<LearnerItemState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data
  },

  async getItemState(userId: string, itemId: string): Promise<LearnerItemState | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', itemId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertItemState(state: Omit<LearnerItemState, 'id' | 'updated_at'>): Promise<LearnerItemState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .upsert({ ...state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,learning_item_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getSkillStates(userId: string, itemId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getSkillState(userId: string, itemId: string, skillType: SkillType): Promise<LearnerSkillState | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', itemId)
      .eq('skill_type', skillType)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertSkillState(state: Omit<LearnerSkillState, 'id' | 'updated_at'>): Promise<LearnerSkillState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .upsert({ ...state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,learning_item_id,skill_type' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getDueSkills(userId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
      .lte('next_due_at', new Date().toISOString())
      .order('next_due_at')
    if (error) throw error
    return data
  },

  async getAllSkillStates(userId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data
  },

  async getItemsLearnedCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('stage', ['retrieving', 'productive', 'maintenance'])
    if (error) throw error
    return count ?? 0
  },
}
```

**Step 4:** Run tests. Expected: PASS.

**Step 5:** Commit:
```bash
git add src/services/learnerStateService.ts src/__tests__/learnerStateService.test.ts
git commit -m "feat: add learner state service for FSRS state and item lifecycle"
```

### Task 4.3: Review event service

**Files:**
- Create: `src/services/reviewService.ts`
- Create: `src/__tests__/reviewService.test.ts`

**Step 1:** Write failing tests:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { reviewService } from '@/services/reviewService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: { id: 'rev1', was_correct: true },
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}))

describe('reviewService', () => {
  it('logReviewEvent inserts to review_events', async () => {
    const event = await reviewService.logReviewEvent({
      user_id: 'u1',
      learning_item_id: 'li1',
      skill_type: 'recognition',
      exercise_type: 'recognition_mcq',
      session_id: 's1',
      was_correct: true,
      score: null,
      latency_ms: 1500,
      hint_used: false,
      attempt_number: 1,
      raw_response: 'house',
      normalized_response: 'house',
      feedback_type: null,
      scheduler_snapshot: null,
    })
    expect(event.id).toBe('rev1')
  })
})
```

**Step 2:** Run tests to verify failure.

**Step 3:** Implement `src/services/reviewService.ts`:

```typescript
// src/services/reviewService.ts
import { supabase } from '@/lib/supabase'
import type { ReviewEvent } from '@/types/learning'

type ReviewEventInsert = Omit<ReviewEvent, 'id' | 'created_at'>

export const reviewService = {
  async logReviewEvent(event: ReviewEventInsert): Promise<ReviewEvent> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .insert(event)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getSessionEvents(sessionId: string): Promise<ReviewEvent[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at')
    if (error) throw error
    return data
  },
}
```

**Step 4:** Run tests. Expected: PASS.

**Step 5:** Commit:
```bash
git add src/services/reviewService.ts src/__tests__/reviewService.test.ts
git commit -m "feat: add review event service for append-only event logging"
```

### Task 4.4: Update session and leaderboard services

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/services/leaderboardService.ts`

**Step 1:** Update `src/lib/session.ts` — change `SessionType` and remove `'review'`:

```typescript
export type SessionType = 'lesson' | 'learning' | 'podcast' | 'practice'
```

**Step 2:** Update `src/services/leaderboardService.ts`:

```typescript
// src/services/leaderboardService.ts
import { supabase } from '@/lib/supabase'

export type LeaderboardMetric = 'total_seconds_spent' | 'lessons_completed' | 'items_learned' | 'days_active'

export interface LeaderboardEntry {
  user_id: string
  display_name: string | null
  items_learned: number
  lessons_completed: number
  total_seconds_spent: number
  days_active: number
}

export const leaderboardService = {
  async getLeaderboard(metric: LeaderboardMetric, limit = 20): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('leaderboard')
      .select('*')
      .order(metric, { ascending: false })
      .limit(limit)
    if (error) throw error
    return data as LeaderboardEntry[]
  },
}
```

**Step 3:** Update `src/pages/Leaderboard.tsx`:
- Replace `vocabulary_count` tab with `items_learned`
- Remove `current_level` from the table display
- Update `formatValue` to handle `items_learned` instead of `vocabulary_count`
- Update the `LeaderboardMetric` import to use the one from the service

**Step 4:** Run `bun run build` — verify no errors.

**Step 5:** Run `bun run test` — update `src/__tests__/leaderboardService.test.ts` if it exists.

**Step 6:** Commit:
```bash
git add src/lib/session.ts src/services/leaderboardService.ts src/pages/Leaderboard.tsx
git commit -m "feat: update session types and leaderboard for V2 (items_learned replaces vocabulary_count)"
```

---

## Phase 5: Session Engine

### Task 5.1: Session queue builder

**Files:**
- Create: `src/lib/sessionEngine.ts`
- Create: `src/__tests__/sessionEngine.test.ts`

This is the core of V2. The session engine assembles a queue of exercises from the learning item pool.

**Step 1:** Write failing tests in `src/__tests__/sessionEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSessionQueue, type SessionBuildInput } from '@/lib/sessionEngine'

function makeInput(overrides: Partial<SessionBuildInput> = {}): SessionBuildInput {
  return {
    allItems: [
      { id: 'li1', item_type: 'word', base_text: 'rumah', normalized_text: 'rumah', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
      { id: 'li2', item_type: 'word', base_text: 'kucing', normalized_text: 'kucing', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
      { id: 'li3', item_type: 'word', base_text: 'anjing', normalized_text: 'anjing', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
    ],
    meaningsByItem: {
      li1: [{ id: 'm1', learning_item_id: 'li1', translation_language: 'en', translation_text: 'house', sense_label: null, usage_note: null, is_primary: true }],
      li2: [{ id: 'm2', learning_item_id: 'li2', translation_language: 'en', translation_text: 'cat', sense_label: null, usage_note: null, is_primary: true }],
      li3: [{ id: 'm3', learning_item_id: 'li3', translation_language: 'en', translation_text: 'dog', sense_label: null, usage_note: null, is_primary: true }],
    },
    contextsByItem: {},
    variantsByItem: {},
    itemStates: {},
    skillStates: {},
    preferredSessionSize: 5,
    lessonFilter: null,
    userLanguage: 'en',
    ...overrides,
  }
}

describe('buildSessionQueue', () => {
  it('returns a queue up to preferredSessionSize', () => {
    const queue = buildSessionQueue(makeInput())
    expect(queue.length).toBeLessThanOrEqual(5)
    expect(queue.length).toBeGreaterThan(0)
  })

  it('includes new items when nothing is due', () => {
    const queue = buildSessionQueue(makeInput())
    expect(queue.some(q => q.exerciseItem.exerciseType === 'recognition_mcq')).toBe(true)
  })

  it('caps new items when due load is high', () => {
    const dueSkillStates: Record<string, any[]> = {}
    const itemStates: Record<string, any> = {}
    // Create 25 due items
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: `li${i}`, item_type: 'word' as const, base_text: `word${i}`, normalized_text: `word${i}`,
      language: 'id', level: 'A1', source_type: 'lesson' as const,
      source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }))
    const meanings: Record<string, any[]> = {}
    for (const item of items) {
      meanings[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `meaning${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
      itemStates[item.id] = {
        id: item.id, user_id: 'u1', learning_item_id: item.id, stage: 'retrieving',
        introduced_at: '', last_seen_at: '', priority: null, origin: null,
        times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
      }
      dueSkillStates[item.id] = [{
        id: `ss${item.id}`, user_id: 'u1', learning_item_id: item.id, skill_type: 'recall',
        stability: 3, difficulty: 5, retrievability: 0.5,
        last_reviewed_at: new Date(Date.now() - 86400000).toISOString(),
        next_due_at: new Date(Date.now() - 3600000).toISOString(),
        success_count: 3, failure_count: 1, lapse_count: 0, consecutive_failures: 0,
        mean_latency_ms: null, hint_rate: null, updated_at: '',
      }]
    }

    const queue = buildSessionQueue(makeInput({
      allItems: items,
      meaningsByItem: meanings,
      itemStates,
      skillStates: dueSkillStates,
      preferredSessionSize: 10,
    }))

    // With 25 due items and session size 10, new items should be capped at 2
    const newItems = queue.filter(q => !itemStates[q.exerciseItem.learningItem.id])
    expect(newItems.length).toBeLessThanOrEqual(2)
  })

  it('respects lessonFilter for scoped sessions', () => {
    const input = makeInput({
      contextsByItem: {
        li1: [{ id: 'c1', learning_item_id: 'li1', context_type: 'example_sentence', source_text: 'Ini rumah', translation_text: 'This is a house', difficulty: null, topic_tag: null, is_anchor_context: true, source_lesson_id: 'lesson-1', source_section_id: null }],
      },
      lessonFilter: 'lesson-1',
    })
    const queue = buildSessionQueue(input)
    // All items in queue should be from lesson-1
    for (const q of queue) {
      const contexts = input.contextsByItem[q.exerciseItem.learningItem.id] ?? []
      const fromLesson = contexts.some(c => c.source_lesson_id === 'lesson-1')
      const isNewFromPool = !input.itemStates[q.exerciseItem.learningItem.id]
      expect(fromLesson || isNewFromPool).toBe(true)
    }
  })
})
```

**Step 2:** Run tests to verify failure.

**Step 3:** Implement `src/lib/sessionEngine.ts`. This is the largest single file in V2:

```typescript
// src/lib/sessionEngine.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState, SkillType, ExerciseType,
  ExerciseItem, SessionQueueItem,
} from '@/types/learning'
import { getRetrievability } from '@/lib/fsrs'

export interface SessionBuildInput {
  allItems: LearningItem[]
  meaningsByItem: Record<string, ItemMeaning[]>
  contextsByItem: Record<string, ItemContext[]>
  variantsByItem: Record<string, ItemAnswerVariant[]>
  itemStates: Record<string, LearnerItemState>
  skillStates: Record<string, LearnerSkillState[]>
  preferredSessionSize: number
  lessonFilter: string | null
  userLanguage: 'en' | 'nl'
}

interface CandidateItem {
  item: LearningItem
  state: LearnerItemState | null
  skills: LearnerSkillState[]
  category: 'due' | 'weak' | 'new'
  priority: number
}

/**
 * Build a session queue from the learning item pool.
 */
export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { allItems, meaningsByItem, contextsByItem, variantsByItem, itemStates, skillStates, preferredSessionSize, lessonFilter, userLanguage } = input

  // Filter items by lesson if scoped
  let eligibleItems = allItems
  if (lessonFilter) {
    const lessonItemIds = new Set<string>()
    for (const [itemId, contexts] of Object.entries(contextsByItem)) {
      if (contexts.some(c => c.source_lesson_id === lessonFilter)) {
        lessonItemIds.add(itemId)
      }
    }
    eligibleItems = allItems.filter(i => lessonItemIds.has(i.id))
  }

  // Filter to items that have meanings in the user's language
  eligibleItems = eligibleItems.filter(i => {
    const meanings = meaningsByItem[i.id] ?? []
    return meanings.some(m => m.translation_language === userLanguage)
  })

  // Categorize items
  const now = new Date()
  const dueItems: CandidateItem[] = []
  const weakItems: CandidateItem[] = []
  const newItems: CandidateItem[] = []

  for (const item of eligibleItems) {
    const state = itemStates[item.id] ?? null
    const skills = skillStates[item.id] ?? []

    if (!state || state.stage === 'new') {
      newItems.push({ item, state, skills, category: 'new', priority: 0 })
      continue
    }

    if (state.suspended) continue

    // Check if any skill is due
    const dueSkills = skills.filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
    if (dueSkills.length > 0) {
      // Priority: lowest retrievability = most overdue
      const minRetrievability = Math.min(...dueSkills.map(s =>
        s.last_reviewed_at ? getRetrievability(s.stability, new Date(s.last_reviewed_at)) : 1
      ))
      dueItems.push({ item, state, skills, category: 'due', priority: 1 - minRetrievability })
    }

    // Weak items: high lapse count or only recognition (no recall skill yet)
    const hasHighLapses = skills.some(s => s.lapse_count >= 3)
    const hasOnlyRecognition = skills.length === 1 && skills[0].skill_type === 'recognition' && state.stage !== 'anchoring'
    if (hasHighLapses || hasOnlyRecognition) {
      weakItems.push({ item, state, skills, category: 'weak', priority: hasHighLapses ? 1 : 0.5 })
    }
  }

  // Sort by priority (highest first)
  dueItems.sort((a, b) => b.priority - a.priority)
  weakItems.sort((a, b) => b.priority - a.priority)

  // Calculate slot allocation
  const dueCount = dueItems.length
  const dueSlots = Math.round(preferredSessionSize * 0.55)
  const weakSlots = Math.round(preferredSessionSize * 0.15)
  const newSlots = calculateNewSlots(dueCount, preferredSessionSize)
  const contextSlots = Math.round(preferredSessionSize * 0.15)

  // Pick items for each category
  const pickedDue = dueItems.slice(0, dueSlots)
  const pickedWeak = weakItems.slice(0, weakSlots)
  const pickedNew = newItems.slice(0, newSlots)

  // Build exercise items from picked candidates
  const queue: SessionQueueItem[] = []

  for (const candidate of [...pickedDue, ...pickedWeak]) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  for (const candidate of pickedNew) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: null,
      })
    }
  }

  // Trim to session size
  const trimmed = queue.slice(0, preferredSessionSize)

  // Apply ordering rules: interleave types, start with easy, delay new items
  return orderQueue(trimmed)
}

function calculateNewSlots(dueCount: number, sessionSize: number): number {
  if (dueCount > 40) return 0
  if (dueCount > 20) return Math.min(2, Math.round(sessionSize * 0.15))
  return Math.round(sessionSize * 0.15)
}

function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
): ExerciseItem[] {
  const { item, state } = candidate
  const meanings = meaningsByItem[item.id] ?? []
  const contexts = contextsByItem[item.id] ?? []
  const variants = variantsByItem[item.id] ?? []
  const stage = state?.stage ?? 'new'

  const exercises: ExerciseItem[] = []
  const isSentenceType = item.item_type === 'sentence' || item.item_type === 'dialogue_chunk'

  // Determine which exercises are appropriate for this stage
  if (stage === 'new' || stage === 'anchoring') {
    // Recognition MCQ only
    exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  } else if (stage === 'retrieving') {
    if (isSentenceType) {
      exercises.push(makeClozeExercise(item, meanings, contexts, variants))
    } else {
      exercises.push(makeTypedRecall(item, meanings, contexts, variants, userLanguage))
    }
  } else {
    // productive / maintenance: any exercise type
    if (isSentenceType) {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    } else {
      // Alternate between recognition and recall for variety
      const preferRecall = Math.random() > 0.4
      if (preferRecall) {
        exercises.push(makeTypedRecall(item, meanings, contexts, variants, userLanguage))
      } else {
        exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
      }
    }
  }

  return exercises
}

function makeRecognitionMCQ(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = primaryMeaning?.translation_text ?? ''

  // Build distractors from other items at same level
  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => {
      const m = (meaningsByItem[i.id] ?? []).find(m => m.translation_language === userLanguage && m.is_primary)
        ?? (meaningsByItem[i.id] ?? []).find(m => m.translation_language === userLanguage)
      return m?.translation_text
    })
    .filter((d): d is string => d != null && d !== correctAnswer)

  // Shuffle and take 3
  const shuffled = distractors.sort(() => Math.random() - 0.5).slice(0, 3)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    distractors: shuffled,
  }
}

function makeTypedRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recall',
    exerciseType: 'typed_recall',
  }
}

function makeClozeExercise(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  // Find a cloze-type context, or use an anchor context
  const clozeContext = contexts.find(c => c.context_type === 'cloze')
    ?? contexts.find(c => c.is_anchor_context)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recall',
    exerciseType: 'cloze',
    clozeContext: clozeContext ? {
      sentence: clozeContext.source_text,
      targetWord: item.base_text,
      translation: clozeContext.translation_text,
    } : undefined,
  }
}

function orderQueue(queue: SessionQueueItem[]): SessionQueueItem[] {
  if (queue.length <= 1) return queue

  // Simple ordering: put recognition MCQ first (easy wins), then interleave
  const recognition = queue.filter(q => q.exerciseItem.exerciseType === 'recognition_mcq')
  const recall = queue.filter(q => q.exerciseItem.exerciseType === 'typed_recall')
  const cloze = queue.filter(q => q.exerciseItem.exerciseType === 'cloze')

  const ordered: SessionQueueItem[] = []

  // Start with 1-2 recognition items for momentum
  ordered.push(...recognition.splice(0, Math.min(2, recognition.length)))

  // Interleave remaining
  const remaining = [...recognition, ...recall, ...cloze].sort(() => Math.random() - 0.5)
  ordered.push(...remaining)

  return ordered
}
```

**Step 4:** Run tests:
```bash
bun run test src/__tests__/sessionEngine.test.ts
```
Expected: ALL PASS.

**Step 5:** Commit:
```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: add session engine with queue builder, exercise selection, and ordering"
```

### Task 5.2: Review handler (orchestrates FSRS + state updates)

**Files:**
- Create: `src/lib/reviewHandler.ts`
- Create: `src/__tests__/reviewHandler.test.ts`

This function is called after every exercise answer. It logs the event, updates FSRS state, and checks promotion/demotion.

**Step 1:** Write failing tests:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { processReview } from '@/lib/reviewHandler'
import type { ExerciseItem, LearnerItemState, LearnerSkillState } from '@/types/learning'

// Mock all external services
vi.mock('@/services/reviewService', () => ({
  reviewService: {
    logReviewEvent: vi.fn(async (event: any) => ({ ...event, id: 'rev1', created_at: new Date().toISOString() })),
  },
}))

vi.mock('@/services/learnerStateService', () => ({
  learnerStateService: {
    upsertItemState: vi.fn(async (state: any) => ({ ...state, id: 'lis1', updated_at: new Date().toISOString() })),
    upsertSkillState: vi.fn(async (state: any) => ({ ...state, id: 'lss1', updated_at: new Date().toISOString() })),
    getSkillStates: vi.fn(async () => []),
  },
}))

describe('processReview', () => {
  const exerciseItem: ExerciseItem = {
    learningItem: { id: 'li1', item_type: 'word', base_text: 'rumah', normalized_text: 'rumah', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
  }

  it('returns updated state after correct answer', async () => {
    const result = await processReview({
      userId: 'u1',
      sessionId: 's1',
      exerciseItem,
      currentItemState: null,
      currentSkillState: null,
      wasCorrect: true,
      isFuzzy: false,
      hintUsed: false,
      latencyMs: 1200,
      rawResponse: 'house',
      normalizedResponse: 'house',
    })

    expect(result.updatedSkillState.success_count).toBe(1)
    expect(result.updatedSkillState.consecutive_failures).toBe(0)
    expect(result.updatedItemState.stage).toBe('anchoring')
    expect(result.updatedItemState.times_seen).toBe(1)
  })

  it('increments consecutive_failures on incorrect answer', async () => {
    const existingSkill: LearnerSkillState = {
      id: 'lss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'recognition',
      stability: 2, difficulty: 5, retrievability: 0.8,
      last_reviewed_at: new Date().toISOString(), next_due_at: new Date().toISOString(),
      success_count: 3, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }

    const result = await processReview({
      userId: 'u1',
      sessionId: 's1',
      exerciseItem,
      currentItemState: { id: 'lis1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving', introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '' },
      currentSkillState: existingSkill,
      wasCorrect: false,
      isFuzzy: false,
      hintUsed: false,
      latencyMs: 3000,
      rawResponse: 'wrong',
      normalizedResponse: 'wrong',
    })

    expect(result.updatedSkillState.consecutive_failures).toBe(1)
    expect(result.updatedSkillState.failure_count).toBe(1)
  })
})
```

**Step 2:** Run tests to verify failure.

**Step 3:** Implement `src/lib/reviewHandler.ts`:

```typescript
// src/lib/reviewHandler.ts
import type { ExerciseItem, LearnerItemState, LearnerSkillState } from '@/types/learning'
import { inferRating, computeNextState } from '@/lib/fsrs'
import { checkPromotion, checkDemotion } from '@/lib/stages'
import { reviewService } from '@/services/reviewService'
import { learnerStateService } from '@/services/learnerStateService'

export interface ReviewInput {
  userId: string
  sessionId: string
  exerciseItem: ExerciseItem
  currentItemState: LearnerItemState | null
  currentSkillState: LearnerSkillState | null
  wasCorrect: boolean
  isFuzzy: boolean
  hintUsed: boolean
  latencyMs: number | null
  rawResponse: string | null
  normalizedResponse: string | null
}

export interface ReviewResult {
  updatedItemState: LearnerItemState
  updatedSkillState: LearnerSkillState
  stageChanged: boolean
  previousStage: string | null
}

export async function processReview(input: ReviewInput): Promise<ReviewResult> {
  const { userId, sessionId, exerciseItem, currentItemState, currentSkillState, wasCorrect, isFuzzy, hintUsed, latencyMs, rawResponse, normalizedResponse } = input
  const { learningItem, skillType, exerciseType } = exerciseItem

  // 1. Compute FSRS rating and next state
  const rating = inferRating({ wasCorrect, hintUsed, isFuzzy })
  const fsrsState = currentSkillState
    ? { stability: currentSkillState.stability, difficulty: currentSkillState.difficulty, lastReviewedAt: currentSkillState.last_reviewed_at ? new Date(currentSkillState.last_reviewed_at) : null }
    : null
  const nextFSRS = computeNextState(fsrsState, rating)

  // 2. Build updated skill state
  const now = new Date().toISOString()
  const updatedSkillState: Omit<LearnerSkillState, 'id' | 'updated_at'> = {
    user_id: userId,
    learning_item_id: learningItem.id,
    skill_type: skillType,
    stability: nextFSRS.stability,
    difficulty: nextFSRS.difficulty,
    retrievability: nextFSRS.retrievability,
    last_reviewed_at: now,
    next_due_at: nextFSRS.nextDueAt.toISOString(),
    success_count: (currentSkillState?.success_count ?? 0) + (wasCorrect ? 1 : 0),
    failure_count: (currentSkillState?.failure_count ?? 0) + (wasCorrect ? 0 : 1),
    lapse_count: (currentSkillState?.lapse_count ?? 0) + (!wasCorrect && (currentSkillState?.success_count ?? 0) > 0 ? 1 : 0),
    consecutive_failures: wasCorrect ? 0 : (currentSkillState?.consecutive_failures ?? 0) + 1,
    mean_latency_ms: latencyMs ?? currentSkillState?.mean_latency_ms ?? null,
    hint_rate: currentSkillState?.hint_rate ?? null,
  }

  // 3. Build updated item state
  const previousStage = currentItemState?.stage ?? 'new'
  const updatedItemState: Omit<LearnerItemState, 'id' | 'updated_at'> = {
    user_id: userId,
    learning_item_id: learningItem.id,
    stage: previousStage === 'new' ? 'anchoring' : previousStage,
    introduced_at: currentItemState?.introduced_at ?? now,
    last_seen_at: now,
    priority: currentItemState?.priority ?? null,
    origin: currentItemState?.origin ?? null,
    times_seen: (currentItemState?.times_seen ?? 0) + 1,
    is_leech: (currentSkillState?.lapse_count ?? 0) >= 8,
    suspended: currentItemState?.suspended ?? false,
    gate_check_passed: currentItemState?.gate_check_passed ?? null,
  }

  // 4. Persist skill state first (needed for promotion check)
  const savedSkill = await learnerStateService.upsertSkillState(updatedSkillState as any)

  // 5. Check promotion/demotion
  // Get all skill states for this item to check both facets
  const allSkills = await learnerStateService.getSkillStates(userId, learningItem.id)
  const recognition = allSkills.find(s => s.skill_type === 'recognition') ?? (skillType === 'recognition' ? savedSkill : null)
  const recall = allSkills.find(s => s.skill_type === 'recall') ?? (skillType === 'recall' ? savedSkill : null)

  const itemStateForCheck = { ...updatedItemState, id: currentItemState?.id ?? '' } as LearnerItemState

  // Check demotion first (takes priority)
  const demotionTarget = checkDemotion(itemStateForCheck, savedSkill)
  if (demotionTarget) {
    updatedItemState.stage = demotionTarget
  } else {
    // Check promotion
    const promotionTarget = checkPromotion(itemStateForCheck, recognition, recall)
    if (promotionTarget) {
      updatedItemState.stage = promotionTarget
    }
  }

  // 6. Persist item state
  const savedItem = await learnerStateService.upsertItemState(updatedItemState as any)

  // 7. Log review event (fire and forget for scheduler_snapshot)
  await reviewService.logReviewEvent({
    user_id: userId,
    learning_item_id: learningItem.id,
    skill_type: skillType,
    exercise_type: exerciseType,
    session_id: sessionId,
    was_correct: wasCorrect,
    score: null,
    latency_ms: latencyMs,
    hint_used: hintUsed,
    attempt_number: 1,
    raw_response: rawResponse,
    normalized_response: normalizedResponse,
    feedback_type: null,
    scheduler_snapshot: {
      stability: nextFSRS.stability,
      difficulty: nextFSRS.difficulty,
      retrievability: nextFSRS.retrievability,
      next_due_at: nextFSRS.nextDueAt.toISOString(),
    },
  })

  return {
    updatedItemState: savedItem,
    updatedSkillState: savedSkill,
    stageChanged: savedItem.stage !== previousStage,
    previousStage,
  }
}
```

**Step 4:** Run tests:
```bash
bun run test src/__tests__/reviewHandler.test.ts
```
Expected: ALL PASS.

**Step 5:** Commit:
```bash
git add src/lib/reviewHandler.ts src/__tests__/reviewHandler.test.ts
git commit -m "feat: add review handler orchestrating FSRS updates, stage transitions, and event logging"
```

---

## Phase 6: Exercise Components

### Task 6.1: Recognition MCQ component

**Files:**
- Create: `src/components/exercises/RecognitionMCQ.tsx`
- Create: `src/components/exercises/RecognitionMCQ.module.css`

**Step 1:** Create the component. It shows the Indonesian word and 4 multiple choice options. On answer, it calls the `onAnswer` callback with the result.

The component receives:
- `exerciseItem: ExerciseItem` — the exercise to render
- `userLanguage: 'en' | 'nl'` — for translation display
- `onAnswer: (wasCorrect: boolean, latencyMs: number) => void`

Key UX:
- Show Indonesian word prominently
- 4 options (1 correct + 3 distractors) shuffled
- Tap an option → highlight green/red → brief pause → call onAnswer
- Show correct answer + anchor context in feedback

**Step 2:** Run `bun run build` — verify no TypeScript errors.

**Step 3:** Commit:
```bash
git add src/components/exercises/
git commit -m "feat: add Recognition MCQ exercise component"
```

### Task 6.2: Typed Recall component

**Files:**
- Create: `src/components/exercises/TypedRecall.tsx`
- Create: `src/components/exercises/TypedRecall.module.css`

**Step 1:** Create the component. Shows the meaning in user's language, asks user to type the Indonesian word.

The component receives:
- `exerciseItem: ExerciseItem`
- `userLanguage: 'en' | 'nl'`
- `onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void`

Key UX:
- Show translation prominently
- Text input, auto-focused
- Submit on Enter or button click
- Use `checkAnswer()` from answerNormalization
- Show correct/incorrect feedback with the canonical answer

**Step 2:** Run `bun run build` — verify no errors.

**Step 3:** Commit:
```bash
git add src/components/exercises/
git commit -m "feat: add Typed Recall exercise component with answer normalization"
```

### Task 6.3: Cloze component

**Files:**
- Create: `src/components/exercises/Cloze.tsx`
- Create: `src/components/exercises/Cloze.module.css`

**Step 1:** Create the component. Shows a sentence with a blank, asks user to fill in the missing word.

The component receives:
- `exerciseItem: ExerciseItem` (with `clozeContext`)
- `onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void`

Key UX:
- Show sentence with `___` for the missing word
- Show translation below
- Text input for the answer
- Use `checkAnswer()` for validation
- Feedback shows the correct word in context

**Step 2:** Run `bun run build` — verify no errors.

**Step 3:** Commit:
```bash
git add src/components/exercises/
git commit -m "feat: add Cloze exercise component"
```

### Task 6.4: Exercise feedback component

**Files:**
- Create: `src/components/exercises/ExerciseFeedback.tsx`
- Create: `src/components/exercises/ExerciseFeedback.module.css`

**Step 1:** Create a shared feedback component shown after every exercise:
- Green/red banner for correct/incorrect
- Shows the correct answer
- Shows one anchor context (example sentence)
- "Continue" button to proceed

**Step 2:** Run `bun run build` — verify no errors.

**Step 3:** Commit:
```bash
git add src/components/exercises/
git commit -m "feat: add shared exercise feedback component"
```

---

## Phase 7: Session Page

### Task 7.1: Session page — exercise delivery loop

**Files:**
- Create: `src/pages/Session.tsx`
- Create: `src/pages/Session.module.css`

**Step 1:** Create the session page at route `/session`. This is the main learning experience.

Flow:
1. On mount: load all data needed for `buildSessionQueue()` — learning items, meanings, contexts, variants, learner states, skill states
2. Build queue
3. Show exercises one at a time using the exercise components from Phase 6
4. After each answer: call `processReview()`, show feedback, advance to next
5. Track progress (completed/total) with a progress bar
6. On completion: update `learning_sessions.ended_at`, show summary

State management:
- `queue: SessionQueueItem[]`
- `currentIndex: number`
- `sessionId: string`
- `showFeedback: boolean`
- `lastResult: ReviewResult | null`
- `results: { correct: number, total: number }`

**Step 2:** Add the `/session` route to `src/App.tsx`:
```typescript
import { Session } from '@/pages/Session'
// Add route:
<Route path="/session" element={<ProtectedRoute><Session /></ProtectedRoute>} />
```

Also add an optional query param route for scoped sessions:
```typescript
// /session?lesson=<lessonId> triggers a scoped session
```

**Step 3:** Run `bun run build` — verify no errors.

**Step 4:** Commit:
```bash
git add src/pages/Session.tsx src/pages/Session.module.css src/App.tsx
git commit -m "feat: add session page with exercise delivery loop and FSRS integration"
```

### Task 7.2: Session summary component

**Files:**
- Create: `src/components/SessionSummary.tsx`
- Create: `src/components/SessionSummary.module.css`

**Step 1:** Create summary screen shown after session completion:
- Total items reviewed
- Correct / incorrect count
- New items introduced
- Stage promotions (if any)
- "Continue" button (builds another queue) and "Done" button (navigates to dashboard)

**Step 2:** Wire it into `Session.tsx` — shown when `currentIndex >= queue.length`.

**Step 3:** Run `bun run build`.

**Step 4:** Commit:
```bash
git add src/components/SessionSummary.tsx src/components/SessionSummary.module.css src/pages/Session.tsx
git commit -m "feat: add session summary screen with stats and continue option"
```

---

## Phase 8: Page Updates

### Task 8.1: Dashboard — redesign for session-first experience

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Dashboard.module.css`

**Step 1:** Rewrite the dashboard to show:
- **Header strip**: items due count, minutes today, current streak (from learning_sessions)
- **Hero card**: "Start Today's Session" with summary text (X reviews due, Y new from next lesson, W weak items). Links to `/session`.
- **Quick actions**: "Continue Lesson" (link to next incomplete lesson), "Practice Weak Words" (link to `/session?weak=true`)
- **Progress snapshot**: items by stage (stable, productive, learning)

Data fetching:
- `learnerStateService.getDueSkills(userId)` → due count
- `learnerStateService.getItemStates(userId)` → stage counts
- `lessonService.getUserLessonProgress(userId)` → continue lesson URL

**Step 2:** Run `bun run build`.

**Step 3:** Commit:
```bash
git add src/pages/Dashboard.tsx src/pages/Dashboard.module.css
git commit -m "feat: redesign dashboard for session-first learning experience"
```

### Task 8.2: Lesson detail — add vocabulary tab

**Files:**
- Modify: `src/pages/Lesson.tsx`
- Modify: `src/pages/Lesson.module.css`

**Step 1:** Add a "Vocabulary" tab to the lesson detail page alongside the existing "Learn" section navigation. The vocabulary tab shows:
- All learning items from this lesson (queried via `item_contexts.source_lesson_id`)
- Each item shows: Indonesian text, translation, mastery indicator (stage badge + skill strength bar)
- "Practice This Lesson" button → navigates to `/session?lesson=<lessonId>`

Use Mantine `Tabs` for Learn vs Vocabulary tabs.

**Step 2:** Run `bun run build`.

**Step 3:** Commit:
```bash
git add src/pages/Lesson.tsx src/pages/Lesson.module.css
git commit -m "feat: add vocabulary tab to lesson detail with per-item mastery and scoped practice"
```

### Task 8.3: Profile — add session size preference

**Files:**
- Modify: `src/pages/Profile.tsx`

**Step 1:** Add a "Session Size" setting to the profile page:
- Slider from 5 to 30 (default 15)
- Persisted to `profiles.preferred_session_size` in Supabase
- Label shows the current value

**Step 2:** Update `src/stores/authStore.ts` to include `preferred_session_size` in the profile type and fetch.

**Step 3:** Run `bun run build`.

**Step 4:** Commit:
```bash
git add src/pages/Profile.tsx src/stores/authStore.ts
git commit -m "feat: add session size preference slider to profile"
```

### Task 8.4: Progress page (new)

**Files:**
- Create: `src/pages/Progress.tsx`
- Create: `src/pages/Progress.module.css`

**Step 1:** Create a progress page at `/progress` showing:
- Total items by stage (bar chart or stacked display)
- Recognition vs recall strength comparison
- Lesson completion progress
- Items due today / this week

**Step 2:** Add route to `src/App.tsx`.

**Step 3:** Run `bun run build`.

**Step 4:** Commit:
```bash
git add src/pages/Progress.tsx src/pages/Progress.module.css src/App.tsx
git commit -m "feat: add progress page with memory strength and lesson completion overview"
```

---

## Phase 9: Navigation, Routing & i18n

### Task 9.1: Update sidebar navigation

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1:** Update nav items to V2 structure:
```typescript
const navItems = [
  { label: T.nav.home,        icon: <IconHome size={17} />,        path: '/' },
  { label: T.nav.lessons,     icon: <IconBook size={17} />,        path: '/lessons' },
  { label: T.nav.podcasts,    icon: <IconHeadphones size={17} />,  path: '/podcasts' },
  { label: T.nav.progress,    icon: <IconChartBar size={17} />,    path: '/progress' },
  { label: T.nav.leaderboard, icon: <IconTrophy size={17} />,      path: '/leaderboard' },
]
```

Add `IconChartBar` import from `@tabler/icons-react`.

**Step 2:** Run `bun run build`.

**Step 3:** Commit:
```bash
git add src/components/Sidebar.tsx
git commit -m "feat: update sidebar navigation for V2 (progress replaces flashcards)"
```

### Task 9.2: Add i18n keys for V2

**Files:**
- Modify: `src/lib/i18n.ts`

**Step 1:** Add translation keys for all new UI text. Check the `translations` object structure and add keys for:
- Session: start, continue, complete, summary, correct, incorrect, due, new, weak
- Exercises: what does X mean, how do you say X, fill in the blank, type your answer, check, correct answer
- Dashboard: items due, start session, practice weak words, items learned
- Progress: memory strength, recognition, recall, items by stage
- Profile: session size
- Leaderboard: items learned (replaces words)
- Navigation: progress

Add both `en` and `nl` translations.

**Step 2:** Run `bun run build`.

**Step 3:** Commit:
```bash
git add src/lib/i18n.ts
git commit -m "feat: add EN/NL translations for V2 session, exercise, and progress UI"
```

---

## Phase 10: Seed Script & Content Pipeline

### Task 10.1: Learning items seed script

**Files:**
- Create: `scripts/seed-learning-items.ts`
- Modify: `Makefile`

**Step 1:** Create the seed script that:
1. Reads learning item data files from `scripts/data/learning-items-lesson-*.ts`
2. Upserts to `learning_items` on `(normalized_text, item_type)`
3. Upserts associated `item_meanings`, `item_contexts`, `item_answer_variants`
4. Is idempotent — safe to re-run

Uses the Supabase service key (same pattern as other seed scripts).

**Step 2:** Update `Makefile`:
```makefile
.PHONY: seed-learning-items
seed-learning-items: ## Seed learning items from data files (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-learning-items.ts

.PHONY: seed-all
seed-all: seed-lessons seed-podcasts seed-learning-items ## Seed all non-audio content (requires SUPABASE_SERVICE_KEY)
```

Remove `seed-vocabulary` and `seed-flashcards` from `seed-all` and their standalone targets.

**Step 3:** Delete `scripts/seed-vocabulary.ts` and `scripts/seed-flashcards.ts`.

**Step 4:** Run `make seed-learning-items` (requires learning item data files to exist — skip if no data files yet).

**Step 5:** Commit:
```bash
git add scripts/seed-learning-items.ts Makefile
git rm scripts/seed-vocabulary.ts scripts/seed-flashcards.ts
git commit -m "feat: add learning items seed script, remove old vocabulary/flashcard seeders"
```

---

## Phase 11: Final Verification

### Task 11.1: Full build and test suite

**Step 1:** Run the full build:
```bash
bun run build
```
Fix any TypeScript errors.

**Step 2:** Run the full test suite:
```bash
bun run test
```
Fix any failing tests.

**Step 3:** Run lint:
```bash
bun run lint
```
Fix any lint errors.

**Step 4:** Commit any fixes:
```bash
git add -A
git commit -m "fix: resolve build and test issues from V2 integration"
```

### Task 11.2: Manual smoke test

**Step 1:** Start the dev server:
```bash
bun run dev
```

**Step 2:** Verify the following flows work:
- [ ] Login → see dashboard with "Start Session" CTA
- [ ] Dashboard shows due count (0 if no data)
- [ ] Click "Start Session" → session page loads
- [ ] If learning items are seeded: exercises render, answers are accepted, feedback shows
- [ ] Session completes → summary screen shows stats
- [ ] "Continue" builds another queue
- [ ] Lessons page → lesson detail → Vocabulary tab shows items
- [ ] "Practice This Lesson" → scoped session
- [ ] Profile → session size slider works
- [ ] Leaderboard → "Items Learned" tab replaces "Words"
- [ ] Progress page shows memory strength data
- [ ] Sidebar navigation is correct (no Flashcards, has Progress)

**Step 3:** Run health checks:
```bash
make check-supabase
make check-supabase-deep
```

### Task 11.3: Final commit

```bash
git add -A
git commit -m "feat: retention-first V2 learning system — FSRS-6, session engine, exercise components"
```

---

## Summary

| Phase | Tasks | Key deliverables |
|-------|-------|-----------------|
| 1. Cleanup | 1.1–1.2 | Remove old card system, SM-2, progress refs |
| 2. Foundation | 2.1–2.4 | Types, ts-fsrs, answer normalization, stage logic |
| 3. Database | 3.1–3.2 | V2 schema migration, health checks |
| 4. Services | 4.1–4.4 | Learning items, learner state, review, leaderboard services |
| 5. Session Engine | 5.1–5.2 | Queue builder, review handler |
| 6. Exercises | 6.1–6.4 | MCQ, typed recall, cloze, feedback components |
| 7. Session Page | 7.1–7.2 | Exercise delivery loop, summary screen |
| 8. Pages | 8.1–8.4 | Dashboard, lesson vocab tab, profile, progress |
| 9. Navigation | 9.1–9.2 | Sidebar, routing, i18n |
| 10. Pipeline | 10.1 | Learning items seed script |
| 11. Verification | 11.1–11.3 | Build, tests, smoke test, final commit |
