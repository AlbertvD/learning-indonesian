# Content Review Page — Spec

**Goal:** Admin-only page to browse all exercise variants for a lesson, review how they render, add comments, and track what needs fixing in the staging files.

---

## User flow

### Mode 1 — Exercise browser

1. Admin navigates to `/admin/content-review`
2. Selects a lesson (dropdown: "Les 1", "Les 2", …)
3. Selects an exercise type (dropdown: all types present in that lesson, or "Alle types")
4. Page shows exercise cards one at a time with a counter ("3 / 24")
5. Prev / Next navigation — keyboard arrows work only when the textarea is **not** focused (check `document.activeElement` in the keydown handler)
6. Each exercise card renders as a **structured summary card** (see below) — not interactive
7. Below the exercise card: a **comment card** — free-text textarea pre-filled with any existing comment for that variant; a Save button
8. Admin types a note, saves → stored in DB
9. A small badge on the exercise card indicates if a comment exists ("💬")
10. Empty state: if no variants exist for the selected lesson+type, show "Geen oefeningen gevonden voor deze les."

### Mode 2 — Comments overview

1. Tab on the same page: "Opmerkingen"
2. Lists all open comments across all lessons, grouped by lesson → exercise type
3. Each row shows: lesson name, exercise type, short prompt summary, comment text, and "Opgelost" button
4. Clicking Opgelost sets `status = 'resolved'` and removes the row from the list
5. Admin uses this list to drive updates to staging files, then re-publishes

---

## Exercise summary card (structured, not interactive)

Each variant is rendered as a read-only two-section card. No interactive components reused — the card reads directly from `payload_json`.

| Type | Vraag | Antwoord |
|---|---|---|
| `recognition_mcq` | Indonesian word (`learningItem.base_text`) | Correct Dutch meaning (from `meanings`) |
| `cued_recall` | `cuedRecallData.promptMeaningText` | `cuedRecallData.correctOptionId` |
| `cloze_mcq` | Sentence with blank (`clozeMcqData.sentence`) + options | `clozeMcqData.correctOptionId` |
| `cloze` | `clozeContext.sentence` | `clozeContext.targetWord` |
| `contrast_pair` | `contrastPairData.promptText` + beide opties | `contrastPairData.correctOptionId` + `targetMeaning` |
| `sentence_transformation` | `sourceSentence` + `transformationInstruction` | `acceptableAnswers[0]` |
| `constrained_translation` | `sourceLanguageSentence` | `acceptableAnswers[0]` (or `blankAcceptableAnswers[0]` if cloze mode) |
| `meaning_recall` | Indonesian word | Dutch meaning |
| `typed_recall` | Indonesian word | Acceptable answers |
| `speaking` | `speakingData.promptText` | *(geen antwoord — zelf beoordelen)* |

All values read from `payload_json`. Include a fallback renderer for unknown types: show the raw `payload_json` in a `<pre>` block with a "Onbekend type" banner.

---

## Data model

### New table: `indonesian.exercise_review_comments`

`content_flags` cannot be used because it has `learning_item_id NOT NULL` and its unique constraint is on `(user_id, learning_item_id, exercise_type)` — grammar variants have no `learning_item_id`.

```sql
CREATE TABLE IF NOT EXISTS indonesian.exercise_review_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_variant_id uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE,
  comment             text NOT NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_variant_id)
);

ALTER TABLE indonesian.exercise_review_comments ENABLE ROW LEVEL SECURITY;

-- Admin-only: RLS restricts to users with 'admin' role, not just row owner
CREATE POLICY "review_comments_admin_only" ON indonesian.exercise_review_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM indonesian.user_roles
            WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM indonesian.user_roles
            WHERE user_id = auth.uid() AND role = 'admin')
  );

GRANT SELECT, INSERT, UPDATE ON indonesian.exercise_review_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.exercise_review_comments TO service_role;

CREATE INDEX idx_exercise_review_comments_user_status
  ON indonesian.exercise_review_comments(user_id, status);

CREATE INDEX idx_exercise_review_comments_variant
  ON indonesian.exercise_review_comments(exercise_variant_id);
```

---

## Data fetching

### Loading exercise variants for a lesson

Two join paths exist because grammar and vocab variants are linked to lessons differently:

- **Grammar variants**: `exercise_variants.lesson_id` is a direct FK (set at publish time)
- **Vocab variants**: `exercise_variants.lesson_id` is NULL; linked via `context_id → item_contexts.source_lesson_id`

```sql
-- Grammar variants (lesson_id set directly)
SELECT ev.*
FROM indonesian.exercise_variants ev
WHERE ev.lesson_id = :lessonId
  AND ev.is_active = true
  AND (:exerciseType IS NULL OR ev.exercise_type = :exerciseType)

UNION ALL

-- Vocab variants (linked via item_contexts)
SELECT ev.*
FROM indonesian.exercise_variants ev
JOIN indonesian.item_contexts ic ON ic.id = ev.context_id
WHERE ic.source_lesson_id = :lessonId
  AND ev.lesson_id IS NULL
  AND ev.is_active = true
  AND (:exerciseType IS NULL OR ev.exercise_type = :exerciseType)
```

### Loading comments for a batch of variants

```sql
SELECT *
FROM indonesian.exercise_review_comments
WHERE user_id = :userId
  AND exercise_variant_id = ANY(:variantIds)
  AND status = 'open'
```

Load all at once after fetching variants; store as a `Map<variantId, ReviewComment>` in component state.

### Upsert comment

