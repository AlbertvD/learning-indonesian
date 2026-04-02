# Bidirectional Flashcard Review — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to practice flashcards in both directions (Indonesian→Dutch and Dutch→Indonesian) with independent SM-2 mastery tracking per direction per card.

**Architecture:** Add a `direction` column to `card_reviews` with a new unique constraint on `(card_id, user_id, direction)`. Update the service layer to pass direction through all card review operations. Add a direction toggle to the Review page UI that reloads the due-cards queue when switched.

**Tech Stack:** React 19, TypeScript, Supabase JS v2 (`@supabase/ssr`), Mantine v8, Vitest + RTL

---

### Task 1: Database migration

**Files:**
- Modify: `scripts/migration.sql`

**Step 1: Add the migration SQL**

Append to the bottom of `scripts/migration.sql`:

```sql
-- Bidirectional review: add direction column to card_reviews
ALTER TABLE indonesian.card_reviews
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'forward'
    CHECK (direction IN ('forward', 'reverse'));

-- Replace unique constraint to include direction
-- NOTE: Verify actual constraint name before running. Check with:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'indonesian.card_reviews'::regclass AND contype = 'u';
-- The name may differ from the default (e.g. _idx suffix, or a custom name).
ALTER TABLE indonesian.card_reviews
  DROP CONSTRAINT IF EXISTS card_reviews_card_id_user_id_key;

ALTER TABLE indonesian.card_reviews
  ADD CONSTRAINT IF NOT EXISTS card_reviews_card_id_user_id_direction_key
    UNIQUE (card_id, user_id, direction);
```

**Step 2: Apply the migration**

```bash
make migrate
```

Expected: migration runs without errors. Existing rows get `direction = 'forward'` automatically.

**Step 3: Verify**

In Supabase Studio, run:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'indonesian' AND table_name = 'card_reviews' AND column_name = 'direction';
```
Expected: one row with `data_type = text`, `column_default = 'forward'`.

**Step 4: Commit**

```bash
git add scripts/migration.sql
git commit -m "feat: add direction column to card_reviews for bidirectional practice"
```

---

### Task 2: Update types

**Files:**
- Modify: `src/types/cards.ts`

**Step 1: Add direction to DueCard**

In `src/types/cards.ts`, add `direction` to the `DueCard` interface:

```typescript
export type ReviewDirection = 'forward' | 'reverse'

export interface DueCard {
  id: string
  card_id: string
  user_id: string
  direction: ReviewDirection
  easiness_factor: number
  interval_days: number
  repetitions: number
  next_review_at: string
  last_reviewed_at: string | null
  anki_cards: AnkiCard & {
    card_sets: CardSet
  }
}
```

Also export `ReviewDirection` — it will be used in the service and Review page.

**Step 2: Commit**

```bash
git add src/types/cards.ts
git commit -m "feat: add ReviewDirection type and direction field to DueCard"
```

---

### Task 3: Update card service

**Files:**
- Modify: `src/services/cardService.ts`
- Test: `src/__tests__/cardService.test.ts`

**Step 1: Write failing tests**

Add to `src/__tests__/cardService.test.ts`:

```typescript
// NOTE: Ensure the test file has a mock setup for the chained Supabase query builder.
// If `getMock()` doesn't exist yet, create a helper that tracks chained calls
// (e.g. .from().select().eq().eq().lte().order()) and exposes them for assertions.
// If it already exists, verify it can handle the additional `.eq('direction', ...)` call.

it('getDueCards filters by direction', async () => {
  await cardService.getDueCards('user-1', 'reverse')

  expect(getMock().eq).toHaveBeenCalledWith('user_id', 'user-1')
  expect(getMock().eq).toHaveBeenCalledWith('direction', 'reverse')
})

it('initializeCardReviews inserts rows with direction', async () => {
  await cardService.initializeCardReviews(['card-1'], 'user-1', 'reverse')

  expect(getMock().upsert).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ card_id: 'card-1', user_id: 'user-1', direction: 'reverse' })
    ]),
    { onConflict: 'card_id,user_id,direction', ignoreDuplicates: true }
  )
})

