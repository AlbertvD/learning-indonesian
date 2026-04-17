# Exercise Flow Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply three independent correctness fixes in the exercise delivery path. Each commits separately; order is free.

**Design doc:** `docs/plans/2026-04-17-exercise-flow-fixes-design.md`

**Tech stack:** React 19, TypeScript, Vitest, @testing-library/react, @mantine/core.

---

## Fix 1 — Grammar cloze_mcq explanation plumb-through

### Task 1.1: Add explanationText to the ClozeMcqData inline type

**Files:**
- Modify: `src/types/learning.ts:204–209`
- Modify: `src/lib/sessionQueue.ts` (add `/** @internal exported for tests */` export of `makeGrammarExercise`)

**Export-for-testing**: `makeGrammarExercise` is currently module-private at `sessionQueue.ts:208`. Export it with an `@internal` JSDoc comment so tests can call it directly with a constructed `ExerciseVariant` input — simpler and more targeted than fabricating a full `buildSessionQueue` fixture with grammar patterns. Matches the approach Task 3.1/3.2 uses for the cloze builders.

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts` — a new `describe` block at the bottom of the file:

```ts
import { makeGrammarExercise } from '@/lib/sessionQueue'
import type { ExerciseVariant, GrammarPatternWithLesson } from '@/types/learning'

