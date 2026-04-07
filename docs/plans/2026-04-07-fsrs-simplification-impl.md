# FSRS Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `sessionEngine.ts` with a simple FSRS-driven due-queue, removing the anchoring-priority logic that caused stability to converge toward zero.

**Architecture:** Delete `sessionEngine.ts`. Create `sessionQueue.ts` with the same exercise-selection helpers but a simplified queue builder that trusts `next_due_at` as the sole scheduling signal. Update `Session.tsx` and `Dashboard.tsx` to drop the two removed session modes.

**Tech Stack:** TypeScript, ts-fsrs, Vitest + @testing-library/react, Supabase JS v2

**Design doc:** `docs/plans/2026-04-07-fsrs-simplification.md`

---

## Task 1: Re-run repair-stability script

The existing `scripts/repair-stability.ts` replays each skill's review history through corrected FSRS and updates stability. Run it now to ensure DB is in a clean state before changing the session logic.

**Files:**
- Run: `scripts/repair-stability.ts`

**Step 1: Dry run to preview changes**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(grep SUPABASE_SERVICE_KEY .env.local | cut -d= -f2) bun scripts/repair-stability.ts --dry-run
```

Review the output. Expect to see the 4 stuck items (akan tetapi, Baik-baik saja, bandar, buka) if not already repaired.

**Step 2: Run live**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(grep SUPABASE_SERVICE_KEY .env.local | cut -d= -f2) bun scripts/repair-stability.ts
```

**Step 3: Verify in DB**

```sql
SELECT li.base_text, lis.stage, lss.skill_type, lss.stability, lss.success_count
FROM indonesian.learner_item_state lis
JOIN indonesian.learner_skill_state lss ON lss.learning_item_id = lis.learning_item_id AND lss.user_id = lis.user_id
JOIN indonesian.learning_items li ON li.id = lis.learning_item_id
WHERE lis.stage = 'anchoring' AND lss.skill_type = 'recognition' AND lss.success_count >= 3
ORDER BY lss.success_count DESC;
```

Items with `success_count >= 3` and `stability >= 1.8` should now be promoted. If any remain stuck, manually promote:

```sql
UPDATE indonesian.learner_item_state
SET stage = 'retrieving'
WHERE learning_item_id IN (<ids>) AND stage = 'anchoring';
```

No commit needed — this is a data migration only.

---

## Task 2: Write failing tests for sessionQueue

**Files:**
- Create: `src/__tests__/sessionQueue.test.ts`
- Reference: `src/__tests__/sessionEngine.test.ts` (for test helpers and mock patterns)
- Reference: `src/lib/sessionEngine.ts` (for `SessionBuildInput` shape)
- Reference: `src/types/learning.ts` (for type definitions)

**Step 1: Check what the existing sessionEngine tests look like**

Read `src/__tests__/sessionEngine.test.ts` to understand the test helper/mock pattern before writing new ones.

**Step 2: Write the test file**