```sql
INSERT INTO indonesian.exercise_review_comments (user_id, exercise_variant_id, comment)
VALUES (:userId, :variantId, :comment)
ON CONFLICT (user_id, exercise_variant_id)
DO UPDATE SET comment = EXCLUDED.comment, updated_at = now()
```

### Open comments overview (with lesson context)

Grammar and vocab variants require different join paths to resolve the lesson name:

```sql
-- Comments on grammar variants
SELECT
  erc.id, erc.comment, erc.exercise_variant_id, erc.created_at,
  ev.exercise_type, ev.payload_json,
  l.title AS lesson_title
FROM indonesian.exercise_review_comments erc
JOIN indonesian.exercise_variants ev ON ev.id = erc.exercise_variant_id
JOIN indonesian.lessons l ON l.id = ev.lesson_id
WHERE erc.user_id = :userId AND erc.status = 'open' AND ev.lesson_id IS NOT NULL

UNION ALL

-- Comments on vocab variants
SELECT
  erc.id, erc.comment, erc.exercise_variant_id, erc.created_at,
  ev.exercise_type, ev.payload_json,
  l.title AS lesson_title
FROM indonesian.exercise_review_comments erc
JOIN indonesian.exercise_variants ev ON ev.id = erc.exercise_variant_id
JOIN indonesian.item_contexts ic ON ic.id = ev.context_id
JOIN indonesian.lessons l ON l.id = ic.source_lesson_id
WHERE erc.user_id = :userId AND erc.status = 'open' AND ev.lesson_id IS NULL

ORDER BY lesson_title, exercise_type
```

The `prompt_summary` shown in the overview is derived client-side from `payload_json` using the same field mapping as the summary card (first 60 chars of the prompt field for that exercise type).

**Note:** PostgREST does not support UNION. The two queries above are conceptual SQL. The service implementation must execute them as two separate Supabase calls and merge the results client-side.

---

## Service: `exerciseReviewService`

**Type dropdown population:** No separate query is needed for the exercise type filter. `getVariantsForLesson` fetches all active variants for the lesson; the component derives distinct `exercise_type` values client-side from the result and uses them to populate the dropdown. Type filtering is then done in-memory.

```typescript
// getVariantsForLesson(lessonId: string) → ExerciseVariant[]  (all types; filtering done client-side)
// getCommentsForVariants(userId: string, variantIds: string[]) → Map<string, ReviewComment>
// upsertComment(userId: string, variantId: string, comment: string) → ReviewComment
// resolveComment(commentId: string) → void
// getOpenComments(userId: string) → ReviewCommentWithContext[]
```

`ReviewCommentWithContext` includes `lessonTitle`, `exerciseType`, `promptSummary` (derived from payload), and `comment`.

---

## Route and access control

- Route: `/admin/content-review`
- Guard: redirect to `/` if `profile.isAdmin !== true`
- Sidebar: admin-only entry, under a collapsible "Admin" group (only renders if `profile.isAdmin`)
- RLS is the enforcement layer — the UI guard is defence in depth

---

## Page layout

```
┌──────────────────────────────────────────────────────────────┐
│  Content Review                           [Opmerkingen tab]  │
├────────────────────────────────────────────────────────────  │
│  Les: [▼ Les 4]  Type: [▼ Alle types]    3 / 24   ◀   ▶    │
├──────────────────────────────────────────────────────────────│
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [badge: contrast_pair]                   [💬 if]   │   │
│  │  Vraag:  Kies de goede vorm — ...                    │   │
│  │  Antwoord:  belum  (Nog niet — openheid voor later)  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Opmerking                                           │   │
│  │  [textarea — pre-filled if existing comment]         │   │
│  │  [Opslaan]                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

Comments tab:
```
┌─────────────────────────────────────────────────────────┐
│  Openstaande opmerkingen  (12)                          │
├──────────┬──────────────┬────────────────┬─────────────┤
│ Les      │ Type         │ Opmerking      │             │
├──────────┼──────────────┼────────────────┼─────────────┤
│ Les 4    │ contrast_pair│ "targetMeaning │ [Opgelost]  │
│          │              │  is wrong..."  │             │
└──────────┴──────────────┴────────────────┴─────────────┘
```

---

## Implementation tasks (in order)

1. **Migration** — add `exercise_review_comments` table + RLS + grants + indexes
2. **Types** — `ReviewComment`, `ReviewCommentWithContext`
3. **Service** — `exerciseReviewService` with all 5 methods; verify `payload_json` shapes for each exercise type in the live DB before writing the summary card
4. **ExerciseSummaryCard** — read-only card with Vraag/Antwoord per type + fallback for unknown types
5. **ContentReviewPage** — lesson/type selector, carousel, comment card, empty state, keyboard nav (focus-aware)
6. **CommentsOverviewTab** — open comments list with resolve action
7. **Sidebar** — admin-only nav entry (conditional on `profile.isAdmin`)
8. **Route** — `/admin/content-review` with admin guard in router

---

## Supabase Requirements

### Schema changes
- New table `indonesian.exercise_review_comments` — see Data model section
- RLS: admin-role-only (via `user_roles` lookup) for all operations
- Grants: `SELECT, INSERT, UPDATE` to `authenticated`; full to `service_role`

### homelab-configs changes
- [ ] PostgREST: no change — `indonesian` schema already exposed
- [ ] Kong: no change
- [ ] GoTrue: no change
- [ ] Storage: no change

### Health check additions
- N/A — admin-only table, not part of learner flow