describe('makeGrammarExercise — cloze_mcq explanation plumb-through', () => {
  it('populates clozeMcqData.explanationText when the variant payload contains it', () => {
    const pattern = {
      id: 'pat-1',
      name: 'bukan vs tidak',
      introduced_by_lesson_order: 3,
    } as GrammarPatternWithLesson
    const variant: ExerciseVariant = {
      id: 'var-1',
      grammar_pattern_id: 'pat-1',
      context_id: null,
      exercise_type: 'cloze_mcq',
      payload_json: {
        sentence: 'Ini ___ buku.',
        translation: 'Dit is geen boek.',
        options: ['bukan', 'tidak'],
        explanationText: 'bukan negates nouns; tidak negates verbs/adjectives.',
      },
      answer_key_json: { correctOptionId: 'bukan' },
      is_active: true,
      created_at: '',
      updated_at: '',
    }

    const exercise = makeGrammarExercise(pattern, variant)

    expect(exercise.exerciseType).toBe('cloze_mcq')
    expect(exercise.clozeMcqData?.explanationText).toBe(
      'bukan negates nouns; tidak negates verbs/adjectives.'
    )
  })

  it('leaves explanationText undefined when the payload omits it', () => {
    const pattern = {
      id: 'pat-2',
      name: 'test',
      introduced_by_lesson_order: 3,
    } as GrammarPatternWithLesson
    const variant: ExerciseVariant = {
      id: 'var-2',
      grammar_pattern_id: 'pat-2',
      context_id: null,
      exercise_type: 'cloze_mcq',
      payload_json: {
        sentence: 'Ini ___ buku.',
        translation: 'Dit is geen boek.',
        options: ['bukan', 'tidak'],
      },
      answer_key_json: { correctOptionId: 'bukan' },
      is_active: true,
      created_at: '',
      updated_at: '',
    }

    const exercise = makeGrammarExercise(pattern, variant)
    expect(exercise.clozeMcqData?.explanationText).toBeUndefined()
  })
})
```

Add the export to `src/lib/sessionQueue.ts:208`:

```ts
/** @internal exported for tests */
export function makeGrammarExercise(
```

**Step 2: Run test, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: fails compiling or fails asserting because `clozeMcqData.explanationText` is not a valid type field yet.

**Step 3: Add `explanationText?: string` to the inline type**

In `src/types/learning.ts`, change lines 204–209 from:

```ts
clozeMcqData?: {
  sentence: string
  translation: string | null
  options: string[]
  correctOptionId: string
}
```

to:

```ts
clozeMcqData?: {
  sentence: string
  translation: string | null
  options: string[]
  correctOptionId: string
  explanationText?: string
}
```

**Step 4: Run tests**

Test still fails on the assertion because the builders don't populate the field yet. That's expected — proceed to Task 1.2.

**Step 5: Commit (squashed with Tasks 1.2 and 1.3)** — don't commit yet; the type change is not useful until the builders populate it.

---

### Task 1.2: Populate explanationText in makeGrammarExercise

**Files:**
- Modify: `src/lib/sessionQueue.ts:279–294` (the `case 'cloze_mcq'` branch in `makeGrammarExercise`)

**Step 1: The test from Task 1.1 is already failing on assertion**

**Step 2: Update makeGrammarExercise**

In `sessionQueue.ts:279–294`, change:

```ts
case 'cloze_mcq':
  return {
    ...base,
    skillType: 'recognition',
    clozeMcqData: {
      sentence: payload.sentence || '',
      translation: (payload.translation as string | null) ?? null,
      options: (payload.options as string[]) || [],
      correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
    },
  }
```

to:

```ts
case 'cloze_mcq':
  return {
    ...base,
    skillType: 'recognition',
    clozeMcqData: {
      sentence: payload.sentence || '',
      translation: (payload.translation as string | null) ?? null,
      options: (payload.options as string[]) || [],
      correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
      explanationText: (payload.explanationText as string) || undefined,
    },
  }
```

Note: `|| undefined` rather than `|| ''` so missing → undefined (consistent with the type's `string | undefined`, and the feedback screen guards on truthy).

**Step 3: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: the Task 1.1 test now passes for the `buildGrammarQueue` call path.

---

### Task 1.3: Populate explanationText in makePublishedExercise

**Files:**
- Modify: `src/lib/sessionQueue.ts:762–772` (the `case 'cloze_mcq'` branch in `makePublishedExercise`)
- Modify: `src/lib/sessionQueue.ts` (add `/** @internal exported for tests */` export of `makePublishedExercise`)

**Step 1: Write the failing test**

Export `makePublishedExercise` from `sessionQueue.ts:736` with the `@internal` JSDoc comment, same pattern as Task 1.1.

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
import { makePublishedExercise } from '@/lib/sessionQueue'
import type { ItemContext, LearningItem } from '@/types/learning'

it('makePublishedExercise: populates clozeMcqData.explanationText from payload_json', () => {
  const item: LearningItem = {
    id: 'item-1', item_type: 'word', base_text: 'bukan', normalized_text: 'bukan',
    language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
  }
  const context: ItemContext = {
    id: 'ctx-1', learning_item_id: 'item-1', context_type: 'example_sentence',
    source_text: 'Ini bukan buku.', translation_text: 'Dit is geen boek.',
    difficulty: null, topic_tag: null, is_anchor_context: false,
    source_lesson_id: null, source_section_id: null,
  }
  const variant: ExerciseVariant = {
    id: 'var-3', grammar_pattern_id: null, context_id: 'ctx-1',
    exercise_type: 'cloze_mcq',
    payload_json: {
      sentence: 'Ini ___ buku.',
      translation: 'Dit is geen boek.',
      options: ['bukan', 'tidak'],
      explanationText: 'Use bukan for nominal negation.',
    },
    answer_key_json: { correctOptionId: 'bukan' },
    is_active: true, created_at: '', updated_at: '',
  }

  const exercise = makePublishedExercise(item, [], context, variant)
  expect(exercise.clozeMcqData?.explanationText).toBe('Use bukan for nominal negation.')
})
```

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: the new test fails; Task 1.1's test still passes.

**Step 3: Update makePublishedExercise**

In `sessionQueue.ts:762–772`, change:

```ts
case 'cloze_mcq':
  return {
    ...baseExercise,
    skillType: 'recognition',
    clozeMcqData: {
      sentence: payload.sentence || context.source_text || '',
      translation: (payload.translation as string | null) ?? null,
      options: (payload.options as string[]) || [],
      correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
    },
  }
```

to:

```ts
case 'cloze_mcq':
  return {
    ...baseExercise,
    skillType: 'recognition',
    clozeMcqData: {
      sentence: payload.sentence || context.source_text || '',
      translation: (payload.translation as string | null) ?? null,
      options: (payload.options as string[]) || [],
      correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
      explanationText: (payload.explanationText as string) || undefined,
    },
  }
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: both Task 1.1 and Task 1.3 tests pass.

---

### Task 1.4: Update ExerciseShell feedback screen to read explanationText

**Files:**
- Modify: `src/components/exercises/ExerciseShell.tsx:361–364` (the `case 'cloze_mcq':` branch in the grammar feedback-screen switch)

**Step 1: Write the failing test**

Create `src/__tests__/exerciseShell.test.tsx` (new file — no existing ExerciseShell-specific test home):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import type { SessionQueueItem } from '@/types/learning'

// Mock processReview / processGrammarReview so feedback path can be exercised.
vi.mock('@/lib/reviewHandler', () => ({
  processReview: vi.fn().mockResolvedValue({
    newItemState: {},
    newSkillState: {},
    promotion: null,
    demotion: null,
  }),
  processGrammarReview: vi.fn().mockResolvedValue({
    newState: {},
    promotion: null,
    demotion: null,
  }),
}))

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('ExerciseShell feedback — grammar cloze_mcq explanation', () => {
  it('shows the authored explanation on wrong-answer feedback screen', async () => {
    const currentItem: SessionQueueItem = {
      source: 'grammar',
      grammarPatternId: 'pat-1',
      grammarState: null,
      exerciseItem: {
        learningItem: null,
        meanings: [],
        contexts: [],
        answerVariants: [],
        skillType: 'recognition',
        exerciseType: 'cloze_mcq',
        clozeMcqData: {
          sentence: 'Saya ___ nasi.',
          translation: 'Ik eet rijst.',
          options: ['makan', 'minum'],
          correctOptionId: 'makan',
          explanationText: 'Makan = eten; minum = drinken.',
        },
      },
    }
    const onAnswer = vi.fn()
    const onContinueToNext = vi.fn()

    wrap(
      <ExerciseShell
        currentItem={currentItem}
        sessionId="s-1"
        user={{ id: 'u-1' } as any}
        userLanguage="nl"
        onAnswer={onAnswer}
        onContinueToNext={onContinueToNext}
      />
    )

    // Pick the wrong option to trigger the feedback screen.
    await userEvent.click(screen.getByRole('button', { name: 'minum' }))

    // Wait for the feedback screen to render.
    await vi.waitFor(() => {
      expect(screen.getByText('Makan = eten; minum = drinken.')).toBeInTheDocument()
    })
  })

  it('does not render an explanation box when explanationText is empty', async () => {
    const currentItem: SessionQueueItem = {
      source: 'grammar',
      grammarPatternId: 'pat-1',
      grammarState: null,
      exerciseItem: {
        learningItem: null,
        meanings: [],
        contexts: [],
        answerVariants: [],
        skillType: 'recognition',
        exerciseType: 'cloze_mcq',
        clozeMcqData: {
          sentence: 'Saya ___ nasi.',
          translation: 'Ik eet rijst.',
          options: ['makan', 'minum'],
          correctOptionId: 'makan',
          // no explanationText
        },
      },
    }
    const onAnswer = vi.fn()
    const onContinueToNext = vi.fn()

    wrap(
      <ExerciseShell
        currentItem={currentItem}
        sessionId="s-1"
        user={{ id: 'u-1' } as any}
        userLanguage="nl"
        onAnswer={onAnswer}
        onContinueToNext={onContinueToNext}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'minum' }))

    await vi.waitFor(() => {
      // The "Antwoord" box always renders on wrong; it's the explanation box that shouldn't.
      expect(screen.queryByText(/Toelichting/)).toBeNull()
    })
  })
})
```

Note: i18n keys used in `ExerciseShell.tsx:403` render a label like "Toelichting" (NL) or "Explanation" (EN). Match the label from `t.session.exercise.explanationLabel`. If the exact string differs, adjust the `queryByText` regex.

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/exerciseShell.test.tsx
```

Expected: the first test fails because line 363 hardcodes `explanationText = ''`. The second test passes (no explanation rendered is the current behavior).

**Step 3: Update ExerciseShell**

In `src/components/exercises/ExerciseShell.tsx:361–364`, change:

```ts
case 'cloze_mcq':
  correctAnswer = exerciseItem.clozeMcqData?.correctOptionId ?? ''
  explanationText = ''
  break
```

to:

```ts
case 'cloze_mcq':
  correctAnswer = exerciseItem.clozeMcqData?.correctOptionId ?? ''
  explanationText = exerciseItem.clozeMcqData?.explanationText ?? ''
  break
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/exerciseShell.test.tsx src/__tests__/sessionQueue.test.ts
```

Expected: all Task 1 tests pass.

**Step 5: Run the full test suite as a regression gate**

```bash
bun run test
```

Expected: all tests pass — no pre-existing suites broken by the type addition or the new exports.

**Step 6: Commit**

```bash
git add src/types/learning.ts src/lib/sessionQueue.ts src/components/exercises/ExerciseShell.tsx src/__tests__/sessionQueue.test.ts src/__tests__/exerciseShell.test.tsx
git commit -m "$(cat <<'EOF'
fix: plumb explanation through grammar cloze_mcq feedback

The ExerciseShell feedback screen hardcoded explanationText to '' for
cloze_mcq grammar exercises, dropping the authored explanation on wrong
answers. Add explanationText to ClozeMcqData, populate it in both grammar
builders (makeGrammarExercise and makePublishedExercise), and read it
on the feedback screen — matching the pattern used for contrast_pair,
sentence_transformation, and constrained_translation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Update linguist-reviewer agent to validate explanationText

**Files:**
- Modify: `.claude/agents/linguist-reviewer.md` (or the equivalent agent config file — verify the exact path with `ls .claude/agents/` first)

**Step 1: Read the current agent config**

```bash
cat .claude/agents/linguist-reviewer.md
```

Find where the agent's check list for grammar variant payloads lives. Look for the existing checks covering `contrast_pair`, `sentence_transformation`, `constrained_translation`.

**Step 2: Extend the check list**

If existing checks already require non-empty `explanationText` for other grammar types, add `cloze_mcq` to the same check. If no such check exists, add a unified check for all four grammar types: "Every authored grammar variant of type `contrast_pair`, `sentence_transformation`, `constrained_translation`, or `cloze_mcq` must have a non-empty `explanationText` field. Flag as WARNING."

Severity: WARNING per CLAUDE.md policy ("WARNINGs are flagged for admin review in the app and do not block publishing").

**Step 3: Manually verify against a known-good lesson**

```bash
bun run linguist-reviewer lesson-8   # or however the agent is invoked
cat scripts/data/staging/lesson-8/review-report.json
```

Expected: no new WARNINGs introduced for lesson 8 (known-good content). If WARNINGs appear, inspect whether the agent is correctly reading existing `explanationText` values or whether the check is over-strict.

**Step 4: Commit**

```bash
git add .claude/agents/linguist-reviewer.md
git commit -m "$(cat <<'EOF'
chore: linguist-reviewer flags grammar variants missing explanationText

Tighten the reviewer's output-quality gate. Previously the reviewer may
have checked explanationText presence only for some grammar types.
Unify the check across cloze_mcq, contrast_pair, sentence_transformation,
and constrained_translation. WARNING severity (non-blocking) per project
convention — flagged for admin review in the app, does not block publish.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fix 2 — Speaking no-op hardening

### Task 2.1: Filter speaking variants out of buildGrammarQueue

**Files:**
- Modify: `src/lib/sessionQueue.ts:191–196` (the variant random-pick inside `buildGrammarQueue`)

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
describe('speaking exercises gated from session selection', () => {
  it('buildGrammarQueue skips patterns whose only variants are speaking', () => {
    // Input: one grammar pattern with only a speaking variant.
    // Assert: buildSessionQueue returns a queue with zero grammar items
    // (the pattern is skipped, no slots filled).
  })

  it('buildGrammarQueue picks non-speaking variants when mixed variants exist', () => {
    // Input: one grammar pattern with one speaking and one contrast_pair variant.
    // Assert: across 30 calls, all returned exercise items are contrast_pair,
    // never speaking.
  })
})
```

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: both new tests fail — current code at `buildGrammarQueue` randomly picks any variant.

**Step 3: Update buildGrammarQueue**

In `sessionQueue.ts:193–196`, change:

```ts
const queue: SessionQueueItem[] = []
for (const pattern of candidates) {
  const variants = grammarVariantsByPattern[pattern.id] ?? []
  const variant = variants[Math.floor(Math.random() * variants.length)]
  const exercise = makeGrammarExercise(pattern, variant)
  queue.push({ ... })
}
```

to:

```ts
const queue: SessionQueueItem[] = []
for (const pattern of candidates) {
  const variants = grammarVariantsByPattern[pattern.id] ?? []
  const nonSpeakingVariants = variants.filter(v => v.exercise_type !== 'speaking')
  if (nonSpeakingVariants.length === 0) continue  // skip pattern — no usable variants
  const variant = nonSpeakingVariants[Math.floor(Math.random() * nonSpeakingVariants.length)]
  const exercise = makeGrammarExercise(pattern, variant)
  queue.push({ ... })
}
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: both new tests pass.

---

### Task 2.2: Filter speaking variants out of selectExercises productive path

**Files:**
- Modify: `src/lib/sessionQueue.ts:455–464` (the published-variant pick in productive/maintenance)

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
it('selectExercises at productive stage never returns a speaking exercise', () => {
  // Input: a productive-stage word item with a single published speaking variant.
  // Assert: across 30 calls, the returned exercise type is never 'speaking' —
  // the engine falls through to the unpublished-variant rotation.
})
```

**Step 2: Run test, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: fails — `makePublishedExercise` is currently called with a speaking variant.

**Step 3: Update selectExercises**

In `sessionQueue.ts:455–464`, change:

```ts
if (hasPublishedVariants) {
  for (const context of contexts) {
    const publishedVariants = exerciseVariantsByContext?.[context.id] ?? []
    if (publishedVariants.length > 0) {
      const variant = publishedVariants[Math.floor(Math.random() * publishedVariants.length)]
      exercises.push(makePublishedExercise(item, meanings, context, variant))
      break
    }
  }
}
```

to:

```ts
if (hasPublishedVariants) {
  for (const context of contexts) {
    const publishedVariants = (exerciseVariantsByContext?.[context.id] ?? [])
      .filter(v => v.exercise_type !== 'speaking')
    if (publishedVariants.length > 0) {
      const variant = publishedVariants[Math.floor(Math.random() * publishedVariants.length)]
      exercises.push(makePublishedExercise(item, meanings, context, variant))
      break
    }
  }
}
```

**Decision — keep the outer `hasPublishedVariants` check at line 453 unchanged.** The inner filter handles the all-speaking case: if every published variant is `speaking`, `publishedVariants` becomes empty, the `if (publishedVariants.length > 0)` guard skips it, and the outer `for` loop continues to the next context. After the loop, `exercises.length === 0` causes fall-through to the unpublished rotation at line 466. The outer `hasPublishedVariants` may briefly report true when all variants are `speaking`, leading to an empty `for` loop pass — harmless, and simpler than a duplicate filter at two levels.

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all Task 2.1 and Task 2.2 tests pass.

---

### Task 2.3: Add defensive early-return in SpeakingExercise.handleSubmitAnswer

**Files:**
- Modify: `src/components/exercises/SpeakingExercise.tsx:24–35`

**Step 1: Write the failing test**

Create `src/__tests__/speakingExercise.test.tsx` (new file):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { SpeakingExercise } from '@/components/exercises/SpeakingExercise'
import type { ExerciseItem } from '@/types/learning'

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('SpeakingExercise defensive no-op', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('clicking the record button never invokes onAnswer, even after the legacy 1500ms timeout', async () => {
    const onAnswer = vi.fn()
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'spoken_production',
      exerciseType: 'speaking',
      speakingData: {
        promptText: 'Zeg "Selamat pagi"',
      },
    }

    wrap(<SpeakingExercise exerciseItem={exerciseItem} userLanguage="nl" onAnswer={onAnswer} />)

    // Click the record button.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole('button'))

    // Advance past the legacy 1500ms setTimeout.
    vi.advanceTimersByTime(2000)

    // Assert onAnswer was never called.
    expect(onAnswer).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test, confirm failure**

```bash
bun run test src/__tests__/speakingExercise.test.tsx
```

Expected: fails — current code calls `onAnswer(true, ...)` after the 1500ms setTimeout.

**Step 3: Add the early-return**

In `src/components/exercises/SpeakingExercise.tsx:24–35`, change:

```ts
const handleSubmitAnswer = () => {
  if (isAnswered) return
  setIsAnswered(true)

  // Speaking exercises are not scored automatically yet (requires transcription API).
  // Treat as acknowledged (correct) so FSRS state is not corrupted.
  const FEEDBACK_DELAY_MS = 1500
  setTimeout(() => {
    const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
    onAnswer(true, latencyMs)
  }, FEEDBACK_DELAY_MS)
}
```

to:

```ts
const handleSubmitAnswer = () => {
  // Defensive no-op: speaking is gated out of session selection in sessionQueue.ts,
  // but if the component is ever reached via a future path, do NOT write a fake
  // 'correct' review — that would corrupt FSRS state for the spoken_production skill.
  // The component stays visually functional (the prompt is shown) for admin preview
  // purposes, but the submit button is a deliberate dead-end until ASR is wired.
  return
}
```

**Explicit cleanup of now-dead code in the component:**
- Remove the two `useState` declarations (`isAnswered` at line 17, `startTime` at line 18).
- Remove `useState` from the `react` import if no longer used in this file (check — nothing else uses `useState` after these deletions).
- Remove `setIsAnswered` and `isAnswered` references everywhere.
- Remove the `disabled={isAnswered}` attribute from the button (line 54) — button stays clickable and each click is a no-op. Visual consistency: the button's look doesn't need to change.

Keep intact: the `IconMicrophone` import, `Alert` import, `Button`/`Stack`/`Text`/`Box`/`Alert` usage, the `promptText` and `targetPatternOrScenario` rendering. The component remains a visible preview surface; only the click behavior changes.

**Step 4: Run tests**

```bash
bun run test src/__tests__/speakingExercise.test.tsx
```

Expected: passes.

**Step 5: Run the full test suite as a regression gate**

```bash
bun run test
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/lib/sessionQueue.ts src/components/exercises/SpeakingExercise.tsx src/__tests__/sessionQueue.test.ts src/__tests__/speakingExercise.test.tsx
git commit -m "$(cat <<'EOF'
fix: gate speaking exercises out of session selection

The SpeakingExercise component reported correct=true on any click, which
would corrupt FSRS state if the DB feature gate (exercise_type_availability.
session_enabled = false for speaking) were ever flipped on before ASR is
wired. Add defense-in-depth:

1. buildGrammarQueue filters out speaking variants before the random pick.
2. selectExercises productive/maintenance path filters speaking from
   published variants and falls through to the unpublished rotation.
3. SpeakingExercise.handleSubmitAnswer becomes an explicit no-op.

Preview-mode rendering of the component is unchanged — the record button
becomes a dead click by design until ASR is wired in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fix 3 — Cloze is_anchor_context fallback cleanup

### Task 3.1: Remove the fallback in makeClozeMcq

**Files:**
- Modify: `src/lib/sessionQueue.ts:681–682`

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
describe('cloze builders strictly require context_type === cloze', () => {
  it('makeClozeMcq returns clozeMcqData: undefined when item has only lesson_snippet anchor contexts', () => {
    // Input: build a session where an item has a single lesson_snippet context
    // with is_anchor_context=true and context_type='lesson_snippet'. Force a
    // call path into makeClozeMcq (e.g. due form_recall skill — though the
    // current selectExercises guard prevents this in normal routing, the
    // builder must still refuse to construct from a non-cloze context).
    // Easiest: unit-test via a small wrapper that calls makeClozeMcq directly.
    // If the function is not exported, either export it or use the public
    // buildSessionQueue path with a carefully-constructed fixture.
  })

  it('makeClozeMcq returns valid clozeMcqData when a cloze context exists alongside lesson_snippet', () => {
    // Positive case — ensures the primary lookup still works.
  })
})
```

Note: `makeClozeMcq` is currently module-private. The cleanest approach is to **export it temporarily** from `sessionQueue.ts` with an `/** @internal exported for tests */` JSDoc comment signalling the intent, so the test can call it directly. This is a small sacrifice of encapsulation for test tractability — the alternative (constructing an input such that `buildSessionQueue` exercises the code path) is brittle and opaque. Same pattern as Task 1.1/1.3 use for `makeGrammarExercise` / `makePublishedExercise`.

**Step 2: Run test, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: the negative test fails — current code falls through to the `lesson_snippet` context and constructs invalid `clozeMcqData` using the full snippet text as `sentence`.

**Step 3: Remove the fallback**

In `src/lib/sessionQueue.ts:681–682`, change:

```ts
const clozeContext = contexts.find(c => c.context_type === 'cloze')
  ?? contexts.find(c => c.is_anchor_context)
```

to:

```ts
const clozeContext = contexts.find(c => c.context_type === 'cloze')
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all cloze-strict tests pass.

---

### Task 3.2: Remove the fallback in makeClozeExercise

**Files:**
- Modify: `src/lib/sessionQueue.ts:718–719`

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
it('makeClozeExercise returns clozeContext: undefined when item has only lesson_snippet anchor contexts', () => {
  // Same pattern as Task 3.1 but for makeClozeExercise.
})

it('makeClozeExercise returns valid clozeContext when a cloze context exists alongside lesson_snippet', () => {
  // Positive case.
})
```

Export `makeClozeExercise` if not already exported, with the `/** @internal exported for tests */` JSDoc comment (same rationale and pattern as Task 3.1).

**Step 2: Run test, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 3: Remove the fallback**

In `src/lib/sessionQueue.ts:718–719`, change:

```ts
const clozeContext = contexts.find(c => c.context_type === 'cloze')
  ?? contexts.find(c => c.is_anchor_context)
```

to:

```ts
const clozeContext = contexts.find(c => c.context_type === 'cloze')
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all Task 3 tests pass.

**Step 5: Run the full test suite as a regression gate**

```bash
bun run test
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
fix: remove is_anchor_context fallback in cloze builders

makeClozeMcq and makeClozeExercise both fell back to any is_anchor_context
context if no context_type='cloze' was found. The fallback never fired in
practice (selectExercises pre-filters by context_type) but was a latent
footgun: a lesson_snippet context could produce a cloze exercise with the
full snippet as the 'sentence', which is semantically broken.

Keep the primary lookup; remove the fallback. makeClozeMcq / makeClozeExercise
now return clozeMcqData / clozeContext as undefined when no cloze context
exists — callers already handle this gracefully (error state in components).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all three fixes are committed:

```bash
bun run test                 # full suite green
bun run lint                 # no new lint errors
bun run build                # production build succeeds
```

Manual smoke test:
- Dev server: `bun run dev`, log in, start a session, verify a grammar `cloze_mcq` with a wrong answer renders the explanation on the feedback screen.
- If feasible, force an item with only a `lesson_snippet` anchor context to reach selectExercises and verify the cloze path is not taken (requires constructing such an item in the DB — optional if unit tests are green).

---

## Summary

| Task | Description | Commit | Dependencies |
|---|---|---|---|
| 1.1 | Add explanationText to ClozeMcqData type | (batched with 1.2, 1.3, 1.4) | None |
| 1.2 | Populate explanationText in makeGrammarExercise | (batched) | 1.1 |
| 1.3 | Populate explanationText in makePublishedExercise | (batched) | 1.1 |
| 1.4 | Read explanationText in ExerciseShell feedback | fix: plumb explanation through grammar cloze_mcq feedback | 1.1, 1.2, 1.3 |
| 1.5 | Update linguist-reviewer agent | chore: linguist-reviewer flags grammar variants missing explanationText | None (independent) |
| 2.1 | Filter speaking from buildGrammarQueue | (batched with 2.2, 2.3) | None |
| 2.2 | Filter speaking from selectExercises productive | (batched) | None |
| 2.3 | Defensive no-op in SpeakingExercise | fix: gate speaking exercises out of session selection | None |
| 3.1 | Remove fallback in makeClozeMcq | (batched with 3.2) | None |
| 3.2 | Remove fallback in makeClozeExercise | fix: remove is_anchor_context fallback in cloze builders | None |

Each commit is independently revertible. Order across fixes is free — no cross-fix dependencies. Within Fix 1, Tasks 1.1–1.4 must land together (type change + population + read); Task 1.5 is independent. Fix 2's three tasks batch into one commit. Fix 3's two tasks batch into one commit.

Estimated session count: one implementation session covers all three fixes plus the agent-config update.