```typescript
// src/__tests__/sessionQueue.test.ts
import { describe, it, expect } from 'vitest'
import { buildSessionQueue } from '@/lib/sessionQueue'
import type { SessionBuildInput, LearningItem, LearnerItemState, LearnerSkillState } from '@/types/learning'

// ---- helpers ----

function makeItem(id: string): LearningItem {
  return { id, item_type: 'word', base_text: id, normalized_text: id, language: 'id', level: 'A1', source_type: 'vocabulary', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' }
}

function makeItemState(itemId: string, stage: LearnerItemState['stage']): LearnerItemState {
  return { id: 'state-' + itemId, user_id: 'u1', learning_item_id: itemId, stage, introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 1, is_leech: false, suspended: false, gate_check_passed: null, updated_at: '' }
}

function makeSkillState(itemId: string, overrides: Partial<LearnerSkillState> = {}): LearnerSkillState {
  const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() // 2 days ago = due
  return {
    id: 'skill-' + itemId,
    user_id: 'u1',
    learning_item_id: itemId,
    skill_type: 'recognition',
    stability: 2.0,
    difficulty: 5.0,
    retrievability: 0.9,
    last_reviewed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    next_due_at: pastDate,
    success_count: 5,
    failure_count: 0,
    lapse_count: 0,
    consecutive_failures: 0,
    mean_latency_ms: null,
    hint_rate: null,
    updated_at: '',
    ...overrides,
  }
}

function futureDate(days = 5): string {
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * days).toISOString()
}

function baseInput(overrides: Partial<SessionBuildInput> = {}): SessionBuildInput {
  return {
    allItems: [],
    meaningsByItem: {},
    contextsByItem: {},
    variantsByItem: {},
    itemStates: {},
    skillStates: {},
    preferredSessionSize: 20,
    dailyNewItemsLimit: 5,
    lessonFilter: null,
    userLanguage: 'en',
    ...overrides,
  }
}

// ---- tests ----

describe('buildSessionQueue — core queue building', () => {
  it('returns empty queue when no items', () => {
    const result = buildSessionQueue(baseInput())
    expect(result).toHaveLength(0)
  })

  it('includes due items (next_due_at in the past)', () => {
    const item = makeItem('i1')
    const state = makeItemState('i1', 'anchoring')
    const skill = makeSkillState('i1') // next_due_at = 2 days ago
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [{ id: 'm1', learning_item_id: 'i1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      itemStates: { i1: state },
      skillStates: { i1: [skill] },
    }))
    expect(result.length).toBeGreaterThan(0)
  })

  it('excludes items not yet due (next_due_at in the future)', () => {
    const item = makeItem('i1')
    const state = makeItemState('i1', 'anchoring')
    const skill = makeSkillState('i1', { next_due_at: futureDate(5) })
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [{ id: 'm1', learning_item_id: 'i1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      itemStates: { i1: state },
      skillStates: { i1: [skill] },
    }))
    expect(result).toHaveLength(0)
  })

  it('respects preferredSessionSize cap', () => {
    const items = Array.from({ length: 30 }, (_, i) => makeItem(`i${i}`))
    const meanings = Object.fromEntries(items.map(it => [it.id, [{ id: 'm-' + it.id, learning_item_id: it.id, translation_language: 'en', translation_text: 'word', is_primary: true, notes: null, created_at: '', updated_at: '' }]]))
    const itemStates = Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'anchoring')]))
    const skillStates = Object.fromEntries(items.map(it => [it.id, [makeSkillState(it.id)]]))
    const result = buildSessionQueue(baseInput({ allItems: items, meaningsByItem: meanings, itemStates, skillStates, preferredSessionSize: 10 }))
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('respects dailyNewItemsLimit for new items', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`new${i}`))
    const meanings = Object.fromEntries(items.map(it => [it.id, [{ id: 'm-' + it.id, learning_item_id: it.id, translation_language: 'en', translation_text: 'word', is_primary: true, notes: null, created_at: '', updated_at: '' }]]))
    // No itemStates → stage 'new'
    const result = buildSessionQueue(baseInput({ allItems: items, meaningsByItem: meanings, dailyNewItemsLimit: 3, preferredSessionSize: 20 }))
    // Each new item produces one exercise, so queue length ≤ dailyNewItemsLimit
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

describe('buildSessionQueue — FSRS-driven scheduling (the core fix)', () => {
  it('anchoring item with future next_due_at is NOT included', () => {
    const item = makeItem('anchor1')
    const state = makeItemState('anchor1', 'anchoring')
    const skill = makeSkillState('anchor1', { next_due_at: futureDate(3) })
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { anchor1: [{ id: 'm1', learning_item_id: 'anchor1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      itemStates: { anchor1: state },
      skillStates: { anchor1: [skill] },
    }))
    // KEY ASSERTION: anchoring items must not bypass FSRS scheduling
    expect(result).toHaveLength(0)
  })

  it('anchoring item with past next_due_at IS included', () => {
    const item = makeItem('anchor1')
    const state = makeItemState('anchor1', 'anchoring')
    const skill = makeSkillState('anchor1') // 2 days ago
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { anchor1: [{ id: 'm1', learning_item_id: 'anchor1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      itemStates: { anchor1: state },
      skillStates: { anchor1: [skill] },
    }))
    expect(result.length).toBeGreaterThan(0)
  })

  it('suspended items are excluded regardless of due date', () => {
    const item = makeItem('sus1')
    const state = makeItemState('sus1', 'anchoring')
    state.suspended = true
    const skill = makeSkillState('sus1') // due
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { sus1: [{ id: 'm1', learning_item_id: 'sus1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      itemStates: { sus1: state },
      skillStates: { sus1: [skill] },
    }))
    expect(result).toHaveLength(0)
  })

  it('most-overdue items appear first in queue', () => {
    const items = ['overdue10', 'overdue1'].map(makeItem)
    const meanings = Object.fromEntries(items.map(it => [it.id, [{ id: 'm-' + it.id, learning_item_id: it.id, translation_language: 'en', translation_text: 'word', is_primary: true, notes: null, created_at: '', updated_at: '' }]]))
    const itemStates = Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'retrieving')]))
    const skillStates = {
      overdue10: [makeSkillState('overdue10', { next_due_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() })],
      overdue1: [makeSkillState('overdue1', { next_due_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() })],
    }
    const result = buildSessionQueue(baseInput({ allItems: items, meaningsByItem: meanings, itemStates, skillStates }))
    expect(result[0].exerciseItem.learningItem.id).toBe('overdue10')
  })
})

describe('buildSessionQueue — session modes', () => {
  it('backlog_clear: excludes new items', () => {
    const newItem = makeItem('new1')
    const result = buildSessionQueue(baseInput({
      allItems: [newItem],
      meaningsByItem: { new1: [{ id: 'm1', learning_item_id: 'new1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }] },
      sessionMode: 'backlog_clear',
    }))
    expect(result).toHaveLength(0)
  })

  it('quick: caps session at 5 items', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(`i${i}`))
    const meanings = Object.fromEntries(items.map(it => [it.id, [{ id: 'm-' + it.id, learning_item_id: it.id, translation_language: 'en', translation_text: 'word', is_primary: true, notes: null, created_at: '', updated_at: '' }]]))
    const itemStates = Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'anchoring')]))
    const skillStates = Object.fromEntries(items.map(it => [it.id, [makeSkillState(it.id)]]))
    const result = buildSessionQueue(baseInput({ allItems: items, meaningsByItem: meanings, itemStates, skillStates, sessionMode: 'quick', preferredSessionSize: 20 }))
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('standard: includes due items and new items', () => {
    const dueItem = makeItem('due1')
    const newItem = makeItem('new1')
    const itemStates = { due1: makeItemState('due1', 'retrieving') }
    const skillStates = { due1: [makeSkillState('due1')] }
    const meanings = {
      due1: [{ id: 'm1', learning_item_id: 'due1', translation_language: 'en', translation_text: 'hello', is_primary: true, notes: null, created_at: '', updated_at: '' }],
      new1: [{ id: 'm2', learning_item_id: 'new1', translation_language: 'en', translation_text: 'world', is_primary: true, notes: null, created_at: '', updated_at: '' }],
    }
    const result = buildSessionQueue(baseInput({ allItems: [dueItem, newItem], meaningsByItem: meanings, itemStates, skillStates }))
    const ids = result.map(r => r.exerciseItem.learningItem.id)
    expect(ids).toContain('due1')
    expect(ids).toContain('new1')
  })

  it('recall_sprint mode is not accepted — falls back to standard', () => {
    // recall_sprint was removed; passing it should not crash and should behave as standard
    expect(() => buildSessionQueue(baseInput({ sessionMode: 'recall_sprint' as never }))).not.toThrow()
  })

  it('push_to_productive mode is not accepted — falls back to standard', () => {
    expect(() => buildSessionQueue(baseInput({ sessionMode: 'push_to_productive' as never }))).not.toThrow()
  })
})
```

