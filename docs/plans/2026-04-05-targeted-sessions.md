# Targeted Session Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four targeted session modes (backlog_clear, recall_sprint, push_to_productive, quick) surfaced on the Dashboard when a weekly goal is at risk, giving users a direct action to improve a specific metric.

**Architecture:** A `sessionMode` field is added to `SessionBuildInput` in `sessionEngine.ts`. Each mode adjusts slot allocation and/or candidate filtering inside `buildSessionQueue`. Session.tsx reads `?mode=` from the URL and passes it through. Dashboard shows targeted session buttons integrated into the weekly goal section, visible only for at-risk/off-track goals.

**Tech Stack:** TypeScript, React 19, Mantine UI v8, React Router 7 (`useSearchParams`), Vitest

---

### Task 1: Add `SessionMode` type and wire it through `SessionBuildInput`

**Files:**
- Modify: `src/lib/sessionEngine.ts:10-23` (the `SessionBuildInput` interface)

**Step 1: Write the failing test**

In `src/__tests__/sessionEngine.test.ts`, add after the existing `describe` block:

```typescript
describe('sessionMode', () => {
  it('backlog_clear mode produces zero new items when nothing is due', () => {
    // makeInput has 3 items all with no state (new) — backlog_clear should return empty
    const queue = buildSessionQueue(makeInput({ sessionMode: 'backlog_clear' }))
    expect(queue.length).toBe(0)
  })

  it('recall_sprint mode produces zero new items', () => {
    // All items in base makeInput are new (no states) — sprint has nothing to work with
    const queue = buildSessionQueue(makeInput({ sessionMode: 'recall_sprint' }))
    expect(queue.length).toBe(0)
  })
})
```

**Step 2: Run to verify it fails**

```bash
bun run test src/__tests__/sessionEngine.test.ts 2>&1 | head -30
```

Expected: TypeScript error — `sessionMode` does not exist on `SessionBuildInput`.

**Step 3: Add the type**

In `src/lib/sessionEngine.ts`, add before the `SessionBuildInput` interface:

```typescript
export type SessionMode = 'standard' | 'backlog_clear' | 'recall_sprint' | 'push_to_productive' | 'quick'
```

Add to `SessionBuildInput` interface (after `lessonOrder?`):

```typescript
  sessionMode?: SessionMode
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionEngine.test.ts 2>&1 | head -30
```

Expected: PASS — the field exists; `buildSessionQueue` ignores it so the new tests pass trivially.

**Step 5: Commit**

```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: add SessionMode type to SessionBuildInput"
```

---

### Task 2: Implement `backlog_clear` mode

**Files:**
- Modify: `src/lib/sessionEngine.ts` — `buildSessionQueue` function

**Step 1: Write the failing test**

Replace the trivial `backlog_clear` test from Task 1 with a meaningful one:

```typescript
it('backlog_clear mode skips new items and fills session with due items only', () => {
  const dueItems = Array.from({ length: 5 }, (_, i) => ({
    id: `due${i}`, item_type: 'word' as const, base_text: `word${i}`,
    normalized_text: `word${i}`, language: 'id', level: 'A1',
    source_type: 'lesson' as const, source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
  }))
  const newItems = Array.from({ length: 3 }, (_, i) => ({
    id: `new${i}`, item_type: 'word' as const, base_text: `newword${i}`,
    normalized_text: `newword${i}`, language: 'id', level: 'A1',
    source_type: 'lesson' as const, source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
  }))
  const allItems = [...dueItems, ...newItems]
  const meaningsByItem: Record<string, any[]> = {}
  const itemStates: Record<string, any> = {}
  const skillStates: Record<string, any[]> = {}
  for (const item of dueItems) {
    meaningsByItem[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
    itemStates[item.id] = { id: item.id, user_id: 'u1', learning_item_id: item.id, stage: 'retrieving', introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '' }
    skillStates[item.id] = [{ id: `ss${item.id}`, user_id: 'u1', learning_item_id: item.id, skill_type: 'form_recall', stability: 3, difficulty: 5, retrievability: 0.5, last_reviewed_at: new Date(Date.now() - 86400000).toISOString(), next_due_at: new Date(Date.now() - 3600000).toISOString(), success_count: 3, failure_count: 1, lapse_count: 0, consecutive_failures: 0, mean_latency_ms: null, hint_rate: null, updated_at: '' }]
  }
  for (const item of newItems) {
    meaningsByItem[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
  }

  const queue = buildSessionQueue(makeInput({
    allItems, meaningsByItem, itemStates, skillStates,
    preferredSessionSize: 10, sessionMode: 'backlog_clear',
  }))

  // No new items (no state means new)
  const newInQueue = queue.filter(q => !itemStates[q.exerciseItem.learningItem.id])
  expect(newInQueue.length).toBe(0)
  // All 5 due items should appear
  expect(queue.length).toBe(5)
})
```

