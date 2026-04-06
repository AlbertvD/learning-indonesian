# Exercise Types & Content Pipeline — Refined Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-04-03
**Status:** Ready for execution
**Depends on:** `2026-03-31-retention-first-v2-implementation.md`, `2026-04-03-text-first-exercise-and-textbook-content-spec (1).md`
**Supersedes:** `2026-04-03-remaining-exercise-types-and-textbook-ai-plan (1).md` (original plan — this version accounts for codebase gaps)

---

## Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OCR / AI provider | Claude API | Reuses existing `make extract-lesson` pattern |
| Content review workflow | TypeScript data files + local Vite review UI | Consistent with existing content pipeline; type-safe |
| Answer normalization | Fuzzy match with Levenshtein | Matches current `TypedRecall` behavior |
| ExerciseShell | Shared wrapper component | 8 exercise types share lifecycle logic; review UI reuses components |
| Skill facet migration | Rename `recall` → `form_recall`, add new facets | Clean naming; small user base makes migration trivial |
| Domain directory | New code in `src/domain/learning/`; existing `src/lib/` stays | Avoids import churn on stable tested code |
| Session engine approach | Layered — `sessionPolicies.ts` on top of existing `sessionEngine.ts` | Independently testable rules; preserves existing behavior |
| In-app review UI | No — replaced by local standalone review tool | Review happens outside app; simpler, no admin auth needed |

---

## Phases

1. **Foundation** — ExerciseShell, skill migration, staging schema, exercise catalog, 4 new components, session policy layer
2. **Content Pipeline** — Textbook intake, AI generation, local review UI, publish script
3. **Integration** — Wire content into sessions, availability registry, feature flags, new learner defaults, speaking contracts, verification

---

## Phase 1: Foundation

No external dependencies. Can start immediately.

---

### Task 1.1: ExerciseShell Refactor

Extract shared exercise lifecycle from `Session.tsx` into a wrapper component.

**ExerciseShell handles:**
- Response latency tracking (start timer on mount, stop on submit)
- Answer submission callback (`onAnswer({ response, isCorrect })`)
- Feedback display (correct/incorrect + explanation via existing `ExerciseFeedback.tsx`)
- Review event recording (FSRS update, skill state, stage check via `reviewHandler.ts`)
- Next-item transition

**Each exercise component handles:**
- Render its prompt
- Collect user input (MCQ click, typed text, etc.)
- Evaluate correctness
- Call `onAnswer()`

**Migration:** Refactor existing `RecognitionMCQ`, `TypedRecall`, `Cloze` to work inside the shell. No behavior change — extraction only.

**Files:**
- Create: `src/components/exercises/ExerciseShell.tsx`
- Modify: `src/components/exercises/RecognitionMCQ.tsx`
- Modify: `src/components/exercises/TypedRecall.tsx`
- Modify: `src/components/exercises/Cloze.tsx`
- Modify: `src/pages/Session.tsx`
- Test: `src/__tests__/exerciseShell.test.tsx`

**Verification:**
- Existing tests still pass
- Session flow unchanged from user perspective
- `bun run build` succeeds

---

### Task 1.2: Skill Facet Migration

Rename `recall` → `form_recall`. Add `meaning_recall` and `spoken_production`.

**Schema change:**
```sql
UPDATE indonesian.learner_skill_state SET skill_type = 'form_recall' WHERE skill_type = 'recall';
-- Update check constraint to allow: recognition, form_recall, meaning_recall, spoken_production
```

**Code changes:**
- Update `SkillType` union in `src/types/learning.ts`
- Update all references in `reviewHandler.ts`, `sessionEngine.ts`, `learnerStateService.ts`
- Update existing tests

**Files:**
- Modify: `scripts/migration.sql`
- Modify: `src/types/learning.ts`
- Modify: `src/lib/reviewHandler.ts`
- Modify: `src/lib/sessionEngine.ts`
- Modify: `src/services/learnerStateService.ts`
- Update: affected tests