it('updateCardReview upserts with direction', async () => {
  const sm2 = {
    easiness_factor: 2.5,
    interval_days: 1,
    repetitions: 0,
    next_review_at: '2026-04-01T00:00:00Z',
    last_reviewed_at: '2026-03-29T00:00:00Z',
  }
  await cardService.updateCardReview('card-1', 'user-1', 'forward', sm2)

  expect(getMock().upsert).toHaveBeenCalledWith(
    { card_id: 'card-1', user_id: 'user-1', direction: 'forward', ...sm2 },
    { onConflict: 'card_id,user_id,direction' }
  )
})
```

**Step 2: Run tests to verify they fail**

```bash
bun run test src/__tests__/cardService.test.ts
```
Expected: 3 new tests FAIL.

**Step 3: Update `getDueCards`**

```typescript
async getDueCards(userId: string, direction: ReviewDirection = 'forward'): Promise<DueCard[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('card_reviews')
    .select('*, anki_cards!inner(*, card_sets!inner(*))')
    .eq('user_id', userId)
    .eq('direction', direction)
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at')
  if (error) throw error
  return data as unknown as DueCard[]
},
```

**Step 4: Update `initializeCardReviews`**

```typescript
async initializeCardReviews(cardIds: string[], userId: string, direction: ReviewDirection = 'forward'): Promise<void> {
  const rows = cardIds.map((cardId) => ({
    card_id: cardId,
    user_id: userId,
    direction,
    next_review_at: new Date().toISOString(),
  }))
  const { error } = await supabase
    .schema('indonesian')
    .from('card_reviews')
    .upsert(rows, { onConflict: 'card_id,user_id,direction', ignoreDuplicates: true })
  if (error) throw error
},
```

**Step 5: Update `updateCardReview`**

```typescript
async updateCardReview(cardId: string, userId: string, direction: ReviewDirection, sm2: {
  easiness_factor: number
  interval_days: number
  repetitions: number
  next_review_at: string
  last_reviewed_at: string
}): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('card_reviews')
    .upsert({ card_id: cardId, user_id: userId, direction, ...sm2 }, { onConflict: 'card_id,user_id,direction' })
  if (error) throw error
},
```

Add `import type { ReviewDirection } from '@/types/cards'` at the top.

**Step 6: Run tests to verify they pass**

```bash
bun run test src/__tests__/cardService.test.ts
```
Expected: all tests PASS.

**Step 7: Commit**

```bash
git add src/services/cardService.ts src/__tests__/cardService.test.ts
git commit -m "feat: add direction param to getDueCards, initializeCardReviews, updateCardReview"
```

---

### Task 4: Update cardStore

**Files:**
- Modify: `src/stores/cardStore.ts`

**Step 1: Read the file**

```bash
# Read src/stores/cardStore.ts to find fetchDueCards
```

**Step 2: Update `CardState` interface**

Update the interface to include the `direction` parameter:

```typescript
import type { CardSet, DueCard, ReviewDirection } from '@/types/cards'

interface CardState {
  cardSets: CardSet[]
  dueCards: DueCard[]
  loading: boolean
  fetchCardSets: () => Promise<void>
  addCardSet: (name: string, description: string, userId: string) => Promise<void>
  fetchDueCards: (userId: string, direction?: ReviewDirection) => Promise<void>
}
```

**Step 3: Update `fetchDueCards`**

Find `fetchDueCards` and add a `direction` parameter that it passes through to `cardService.getDueCards`:

```typescript
fetchDueCards: async (userId: string, direction: ReviewDirection = 'forward') => {
  // ... existing loading/error handling ...
  const cards = await cardService.getDueCards(userId, direction)
  // ... rest of existing logic ...
}
```

**Step 4: Run all tests**

```bash
bun run test
```
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/stores/cardStore.ts
git commit -m "feat: pass direction through cardStore.fetchDueCards"
```

---

### Task 5: Update Review page

**Files:**
- Modify: `src/pages/Review.tsx`
- Modify: `src/pages/Review.module.css`

**Step 1: Add direction state and toggle**

In `Review.tsx`:

1. Import `ReviewDirection` from `@/types/cards`
2. Add state: `const [direction, setDirection] = useState<ReviewDirection>('forward')`
3. **Split the existing `useEffect` into two:**
   - **Session effect** (runs once): starts/ends the learning session. Dependencies: `[user]`. This should NOT re-run when direction changes.
   - **Fetch effect** (runs on direction change): calls `fetchDueCards(user.id, direction)` and manages loading state. Dependencies: `[user, direction, fetchDueCards]`.
4. When direction changes via toggle, also reset session state:
   ```typescript
   const handleDirectionChange = (newDirection: ReviewDirection) => {
     if (newDirection === direction) return
     setDirection(newDirection)
     setCurrentIndex(0)
     setShowAnswer(false)
     setReviewedCount(0)
     setSessionDone(false)
   }
   ```

Example of the split effects:

```typescript
// Session tracking — runs once
useEffect(() => {
  if (!user) return
  startSession(user.id, 'review')
    .then((sid) => { sessionIdRef.current = sid })
    .catch((err) => logError({ page: 'review', action: 'startSession', error: err }))

  return () => {
    if (sessionIdRef.current) {
      endSession(sessionIdRef.current).catch((err) =>
        logError({ page: 'review', action: 'endSession', error: err })
      )
    }
  }
}, [user])

// Fetch due cards — re-runs when direction changes
useEffect(() => {
  async function fetchCards() {
    if (!user) return
    setLoading(true)
    try {
      await fetchDueCards(user.id, direction)
    } catch (err) {
      logError({ page: 'review', action: 'init', error: err })
      notifications.show({
        color: 'red',
        title: T.common.error,
        message: T.common.somethingWentWrong,
      })
    } finally {
      setLoading(false)
    }
  }
  fetchCards()
}, [user, direction, fetchDueCards])
```

**Step 2: Extract the subnav + toggle as a reusable fragment**

Create a helper that renders the subnav with the direction toggle, so it can be reused across the main review view, the "all caught up" screen, and the "session done" screen:

```tsx
const directionToggle = (
  <div className={classes.reviewSubnav}>
    <button className={classes.backBtn} onClick={() => navigate(backUrl)}>
      <IconChevronLeft size={15} />
      {T.sets.title}
    </button>
    <div className={classes.directionToggle}>
      <button
        className={`${classes.dirBtn} ${direction === 'forward' ? classes.dirBtnActive : ''}`}
        onClick={() => handleDirectionChange('forward')}
      >
        {T.review.forward}
      </button>
      <button
        className={`${classes.dirBtn} ${direction === 'reverse' ? classes.dirBtnActive : ''}`}
        onClick={() => handleDirectionChange('reverse')}
      >
        {T.review.reverse}
      </button>
    </div>
  </div>
)
```

Add `forward` and `reverse` keys to the review translation strings (e.g. `forward: 'ID → NL'`, `reverse: 'NL → ID'` for NL, and `forward: 'ID → EN'`, `reverse: 'EN → ID'` for EN).

Then use `{directionToggle}` in all three return paths:
- The "all caught up" screen (before the `doneCard` div)
- The "session done" screen (before the `doneCard` div)
- The main review screen (replaces the existing `reviewSubnav` div)

**Step 3: Swap front/back based on direction**

In the card render section, replace the hardcoded `front`/`back` references:

```tsx
const question = direction === 'forward'
  ? card.anki_cards.front.replace(/\s*\([^)]*\)\s*$/, '')
  : card.anki_cards.back

const answer = direction === 'forward'
  ? card.anki_cards.back
  : card.anki_cards.front.replace(/\s*\([^)]*\)\s*$/, '')
```

Then use `question` and `answer` in the card faces instead of `card.anki_cards.front` / `card.anki_cards.back`.

**Step 4: Pass direction to `handleRating`**

Update `handleRating` to pass `direction` to `updateCardReview`:

```typescript
await cardService.updateCardReview(card.card_id, user.id, direction, { ... })
```

**Step 5: Add CSS for the toggle**

In `Review.module.css`, first update `.reviewSubnav` to be a flex container:

```css
.reviewSubnav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
```

Then add after `.backBtn`:

```css
.directionToggle {
  display: flex;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  overflow: hidden;
}

.dirBtn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--display);
  font-size: 12px;
  font-weight: 700;
  padding: 5px 12px;
  cursor: pointer;
  transition: all .15s;
}

.dirBtn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.06);
}

.dirBtnActive {
  background: rgba(0,229,255,0.12);
  color: var(--accent-primary);
}

/* Light theme */
:global(html[data-mantine-color-scheme="light"]) .directionToggle {
  border-color: var(--border);
}

:global(html[data-mantine-color-scheme="light"]) .dirBtnActive {
  background: rgba(0,153,184,0.12);
  color: var(--accent-primary);
}
```

**Step 6: Run all tests**

```bash
bun run test
```
Expected: all tests PASS.

**Step 7: Commit**

```bash
git add src/pages/Review.tsx src/pages/Review.module.css
git commit -m "feat: add bidirectional review toggle to Review page"
```

---

### Task 6: Initialize reverse reviews lazily

**Files:**
- Modify: `src/pages/Set.tsx`
- Modify: `src/pages/Review.tsx`

**Rationale:** Eagerly initializing both directions on every set visit doubles the Supabase calls for users who only use forward mode. Instead, initialize reverse rows lazily — only when the user first switches to reverse on the Review page.

**Step 1: Update Set.tsx**

Pass `'forward'` explicitly to `initializeCardReviews` (so it matches the new function signature), but don't add a second call for reverse:

```typescript
await cardService.initializeCardReviews(cards.map(c => c.id), user.id, 'forward')
```

**Step 2: Initialize reverse on first toggle in Review.tsx**

In `handleDirectionChange`, when switching to reverse, call `initializeCardReviews` for the reverse direction. Use a ref to avoid re-initializing on subsequent toggles:

```typescript
const reverseInitializedRef = useRef(false)

const handleDirectionChange = async (newDirection: ReviewDirection) => {
  if (newDirection === direction) return
  if (newDirection === 'reverse' && !reverseInitializedRef.current && user) {
    try {
      const cardIds = dueCards.map(c => c.card_id)
      // Also need all card IDs from the set, not just due ones.
      // Fetch from the store or pass through. If the Review page
      // doesn't have access to all card IDs, initialize via the
      // fetch effect instead — getDueCards will return an empty
      // list if no reverse rows exist, and the "all caught up"
      // screen lets the user navigate to the set to trigger init.
      await cardService.initializeCardReviews(cardIds, user.id, 'reverse')
      reverseInitializedRef.current = true
    } catch (err) {
      logError({ page: 'review', action: 'initReverse', error: err })
    }
  }
  setDirection(newDirection)
  setCurrentIndex(0)
  setShowAnswer(false)
  setReviewedCount(0)
  setSessionDone(false)
}
```

**Alternative (simpler):** If getting all card IDs on the Review page is awkward, keep the eager approach from Set.tsx — call `initializeCardReviews` for both directions there. The extra upsert with `ignoreDuplicates: true` is cheap. Choose whichever is simpler for your codebase.

**Step 3: Run all tests**

```bash
bun run test
```
Expected: all tests PASS.

**Step 4: Commit**

```bash
git add src/pages/Set.tsx src/pages/Review.tsx
git commit -m "feat: initialize reverse review rows when user first toggles to reverse direction"
```

---

### Task 7: Manual smoke test

1. Open the app and navigate to a card set
2. Start a review session — verify it works as before (Indonesian → Dutch)
3. Click the direction toggle — verify the queue reloads and the card shows Dutch as question, Indonesian as answer
4. Rate a card in reverse — verify the session advances
5. Toggle back to forward — verify the forward queue is independent
6. Complete all forward reviews — verify "all caught up" screen still shows the direction toggle
7. Switch to reverse on the "all caught up" screen — verify it loads reverse due cards (or shows "all caught up" for reverse too)
8. Check Supabase Studio: `SELECT * FROM indonesian.card_reviews ORDER BY direction` — verify separate rows exist for `forward` and `reverse` with independent SM-2 values
9. Verify the toggle labels match the app's current language setting (NL vs EN)