**Step 3: Run tests — expect them to fail with "module not found"**

```bash
bun run test src/__tests__/sessionQueue.test.ts 2>&1 | head -20
```

Expected: `Error: Cannot find module '@/lib/sessionQueue'`

No commit yet — tests should fail first.

---

## Task 3: Create sessionQueue.ts

**Files:**
- Create: `src/lib/sessionQueue.ts`
- Reference: `src/lib/sessionEngine.ts` lines 204–742 (copy helpers verbatim)

The new file keeps all exercise-selection helpers (`selectExercises`, `orderQueue`, `applyLessonGate`, all `make*` functions, semantic groups) exactly as they are in `sessionEngine.ts`. Only `buildSessionQueue` is rewritten.

**Step 1: Create the file**

```typescript
// src/lib/sessionQueue.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
} from '@/types/learning'
import type { ExerciseVariant } from '@/types/contentGeneration'

export type SessionMode = 'standard' | 'backlog_clear' | 'quick'

export interface SessionBuildInput {
  allItems: LearningItem[]
  meaningsByItem: Record<string, ItemMeaning[]>
  contextsByItem: Record<string, ItemContext[]>
  variantsByItem: Record<string, ItemAnswerVariant[]>
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>
  itemStates: Record<string, LearnerItemState>
  skillStates: Record<string, LearnerSkillState[]>
  preferredSessionSize: number
  dailyNewItemsLimit: number
  lessonFilter: string | null
  userLanguage: 'en' | 'nl'
  lessonOrder?: Record<string, number>
  sessionMode?: SessionMode
}

const LESSON_MASTERY_THRESHOLD = 0.70
const MASTERED_STAGES = new Set(['retrieving', 'productive', 'maintenance'])

interface CandidateItem {
  item: LearningItem
  state: LearnerItemState | null
  skills: LearnerSkillState[]
}

export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const {
    allItems, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext,
    itemStates, skillStates, preferredSessionSize, dailyNewItemsLimit,
    lessonFilter, userLanguage, lessonOrder,
  } = input
  const sessionMode: SessionMode = (['standard', 'backlog_clear', 'quick'].includes(input.sessionMode ?? ''))
    ? input.sessionMode as SessionMode
    : 'standard'
  const effectiveSessionSize = sessionMode === 'quick' ? 5 : preferredSessionSize
  const now = new Date()

  // 1. Filter eligible items
  let eligibleItems = allItems
  if (lessonFilter) {
    const lessonItemIds = new Set<string>()
    for (const [itemId, contexts] of Object.entries(contextsByItem)) {
      if (contexts.some(c => c.source_lesson_id === lessonFilter)) lessonItemIds.add(itemId)
    }
    eligibleItems = allItems.filter(i => lessonItemIds.has(i.id))
  }
  eligibleItems = eligibleItems.filter(i => {
    const meanings = meaningsByItem[i.id] ?? []
    if (meanings.some(m => m.translation_language === userLanguage)) return true
    const contexts = contextsByItem[i.id] ?? []
    return contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)
  })

  // 2. Split into due items and new items — no special anchoring treatment
  const dueItems: CandidateItem[] = []
  const newItems: CandidateItem[] = []

  for (const item of eligibleItems) {
    const state = itemStates[item.id] ?? null
    const skills = skillStates[item.id] ?? []

    if (state?.suspended) continue

    if (!state || state.stage === 'new') {
      newItems.push({ item, state, skills })
      continue
    }

    // Trust FSRS: include item only if any skill is due
    const isDue = skills.some(s => s.next_due_at && new Date(s.next_due_at) <= now)
    if (isDue) {
      dueItems.push({ item, state, skills })
    }
  }

  // 3. Sort due items by most-overdue first
  dueItems.sort((a, b) => {
    const earliest = (c: CandidateItem) =>
      Math.min(...c.skills
        .filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
        .map(s => new Date(s.next_due_at!).getTime()))
    return earliest(a) - earliest(b)
  })

  // 4. Gate and cap new items
  const gatedNew = sessionMode === 'backlog_clear'
    ? []
    : (lessonOrder
        ? applyLessonGate(newItems, eligibleItems, itemStates, contextsByItem, lessonOrder)
        : newItems
      ).slice(0, dailyNewItemsLimit)

  // 5. Compose candidates: due first, then new
  const candidates = [...dueItems, ...gatedNew].slice(0, effectiveSessionSize)

  // 6. Build exercises and order queue
  const queue: SessionQueueItem[] = []
  for (const candidate of candidates) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  return orderQueue(queue.slice(0, effectiveSessionSize))
}
```