**Verification:**
- `bun run test` passes
- Existing session flow works with renamed facet

---

### Task 1.3: Staging Schema & Types

Add all new tables to `migration.sql` and corresponding TypeScript types. No services yet — schema foundation only.

**New tables:**
- `textbook_sources` — textbook-level source metadata
- `textbook_pages` — staged OCR/imported page material; unique on `(textbook_source_id, page_number)`
- `grammar_patterns` — grammar targets with `complexity_score` and `confusion_group`
- `item_context_grammar_patterns` — links live contexts to grammar patterns; at most one `is_primary = true`
- `exercise_type_availability` — master availability registry with `session_enabled`, `authoring_enabled`, `requires_approved_content`
- `generated_exercise_candidates` — staged AI candidates with `review_status` as canonical state
- `exercise_variants` — published exercise payloads the session engine can schedule

**New view:**
- `content_review_queue` — derived from `generated_exercise_candidates`; no independent state

**New type files:**
- Create: `src/types/contentGeneration.ts` — `TextbookSource`, `TextbookPage`, `GrammarPattern`, `GeneratedExerciseCandidate`, `ContentReviewItem`
- Modify: `src/types/learning.ts` — add `ExerciseVariant`, `ExerciseTypeAvailability`, `ItemContextGrammarPattern`

**Files:**
- Modify: `scripts/migration.sql`
- Create: `src/types/contentGeneration.ts`
- Modify: `src/types/learning.ts`
- Test: `src/__tests__/contentGenerationTypes.test.ts`

**Verification:**
- Types compile
- `bun run build` succeeds

---

### Task 1.4: Exercise Catalog

Define all exercise types with metadata.

**Metadata per type:**
- `contentFocus`: `vocabulary` | `grammar` | `mixed` | `production`
- `requiresAudio`: boolean
- `requiresGrammarPattern`: boolean
- `requiresManualApproval`: boolean
- `primarySkillFacet`: canonical skill facet mapping

**Canonical skill facet mapping:**
- `recognition` → `recognition`
- `cued_recall` → `meaning_recall`
- `typed_recall` → `form_recall`
- `cloze` → `form_recall`
- `contrast_pair` → `recognition`
- `sentence_transformation` → `form_recall`
- `constrained_translation` → `meaning_recall`
- `speaking` → `spoken_production`

**Files:**
- Create: `src/domain/learning/exerciseCatalog.ts`
- Test: `src/__tests__/exerciseCatalog.test.ts`

---

### Task 1.5: Cued Recall Exercise

Reverse-direction multiple-choice: meaning cue → select Indonesian form from 4 options.

**Payload:**
- `promptMeaningText`, `cueText` (nullable), `options` (exactly 4), `correctOptionId`, `explanationText` (nullable)

**Evaluation:** Exact option selection against `correctOptionId`.

**Implementation note:** Reuse recognition-style option UI and distractor-generation logic.

**Files:**
- Create: `src/components/exercises/CuedRecallExercise.tsx`
- Modify: `src/types/learning.ts` — cued recall payload types
- Test: `src/__tests__/cuedRecallExercise.test.tsx`

---

### Task 1.6: Contrast Pair Exercise

Early grammar discrimination: choose between 2 confusable forms.

**Payload:**
- `promptText`, `targetMeaning`, `options` (exactly 2), `correctOptionId`, `explanationText`

**Evaluation:** Exact option selection.

**Files:**
- Create: `src/components/exercises/ContrastPairExercise.tsx`
- Modify: `src/types/learning.ts` — contrast pair payload types
- Test: `src/__tests__/contrastPairExercise.test.tsx`

---

### Task 1.7: Sentence Transformation Exercise

Productive sentence manipulation: apply a transformation instruction to a source sentence.

**Payload:**
- `sourceSentence`, `transformationInstruction`, `acceptableAnswers`, `hintText` (nullable), `explanationText`

**Evaluation:** Normalize learner answer, Levenshtein fuzzy match against `acceptableAnswers`.

