# Fold spec — `lib/lessons/`

Status: DRAFT v1
Branch: TBD
Spec author: forge session 2026-05-08
Architect-review-loop: not yet started

---

## 1. Goal + scope

Establish `src/lib/lessons/` as a deep module per `docs/target-architecture.md` §lib/lessons + §Module conventions.

The module owns three concerns:
- **Experience** — turn published `lesson_page_blocks` into a typed reader experience (the page-block → reader-block classifier).
- **Activation** — the user-driven gate that decides whether a lesson's capabilities are eligible for new-capability introduction.
- **Recommendation** — surface the next lesson the user should activate (trivial, by `order_index`).

### In scope
- New module shape per convention: `index.ts`, `model.ts`, `overview.ts`, `experience.ts`, `activation.ts`, `adapter.ts`, colocated `__tests__/`.
- Public surface: 4 user-facing functions + 1 cross-module plumbing function + 7 types.
- Retirements (dead or duplicated code): `decideLessonOverviewStatus`, `recommendLesson`, `buildLessonOverviewSignals`, `buildLessonOverviewModel`, `LessonOverviewSignal`/`Exposure`/`CapabilityCounts` types, `LessonOverviewStatus` enum, `lessonReadiness.ts` (orphan from retirement #6), `markLessonComplete`, `services/progressService.ts` entirely, `buildLessonPracticeActions` + `LessonPracticeAction` types, `lessonService.getLessonCapabilityPracticeSummary`, `extractLessonGrammarTopics`/`grammarTopicLabels`/`trimTopic`/`stringList`/`categoryTitles`.
- Folding: lessons-domain methods on `lessonService.ts` move into `lib/lessons/adapter.ts`; pure-CRUD methods stay in `services/lessonService.ts`.
- Caller migration: ~12 files update import paths.

### Prerequisites (must land before this fold)

A separate **pipeline cleanup PR** lands before this fold, normalizing pipeline output so the runtime trusts canonical shapes and retires its compensation logic:

| # | Pipeline cleanup item | Effect on this fold |
|---|---|---|
| 1 | Write canonical `lesson_sections.content.grammar_topics: string[]` on every grammar/reference_table section + backfill | Adapter reads the field directly; no runtime extractor |
| 2 | Write `lesson_page_blocks.block_kind` as the canonical 7-value reader-block kind (`lesson_hero`, `reading_section`, `vocab_strip`, `dialogue_card`, `pattern_callout`, `practice_bridge`, `lesson_recap`) | Runtime classifier (`blockKindFromPipeline`) retires; `buildLessonExperience` shrinks to sort + dedupe + shape |
| 3 | Retire `block.payload.audioUrl` / `audio_url` on page-blocks; per-text audio resolves uniformly through `audio_clips` table at runtime | Lesson reader rewires to `useSessionAudio` + `<PlayButton>` from `lib/audio.tsx` |
| 4 | (Coordinated with lib/audio) `fetchSessionAudioMap` + `resolveSessionAudioUrl` accept voice-paired requests so dialogue lines resolve correctly across speaker voices | `LessonPage.audibleTexts: Array<{text, voiceId}>` is voice-paired |

### Out of scope (deferred)
| Item | Why deferred |
|---|---|
| SQL function `get_lessons_overview` slimming (drop 8 unused fields) | Pairs with analytics fold; this fold's adapter just ignores the unused fields. |
| `lib/preview/localPreviewContent.ts` adaptation | Accepts regression — `buildLessonExperience` becomes private. |
| `lesson_progress` table retirement | Becomes write-orphan after this fold; future cleanup. |
| Mastery `not_assessed` label retirement | Mastery/analytics fold concern. |
| `services/lessonService.getAudioUrl` relocation | Stays in services/ as transport (long-form lesson audio bucket). |

---

## 2. Public surface (curated)

```ts
// src/lib/lessons/index.ts

// User-facing — the 4 things callers ask the lessons module about
export function getLessonOverview(userId: string): Promise<LessonOverview>
export function getLessonPage(userId: string, lessonId: string): Promise<LessonPage>
export function nextLesson(userId: string): Promise<string | null>
export function setLessonActivated(
  userId: string, lessonId: string, activated: boolean,
): Promise<void>

// Cross-module plumbing — read by session-builder + mastery
export function listActivatedLessons(userId: string): Promise<Set<string>>

// Types
export type {
  Lesson, LessonSection, LessonPageBlock,
  LessonOverview, LessonOverviewRow,
  LessonExperience, LessonExperienceBlock,
  LessonPage,
}
```

5 functions, 8 types. Function count comfortably under the convention's soft cap of ~10.

---

## 3. File-by-file plan

```
src/lib/lessons/
  index.ts        public barrel — re-exports the 5 functions + 8 types
  model.ts        all public types in one place
  overview.ts     getLessonOverview, nextLesson
  experience.ts   getLessonPage, private buildLessonExperience,
                  private blockKindFromPipeline, private fromPipelineBlock
  activation.ts   setLessonActivated, listActivatedLessons
                  (no `client` injection — vi.mock pattern)
  adapter.ts      private I/O primitives: fetchLessonsOverviewRows,
                  fetchLesson, fetchLessonPageBlocks,
                  fetchActivationRow, fetchActivatedLessonIds,
                  fetchOrderedLessonIds
  __tests__/
    overview.test.ts
    experience.test.ts
    activation.test.ts
    adapter.test.ts
```

`buildLessonExperience` is **internal** — the preview module's regression is accepted.

---

## 4. I/O contract per public symbol

### 4.1 `getLessonOverview(userId): Promise<LessonOverview>`

**Inputs**
- `userId: string` — caller's auth uid.
- Invariant: must be a UUID; assumed authenticated (RLS gates the underlying RPC).

**Logic** — 1 round trip + 2 pure transforms
1. `adapter.fetchLessonsOverviewRows(userId)` wraps the existing `get_lessons_overview` RPC.
2. Pure: shape each row into `LessonOverviewRow` (snake → camel; drop fields the overview surface doesn't expose).
3. Pure: compute `recommendedLessonId` inline as `rows.find(r => !r.has_started_lesson)?.lesson_id ?? null`.

**Outputs**

```ts
LessonOverview {
  lessons: LessonOverviewRow[]            // sorted by orderIndex ascending
  recommendedLessonId: string | null      // earliest non-activated lesson id
}

LessonOverviewRow {
  lessonId:    string
  orderIndex:  number
  title:       string
  isActivated: boolean
}
```

**Invariants**
- `lessons` sorted by `orderIndex` ascending.
- `lessons.length === count of published lessons` (filtered server-side by RPC).
- `recommendedLessonId` is `null` OR is one of `lessons[i].lessonId`.
- `recommendedLessonId === null` iff every lesson is activated OR no lessons exist.

**Test acceptance criteria**
- returns `{ lessons: [], recommendedLessonId: null }` when no published lessons exist
- sorts lessons by `orderIndex` ascending
- `isActivated` reflects activation row presence
- `recommendedLessonId` is the earliest non-activated lesson by `orderIndex`
- `recommendedLessonId` is `null` when all lessons are activated

---

### 4.2 `getLessonPage(userId, lessonId): Promise<LessonPage>`

**Inputs**
- `userId: string`, `lessonId: string`.

**Logic** — 3 parallel adapter calls + 1 pure builder
1. `Promise.all([fetchLesson(lessonId), fetchLessonPageBlocks(sourceRefFor(lesson)), fetchActivationRow(userId, lessonId)])`. Note: `sourceRefFor(lesson) = 'lesson-${order_index}'` is computed after the lesson fetch returns; structurally these are 2 sequential calls (lesson, then page-blocks) plus 1 parallel (activation).
2. Pure: `buildLessonExperience({ lesson, pageBlocks })`.

**Outputs**

```ts
LessonPage {
  experience:      LessonExperience
  isActivated:     boolean
  audibleTexts:    Array<{ text: string; voiceId: string | null }>   // collected from blocks; voice-paired for dialogue lines (per prerequisite #4)
  audioPath:       string | null               // lessons.audio_path — long-form lesson audio (e.g., grammar narration)
  durationSeconds: number | null
  primaryVoice:    string | null               // primary TTS voice id
  dialogueVoices:  Record<string,string>|null  // per-speaker voice mapping for dialogues
}

LessonExperience {
  lessonId:    string
  sourceRef:   string
  title:       string
  level:       string
  blocks:      LessonExperienceBlock[]   // sorted by displayOrder
  sourceRefs:  string[]                   // dedup'd union across blocks
}

LessonExperienceBlock {
  id:                string
  kind:              LessonExperienceBlockKind   // discriminator
  title:             string
  sourceRef:         string
  sourceRefs:        string[]
  contentUnitSlugs:  string[]
  displayOrder:      number
  payload:           Record<string, unknown>
  capabilityKeyRefs: string[]
}

type LessonExperienceBlockKind =
  | 'lesson_hero' | 'reading_section' | 'vocab_strip'
  | 'dialogue_card' | 'pattern_callout' | 'practice_bridge' | 'lesson_recap'
```

**Invariants**
- `experience.blocks` sorted by `displayOrder` ascending.
- Every `block.kind` is one of the 7 enumerated values.
- `isActivated === true` iff a row exists in `learner_lesson_activation` for `(userId, lessonId)`.

**Test acceptance criteria**
- returns experience with all page-blocks shaped into `LessonExperienceBlock`
- sorts blocks by `displayOrder` ascending
- preserves `block_kind` from the validated input (one of the 7 reader kinds)
- `isActivated` reflects activation row presence
- `audibleTexts` includes one entry per audible Indonesian text in the experience (vocab items, dialogue lines, expressions)
- audible texts from dialogue lines have `voiceId` resolved via `dialogueVoices[speaker]` (or `primaryVoice` fallback)
- audible texts from non-dialogue blocks have `voiceId === primaryVoice`
- `audioPath` is the raw `lessons.audio_path` (page resolves URL via `lessonService.getAudioUrl`)
- adapter rejects rows with `block_kind` not in the 7-value enum (validation per §5.3)

---

### 4.3 `nextLesson(userId): Promise<string | null>`

**Inputs**
- `userId: string`.

**Logic** — 2 parallel light adapter calls
1. `Promise.all([fetchOrderedLessonIds(), fetchActivatedLessonIds(userId)])`.
2. Pure: `lessons.find(l => !activated.has(l.id))?.id ?? null`.

**Outputs**
- `string | null` — the lesson id of the earliest non-activated lesson by `order_index`.

**Invariants**
- Returns `null` if no published lessons exist.
- Returns `null` if every lesson is activated.
- Otherwise returns the lowest-order_index lesson's id where `id ∉ activatedSet`.

**Test acceptance criteria**
- returns the first lesson when none are activated
- returns the earliest non-activated lesson when some are activated
- returns `null` when all are activated
- returns `null` when no lessons exist

---

### 4.4 `setLessonActivated(userId, lessonId, activated): Promise<void>`

**Inputs**
- `userId: string`, `lessonId: string`, `activated: boolean`.

**Logic**
- Calls `set_lesson_activation` RPC with `(p_user_id, p_lesson_id, p_activated)`.
- The RPC is `SECURITY DEFINER` (table is SELECT-only for `authenticated`).
- The RPC is idempotent: `INSERT … ON CONFLICT DO NOTHING` for `activated=true`, `DELETE WHERE …` for `activated=false`.

**Outputs**
- `void` on success.
- Throws on RPC error.

**Postcondition (the contract that makes activation deep)**
- After `setLessonActivated(uid, lid, true)` resolves: every capability `c` where `c.lesson_id = lid AND c.publication_status = 'published' AND c.readiness_status = 'ready'` is eligible for the next call to `lib/session-builder`'s eligibility filter, and counts as `introduced` (not `not_assessed`) in `lib/analytics/mastery/`'s rule 2.
- After `setLessonActivated(uid, lid, false)` resolves: those capabilities are no longer eligible for new-capability introduction. (Previously-introduced capabilities with FSRS state remain — deactivation does not delete state rows.)
- Verified by:
  - `lib/session/capabilitySessionLoader.ts` reads `listActivatedLessons` for the eligibility filter
  - `lib/mastery/masteryModel.ts:447` reads `learner_lesson_activation` for rule 2 (post-fold this becomes a call to `listActivatedLessons`)

**Test acceptance criteria**
- calls `set_lesson_activation` RPC with `p_activated=true` on activate
- calls same RPC with `p_activated=false` on deactivate
- throws on RPC error
- public function signature has 3 args (no `client` injection parameter)

---

### 4.5 `listActivatedLessons(userId): Promise<Set<string>>`

**Inputs**
- `userId: string`.

**Logic**
- Single `SELECT lesson_id FROM learner_lesson_activation WHERE user_id = $1`.
- Materialise as `Set<string>` for O(1) membership.

**Outputs**
- `Set<string>` of activated lesson ids.

**Invariants**
- Empty set if user has no activations or is unknown.
- Contains exactly the `lesson_id` values present in `learner_lesson_activation` for `userId`.

**Test acceptance criteria**
- returns empty `Set` when user has no activations
- returns `Set` of correct lesson ids when activations exist
- throws on query error
- public function signature has 1 arg (no `client` injection parameter)

---

## 5. Pipeline contract (inbound shapes)

The lessons module reads from four DB tables populated by the content pipeline. The shapes below define what the adapter expects to find on read. The adapter validates each row against this contract and throws on violation; pure logic only sees clean shapes.

**This is the testability boundary.** Tests of pure functions (`buildLessonExperience`, `formatGrammarTopicTag`, `blockKindFromPipeline`) construct synthetic instances of these types directly — no Supabase mocking needed. Only adapter tests mock Supabase.

### 5.1 `lessons` table

```ts
type Lesson = {
  id:                 string         // uuid
  order_index:        number         // monotonic positive integer, immutable for published lessons
  title:              string         // non-empty
  level:              string         // CEFR-ish marker (e.g. 'A1')
  description:        string | null
  audio_path:         string | null  // path within indonesian-lessons bucket
  duration_seconds:   number | null  // matches audio file when audio_path != null
  primary_voice:      string | null  // TTS voice id when audio is generated
  is_published:       boolean        // filter at SQL level — runtime only sees true
  publication_status: 'published'    // filter at SQL level
  created_at:         string         // ISO timestamp
}
```

**Field consumption (TBD until §9 verification greps run):** `id`, `order_index`, `title`, `level` are required. `description`, `audio_path`, `duration_seconds`, `primary_voice` are likely consumed by the lesson reader for audio playback — confirm. Other columns (`module_id`, `transcript_dutch/indonesian/english`, `dialogue_voices`) may be dead — drop from `Lesson` if unconsumed.

### 5.2 `lesson_sections` table

```ts
type LessonSection = {
  id:          string
  lesson_id:   string
  order_index: number
  title:       string
  content:     LessonSectionContent      // discriminated by .type
}

type LessonSectionContent =
  | { type: 'grammar';         grammar_topics: string[]; /* + grammar fields */ }
  | { type: 'reference_table'; grammar_topics: string[]; /* + table fields */ }
  | { type: 'text';            paragraphs: string[]; /* + text fields */ }
  | { type: 'dialogue';        /* dialogue fields */ }
  | { type: 'vocabulary';      items: VocabItem[] }
  | { type: 'pronunciation';   /* fields */ }
  | { type: 'culture';         /* fields */ }
  // ... additional types as the pipeline grows
```

**Contract:** for `type ∈ {'grammar', 'reference_table'}`, `grammar_topics` is a non-empty `string[]` of display-ready strings (no `"grammar:"` prefix). Pre-pipeline-cleanup data violates this; runtime degrades to null tag (UX regression accepted per §9).

### 5.3 `lesson_page_blocks` table

```ts
type LessonPageBlock = {
  block_key:           string
  source_ref:          string                                                  // 'lesson-${order_index}' for top-level; sub-blocks may suffix
  source_refs:         string[]
  block_kind:          'lesson_hero' | 'reading_section' | 'vocab_strip'
                     | 'dialogue_card' | 'pattern_callout'
                     | 'practice_bridge' | 'lesson_recap'                      // canonical 7-value reader kind, written by pipeline (prerequisite #2)
  display_order:       number
  payload_json:        LessonPageBlockPayload
  content_unit_slugs:  string[]
  capability_key_refs: string[]
}

type LessonPageBlockPayload =
  | { type: 'grammar';         grammar_topics: string[]; title?: string; body?: string }
  | { type: 'reference_table'; grammar_topics: string[]; title?: string; rows?: unknown[] }
  | { type: 'dialogue';        /* dialogue fields */ }
  | { type: 'vocabulary';      items: VocabItem[] }
  | { type: 'numbers';         items: NumberItem[] }
  | { type: 'expressions';     items: ExpressionItem[] }
  | { type?: never;            title?: string; body?: string; paragraphs?: string[] }   // plain text fall-through
```

**Grammar subtopics:** Grammar / reference_table page-blocks carry their `grammar_topics: string[]` directly in the payload (denormalized from the source `lesson_sections.content` row). The lesson reader renders these subtopics inside the section. The overview page does NOT consume grammar topics — overview cards are activation + title only.

### 5.4 `learner_lesson_activation` table

```ts
type LearnerLessonActivation = {
  user_id:   string  // uuid
  lesson_id: string  // uuid
  // row presence = activated; deletion = deactivated
}
```

Writes go through the `set_lesson_activation(p_user_id, p_lesson_id, p_activated)` RPC (`SECURITY DEFINER`). The underlying table is SELECT-only for `authenticated`. The RPC is idempotent: `INSERT … ON CONFLICT DO NOTHING` for activate, `DELETE WHERE …` for deactivate.

### 5.5 Pipeline invariants

1. **`order_index` is immutable for published lessons.** Changing it breaks `source_ref = 'lesson-${order_index}'` matching everywhere downstream.
2. **Only published lessons reach runtime.** `publication_status = 'published'` AND `is_published = true` filter at SQL function level.
3. **Every `grammar` / `reference_table` section has non-empty `grammar_topics`** after pipeline cleanup PR; pre-cleanup is degraded.
4. **`source_ref` matches `^lesson-\d+(/.*)?$`.**
5. **Every `capability_key_refs` entry resolves to an existing `learning_capabilities` row.** Enforced by `publish-approved-content.ts` quality gates.

### 5.6 Adapter validation

The adapter validates each fetched row against the contract above. Validation failures throw with a descriptive error (e.g. `lesson_page_block ${block_key} missing block_kind`). Patterns:

- Discriminated-union narrowing on `block_kind`, `payload_json.type`, `content.type`
- Required-field assertions
- Format-regex assertions for `source_ref`

Pure functions consume only the validated types and never need to handle malformed input.

---

## 6. Internal (private) surface

Not re-exported by `index.ts`. Module-private; tests reach in via internal paths if needed.

| Symbol | File | Purpose |
|---|---|---|
| `fetchLessonsOverviewRows(userId)` | adapter.ts | wraps `get_lessons_overview` RPC |
| `fetchLesson(lessonId)` | adapter.ts | single lesson + sections |
| `fetchLessonPageBlocks(sourceRef)` | adapter.ts | page blocks by sourceRef |
| `fetchActivationRow(userId, lessonId)` | adapter.ts | single activation row check |
| `fetchActivatedLessonIds(userId)` | adapter.ts | bulk activation read returning `Set<string>` |
| `fetchOrderedLessonIds()` | adapter.ts | `[{ id, order_index }]` ordered by order_index |
| `buildLessonExperience(input)` | experience.ts | pure shape-massage: sort blocks by displayOrder, dedupe sourceRefs, snake → camel. **No classifier** — pipeline writes canonical `block_kind` directly per prerequisite #2. |
| `fromPipelineBlock(block, lesson)` | experience.ts | block transformer (snake → camel, copy fields) |
| `sourceRefFor(lesson)` | experience.ts | `lesson-${order_index}` (single source of truth) |

---

## 7. Caller migration

### Files importing from `services/lessonService` today

| Caller | After fold |
|---|---|
| `pages/Lessons.tsx` | imports `getLessonOverview` from `@/lib/lessons`; renders activation toggle + 2-state CTAs (no 6-state status pill) |
| `pages/Lesson.tsx` | imports `getLessonPage` + `setLessonActivated` from `@/lib/lessons` |
| `pages/Session.tsx` | keeps `lessonService.getLessonPageBlocks` (session-builder concern; folds later) |
| `pages/Dashboard.tsx` | keeps `lessonService.getLessonsBasic` + `getUserLessonProgress` (thin transport stays) |
| `hooks/useProgressData.ts` | keeps thin transport calls; rewires `progressService.*` to `learnerProgressService` direct |
| `lib/preview/localPreviewContent.ts` | **broken** (regression accepted) |

### Files importing from `lib/lessons/*` today

| Caller | After fold |
|---|---|
| `pages/Lessons.tsx` | imports from `@/lib/lessons` (barrel) |
| `pages/Lesson.tsx` | imports from `@/lib/lessons` (barrel) |
| `components/lessons/LessonReader.tsx` | imports types from `@/lib/lessons` |
| `components/lessons/blocks/LessonBlockRenderer.tsx` | imports `LessonExperienceBlock` type from `@/lib/lessons` |
| `services/lessonService.ts` | **circular dep gone**: `LessonGrammarTopic` type retires (no longer needed since the runtime extractor retires) |
| `lib/mastery/masteryModel.ts:447` | replaces direct DB query with `listActivatedLessons(userId)` from `@/lib/lessons` |
| `lib/session/capabilitySessionLoader.ts` | imports `listActivatedLessons` from `@/lib/lessons` (replaces existing path) |
| `stores/authStore.ts:172` | calls `setLessonActivated(uid, lid, true)` instead of direct RPC |

### Lessons.tsx render changes (substantial)

The page rewrites its card render. The 6-state status pill, 3-value `actionLabel`, and `href` derivation all retire. Replacement render uses `isActivated` + `isPrepared` directly to choose between "Open lesson" / "Recommended" / disabled states. ~40 LOC of page changes.

---

## 8. Test migration

### Test files retiring or migrating

| Existing | Action |
|---|---|
| `src/__tests__/lessonOverviewModel.test.ts` | DELETE — subject retires |
| `src/__tests__/lessonOverviewStatus.test.ts` | DELETE — subject retires |
| `src/__tests__/lessonReadiness.test.ts` | DELETE — orphan retires |
| `src/__tests__/lessonActionModel.test.ts` | DELETE — subject retires |
| `src/__tests__/progressService.test.ts` | DELETE — subject retires |
| `src/__tests__/lessonExperience.test.ts` | MIGRATE → `src/lib/lessons/__tests__/experience.test.ts` |
| `src/__tests__/lessonService.test.ts` | SHRINK — remaining methods (getLessonsBasic, getLessonsWithVoice, getUserLessonProgress, getAudioUrl) keep tests; folded methods' tests move to adapter.test.ts |
| `src/__tests__/Lessons.test.tsx` | UPDATE — page render assertions match new shape |
| `src/__tests__/Lesson.test.tsx` | UPDATE — drop `markLessonComplete` assertion; switch to new `getLessonPage` mock |
| `src/lib/lessons/__tests__/activation.test.ts` | REWRITE — drop `client` parameter, use `vi.mock('@/lib/supabase')` per CLAUDE.md convention |

### New test files

| File | Tests |
|---|---|
| `src/lib/lessons/__tests__/overview.test.ts` | `getLessonOverview`, `nextLesson`, `formatGrammarTopicTag` |
| `src/lib/lessons/__tests__/experience.test.ts` (migrated) | `getLessonPage`, `buildLessonExperience`, classifier coverage |
| `src/lib/lessons/__tests__/activation.test.ts` (rewritten) | `setLessonActivated`, `listActivatedLessons` |
| `src/lib/lessons/__tests__/adapter.test.ts` | adapter primitives with `vi.mock('@/lib/supabase')` |

### Test count prediction

Per OpenBrain rule "test-count exact prediction works as a binary diagnostic":
- **Pre-PR:** count `it(/test(` blocks via `bun run test --run` — record before commit 1.
- **Delete:** sum `it()` blocks across the 5 deleted test files.
- **Add:** sum new test conditions specified in §4 acceptance criteria across the new test files.
- **Predict:** `post = pre + added - deleted`. Bake the triple into the PR description.

---

## 9. Risks + open questions

1. **Pipeline cleanup PR is a hard prerequisite.** All four prerequisite items in §1 must land before this fold. If any are missing at deploy time:
   - #1 missing → lesson page grammar sections render without subtopics (UX regression)
   - #2 missing → adapter rejects rows that still carry the legacy 5-value `block_kind`; runtime is unable to render the lesson page (hard fail by design)
   - #3 missing → per-block audio doesn't play in the lesson reader
   - #4 missing → dialogue audio resolves with the wrong voice (or no voice)
   `make migrate-idempotent-check` + smoke test sign off the prerequisite chain before this fold's PR opens.

2. **SQL function `get_lessons_overview` returns 8 unused fields.** Adapter ignores them. Cleanup paired with analytics fold (separate PR).

3. **`lesson_progress` becomes write-orphan.** No more writers after `markLessonComplete` retires. Reads continue (Dashboard, useProgressData display). Future cleanup: retire table + readers + display widgets.

4. **`not_assessed` mastery label is dead weight after this fold.** Mastery should filter unintroduced capabilities at query level using `listActivatedLessons`. Captured for analytics/mastery fold.

5. **Atomic deployment.** Fold renames import paths across ~12 files. Cannot ship partially. PR has to land green or revert.

6. **RLS preservation.** Fold must not modify RLS on `lesson_page_blocks`, `learner_lesson_activation`, `lessons`, or capability tables. `make migrate-idempotent-check` + `check-supabase-deep` are binding gates per the 2026-05-08 RLS-regression lesson.

7. **`source_ref` contract with the pipeline.** Invariant: `source_ref = 'lesson-${order_index}'` for top-level lesson page-blocks. Pipeline writes; runtime queries. If a lesson's `order_index` is ever changed without a paired data migration, runtime breaks. Documented as a contract.

8. **Preview module regression.** `lib/preview/localPreviewContent.ts` breaks because `buildLessonExperience` is now private. **Accepted** (preview was a dev-only inspection surface).

9. **Authstore signup hook migration.** `stores/authStore.ts:172` currently calls the RPC directly to auto-activate lessons 1–3 for new users. Fold updates this to `setLessonActivated` from `@/lib/lessons`. Functionally identical; cleaner module boundary.

---

## 10. Acknowledgements (doc-claim corrections)

`docs/target-architecture.md` §lib/lessons (lines 462–524) had 8 corrections worth recording:

1. **`getLessonOverviewStatus(lessonId, userId)` listed as public** — does not exist in code; was speculative. Drop from public API.
2. **`buildLessonExperience(...)` listed as public** — folded into private after preview-module deferral.
3. **`buildLessonPracticeActions(...)` listed as public** — retires entirely (session-builder concern, not lessons).
4. **`isMeaningfulDialogueAudio` / `isMeaningfulGrammarAudio` listed as public** — orphan from retirement #6, retires.
5. **`actionModel.ts` file in module structure** — retires with practice action surface.
6. **`readiness.ts` file in module structure** — retires (orphan).
7. **`adapter.ts folds lessonService.ts + progressService.ts`** — only PARTIAL folds; pure-CRUD methods stay in `services/lessonService.ts`. `progressService.ts` retires entirely (4 thin façades route directly to `learnerProgressService`; 1 dead `markLessonComplete` deletes).
8. **`Consumed by … session-builder/ — eligibility filter via listActivatedLessons`** — accurate semantically, but `lib/session/capabilitySessionLoader.ts` reads `learner_lesson_activation` directly today via its own adapter; fold updates the import to call `listActivatedLessons`.

These corrections become a `target-architecture.md` amendment paired with this fold's PR.

---

## 11. Migration order (within the fold's PR)

Each commit must build + test green per the source-test-bundling rule (OpenBrain lesson 2026-05-07).

1. **Commit 1 — establish module + types.** Create `src/lib/lessons/{model.ts, index.ts}`. Add new public types. No callers yet.
2. **Commit 2 — fold experience.** Move `buildLessonExperience` + classifier into `experience.ts`. Add `getLessonPage` orchestrator. Migrate `lessonExperience.test.ts` → `experience.test.ts`. Update `pages/Lesson.tsx`, `components/lessons/*` imports.
3. **Commit 3 — fold activation, drop client param.** Move existing activation functions; rewrite `activation.test.ts` to `vi.mock` pattern. Update `authStore.ts`, `masteryModel.ts:447`, `capabilitySessionLoader.ts` imports.
4. **Commit 4 — fold overview + nextLesson, retire status tree.** Add `getLessonOverview`, `nextLesson`. Delete `lessonOverviewModel.ts`, `lessonOverviewStatus.ts`, `lessonReadiness.ts`, `lessonActionModel.ts`. Delete corresponding test files. Add `overview.test.ts`. Update `pages/Lessons.tsx` page render.
5. **Commit 5 — retire progressService.** Delete `services/progressService.ts` + test. Update `useProgressData.ts` to call `learnerProgressService` direct. Update `Lesson.test.tsx` (drop the negative assertion on `markLessonComplete`).
6. **Commit 6 — fold lessonService remainder.** Move 4 lessons-domain methods + 3 helper functions from `lessonService.ts` into `adapter.ts`. Delete `extractLessonGrammarTopics`, `grammarTopicLabels`, `trimTopic`, `stringList`, `categoryTitles` from `lessonService.ts`. Update `lessonService.test.ts`. Add `adapter.test.ts`.
7. **Commit 7 — target-architecture amendment.** Apply the 8 doc-claim corrections from §9.

Total: 7 commits. Estimated diff: ~–2,000 LOC delete / ~+700 LOC add (net −1,300 LOC).

---

## 12. Verification gates

Pre-merge:
- `bun run lint` clean
- `bun run test --run` matches predicted post-PR count
- `bun run build` clean
- `make migrate-idempotent-check` clean (no SQL changes in this PR — should be a no-op)
- `make check-supabase-deep` clean
- Architect-review-loop on this spec → APPROVE
- Architect-review-loop on the executed diff → APPROVE

Post-merge:
- Manual smoke test: log in as test user, open `/lessons` (overview renders), open one lesson (reader renders + activation toggle works), activate lesson, verify session-builder picks up the new capabilities on next session start.
