# Session System Refactor Plan

## Context

Session.tsx currently fires 3×N Supabase requests on startup (one getMeanings, getContexts, getAnswerVariants per learning item). With 199 items that's 597 requests — all to load content that only ~15 items will actually use per session. Batch endpoints already exist in learningItemService.ts but aren't called. Additionally, the exercise data flow has no unified shape (ReviewInput is built ad-hoc), exercise selection is tangled with content loading, and a duplicate Cloze render bug exists.

**Goal:** Collapse 597 init requests to 3, clean up data flow, and decouple selection from building.

---

## Step 1 — Fix duplicate Cloze render bug

**File:** `src/pages/Session.tsx` lines 359-366  
Delete the second identical `exerciseType === 'cloze'` JSX block. Four conditional blocks become three.

---

## Step 2 — Add `ExerciseContext` to types

**File:** `src/types/learning.ts` — additive only

```ts
export interface ExerciseContext {
  userId: string
  sessionId: string
  exerciseItem: ExerciseItem
  learnerItemState: LearnerItemState | null
  learnerSkillState: LearnerSkillState | null
}
```

---

## Step 3 — Refactor `handleAnswer` to use `ExerciseContext`

**File:** `src/pages/Session.tsx` — `handleAnswer` function  
Replace the 11-field ad-hoc ReviewInput construction with:

```ts
const ctx: ExerciseContext = {
  userId: user.id,
  sessionId,
  exerciseItem: item.exerciseItem,
  learnerItemState: item.learnerItemState,
  learnerSkillState: item.learnerSkillState,
}
const reviewInput: ReviewInput = { ...ctx, wasCorrect, isFuzzy, hintUsed: false, latencyMs, rawResponse, normalizedResponse }
```

ReviewInput signature is unchanged — this is an internal refactor only.

---

## Step 4 — Export `selectExercises` and `CandidateItem` from sessionEngine

**File:** `src/lib/sessionEngine.ts`  
- Promote `CandidateItem` interface to `export`
- Change `function selectExercises` to `export function selectExercises`
- No behavioral change — used internally by buildSessionQueue as before

---

## Step 5 — Extract `selectCandidates` from `buildSessionQueue`

**File:** `src/lib/sessionEngine.ts`

New exported function:
```ts
export function selectCandidates(input: SessionBuildInput): CandidateItem[]
```

Extracts: eligibility filtering, categorization, priority scoring, slot allocation. Returns the ~15 selected candidates without building ExerciseItems.

`buildSessionQueue` becomes a thin wrapper: `selectCandidates` → `selectExercises` per candidate → `orderQueue`. Existing signature unchanged — all tests pass as-is.

---

## Step 6 — Lazy-load content + batch fetch in Session.tsx

**File:** `src/pages/Session.tsx` — `initSession` function

**New flow (replaces the 3×N per-item loop):**

```
Old: 3 × 199 = 597 requests (per-item singles)
New: 3 requests  (batch, only for selected items)
```

1. Batch-fetch ALL meanings: `getMeaningsBatch(items.map(i => i.id))` — needed for language filtering in selectCandidates
2. If `lessonFilter` active: batch-fetch ALL contexts (`getContextsBatch`) — needed for lesson membership filtering; reuse for content map
3. Call `selectCandidates(...)` → ~15 `CandidateItem[]`
4. Collect `selectedIds = candidates.map(c => c.item.id)`
5. Batch-fetch contexts + variants for selected IDs only (2 requests, or skip contexts if already fetched):
   ```ts
   Promise.all([getContextsBatch(selectedIds), getAnswerVariantsBatch(selectedIds)])
   ```
6. Filter state maps to selected IDs only:
   ```ts
   const selectedItemIds = new Set(candidates.map(c => c.item.id))
   const filteredItemStates = Object.fromEntries(
     Object.entries(itemStates).filter(([id]) => selectedItemIds.has(id))
   )
   const filteredSkillStates = Object.fromEntries(
     Object.entries(skillStatesMap).filter(([id]) => selectedItemIds.has(id))
   )
   ```
7. Build content maps from batch results, call `buildSessionQueue` with filtered data

**Total requests:**
- No lesson filter: **3 requests** (meanings + contexts + variants)
- With lesson filter: **3 requests** (meanings + contexts reused + variants)

---

## Step 7 — `ReviewInput` extends `ExerciseContext`

**File:** `src/lib/reviewHandler.ts`

```ts
import type { ExerciseContext } from '@/types/learning'

export interface ReviewInput extends ExerciseContext {
  wasCorrect: boolean
  isFuzzy: boolean
  hintUsed: boolean
  latencyMs: number | null
  rawResponse: string | null
  normalizedResponse: string | null
}
```

Removes 5 duplicate fields (`userId`, `sessionId`, `exerciseItem`, `learnerItemState`, `learnerSkillState`). Runtime shape identical. Existing reviewHandler tests continue to pass.

---

## Files Modified

| File | Steps |
|------|-------|
| `src/pages/Session.tsx` | 1, 3, 6 |
| `src/types/learning.ts` | 2, 7 |
| `src/lib/sessionEngine.ts` | 4, 5 |
| `src/lib/reviewHandler.ts` | 7 |
| `src/__tests__/sessionEngine.test.ts` | verify passes after step 5 |
| `src/__tests__/reviewHandler.test.ts` | verify passes after step 7 |

---

## Verification

After all steps:
```bash
bun run test      # all 57 tests must still pass
bun run build     # must compile cleanly
```

Manual: Open a session at `localhost:5173/session`, open the Network tab, verify init fires ~3 Supabase requests instead of hundreds.