**Files:**
- Create: `src/components/exercises/SentenceTransformationExercise.tsx`
- Modify: `src/types/learning.ts` — sentence transformation payload types
- Test: `src/__tests__/sentenceTransformationExercise.test.tsx`

---

### Task 1.8: Constrained Translation Exercise

Translation with a required grammar target.

**Payload:**
- `sourceLanguageSentence`, `requiredTargetPattern`, `acceptableAnswers`, `disallowedShortcutForms` (nullable), `explanationText`

**Evaluation:** Normalize learner answer, Levenshtein fuzzy match against `acceptableAnswers`, reject explicit disallowed shortcuts.

**Files:**
- Create: `src/components/exercises/ConstrainedTranslationExercise.tsx`
- Modify: `src/types/learning.ts` — constrained translation payload types
- Test: `src/__tests__/constrainedTranslationExercise.test.tsx`

---

### Task 1.9: Session Policy Layer

Create `sessionPolicies.ts` that applies rules on top of the base queue from `sessionEngine.ts`.

**Policies:**
- **Exercise availability gating** — reads `exercise_type_availability`, skips types where `session_enabled = false`
- **Approved content check** — if `requires_approved_content = true`, verify published `exercise_variants` exist
- **Grammar-aware interleaving** — reads `grammar_patterns.confusion_group`, avoids adjacent confusable items
- **Consecutive type cap** — max 2 of same exercise type in a row when alternatives exist
- **New learner detection** — `account_age_days < 30` AND `stable_item_count < 50`
- **Mid-session overload** — accuracy < 0.6 on first 8 prompts OR 2 consecutive `again` on new content → stop new items
- **Queue trimming** — when queue exceeds `session_interaction_cap`, trim in order: keep due > weak > new

**Architecture:** `sessionEngine.ts` builds the raw queue (unchanged). `sessionPolicies.ts` exports `applyPolicies(queue, context)` that returns a shaped queue. `Session.tsx` calls both.

**Files:**
- Create: `src/lib/sessionPolicies.ts`
- Modify: `src/lib/sessionEngine.ts` — export raw queue builder separately
- Modify: `src/pages/Session.tsx` — apply policies after queue build
- Test: `src/__tests__/sessionPolicies.test.ts`

---

## Phase 2: Content Pipeline

Requires Claude API key at runtime. Tasks 2.1 and 2.2 may be combined if a single script handles both extraction and generation.

---

### Task 2.1: Textbook Intake Script

Reuse the existing `make extract-lesson` pattern. Send page images to Claude API with structured output targeting the staging types.

**Flow:**
- Input: page images from `content/raw/lesson-<N>/`
- Claude API call requesting: vocabulary items, example sentences, grammar patterns
- Output: TypeScript data files in `scripts/data/staging/lesson-<N>/`

**Output structure:**
```
scripts/data/staging/lesson-<N>/
├── pages.ts              — page metadata + raw extracted text
├── grammar-patterns.ts   — extracted grammar patterns
├── candidates.ts         — exercise candidates (all types), reviewStatus: 'pending_review'
└── index.ts              — re-exports
```

**Files:**
- Create: `scripts/extract-textbook-content.ts`
- Modify: `Makefile` — add `make extract-textbook LESSON=<N>`

---

### Task 2.2: AI Candidate Generation

Generate exercise-specific candidates from extracted page content. May be part of Task 2.1 or a separate step.

**Generates candidates for:**
- `contrast_pair` — confusable form pairs + explanation
- `sentence_transformation` — source sentence + instruction + acceptable answers
- `constrained_translation` — source language prompt + target pattern + acceptable answers
- `speaking` — prompt/scenario contract only (stored, not published)

**Each candidate includes:**
- Textbook source + page reference
- Target exercise type
- Grammar pattern reference (when applicable)
- Prompt text, explanation, answer key
- Prompt template version + model name
- `reviewStatus: 'pending_review'`

