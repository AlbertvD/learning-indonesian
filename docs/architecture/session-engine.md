# Session Engine

`src/lib/sessionEngine.ts`

---

## Overview

`buildSessionQueue` is the single entry point that converts the full learning-item pool into an ordered, ready-to-play `SessionQueueItem[]`. It runs entirely in the browser with no network calls. `applyPolicies` (see [session-policies.md](session-policies.md)) is called by the caller after this function returns.

---

## Input: `SessionBuildInput`

| Field | Type | Purpose |
|---|---|---|
| `allItems` | `LearningItem[]` | Full item pool (optionally pre-filtered by lesson) |
| `meaningsByItem` | `Record<string, ItemMeaning[]>` | Translations keyed by item ID |
| `contextsByItem` | `Record<string, ItemContext[]>` | Example sentences, cloze contexts, exercise prompts |
| `variantsByItem` | `Record<string, ItemAnswerVariant[]>` | Accepted alternative spellings/forms |
| `exerciseVariantsByContext` | `Record<string, ExerciseVariant[]>` | Published grammar exercises keyed by context ID |
| `itemStates` | `Record<string, LearnerItemState>` | Per-item lifecycle stage |
| `skillStates` | `Record<string, LearnerSkillState[]>` | Per-item per-skill FSRS state |
| `preferredSessionSize` | `number` | Session size cap |
| `dailyNewItemsLimit` | `number` | Max new items per session (from `profiles.daily_new_items_limit`, default 10) |
| `lessonFilter` | `string \| null` | Restrict to a single lesson's items |
| `userLanguage` | `'en' \| 'nl'` | Controls which meanings are valid |
| `lessonOrder` | `Record<string, number>` | lessonId → order_index for lesson gating |
| `sessionMode` | `SessionMode` | Controls session composition and exercise selection |

---

## Step 1: Filter eligible items

Two filters are applied before categorization:

**Lesson filter.** If `lessonFilter` is set, only items whose `item_contexts` contain `source_lesson_id === lessonFilter` are kept.

**Meanings filter.** An item is eligible if it has at least one meaning in `userLanguage`. **Exception:** items whose contexts have published `ExerciseVariant` rows are always eligible, regardless of meanings. Grammar exercises are self-contained — all display text lives in `payload_json`, so meanings are not needed to render them.

```ts
eligibleItems = eligibleItems.filter(i => {
  const meanings = meaningsByItem[i.id] ?? []
  if (meanings.some(m => m.translation_language === userLanguage)) return true
  const contexts = contextsByItem[i.id] ?? []
  return contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)
})
```

**`recall_sprint` filter.** In this mode a third filter restricts to items that already have a `form_recall` skill. Items with no `LearnerItemState` record (truly new, never seen) and items with `stage === 'anchoring'` are excluded. Note: the code gates on `!state || state.stage === 'anchoring'` — not on `stage === 'new'` explicitly, so an item with a state record explicitly set to `stage: 'new'` would still pass this filter and be checked for a `form_recall` skill.

---

## Step 2: Categorize items into buckets

Each eligible item lands in exactly one bucket:

| Bucket | Condition |
|---|---|
| `new` | No `LearnerItemState`, or `stage === 'new'` |
| `anchoring` | `stage === 'anchoring'` — always reinforced regardless of FSRS due date |
| `due` | Has at least one skill with `next_due_at <= now` |
| `weak` | High lapse count (`lapse_count >= 3`) OR exactly one skill and it is `recognition` (no recall yet) |

Notes:
- Suspended items are skipped — but only if they have a `LearnerItemState` record. The suspended check runs after the `new` item early-return, so an item with `suspended = true` and no state record (or `stage === 'new'`) will still be placed in the `new` bucket.
- An item can appear in both `due` and `weak` simultaneously (the engine picks from both independently).
- `anchoring` items bypass the due-date check intentionally — they haven't been seen enough times to safely skip.

**Priorities within each bucket:**
- `due`: `1 - minRetrievability` (most overdue = highest priority)
- `anchoring`: 1.0 if any skill is overdue, 0.6 otherwise
- `weak`: 1.0 for high lapses, 0.5 for recognition-only

---

## Step 3: Lesson gating for new items

When `lessonOrder` is provided, `applyLessonGate` filters new items to those from unlocked lessons only.

Unlock logic:
1. Lesson 1 (lowest `order_index`) is always unlocked.
2. Each subsequent lesson unlocks only after the previous lesson reaches **70%** of its items at `retrieving`, `productive`, or `maintenance` stage.
3. The gate stops at the first locked lesson — lessons beyond a gap are not unlocked even if they would individually qualify.

Items already in progress (`anchoring` / `retrieving` / etc.) from any lesson are never filtered — the gate only controls introduction of brand-new items.

