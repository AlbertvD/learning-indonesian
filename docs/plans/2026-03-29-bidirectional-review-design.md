# Bidirectional Flashcard Review — Design

**Date:** 2026-03-29

## Overview

Allow users to practice flashcards in both directions with independent mastery tracking per direction per card.

- **Forward** (default): Indonesian → Dutch
- **Reverse**: Dutch → Indonesian

## User Experience

On the Review page, a two-segment direction toggle sits next to the back button at the top:

```
← Sets    [🇮🇩 → 🇳🇱]  [🇳🇱 → 🇮🇩]
```

- Active direction is highlighted in cyan
- Switching direction reloads the due cards queue for that direction and resets the session
- Direction defaults to `forward` on every page load

## Data Model

### Schema change

Add a `direction` column to `card_reviews`:

```sql
ALTER TABLE indonesian.card_reviews
  ADD COLUMN direction text NOT NULL DEFAULT 'forward'
    CHECK (direction IN ('forward', 'reverse'));

-- Drop old unique constraint, add new one
ALTER TABLE indonesian.card_reviews
  DROP CONSTRAINT card_reviews_card_id_user_id_key;

ALTER TABLE indonesian.card_reviews
  ADD CONSTRAINT card_reviews_card_id_user_id_direction_key
    UNIQUE (card_id, user_id, direction);
```

Existing rows default to `direction = 'forward'` — no data migration needed.

### DueCard type

Add `direction: 'forward' | 'reverse'` to the `DueCard` type.

## Service Layer

All three card service methods gain a `direction` parameter:

- `getDueCards(userId, direction)` — filters by direction
- `initializeCardReviews(cardIds, userId, direction)` — inserts rows for that direction
- `updateCardReview(cardId, userId, direction, sm2)` — upserts on `(card_id, user_id, direction)`

## Review Page

- Add `direction` state (`'forward' | 'reverse'`), defaulting to `'forward'`
- Direction toggle rendered in `reviewSubnav` next to the back button
- Switching direction: reset `currentIndex`, `showAnswer`, `reviewedCount`, `sessionDone`, then re-fetch due cards for the new direction
- Card display: when `direction === 'reverse'`, swap front/back — question = `card.anki_cards.back`, answer = `card.anki_cards.front`
- `handleRating` passes direction to `updateCardReview`

## Supabase Requirements

### Schema changes
- Add `direction` column to `indonesian.card_reviews` with default `'forward'` and CHECK constraint
- Drop old unique constraint `(card_id, user_id)`, add new `(card_id, user_id, direction)`
- Add to `scripts/migration.sql`

### homelab-configs changes
- PostgREST: N/A — no new schema exposure needed
- Kong: N/A — no new CORS headers needed
- GoTrue: N/A
- Storage: N/A

### Health check additions
- N/A — existing card review checks remain valid