**Step 2: Run to verify it fails**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | grep -A5 "backlog_clear mode skips"
```

Expected: FAIL — new items are included.

**Step 3: Implement**

In `buildSessionQueue`, after destructuring `input`, read the mode:

```typescript
const sessionMode = input.sessionMode ?? 'standard'
```

Find the slot allocation block (the lines with `Math.round(preferredSessionSize * 0.55)` etc.). Replace it with:

```typescript
  // Slot allocation — adjusted by session mode
  // backlog_clear: maximise due reviews, zero anchoring, zero new
  // all other modes: standard fractions
  const dueSlots = (sessionMode === 'backlog_clear')
    ? preferredSessionSize
    : Math.round(preferredSessionSize * 0.55)
  const anchoringSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(preferredSessionSize * 0.20)
  const weakSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(preferredSessionSize * 0.10)
```

Find the `calculateNewSlots` call. Replace it with:

```typescript
  const newSlots = (sessionMode === 'backlog_clear' || sessionMode === 'recall_sprint' || sessionMode === 'push_to_productive')
    ? 0
    : calculateNewSlots(dueItems.length, anchoringItems.length, reviewsFilled, preferredSessionSize)
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: implement backlog_clear session mode"
```

---

### Task 3: Implement `recall_sprint` mode

**Files:**
- Modify: `src/lib/sessionEngine.ts`
- Modify: `src/__tests__/sessionEngine.test.ts`

**Step 1: Write the failing test**

Replace the trivial `recall_sprint` test from Task 1 with:

```typescript
it('recall_sprint mode only includes items with a form_recall skill and forces recall exercises', () => {
  // li1: retrieving, has form_recall skill — eligible
  // li2: anchoring, recognition only — excluded (no recall skill)
  // li3: no state (new) — excluded
  const retrievingState = {
    id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
    introduced_at: '', last_seen_at: '', priority: null, origin: null,
    times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
  }
  const anchoringState = {
    id: 'li2', user_id: 'u1', learning_item_id: 'li2', stage: 'anchoring' as const,
    introduced_at: '', last_seen_at: '', priority: null, origin: null,
    times_seen: 2, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
  }
  // Form_recall skill that is NOT yet due (verifies non-due eligible items surface)
  const recallSkill = {
    id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'form_recall' as const,
    stability: 2, difficulty: 5, retrievability: 0.8,
    last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
    next_due_at: new Date(Date.now() + 86400000).toISOString(), // not yet due
    success_count: 2, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null, updated_at: '',
  }

  const queue = buildSessionQueue(makeInput({
    itemStates: { li1: retrievingState, li2: anchoringState },
    skillStates: { li1: [recallSkill] },
    sessionMode: 'recall_sprint',
  }))

  // Only li1 should appear (has form_recall skill)
  expect(queue.every(q => q.exerciseItem.learningItem.id === 'li1')).toBe(true)
  // Exercises must be recall type (not recognition_mcq)
  expect(queue.every(q => q.exerciseItem.exerciseType !== 'recognition_mcq')).toBe(true)
  // li1 must appear even though its skill is not yet due
  expect(queue.length).toBeGreaterThan(0)
})
```

**Step 2: Run to verify it fails**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | grep -A5 "recall_sprint mode only"
```

