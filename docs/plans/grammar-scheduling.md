# Grammar Pattern Scheduling — Design Spec

**Date:** 2026-04-10  
**Status:** Draft v3 — under architect review

---

## Problem

Grammar exercise variants (contrast_pair, sentence_transformation, constrained_translation, cloze_mcq) are published in the DB but never appear in review sessions. Two independent causes:

1. **Wrong lookup key.** `Session.tsx` loads exercise variants via `getExerciseVariantsByContext(contextIds)`, which queries `exercise_variants.context_id`. Grammar variants are published with `lesson_id` + `grammar_pattern_id` and `context_id = NULL` — so the query returns nothing.

2. **Stage gating.** Even if the lookup worked, `sessionQueue.ts` only serves published variants at `productive`/`maintenance` stage. A learner working through early lessons never reaches that stage for most items.

**Root cause:** Grammar patterns are lesson-level concepts, not properties of a single vocabulary item. Scheduling them through `learner_skill_state` (keyed on `learning_item_id`) is architecturally wrong.

---

## Design Decision

Grammar patterns are **first-class FSRS-scheduled items**, tracked in a dedicated table `learner_grammar_state` (one row per learner × pattern). They run on a parallel scheduling track alongside vocabulary and occupy a **15% slice** of each session, scaled to the user's chosen session size.

---

## Session Composition

```ts
const GRAMMAR_SESSION_RATIO = 0.15  // named constant — tune without code search

const grammarSlots = (sessionMode === 'backlog_clear' || sessionMode === 'quick')
  ? 0
  : Math.max(1, Math.round(effectiveSessionSize * GRAMMAR_SESSION_RATIO))
const vocabSlots = effectiveSessionSize - grammarSlots
```

At session size 15 → 2 grammar + 13 vocab.  
At session size 20 → 3 grammar + 17 vocab.  
At session size 10 → 2 grammar + 8 vocab.

**`backlog_clear` and `quick` modes:** grammar slots = 0. `quick` (5 items) would be forced to 20% grammar by the `Math.max(1, ...)` floor — too dominant for a speed-focused mode. Both modes are vocabulary-only.

---

## Queue Ordering

1. **Due patterns** — `due_at <= now`, sorted most-overdue first
2. **New patterns** — `stage = 'new'`, sorted by `introduced_by_lesson_order` ascending

No explicit lesson gating. Lesson order itself is the gate.

**Interleaving with vocabulary:** Grammar items are distributed evenly through the session, not appended as a block. After building vocab and grammar candidate lists independently, they are merged by inserting grammar items at evenly spaced intervals: one grammar item for every `floor(vocabSlots / (grammarSlots + 1))` vocab items. The result is passed to `orderQueue`.

---

## Schema

### New table: `learner_grammar_state`

```sql
CREATE TABLE IF NOT EXISTS indonesian.learner_grammar_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grammar_pattern_id    UUID NOT NULL REFERENCES indonesian.grammar_patterns(id) ON DELETE CASCADE,

  -- FSRS scheduling
  stage                 TEXT NOT NULL DEFAULT 'new'
                        CHECK (stage IN ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  stability             NUMERIC,
  difficulty            NUMERIC,
  due_at                TIMESTAMPTZ,
  last_reviewed_at      TIMESTAMPTZ,
  review_count          INT NOT NULL DEFAULT 0,
  lapse_count           INT NOT NULL DEFAULT 0,
  consecutive_failures  INT NOT NULL DEFAULT 0,   -- for demotion logic, mirrors learner_skill_state

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, grammar_pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_grammar_state_due
  ON indonesian.learner_grammar_state(user_id, due_at);

ALTER TABLE indonesian.learner_grammar_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_grammar_state_select" ON indonesian.learner_grammar_state
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "learner_grammar_state_insert" ON indonesian.learner_grammar_state
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_grammar_state_update" ON indonesian.learner_grammar_state
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- No DELETE policy — learners cannot delete grammar state. Admin bypasses via service_role.

GRANT SELECT, INSERT, UPDATE ON indonesian.learner_grammar_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learner_grammar_state TO service_role;
```

**`updated_at`:** No DB trigger. `upsertGrammarState` always passes `updated_at: new Date().toISOString()`, matching `learnerStateService.upsertSkillState`.

### Migration to `review_events`

Grammar reviews must be logged to `review_events` to keep goal accuracy calculations correct (the weekly goal system counts overdue skills from `learner_skill_state` and lapses from `review_events`). The `learning_item_id NOT NULL` constraint is relaxed and `grammar_pattern_id` is added:

```sql
-- Relax learning_item_id — grammar reviews have no learning_item_id
ALTER TABLE indonesian.review_events ALTER COLUMN learning_item_id DROP NOT NULL;

-- Add grammar_pattern_id
ALTER TABLE indonesian.review_events ADD COLUMN IF NOT EXISTS
  grammar_pattern_id UUID REFERENCES indonesian.grammar_patterns(id) ON DELETE SET NULL;

-- Constraint: exactly one of learning_item_id or grammar_pattern_id must be non-null
ALTER TABLE indonesian.review_events ADD CONSTRAINT review_events_source_check
  CHECK (
    (learning_item_id IS NOT NULL AND grammar_pattern_id IS NULL) OR
    (learning_item_id IS NULL AND grammar_pattern_id IS NOT NULL)
  );
```

---

## Type Changes — `src/types/learning.ts`

```ts
// New type
export interface LearnerGrammarState {
  id: string
  user_id: string
  grammar_pattern_id: string
  stage: 'new' | 'anchoring' | 'retrieving' | 'productive' | 'maintenance'
  stability: number | null
  difficulty: number | null
  due_at: string | null
  last_reviewed_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failures: number
  updated_at: string
}

export interface GrammarPatternWithLesson {
  id: string
  slug: string
  name: string
  introduced_by_lesson_order: number  // resolved from lessons.order_index join
}

// ExerciseVariant — nullable fields to match DB reality
export interface ExerciseVariant {
  // ... existing fields ...
  context_id: string | null          // was: string — grammar variants have NULL
  learning_item_id: string | null    // was: string — grammar variants have NULL
  grammar_pattern_id: string | null  // already optional in practice
}

// SessionQueueItem — discriminated union on source
export type SessionQueueItem =
  | {
      source: 'vocab'
      exerciseItem: ExerciseItem
      learnerItemState: LearnerItemState | null
      learnerSkillState: LearnerSkillState | null
    }
  | {
      source: 'grammar'
      exerciseItem: ExerciseItem
      grammarState: LearnerGrammarState | null
      grammarPatternId: string
    }

// ExerciseItem — learningItem nullable for grammar exercises
export interface ExerciseItem {
  learningItem: LearningItem | null   // null for grammar exercises
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  skillType: string
  exerciseType: string
  // ... existing optional data fields ...
}
```

All sites that access `exerciseItem.learningItem` must guard for null. TypeScript will surface every call site at compile time when `learningItem` becomes nullable.

---

## Grammar Exercise Builder

`makePublishedExercise` (sessionQueue.ts:511) requires an `ItemContext` parameter. Grammar exercises have no vocabulary context. A new function replaces it for the grammar path:

```ts
function makeGrammarExercise(variant: ExerciseVariant): ExerciseItem {
  // learningItem: null
  // meanings: []
  // contexts: []
  // answerVariants: []
  // skillType and exerciseType from variant
  // payload structs built from variant.payload_json — same switch block as makePublishedExercise
}
```

---

## Stage Transitions for Grammar — `src/lib/stages.ts`

New functions `checkGrammarPromotion` and `checkGrammarDemotion` operate on `LearnerGrammarState`:

```ts
function checkGrammarPromotion(state: LearnerGrammarState): LearnerStage | null
function checkGrammarDemotion(state: LearnerGrammarState): LearnerStage | null
```

**Promotion thresholds** (single-state equivalents of dual-skill vocab thresholds):

| Transition | Condition |
|---|---|
| new → anchoring | First review (any result) |
| anchoring → retrieving | `stability >= 1.8 && review_count >= 3` |
| retrieving → productive | `stability >= 4.5 && review_count >= 5` |
| productive → maintenance | `stability >= 21.0 && lapse_count === 0` |

**Demotion** — mirrors vocab `checkDemotion` exactly: trigger on `consecutive_failures >= 2`, demote one stage, floor at anchoring. This is why `consecutive_failures` is on `learner_grammar_state`.

```ts
function checkGrammarDemotion(state: LearnerGrammarState): LearnerStage | null {
  if (state.consecutive_failures < 2) return null
  const idx = STAGE_ORDER.indexOf(state.stage)
  if (idx <= 1) return null  // floor at anchoring
  return STAGE_ORDER[idx - 1]
}
```

---

## New Service: `grammarStateService.ts`