Then copy verbatim from `sessionEngine.ts` (lines 214–742):
- `applyLessonGate` function
- `selectExercises` function (remove `recall_sprint` / `quick` recall-biasing branch — lines 291–297 in sessionEngine; `quick` no longer biases exercise type, it only caps session size)
- All `make*` functions
- `SEMANTIC_GROUPS_NL`, `SEMANTIC_GROUPS_EN`
- `getSemanticGroup`, `shuffle`
- `orderQueue` function

**Step 2: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "feat: add sessionQueue.ts — FSRS-driven due queue, no anchoring priority"
```

---

## Task 4: Update Session.tsx to use sessionQueue

**Files:**
- Modify: `src/pages/Session.tsx:8` (import line)
- Modify: `src/pages/Session.tsx:41-43` (sessionMode validation)

**Step 1: Update the import**

Line 8, change:
```typescript
import { buildSessionQueue, type SessionBuildInput, type SessionMode } from '@/lib/sessionEngine'
```
to:
```typescript
import { buildSessionQueue, type SessionBuildInput, type SessionMode } from '@/lib/sessionQueue'
```

**Step 2: Update sessionMode validation**

Lines 41-43, change:
```typescript
const sessionMode: SessionMode = (['backlog_clear', 'recall_sprint', 'push_to_productive', 'quick'].includes(sessionModeParam ?? ''))
  ? sessionModeParam as SessionMode
  : 'standard'