Expected: FAIL — anchoring/new items appear, exercise types wrong, non-due item may be missing.

**Step 3: Implement**

**3a. Filter eligible items** — In `buildSessionQueue`, after the language filter on `eligibleItems`, add:

```typescript
  // recall_sprint: restrict to items that have a form_recall skill.
  // New and anchoring items produce recognition-only exercises and cannot
  // improve recall quality, so they are excluded.
  if (sessionMode === 'recall_sprint') {
    eligibleItems = eligibleItems.filter(item => {
      const state = itemStates[item.id]
      if (!state || state.stage === 'anchoring') return false
      const skills = skillStates[item.id] ?? []
      return skills.some(s => s.skill_type === 'form_recall')
    })
  }
```

**3b. Force eligible items into dueItems** — Inside the main categorization `for` loop, after the anchoring check and before the `dueSkills` check, add:

```typescript
    // recall_sprint: force all eligible items into dueItems regardless of due date.
    // The eligibleItems filter already guarantees these items have a form_recall skill.
    if (sessionMode === 'recall_sprint') {
      const minRetrievability = skills.length > 0
        ? Math.min(...skills.filter(s => s.skill_type === 'form_recall').map(s =>
            s.last_reviewed_at ? getRetrievability(s.stability, new Date(s.last_reviewed_at)) : 1
          ))
        : 1
      dueItems.push({ item, state, skills, category: 'due', priority: 1 - minRetrievability })
      continue
    }
```

**3c. Force recall exercise type** — Update `selectExercises` signature to accept `sessionMode`:

```typescript
function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>,
  userLanguage: 'en' | 'nl' = 'en',
  allItems: LearningItem[] = [],
  sessionMode: SessionMode = 'standard',
): ExerciseItem[]
```

At the top of `selectExercises`, after computing `isSentenceType`, add:

```typescript
  // recall_sprint: force recall exercise type regardless of stage
  if (sessionMode === 'recall_sprint') {
    if (isSentenceType) {
      return [makeClozeExercise(item, meanings, contexts, variants)]
    }
    return [makeTypedRecall(item, meanings, contexts, variants)]
  }
```

Update both `selectExercises` call sites in `buildSessionQueue` to pass `sessionMode`:

```typescript
const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems, sessionMode)
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: implement recall_sprint session mode"
```

---

### Task 4: Implement `push_to_productive` mode

**Files:**
- Modify: `src/lib/sessionEngine.ts`
- Modify: `src/__tests__/sessionEngine.test.ts`

**Step 1: Write the failing test**

Add to the `sessionMode` describe block:

```typescript
it('push_to_productive mode includes retrieving items that are not yet due', () => {
  // li1: retrieving, has form_recall skill, NOT yet due — should be included
  // li2: productive, overdue — lower priority, but can appear
  // li3: new (no state) — excluded
  const retrievingState = {
    id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
    introduced_at: '', last_seen_at: '', priority: null, origin: null,
    times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
  }
  const productiveState = {
    id: 'li2', user_id: 'u1', learning_item_id: 'li2', stage: 'productive' as const,
    introduced_at: '', last_seen_at: '', priority: null, origin: null,
    times_seen: 10, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
  }
  const retrievingSkill = {
    id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'form_recall' as const,
    stability: 4, difficulty: 5, retrievability: 0.7,
    last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
    next_due_at: new Date(Date.now() + 86400000).toISOString(), // not yet due
    success_count: 4, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null, updated_at: '',
  }
  const productiveSkill = {
    id: 'ss2', user_id: 'u1', learning_item_id: 'li2', skill_type: 'form_recall' as const,
    stability: 8, difficulty: 5, retrievability: 0.5,
    last_reviewed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    next_due_at: new Date(Date.now() - 3600000).toISOString(), // overdue
    success_count: 8, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null, updated_at: '',
  }

  const queue = buildSessionQueue(makeInput({
    itemStates: { li1: retrievingState, li2: productiveState },
    skillStates: { li1: [retrievingSkill], li2: [productiveSkill] },
    preferredSessionSize: 5,
    sessionMode: 'push_to_productive',
  }))

  // li1 must appear even though not yet due
  expect(queue.some(q => q.exerciseItem.learningItem.id === 'li1')).toBe(true)
  // No new items (li3 has no state)
  const newInQueue = queue.filter(q => !['li1', 'li2'].includes(q.exerciseItem.learningItem.id))
  expect(newInQueue.length).toBe(0)
})

it('push_to_productive skips retrieving items that have no form_recall skill yet', () => {
  // A retrieving item with only a recognition skill — no recall to push to productive
  const retrievingState = {
    id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
    introduced_at: '', last_seen_at: '', priority: null, origin: null,
    times_seen: 3, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
  }
  const recognitionOnlySkill = {
    id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'recognition' as const,
    stability: 2, difficulty: 5, retrievability: 0.7,
    last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
    next_due_at: new Date(Date.now() + 86400000).toISOString(),
    success_count: 3, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null, updated_at: '',
  }

  const queue = buildSessionQueue(makeInput({
    itemStates: { li1: retrievingState },
    skillStates: { li1: [recognitionOnlySkill] },
    preferredSessionSize: 5,
    sessionMode: 'push_to_productive',
  }))

  // li1 should NOT appear — it only has recognition, pushing it to typed_recall
  // would produce an exercise with no matching learnerSkillState for scoring
  expect(queue.filter(q => q.exerciseItem.learningItem.id === 'li1').length).toBe(0)
})
```

**Step 2: Run to verify it fails**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | grep -A5 "push_to_productive"
```

Expected: FAIL — non-due retrieving items don't appear, recognition-only item may appear.

**Step 3: Implement**

Inside the categorization `for` loop, after the anchoring check (the `if (state.stage === 'anchoring')` block with `continue`), add:

```typescript
    // push_to_productive: force retrieving-stage items that have a form_recall skill
    // into dueItems regardless of due date. Higher stability = closer to graduating =
    // higher priority. Items with only recognition skill are excluded — their
    // learnerSkillState would not be found for form_recall scoring.
    if (sessionMode === 'push_to_productive' && state.stage === 'retrieving') {
      const hasRecallSkill = skills.some(s => s.skill_type === 'form_recall')
      if (!hasRecallSkill) continue // skip — only recognition skill, can't score recall
      const maxStability = Math.max(...skills.map(s => s.stability))
      dueItems.push({ item, state, skills, category: 'due', priority: maxStability / 20 })
      continue
    }
```

**Step 4: Run all engine tests**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: implement push_to_productive session mode"
```

---

### Task 5: Implement `quick` mode

**Files:**
- Modify: `src/lib/sessionEngine.ts`
- Modify: `src/__tests__/sessionEngine.test.ts`

This mode is the simplest — it caps the session at 5 items regardless of `preferredSessionSize`. It's used for the `consistency` goal where the barrier to studying is friction, not a skill deficit.

**Step 1: Write the failing test**

```typescript
it('quick mode caps session at 5 items', () => {
  // Build enough new items to fill a large session
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: `li${i}`, item_type: 'word' as const, base_text: `word${i}`,
    normalized_text: `word${i}`, language: 'id', level: 'A1',
    source_type: 'lesson' as const, source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
  }))
  const meanings: Record<string, any[]> = {}
  for (const item of items) {
    meanings[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
  }

  const queue = buildSessionQueue(makeInput({
    allItems: items, meaningsByItem: meanings,
    preferredSessionSize: 15, sessionMode: 'quick',
  }))

  expect(queue.length).toBeLessThanOrEqual(5)
})
```