```ts
// src/services/grammarStateService.ts

getGrammarStates(userId: string): Promise<LearnerGrammarState[]>
getAllGrammarPatterns(): Promise<GrammarPatternWithLesson[]>  // joins grammar_patterns + lessons on introduced_by_lesson_id

// Chunked — 50 IDs per request, matching existing getExerciseVariantsByContext
getGrammarVariants(patternIds: string[]): Promise<ExerciseVariant[]>

// Idempotent — ON CONFLICT (user_id, grammar_pattern_id) DO NOTHING
// Seeds ALL patterns, not just lessons completed.
// Intentional: queue builder orders new patterns by lesson index, so unseeded
// future-lesson patterns are held back naturally. Single-user homelab — overhead is negligible.
seedGrammarStates(userId: string, patternIds: string[]): Promise<void>

// Always sets updated_at explicitly
upsertGrammarState(state: Omit<LearnerGrammarState, 'id' | 'updated_at'>): Promise<LearnerGrammarState>
```

**On stale state after seed:** `grammarStatesArray` is fetched before `seedGrammarStates` runs. For new patterns (first session after publishing a new lesson), the fetched array won't contain the just-seeded rows. This is intentional and handled: `buildGrammarCandidates` treats missing state as `stage = 'new'`, which is correct.

---

## Data Loading — `Session.tsx`

```ts
const [
  itemStatesArray,
  skillStatesArray,
  lessonsBasic,
  grammarStatesArray,
  grammarPatternsAll,
] = await Promise.all([
  learnerStateService.getItemStates(user.id),
  learnerStateService.getSkillStatesBatch(user.id),
  lessonService.getLessonsBasic(),
  grammarStateService.getGrammarStates(user.id),
  grammarStateService.getAllGrammarPatterns(),
])

// Seed missing rows (idempotent — safe on every session start)
await grammarStateService.seedGrammarStates(user.id, grammarPatternsAll.map(p => p.id))

// Load grammar variants (chunked)
const grammarVariantsByPattern: Record<string, ExerciseVariant[]> = {}
const grammarVariants = await grammarStateService.getGrammarVariants(grammarPatternsAll.map(p => p.id))
for (const v of grammarVariants) {
  if (v.grammar_pattern_id) {
    if (!grammarVariantsByPattern[v.grammar_pattern_id]) grammarVariantsByPattern[v.grammar_pattern_id] = []
    grammarVariantsByPattern[v.grammar_pattern_id].push(v)
  }
}

const grammarStates: Record<string, LearnerGrammarState> = {}
for (const s of grammarStatesArray) grammarStates[s.grammar_pattern_id] = s
```

Pass `grammarPatternsAll`, `grammarStates`, `grammarVariantsByPattern` into `SessionBuildInput`.

---

## Session Queue Changes — `sessionQueue.ts`

### New fields on `SessionBuildInput`

```ts
grammarPatterns?: GrammarPatternWithLesson[]
grammarStates?: Record<string, LearnerGrammarState>
grammarVariantsByPattern?: Record<string, ExerciseVariant[]>
```

### Queue assembly

```ts
const grammarSlots = (sessionMode === 'backlog_clear' || sessionMode === 'quick')
  ? 0
  : Math.max(1, Math.round(effectiveSessionSize * GRAMMAR_SESSION_RATIO))
const vocabSlots = effectiveSessionSize - grammarSlots

const vocabCandidates = [...dueItems, ...gatedNew].slice(0, vocabSlots)
const grammarCandidates = buildGrammarCandidates(
  input.grammarPatterns ?? [],
  input.grammarStates ?? {},
  input.grammarVariantsByPattern ?? {},
  grammarSlots,
  now,
)

const vocabQueue = vocabCandidates.map(c => buildVocabQueueItem(c, ...))
const grammarQueue = grammarCandidates.map(g => buildGrammarQueueItem(g))

return orderQueue(interleaveQueues(vocabQueue, grammarQueue))
```

`interleaveQueues` inserts grammar items at evenly spaced positions so they distribute through the session rather than clustering at the end.

---

## Review Handler — `reviewHandler.ts`

### `processGrammarReview` — new parallel function

```ts
export interface GrammarReviewInput {
  userId: string
  sessionId: string
  grammarPatternId: string
  currentGrammarState: LearnerGrammarState | null
  wasCorrect: boolean
  isFuzzy: boolean
  hintUsed: boolean
  latencyMs: number | null
}

export interface GrammarReviewResult {
  updatedGrammarState: LearnerGrammarState
  stageChanged: boolean
  previousStage: string | null
}

export async function processGrammarReview(input: GrammarReviewInput): Promise<GrammarReviewResult>
```