---

## Step 4: Session composition

Sessions are built in FSRS-aligned priority order:

| Priority | Category | Inclusion rule |
|---|---|---|
| 1 | Anchoring | All anchoring items (always — analogous to FSRS learning steps) |
| 2 | Due | All FSRS-due items (trust the algorithm's scheduling) |
| 3 | New | Up to `dailyNewItemsLimit` items from `gatedNewItems` |

The combined list is trimmed to `effectiveSessionSize`. Special modes:

| Mode | Composition |
|---|---|
| `standard` | anchoring + due + new (up to `dailyNewItemsLimit`) |
| `quick` | same as `standard` but `effectiveSessionSize = 5` |
| `backlog_clear` | due only — clears overdue backlog without new introductions |
| `recall_sprint` | all items with `form_recall` skill (no stage filter, no new items) |
| `push_to_productive` | retrieving-stage items with `form_recall` skill, no new items |

The previous percentage-based slot allocation (55% due / 20% anchoring / 10% weak) and `calculateNewSlots` backlog-threshold logic have been removed. New item pacing is now controlled by `dailyNewItemsLimit` alone. The weak-item bucket has also been removed — weak items (high lapse count) get shorter FSRS intervals and appear naturally in the due bucket when scheduled.

---

## Step 5: `selectExercises` — stage-based exercise selection

`selectExercises` maps each `CandidateItem` to one or more `ExerciseItem` objects based on the item's current stage and the session mode.

### `new` and `anchoring` stages

- `new`: always `recognition_mcq` (Indonesian → pick translation).
- `anchoring`: `recognition_mcq` ~65% of the time; `cued_recall` (translation → pick Indonesian) ~35%.

### `retrieving` stage

- `sentence`/`dialogue_chunk` item types: always `cloze`.
- Word items with a `cloze`-type context: alternate between `cloze` and `typed_recall` (~50/50).
- Word items without a cloze context: `typed_recall`.

### `productive` and `maintenance` stages

- `sentence`/`dialogue_chunk`: `recognition_mcq`.
- Words with published `ExerciseVariant` rows: pick one randomly (`contrast_pair`, `sentence_transformation`, or `constrained_translation`).
- Words without published variants: random rotation — `typed_recall` (35%), `cloze` if context exists (25%), `cued_recall` (20%), `recognition_mcq` (20%).

### `recall_sprint` / `quick` (recall-biased)

- `recall_sprint` and `quick` (for items with `form_recall` skill): `sentence`/`dialogue_chunk` → `cloze`; words → `typed_recall`.
- `quick` items without recall skill fall through to the normal stage-based logic.

### Cloze context eligibility

`selectExercises` only attempts a cloze exercise for items that have a `context_type === 'cloze'` context (`hasAnchorContext` check). `lesson_snippet` contexts with `is_anchor_context === true` are not eligible at the selection stage.

However, `makeClozeExercise` itself has a broader fallback — if no `cloze`-type context is found it falls back to any context where `is_anchor_context === true` (which can include `lesson_snippet` contexts). In practice this fallback only fires if `hasAnchorContext` was `true` via another path, which the current code prevents. The safeguard is in `selectExercises`, not in `makeClozeExercise`.

---

## Step 6: `makePublishedExercise` — answer key separation

Grammar exercises stored in `exercise_variants` split their data across two JSON columns. Supported types: `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking` (disabled via DB gate).

- `payload_json`: display-only fields (prompt text, instructions, explanation, option labels). Safe to send to the client as-is.
- `answer_key_json`: correctness data (`correctOptionId`, `acceptableAnswers`, `disallowedShortcutForms`). Stored separately so display and grading concerns are cleanly isolated.

`makePublishedExercise` reads `correctOptionId` / `acceptableAnswers` from `answer_key_json` (with a fallback to `payload_json` for legacy data):

```ts
correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || ''
acceptableAnswers: (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || []
```

---

## Step 7: `orderQueue`

The final queue is reordered for a good session start:

1. Up to 2 `recognition_mcq` items are moved to the front — easiest type, good warm-up.
2. Remaining items are Fisher-Yates shuffled.

The full queue is then trimmed to `effectiveSessionSize` before being returned.

---

## `SessionQueueItem` shape

```ts
interface SessionQueueItem {
  exerciseItem: ExerciseItem          // fully hydrated exercise, ready to render
  learnerItemState: LearnerItemState | null   // null for brand-new items
  learnerSkillState: LearnerSkillState | null // null if no skill of the matching skillType exists yet (not only for new items — a retrieving item served typed_recall will have null here if it only has a recognition skill so far)
}
```

After the queue is built, `Session.tsx` passes it through `applyPolicies` (see [session-policies.md](session-policies.md)) before starting the session.