**Step 2: Run to verify it fails**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose 2>&1 | grep -A5 "quick mode caps"
```

Expected: FAIL — queue returns up to 15 items.

**Step 3: Implement**

In `buildSessionQueue`, after reading `sessionMode`, add:

```typescript
  // quick mode uses a reduced session size regardless of user preference
  const effectiveSessionSize = sessionMode === 'quick' ? 5 : preferredSessionSize
```

Replace every subsequent use of `preferredSessionSize` in `buildSessionQueue` (in slot allocation, `calculateNewSlots` call, and the final `queue.slice`) with `effectiveSessionSize`. There are 4 occurrences:

```typescript
  const dueSlots = (sessionMode === 'backlog_clear')
    ? effectiveSessionSize
    : Math.round(effectiveSessionSize * 0.55)
  const anchoringSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(effectiveSessionSize * 0.20)
  const weakSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(effectiveSessionSize * 0.10)
  // ...
  const newSlots = (sessionMode === 'backlog_clear' || sessionMode === 'recall_sprint' || sessionMode === 'push_to_productive')
    ? 0
    : calculateNewSlots(dueItems.length, anchoringItems.length, reviewsFilled, effectiveSessionSize)
  // ...
  const trimmed = queue.slice(0, effectiveSessionSize)
```

**Step 4: Run all engine tests**

```bash
bun run test src/__tests__/sessionEngine.test.ts --reporter=verbose
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/sessionEngine.ts src/__tests__/sessionEngine.test.ts
git commit -m "feat: implement quick session mode (5-item cap)"
```

---

### Task 6: Read session mode from URL in Session.tsx

**Files:**
- Modify: `src/pages/Session.tsx:40-41`

**Step 1: Add import and URL reading**

Update the import at the top from:
```typescript
import { buildSessionQueue, type SessionBuildInput } from '@/lib/sessionEngine'
```
to:
```typescript
import { buildSessionQueue, type SessionBuildInput, type SessionMode } from '@/lib/sessionEngine'
```

Find this line (around line 40):
```typescript
  const lessonFilter = searchParams.get('lesson')
```

Add directly below it:
```typescript
  const sessionModeParam = searchParams.get('mode')
  const sessionMode: SessionMode = (['backlog_clear', 'recall_sprint', 'push_to_productive', 'quick'].includes(sessionModeParam ?? ''))
    ? sessionModeParam as SessionMode
    : 'standard'
```

**Step 2: Pass mode to session build input**

Find the `SessionBuildInput` construction (the `input` object, around line 168). Add `sessionMode`:

```typescript
        const input: SessionBuildInput = {
          allItems: items,
          meaningsByItem,
          contextsByItem,
          variantsByItem,
          exerciseVariantsByContext,
          itemStates,
          skillStates: skillStatesMap,
          preferredSessionSize,
          lessonFilter,
          userLanguage: profile?.language ?? 'en',
          lessonOrder,
          sessionMode,
        }
```

**Step 3: Build check**

```bash
bun run build 2>&1 | tail -20
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/pages/Session.tsx
git commit -m "feat: read session mode from URL param in Session.tsx"
```

---

### Task 7: Add targeted session buttons to Dashboard

The buttons must live near the goal rings (inside the weekly goals section), not as a separate card below Quick Actions. When a goal is at risk/off-track/missed, a small action button appears below its ring.

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/lib/i18n.ts`

**Step 1: Add i18n keys**

In `src/lib/i18n.ts`, find the `dashboard` section in both `nl` and `en` objects.

Add to NL `dashboard`:
```typescript
improveRecall: 'Oefen herinnering',
improveVocab: 'Vergroot woordenschat',
improveBacklog: 'Verminder achterstand',
quickSession: 'Korte sessie',
```

Add to EN `dashboard`:
```typescript
improveRecall: 'Drill recall',
improveVocab: 'Push vocabulary',
improveBacklog: 'Clear backlog',
quickSession: 'Quick session',
```