**Files:**
- Create: `scripts/generate-exercise-candidates.ts` (if separate from 2.1)
- Modify: `Makefile` — add `make generate-candidates LESSON=<N>`

---

### Task 2.3: Local Review UI

Standalone Vite app that reads staging TypeScript files and presents candidates for approval.

**Features:**
- List pending candidates grouped by lesson/page
- Show source page text alongside candidate
- Preview exercise as learner would see it (reuse actual exercise components inside ExerciseShell)
- Approve / reject buttons per candidate
- Optional reviewer notes
- Writes `reviewStatus` back to TS files

**Tech:** Vite + React + Mantine (same stack). Small local Express server for filesystem read/write since browser can't write files directly.

**Files:**
- Create: `tools/review/package.json`
- Create: `tools/review/src/App.tsx`
- Create: `tools/review/server.ts` — local file read/write API
- Create: `tools/review/vite.config.ts`

---

### Task 2.4: Publish Script

Reads approved candidates from staging TS files and upserts into Supabase.

**Per approved candidate:**
1. Resolve canonical `learning_item` (reuse existing word/phrase item, or create sentence-level)
2. Upsert `item_contexts` row linked to learning item
3. Upsert `item_context_grammar_patterns` when grammar applies
4. Insert `exercise_variants` row with live payload
5. Mark candidate `reviewStatus: 'published'` in staging file

**Also seeds:**
- `textbook_sources` row (once per textbook)
- `textbook_pages` rows (once per page)
- `grammar_patterns` rows
- `exercise_type_availability` with launch defaults

**Safety:** Refuses candidates not marked `'approved'`.

**Files:**
- Create: `scripts/publish-approved-content.ts`
- Modify: `Makefile` — add `make publish-content LESSON=<N> SUPABASE_SERVICE_KEY=<key>`

---

## Phase 3: Integration

Wire everything together. Depends on Phase 1 (components + policies) and Phase 2 (published content).

---

### Task 3.1: Wire Published Content Into Session Engine

Extend session data loading to include `exercise_variants` and grammar patterns.

**Changes:**
- For `contrast_pair`, `sentence_transformation`, `constrained_translation`: require a published `exercise_variant`
- For `recognition`, `cued_recall`, `typed_recall`, `cloze`: continue existing live content path
- Load `item_context_grammar_patterns` so policies can use them

**Files:**
- Modify: `src/lib/sessionEngine.ts`
- Modify: `src/services/learningItemService.ts` — add variant + grammar pattern loading
- Test: `src/__tests__/sessionEngineIntegration.test.ts`

---

### Task 3.2: Exercise Availability Registry

Make `exercise_type_availability` a runtime gate.

**Seed data:**

| Type | session_enabled | authoring_enabled | requires_approved_content |
|------|----------------|-------------------|--------------------------|
| recognition | true | true | false |
| cued_recall | true | true | false |
| typed_recall | true | true | false |
| cloze | true | true | false |
| contrast_pair | true | true | true |
| sentence_transformation | true | true | true |
| constrained_translation | true | true | true |
| speaking | false | true | true |

**Files:**
- Create: `src/services/exerciseAvailabilityService.ts`
- Modify: `src/lib/sessionPolicies.ts` — add availability check
- Modify: `scripts/migration.sql` — seed data insert
- Test: `src/__tests__/exerciseAvailability.test.ts`

---

### Task 3.3: Feature Flags

Lightweight environment-based flags via `VITE_FEATURE_*` env vars. Additional gate on top of `exercise_type_availability` — both must pass.

**Flags:**
- `VITE_FEATURE_TEXTBOOK_IMPORT`
- `VITE_FEATURE_AI_GENERATION`
- `VITE_FEATURE_CUED_RECALL`
- `VITE_FEATURE_CONTRAST_PAIR`
- `VITE_FEATURE_SENTENCE_TRANSFORMATION`
- `VITE_FEATURE_CONSTRAINED_TRANSLATION`
- `VITE_FEATURE_SPEAKING`