Reuses `inferRating`, `computeNextState`, `checkGrammarPromotion`, `checkGrammarDemotion`. Does **not** call `upsertItemState` or `upsertSkillState`. Logs to `review_events` with `grammar_pattern_id` (not `learning_item_id`).

**Known limitation:** Wrong-answer requeue passes stale `grammarState` to the retry (same bug exists in vocabulary path). Accepted as known limitation in both paths.

---

## `ExerciseShell` Changes

### React keys

All exercise components use `currentItem.exerciseItem.learningItem.id` as key. This crashes for grammar (`learningItem = null`). Compute the key once before the switch:

```ts
const exerciseKey = exerciseItem.learningItem?.id
  ?? (currentItem.source === 'grammar' ? currentItem.grammarPatternId : 'unknown')
```

Use `exerciseKey` in place of `currentItem.exerciseItem.learningItem.id` throughout the switch.

### Answer dispatch

```ts
const isGrammar = currentItem.source === 'grammar'

// In handleAnswerFromExercise:
if (isGrammar) {
  const result = await processGrammarReview({
    userId: user.id,
    sessionId,
    grammarPatternId: currentItem.grammarPatternId,
    currentGrammarState: currentItem.grammarState,
    wasCorrect, isFuzzy, hintUsed: false, latencyMs,
  })
  onAnswer(result, wasCorrect)
} else {
  const result = await processReview({ ..., currentItemState: currentItem.learnerItemState, currentSkillState: currentItem.learnerSkillState, ... })
  onAnswer(result, wasCorrect)
}
```

### `onAnswer` callback type

`ExerciseShellProps.onAnswer` currently expects `(result: ReviewResult, wasCorrect: boolean)`. `GrammarReviewResult` is a different type. Either:
- Use a union: `(result: ReviewResult | GrammarReviewResult, wasCorrect: boolean) => void`
- Or: the callback only uses `wasCorrect` — `Session.tsx:handleExerciseAnswer` ignores `result` today, so the type can be loosened to `(result: unknown, wasCorrect: boolean) => void`

The latter is simpler and honest about how the result is used.

### Content flag

```ts
useEffect(() => {
  if (!profile?.isAdmin || !authUser) return
  if (!exerciseItem.learningItem) return  // grammar exercises: no flag
  contentFlagService.getFlagForItem(authUser.id, exerciseItem.learningItem.id, exerciseItem.exerciseType)
    .then(flag => setCurrentFlag(flag))
    .catch(() => {})
}, [profile?.isAdmin, authUser, exerciseItem.learningItem?.id, exerciseItem.exerciseType])
```

`FlagButton` is hidden when `exerciseItem.learningItem` is null. Grammar content issues are handled via admin tools.

### Wrong-answer screen for grammar

The current wrong-answer screen (ExerciseShell:247-287) shows a two-column "Gevraagd / Correct antwoord" layout using `learningItem.base_text` — vocabulary-specific and inapplicable to grammar.

`explanationText` is **not shown in the UI** — it exists in the payload as a content authoring field only.

The grammar wrong-answer screen shows:

1. "Fout" banner (same as vocabulary)
2. "Correct antwoord" card showing the correct answer:
   - contrast_pair / cloze_mcq: the option text matching `correctOptionId`
   - sentence_transformation: `acceptableAnswers[0]`
   - constrained_translation: `acceptableAnswers[0]`
3. "Doorgaan" button

Implementation: `if (isGrammar) { return <GrammarWrongAnswerScreen ... /> }` before the existing vocabulary wrong-answer block.

---

## Supabase Requirements

### Schema changes
- New table `indonesian.learner_grammar_state`
- `review_events.learning_item_id` → nullable; add `grammar_pattern_id` column; add source check constraint
- Add both to `scripts/migration.sql`; run via `make migrate`

### homelab-configs changes
- None required

### Health check additions
- `check-supabase-deep.ts`: verify `learner_grammar_state` table + grants; verify `review_events.grammar_pattern_id` column exists

---

## Out of Scope

- Grammar progress UI
- Per-pattern difficulty weighting (variants chosen uniformly at random)
- `learner_stage_events` for grammar (no `learning_item_id`; deferred)
- Pattern dependency ordering beyond lesson index