**Step 2: Add action buttons inside the goal rows**

In `src/pages/Dashboard.tsx`, find where weekly goals are rendered. Currently there is a `GoalRow` component or inline goal rendering. Below each goal's progress display, add a conditional action button when the goal status is `at_risk`, `off_track`, or `missed`.

Define a config map outside the JSX (above the `return` statement or as a module-level const):

```typescript
const GOAL_ACTIONS: Record<string, { label: (T: typeof import('@/lib/i18n').translations['nl']) => string; mode: SessionMode }> = {
  recall_quality:    { label: T => T.dashboard.improveRecall,  mode: 'recall_sprint' },
  usable_vocabulary: { label: T => T.dashboard.improveVocab,   mode: 'push_to_productive' },
  review_health:     { label: T => T.dashboard.improveBacklog, mode: 'backlog_clear' },
  consistency:       { label: T => T.dashboard.quickSession,   mode: 'quick' },
}
```

Wait — the `T` type is complex. Instead, inline the lookup in the render:

```typescript
// Place this inside the Dashboard component, above the return statement:
const goalActionConfig: Record<string, { label: string; mode: SessionMode }> = {
  recall_quality:    { label: T.dashboard.improveRecall,  mode: 'recall_sprint' },
  usable_vocabulary: { label: T.dashboard.improveVocab,   mode: 'push_to_productive' },
  review_health:     { label: T.dashboard.improveBacklog, mode: 'backlog_clear' },
  consistency:       { label: T.dashboard.quickSession,   mode: 'quick' },
}
```

Add the `SessionMode` import at the top of the file:
```typescript
import type { SessionMode } from '@/lib/sessionEngine'
```

In the JSX where each weekly goal is rendered, add after each goal's progress bar/ring:

```tsx
{(['at_risk', 'off_track', 'missed'] as const).includes(goal.status) && goalActionConfig[goal.goal_type] && (
  <Button
    component={Link}
    to={`/session?mode=${goalActionConfig[goal.goal_type].mode}`}
    variant="light"
    color={goal.status === 'at_risk' ? 'orange' : 'red'}
    size="xs"
    mt={4}
    fullWidth
  >
    {goalActionConfig[goal.goal_type].label}
  </Button>
)}
```

**Step 3: Build check**

```bash
bun run build 2>&1 | tail -20
```

Expected: No errors.

**Step 4: Run all tests**

```bash
bun run test 2>&1 | tail -20
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/lib/i18n.ts
git commit -m "feat: show targeted session buttons on at-risk weekly goals"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

```bash
bun run test --reporter=verbose 2>&1 | tail -30
```

Expected: All tests PASS.

**Step 2: Production build**

```bash
bun run build 2>&1 | tail -10
```

Expected: Clean build, no TypeScript errors.

**Step 3: Push**

```bash
git push
```

---

## Files Modified

| File | Tasks |
|------|-------|
| `src/lib/sessionEngine.ts` | 1, 2, 3, 4, 5 |
| `src/__tests__/sessionEngine.test.ts` | 1, 2, 3, 4, 5 |
| `src/pages/Session.tsx` | 6 |
| `src/pages/Dashboard.tsx` | 7 |
| `src/lib/i18n.ts` | 7 |

## Issues fixed vs original draft

- `recall_sprint` non-due items: force-pushed into `dueItems` (same pattern as `push_to_productive`)
- `push_to_productive` recognition-only items: skipped via `hasRecallSkill` guard
- `backlog_clear` slot arithmetic: `anchoringSlots = 0`, no slot overflow
- `quick` mode added for `consistency` goal (5-item cap)
- Dashboard buttons placed inside goal rows, not a standalone card
- `cols={{ base: 1, sm: 2 }}` not needed — one button per goal, so no awkward grid

## Supabase Requirements

N/A — no schema changes. All data needed already exists (`learner_skill_states` has `stage`, `stability`, `skill_type`, `next_due_at`). The session mode only affects client-side item selection logic.