**Files:**
- Create: `src/lib/featureFlags.ts`
- Modify: `src/lib/sessionPolicies.ts` — check flags
- Modify: `.env.local.example` — document flags

---

### Task 3.4: New Learner Defaults & FSRS Tuning

**New learner detection:**
- `account_age_days < 30` AND `stable_item_count < 50`
- Exit when: both thresholds met, OR `successful_recall_review_count >= 200`

**Session sizing:**
- `target_session_minutes = 15` (clamp 10–20)
- `estimated_beginner_seconds_per_interaction = 18`
- Derive `session_interaction_cap = floor(target * 60 / 18)`

**New-item burden:**
- `due > 40` → 0 new; `due > 20` → 2 new; else → 8 new
- Grammar cap: `min(2, max(1, floor(new_items_target / 4)))`

**FSRS grammar adjustments:**
- Grammar-tagged `good`/`easy` stability growth reduced ~20%
- Confusable grammar growth reduced ~30%
- Early interval cap: 20–30 days for first 30–60 days

**Files:**
- Create: `src/lib/newLearnerDefaults.ts`
- Modify: `src/lib/fsrs.ts` — grammar-aware stability adjustments
- Modify: `src/lib/sessionPolicies.ts` — new learner detection + overload rule
- Test: `src/__tests__/newLearnerDefaults.test.ts`

---

### Task 3.5: Speaking Contracts (Disabled)

Schema, types, and minimal component. Not scheduled.

**Payload:** `promptText`, `targetPatternOrScenario`, `transcript`, `selfRating`, `confidenceScore`

**Component:** Renders prompt + typed transcript fallback + self-assessment. Wired into ExerciseShell but never selected while `session_enabled = false`.

**Files:**
- Create: `src/components/exercises/SpeakingExercise.tsx`
- Modify: `src/types/learning.ts` — speaking payload types
- Test: `src/__tests__/speakingContracts.test.ts`

---

### Task 3.6: Verification

**Run:**
- All targeted test suites from every task
- `bun run test` — full suite
- `bun run build` — production build
- `make check-supabase-deep` — after migration applied

**Document deferred work:**
- Live speaking enablement
- Pronunciation scoring
- Listening dictation
- Open conversation exercises
- Fully automated publishing (no reviewer)
- Grammar-specific scheduling / dedicated grammar state
- Approved-content gate enforcement: `sessionPolicies.ts` step 2 (`filterByApprovedContent`) is currently commented out. Once published `exercise_variants` exist for lessons 1–4, enable it so that `requires_approved_content=true` types (contrast_pair, sentence_transformation, constrained_translation) are only served when a published variant exists for the item's context.

---

## Execution Order

**Phase 1 (sequential):**
1. Task 1.1 — ExerciseShell refactor
2. Task 1.2 — Skill facet migration
3. Task 1.3 — Staging schema & types
4. Task 1.4 — Exercise catalog
5. Task 1.5 — Cued recall
6. Task 1.6 — Contrast pair
7. Task 1.7 — Sentence transformation
8. Task 1.8 — Constrained translation
9. Task 1.9 — Session policy layer

**Phase 2 (sequential):**
10. Task 2.1 — Textbook intake script
11. Task 2.2 — AI candidate generation
12. Task 2.3 — Local review UI
13. Task 2.4 — Publish script

**Phase 3 (sequential, except 3.3 + 3.5 can parallel):**
14. Task 3.1 — Wire published content into session engine
15. Task 3.2 — Exercise availability registry
16. Task 3.3 — Feature flags (can parallel with 3.5)
17. Task 3.4 — New learner defaults & FSRS tuning
18. Task 3.5 — Speaking contracts (can parallel with 3.3)
19. Task 3.6 — Verification

---

## Verification Checklist

After each task:
1. Run targeted tests from that task
2. Run `bun run test` when shared types, scheduler logic, or shell routing changed
3. Run `bun run build` after route, store, or payload-type changes

After each phase:
1. `bun run test` — full suite
2. `bun run build` — production build
3. Manual smoke test of session flow