```
to:
```typescript
const sessionMode: SessionMode = (['backlog_clear', 'quick'].includes(sessionModeParam ?? ''))
  ? sessionModeParam as SessionMode
  : 'standard'
```

**Step 3: Build check**

```bash
bun run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/pages/Session.tsx
git commit -m "fix(session): use sessionQueue, drop recall_sprint and push_to_productive modes"
```

---

## Task 5: Update Dashboard.tsx to remap action card modes

**Files:**
- Modify: `src/pages/Dashboard.tsx` lines ~222-232

**Step 1: Find the action card config**

The section looks like:
```typescript
recall_quality: {
  ...
  mode: 'recall_sprint',   // ← change to 'standard'
},
usable_vocabulary: {
  ...
  mode: 'push_to_productive',  // ← change to 'standard'
},
```

**Step 2: Update both modes to 'standard'**

Change `'recall_sprint'` → `'standard'` and `'push_to_productive'` → `'standard'`.

**Step 3: Build + type check**

```bash
bun run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(dashboard): remap recall_sprint and push_to_productive action cards to standard"
```

---

## Task 6: Delete sessionEngine.ts and its tests

**Files:**
- Delete: `src/lib/sessionEngine.ts`
- Delete: `src/__tests__/sessionEngine.test.ts` (if it exists — check first)

**Step 1: Check for any remaining imports of sessionEngine**

```bash
grep -r "sessionEngine" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results. If any remain, update them to `sessionQueue`.

**Step 2: Delete the files**

```bash
rm src/lib/sessionEngine.ts
```

Check if `src/__tests__/sessionEngine.test.ts` exists:
```bash
ls src/__tests__/sessionEngine.test.ts 2>/dev/null && echo "exists" || echo "not found"
```

If it exists: `rm src/__tests__/sessionEngine.test.ts`

**Step 3: Run all tests**

```bash
bun run test
```

Expected: all tests pass.

**Step 4: Build check**

```bash
bun run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete sessionEngine.ts — replaced by sessionQueue.ts"
```

---

## Task 7: Final verification

**Step 1: Run full test suite**

```bash
bun run test
```

Expected: all green, no failures.

**Step 2: Type check**

```bash
bun run build
```

Expected: clean build.

**Step 3: Manual smoke test**

Start dev server (`bun run dev`), log in, start a session. Verify:
- Session loads and items appear
- Anchoring items with `next_due_at` in the future do NOT appear
- Session size respects the configured limit
- `backlog_clear` mode still works (no new items)
- `quick` mode caps at 5

**Step 4: DB check — confirm stuck items are fixed**

```sql
SELECT li.base_text, lis.stage, lss.stability, lss.success_count
FROM indonesian.learner_item_state lis
JOIN indonesian.learner_skill_state lss ON lss.learning_item_id = lis.learning_item_id AND lss.user_id = lis.user_id
JOIN indonesian.learning_items li ON li.id = lis.learning_item_id
WHERE lss.skill_type = 'recognition' AND lss.success_count >= 3 AND lss.stability >= 1.8
ORDER BY lss.success_count DESC;
```

All items meeting the promotion threshold should be at `retrieving` or higher.

---

## Summary

| Task | Files | Action |
|------|-------|--------|
| 1 | `scripts/repair-stability.ts` | Run (data migration) |
| 2 | `src/__tests__/sessionQueue.test.ts` | Write failing tests |
| 3 | `src/lib/sessionQueue.ts` | Create simplified queue |
| 4 | `src/pages/Session.tsx` | Update import + mode list |
| 5 | `src/pages/Dashboard.tsx` | Remap action card modes |
| 6 | `src/lib/sessionEngine.ts`, `src/__tests__/sessionEngine.test.ts` | Delete |
| 7 | — | Verify end-to-end |
