# Remaining Exercise Types and Textbook AI Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Indonesian learning app so it is technically ready to support all planned exercise families, while implementing and enabling only the text-based content path first for textbook-driven words, phrases, sentences, and grammar.

**Architecture:** Reuse the unified session engine and `ExerciseShell` as the delivery layer, but add a content-generation pipeline that converts textbook pages into reviewed lesson, grammar, and exercise candidates before anything reaches learners. Keep AI-generated content in staging tables until it is approved, then publish it into a live payload model that can represent all planned exercise families, while feature flags and scheduler rules enable only text-based exercise delivery in the first rollout.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, Mantine, Supabase, Postgres SQL migrations, Vitest, OCR for textbook capture, OpenAI or equivalent LLM for structured content generation

---

## Repository Prerequisite

- This plan is executable only in the learning-app repo or worktree that contains `src/`, `scripts/`, and `package.json`.
- The current `AI Governance` workspace is planning-only; use it to maintain the docs, but perform code changes in the app repo or an app worktree.
- Before starting Step 1, confirm the target app repo or worktree is available and up to date.

---

## Scope Assumptions

- Treat `recognition`, `cued recall`, `typed recall`, and `cloze` as already implemented.
- Treat these as the text-based exercise families to implement and enable in the next cycle:
  - `contrast_pair`
  - `sentence_transformation`
  - `constrained_translation`
- Keep `speaking` contract-ready but disabled in the first rollout.
- Treat grammar as interwoven session content, not as a separate learner-facing mode.
- Defer grammar-specific scheduling and any dedicated `learner_grammar_state` model for now.
- Do not auto-publish AI-generated content directly into learner sessions.
- Require a human review step for every AI-generated grammar explanation, acceptable answer set, and exercise prompt.
- Keep live speaking, pronunciation scoring, listening-specific exercises, and open-ended conversation grading out of scope until a later phase.

## Current Outcome This Plan Should Produce

At the end of this plan, the app should be able to:

- ingest textbook pages or OCR output
- generate candidate lesson words, phrases, sentences, grammar patterns, and text-based exercise prompts with AI
- review and approve those candidates before publication
- schedule the text-based remaining exercise types through the existing session engine
- support grammar practice from textbook material without forcing all authoring to be manual
- weave grammar prompts into normal mixed sessions without introducing a separate grammar scheduler
- remain technically ready for later non-text exercise enablement without needing a schema redesign

---

## New Learner Session Engine Defaults

Use this section as the implementation target for novice learners during the first learning phase.

Treat a learner as `new` when:
- `account_age_days < 30`
- `stable_item_count < 50`

Exit `new` learner mode when either:
- `account_age_days >= 30` and `stable_item_count >= 50`
- `successful_recall_review_count >= 200`

Behavior goals for new learners:
- prefer short, repeatable study sessions over long queues
- keep early spacing conservative
- bias toward productive retrieval without overwhelming the learner
- interleave confusable items instead of blocking similar forms together
- include audio support when available, even when the answer mode is text-first

Default session behavior:
- set `target_session_minutes = 15`, with UI controls allowed to clamp between `10` and `20`
- set `estimated_beginner_seconds_per_interaction = 18`
- derive `session_interaction_cap = floor(target_session_minutes * 60 / estimated_beginner_seconds_per_interaction)`
- set daily `new_items_target` with exact rules:
  - if `due_review_count > 40`: `0`
  - else if `due_review_count > 20`: `2`
  - else: `8`
- if `new_items_target = 0`, set `grammar_targeted_new_prompt_cap = 0`
- else if grammar-heavy content is introduced, set `grammar_targeted_new_prompt_cap = min(2, max(1, floor(new_items_target / 4)))` when approved grammar prompts are available
- use text-first exercises with audio enrichment when available
- cap consecutive prompts of the same exercise type at `2` when alternatives exist
- do not place confusable items adjacent when alternatives exist
- prefer easier support after a lapse, then return to productive prompts
- when candidate work exceeds `session_interaction_cap`, trim the queue in this priority order:
  - keep due review first
  - keep weak items second
  - keep new items last
- within a trimmed queue, preserve interleaving and exercise variety when possible

Beginner queue composition:
- start with a few easier wins before the hardest production prompts
- mix due review, weak items, and the computed `new_items_target`
- weave grammar prompts into the middle of the queue, not only at the beginning or end
- if scored accuracy on the first `8` prompts is below `0.6`, or if there are `2` consecutive `again` outcomes on new content, set remaining session `new_items_target = 0` and finish with due review only

### FSRS Field Mapping For Beginner L2 Learners

These are implementation-facing defaults derived from the literature summary above. Treat them as relative launch guidance, not permanent magic numbers.

`Item.difficulty`
- vocabulary items: initialize around `5.0` to `5.5`
- grammar-tagged exemplars: initialize around `5.7` to `6.3`
- confusable grammar-tagged exemplars: initialize around `6.3` to `6.8`

`Item.stability` / initial stability (`S0`)
- vocabulary items: initialize around `1.5` to `2.2` days
- grammar-tagged exemplars: initialize around `1.0` to `1.5` days
- difficult or confusable grammar-tagged exemplars: initialize around `0.8` to `1.2` days

`R_target` / retrievability target
- use a target near `0.8` so reviews happen before steep decay

Review outcome behavior
- keep interval growth conservative during the first month
- reduce grammar-tagged `good` and `easy` stability growth by roughly `15%` to `25%` compared with plain vocabulary
- reduce confusable grammar-tagged `good` and `easy` growth by roughly `30%`
- after `again` on grammar-tagged prompts, retry same day or next day
- after `again` on vocabulary prompts, allow slightly looser retry behavior than grammar

Interval caps for early learners
- cap maximum interval to about `20` to `30` days during the first `30` to `60` days
- relax these caps only after the learner shows stable retention on a meaningful number of items

Session-level FSRS mapping
- `new items/day`: `5` to `12`
- `grammar-targeted new prompts/day`: `0` to `2` within the total new-item budget for new learners
- `session length`: `10` to `20` minutes
- `queue ordering`: interleave confusable items whenever possible
- `modality`: prefer text-plus-audio payloads when audio exists

Implementation note:
- because this plan intentionally defers dedicated grammar scheduling, apply grammar-related FSRS adjustments to grammar-tagged items and live `exercise_variants`, not to a separate `learner_grammar_state`

---

## Canonical Publication And Grammar Tagging Model

This section defines the source of truth and live publication path so the content pipeline can feed the session engine deterministically.

Review-state ownership:
- `generated_exercise_candidates.review_status` is the single source of truth for candidate review state
- `content_review_queue` is a derived database view or service projection over candidates that are pending review or recently reviewed
- reviewer actions must mutate candidate state first; queue rows must never become an independent source of truth

Live publication destination:
- approved textbook-derived word-focused content attaches to an existing canonical `learning_item` when one already exists for the target word or phrase
- approved textbook-derived full-sentence content creates a sentence-level `learning_item` when no suitable canonical sentence item already exists
- published contexts then attach to the resolved live `learning_item` through `item_contexts`
- grammar tagging publishes into `item_context_grammar_patterns`
- exercise-type-specific live prompts publish into `exercise_variants`
- the session builder may read only from approved, published live rows and must not read directly from staging candidates

Required canonical links:
- each published context must reference exactly one live `learning_item_id`
- each published `exercise_variant` must reference exactly one live `context_id`
- each grammar-aware published exercise must reference exactly one `grammar_pattern_id`
- `item_context_grammar_patterns` must link live contexts to one or more grammar patterns used by the scheduler

Scheduler visibility contract:
- a queued item is considered grammar-aware when its selected live context has at least one linked `grammar_pattern`
- confusable-pattern interleaving reads from `grammar_patterns.confusion_group`
- grammar complexity adjustments read from `grammar_patterns.complexity_score`
- the session engine may only schedule an exercise type when it is marked available in the exercise availability registry, passes feature-flag checks, and:
  - if `requires_approved_content = true`, approved published content exists for that type
  - if `requires_approved_content = false`, live content exists under the existing retention-first model

---

### Task 1: Freeze the Exercise Inventory and Target Taxonomy

**Files:**
- Modify: `docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md`
- Create: `src/domain/learning/exerciseCatalog.ts`
- Test: `src/__tests__/exerciseCatalog.test.ts`

**Step 1: Write the failing test**

Cover:
- implemented exercise types are marked as live
- remaining exercise types are marked as planned
- unsupported future types are not accidentally selectable

**Step 2: Implement `exerciseCatalog.ts`**

Define:
- `ExerciseType`
- `ImplementedExerciseType`
- `PlannedExerciseType`
- metadata for each type:
  - `contentFocus`
  - `requiresAudio`
  - `requiresGrammarPattern`
  - `requiresManualApproval`

**Step 3: Update the March 30 plan with a short current-status note**

Record:
- which exercise types are already live
- which exercise types remain to be implemented
- which exercise types are explicitly out of scope

**Step 4: Run tests**

Run:

```bash
npm test -- exerciseCatalog
```

Expected:
- exercise inventory stays deterministic and documented

**Step 5: Commit**

```bash
git add docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md src/domain/learning/exerciseCatalog.ts src/__tests__/exerciseCatalog.test.ts
git commit -m "docs: freeze exercise inventory and target taxonomy"
```

---

### Task 2: Add Staging Schema for Textbook and AI-Generated Exercise Content

**Files:**
- Modify: `scripts/migration.sql`
- Modify: `src/types/learning.ts`
- Create: `src/types/contentGeneration.ts`
- Test: `src/__tests__/contentGenerationTypes.test.ts`

**Step 1: Write the failing type test**

Cover:
- textbook source metadata compiles
- generated exercise candidates compile
- review state is required before publication
- published live exercise rows compile with required context and grammar links

**Step 2: Extend the SQL schema**

Add tables:
- `textbook_sources`
- `textbook_pages`
- `grammar_patterns`
- `item_context_grammar_patterns`
- `exercise_type_availability`
- `generated_exercise_candidates`
- `exercise_variants`

Add derived view:
- `content_review_queue`

Add required fields for:
- source provenance
- page number
- OCR text
- prompt version
- model name
- generated JSON payload
- review status
- reviewer notes
- approved publication target
- live `context_id`
- live `grammar_pattern_id`
- live `exercise_type`
- live `payload_json`
- live `answer_key_json`

For `exercise_type_availability`, add:
- `exercise_type`
- `session_enabled`
- `authoring_enabled`
- `requires_approved_content`
- `rollout_phase`
- `notes`

Declare ownership explicitly:
- `generated_exercise_candidates.review_status` is canonical
- `content_review_queue` is derived and must not store independent review status

**Step 3: Add TypeScript interfaces**

Create `src/types/contentGeneration.ts` with:
- `TextbookSource`
- `TextbookPage`
- `GrammarPattern`
- `GeneratedExerciseCandidate`
- `ContentReviewItem`

Modify `src/types/learning.ts` with:
- `ItemContextGrammarPattern`
- `ExerciseVariant`
- `ExerciseTypeAvailability`

**Step 4: Run tests**

Run:

```bash
npm test -- contentGenerationTypes
```

Expected:
- content-generation schema is typed and enforceable

**Step 5: Commit**

```bash
git add scripts/migration.sql src/types/learning.ts src/types/contentGeneration.ts src/__tests__/contentGenerationTypes.test.ts
git commit -m "feat: add textbook and AI content staging schema"
```

---

### Task 3: Build Textbook Import and OCR Intake

**Files:**
- Create: `scripts/import-textbook-pages.ts`
- Create: `src/services/authoring/textbookImportService.ts`
- Create: `src/__tests__/textbookImportService.test.ts`

**Step 1: Write the failing test**

Cover:
- page imports are idempotent
- OCR text is attached to the correct source and page
- empty or low-confidence OCR pages are flagged for review

**Step 2: Implement `textbookImportService`**

Support:
- importing page images or OCR JSON
- storing raw page text
- capturing page-level metadata
- flagging incomplete captures

**Step 3: Add the import script**

Support CLI inputs for:
- textbook id
- page range
- OCR file path or image directory

**Step 4: Run tests**

Run:

```bash
npm test -- textbookImportService
```

Expected:
- textbook pages can be staged reliably for generation

**Step 5: Commit**

```bash
git add scripts/import-textbook-pages.ts src/services/authoring/textbookImportService.ts src/__tests__/textbookImportService.test.ts
git commit -m "feat: add textbook OCR intake pipeline"
```

---

### Task 4: Build AI Exercise Candidate Generation With Review Gating

**Files:**
- Create: `src/services/authoring/aiExerciseGenerationService.ts`
- Create: `src/services/authoring/contentReviewService.ts`
- Create: `src/__tests__/aiExerciseGenerationService.test.ts`
- Create: `src/__tests__/contentReviewService.test.ts`

**Step 1: Write the failing tests**

Cover:
- AI generation creates candidates for each planned exercise type
- every candidate includes provenance and answer keys
- unreviewed candidates cannot be published
- approved candidates publish into the canonical live store

**Step 2: Implement `aiExerciseGenerationService`**

Generate and enable candidate content for:
- `contrast_pair`
- `sentence_transformation`
- `constrained_translation`

Store contract-ready candidate support for later:
- `speaking`

Require each candidate to include:
- textbook source reference
- page reference
- grammar pattern reference when applicable
- prompt text
- expected answer or rubric
- distractors or contrast pairs when needed
- explanation text

**Step 3: Implement `contentReviewService`**

Add methods for:
- `queueCandidateForReview`
- `approveCandidate`
- `rejectCandidate`
- `publishApprovedCandidate`

`publishApprovedCandidate` must:
- resolve a canonical live `learning_item` first:
  - reuse an existing item for word- or phrase-focused textbook content when an appropriate canonical item already exists
  - create a sentence-level `learning_item` for full-sentence textbook content when no suitable canonical sentence item exists
- upsert a live `item_contexts` row linked to that resolved `learning_item`
- upsert `item_context_grammar_patterns` links for grammar-aware content
- insert or update one `exercise_variants` row for the live exercise payload
- refuse publication unless candidate state is `approved`

Seed `exercise_type_availability` with launch defaults:
- `recognition`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `cued_recall`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `typed_recall`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `cloze`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `contrast_pair`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `sentence_transformation`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `constrained_translation`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `speaking`: `session_enabled = false`, `authoring_enabled = true`, `requires_approved_content = true`

**Step 4: Run tests**

Run:

```bash
npm test -- aiExerciseGenerationService
npm test -- contentReviewService
```

Expected:
- AI generation is useful without bypassing human review

**Step 5: Commit**

```bash
git add src/services/authoring/aiExerciseGenerationService.ts src/services/authoring/contentReviewService.ts src/__tests__/aiExerciseGenerationService.test.ts src/__tests__/contentReviewService.test.ts
git commit -m "feat: add reviewed AI exercise generation pipeline"
```

---

### Task 5: Implement the Contrast Pair Exercise

**Files:**
- Create: `src/components/exercises/ContrastPairExercise.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx`
- Modify: `src/types/learning.ts`
- Test: `src/__tests__/contrastPairExercise.test.tsx`

**Step 1: Write the failing test**

Cover:
- one contrast pair prompt renders correctly
- learner can choose between confusable forms
- answer submission records correctness and latency

**Step 2: Extend exercise payload types**

Add payload support for:
- two candidate answers
- target meaning or context cue
- explanation text
- contrast metadata

**Step 3: Implement `ContrastPairExercise.tsx`**

Support:
- prompt display
- two-option or short multi-option answer selection
- feedback with explanation

**Step 4: Wire it through `ExerciseShell.tsx`**

Add:
- correct component dispatch
- submit callback support

**Step 5: Run tests**

Run:

```bash
npm test -- contrastPairExercise
```

Expected:
- contrast pairs work as a live session exercise

**Step 6: Commit**

```bash
git add src/components/exercises/ContrastPairExercise.tsx src/components/exercises/ExerciseShell.tsx src/types/learning.ts src/__tests__/contrastPairExercise.test.tsx
git commit -m "feat: add contrast pair exercise"
```

---

### Task 6: Implement the Sentence Transformation Exercise

**Files:**
- Create: `src/components/exercises/SentenceTransformationExercise.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx`
- Modify: `src/types/learning.ts`
- Test: `src/__tests__/sentenceTransformationExercise.test.tsx`

**Step 1: Write the failing test**

Cover:
- transformation prompt renders with source sentence
- learner submits a transformed sentence
- normalization handles punctuation and spacing fairly

**Step 2: Extend the payload and grading types**

Add fields for:
- source sentence
- transformation instruction
- acceptable answers
- hint text

**Step 3: Implement `SentenceTransformationExercise.tsx`**

Support:
- prompt display
- typed answer submission
- answer normalization
- feedback with target form

**Step 4: Wire it through `ExerciseShell.tsx`**

**Step 5: Run tests**

Run:

```bash
npm test -- sentenceTransformationExercise
```

Expected:
- sentence transformation works end to end

**Step 6: Commit**

```bash
git add src/components/exercises/SentenceTransformationExercise.tsx src/components/exercises/ExerciseShell.tsx src/types/learning.ts src/__tests__/sentenceTransformationExercise.test.tsx
git commit -m "feat: add sentence transformation exercise"
```

---

### Task 7: Implement the Constrained Translation Exercise

**Files:**
- Create: `src/components/exercises/ConstrainedTranslationExercise.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx`
- Modify: `src/types/learning.ts`
- Test: `src/__tests__/constrainedTranslationExercise.test.tsx`

**Step 1: Write the failing test**

Cover:
- prompt renders with source language text
- required grammar cue is shown
- grading accepts approved variants only

**Step 2: Extend the payload and grading types**

Add fields for:
- source language sentence
- required target pattern
- acceptable answers
- disallowed shortcut forms when relevant

**Step 3: Implement `ConstrainedTranslationExercise.tsx`**

Support:
- prompt display
- typed submission
- answer validation
- explanation and target reveal

**Step 4: Wire it through `ExerciseShell.tsx`**

**Step 5: Run tests**

Run:

```bash
npm test -- constrainedTranslationExercise
```

Expected:
- constrained translation works as a grammar-aware production task

**Step 6: Commit**

```bash
git add src/components/exercises/ConstrainedTranslationExercise.tsx src/components/exercises/ExerciseShell.tsx src/types/learning.ts src/__tests__/constrainedTranslationExercise.test.tsx
git commit -m "feat: add constrained translation exercise"
```

---

### Task 8: Keep Speaking Contract-Ready But Disabled

**Files:**
- Modify: `scripts/migration.sql`
- Modify: `src/types/learning.ts`
- Modify: `src/components/exercises/SpeakingExercise.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx`
- Test: `src/__tests__/speakingContracts.test.tsx`

**Step 1: Write the failing test**

Cover:
- speaking payload shape remains valid
- speaking component can render behind a disabled gate
- session engine will not schedule speaking while the feature is off

**Step 2: Extend schema and types**

Add or confirm fields for:
- speaking prompt text
- target pattern or scenario
- transcript
- self-rating
- confidence score
- review-event linkage

**Step 3: Upgrade `SpeakingExercise.tsx`**

Support:
- prompt display
- recording-ready contract or typed transcript fallback
- self-assessment flow
- answer submission

**Step 4: Wire it through `ExerciseShell.tsx` behind a feature flag**

Ensure:
- the component remains loadable for future enablement
- it is not selected in normal live session flow in this rollout

**Step 5: Run tests**

Run:

```bash
npm test -- speakingContracts
```

Expected:
- speaking contracts remain stable without becoming a live scheduled exercise type

**Step 6: Commit**

```bash
git add scripts/migration.sql src/types/learning.ts src/components/exercises/SpeakingExercise.tsx src/components/exercises/ExerciseShell.tsx src/__tests__/speakingContracts.test.tsx
git commit -m "feat: keep speaking contract-ready behind feature flag"
```

---

### Task 9: Add Authoring Review UI for AI-Generated Textbook Content

**Files:**
- Create: `src/pages/ContentReview.tsx`
- Create: `src/stores/contentReviewStore.ts`
- Modify: `src/App.tsx`
- Test: `src/__tests__/contentReviewPage.test.tsx`

**Step 1: Write the failing test**

Cover:
- reviewer sees queued candidates
- reviewer can approve or reject
- publication target is visible before approval

**Step 2: Implement `contentReviewStore.ts`**

Store:
- review queue
- selected candidate
- approve status
- reject status

**Step 3: Implement `ContentReview.tsx`**

Support:
- candidate list
- source page preview
- grammar explanation preview
- answer-key preview
- live publication target preview
- approve or reject actions

**Step 4: Add a route behind a feature flag**

Modify:
- `src/App.tsx`

Add:
- `/content-review`

**Step 5: Run tests**

Run:

```bash
npm test -- contentReviewPage
```

Expected:
- AI-generated textbook content can be reviewed safely before publication

**Step 6: Commit**

```bash
git add src/pages/ContentReview.tsx src/stores/contentReviewStore.ts src/App.tsx src/__tests__/contentReviewPage.test.tsx
git commit -m "feat: add AI content review workflow"
```

---

### Task 10: Teach the Session Builder When to Use Each Remaining Exercise Type

**Files:**
- Modify: `src/services/scheduler/sessionBuilderService.ts`
- Modify: `src/services/scheduler/schedulerService.ts`
- Modify: `src/services/learning/learnerStateService.ts`
- Modify: `src/domain/learning/skills.ts`
- Modify: `src/domain/learning/masteryRules.ts`
- Test: `src/__tests__/remainingExerciseSelection.test.ts`

**Step 1: Write the failing test**

Cover:
- new learners receive conservative spacing-oriented defaults
- new learners stay within the intended new-item burden
- new learners receive short-session queue sizing
- queues over the short-session cap are trimmed in deterministic priority order
- early grammar exposure prefers `contrast_pair`
- mid-stage grammar prefers `sentence_transformation` or `constrained_translation`
- speaking is not selected while `speaking_enabled` is off
- unapproved AI content is never scheduled
- each remaining exercise type maps to exactly one primary learner skill facet

**Step 2: Implement selection rules**

Add rules for:
- beginner-profile detection
- conservative new-learner interval and burden defaults
- queue trimming by `session_interaction_cap` with due > weak > new priority
- stage-based progression
- grammar-pattern complexity
- confusable-pattern interleaving
- exercise availability registry gating
- feature-flag gating for non-text exercise families
- approved-content-only scheduling

Define the canonical primary skill-facet mapping:
- `contrast_pair` -> `recognition`
- `sentence_transformation` -> `form_recall`
- `constrained_translation` -> `meaning_recall`
- `speaking` -> `spoken_production`

If `meaning_recall` is not already present in the domain model, add it now rather than overloading `form_recall`.

Keep the scope intentionally limited:
- grammar prompts are woven into the normal mixed queue
- no grammar-only queue is introduced
- no dedicated grammar due-state calculation is added
- no non-text exercise type is scheduled in the first rollout

Scheduling guardrail:
- an exercise type is eligible only when `exercise_type_availability.session_enabled = true`
- content may still be authored and approved when `authoring_enabled = true` but `session_enabled = false`

**Step 3: Update mastery rules and learner-state writes**

Ensure:
- productive tasks raise the right skill facets
- repeated failures can fall back to easier exercise types
- review outcome writes update the mapped primary facet only
- scheduler selection and learner-state updates use the same exercise-to-facet mapping

**Step 4: Run tests**

Run:

```bash
npm test -- remainingExerciseSelection
```

Expected:
- the engine chooses the right remaining exercise type for the learner state and available reviewed content

**Step 5: Commit**

```bash
git add src/services/scheduler/sessionBuilderService.ts src/services/scheduler/schedulerService.ts src/services/learning/learnerStateService.ts src/domain/learning/skills.ts src/domain/learning/masteryRules.ts src/__tests__/remainingExerciseSelection.test.ts
git commit -m "feat: schedule remaining exercise types"
```

---

### Task 11: Run Full Verification and Document What Is Still Deferred

**Files:**
- Modify: `docs/plans/2026-04-03-remaining-exercise-types-and-textbook-ai-plan.md`
- Modify: `docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md`

**Step 1: Run targeted tests**

Run:

```bash
npm test -- exerciseCatalog
npm test -- contentGenerationTypes
npm test -- textbookImportService
npm test -- aiExerciseGenerationService
npm test -- contentReviewService
npm test -- contrastPairExercise
npm test -- sentenceTransformationExercise
npm test -- constrainedTranslationExercise
npm test -- speakingContracts
npm test -- contentReviewPage
npm test -- remainingExerciseSelection
```

Expected:
- each new surface has focused coverage

**Step 2: Run broader regression checks**

Run:

```bash
npm test
npm run build
```

Expected:
- existing session flows still work
- production build succeeds

**Step 3: Add a final deferred-work note**

Document anything intentionally left out, such as:
- live speaking enablement
- automated pronunciation scoring
- listening dictation
- open conversation exercises
- fully automated publishing with no reviewer gate
- grammar-specific scheduling and dedicated grammar state tracking

**Step 4: Commit**

```bash
git add docs/plans/2026-04-03-remaining-exercise-types-and-textbook-ai-plan.md docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md
git commit -m "docs: finalize remaining exercise types rollout plan"
```

---

## Verification Checklist Per Task

After each task:

1. Run the targeted tests from that task.
2. Run `npm test` when shared types, scheduler logic, or shell routing changed.
3. Run `npm run build` after route, store, or payload-type changes.
4. Manually verify:
   - lesson import
   - review queue safety
   - exercise rendering
   - answer submission
   - approval gating

## Suggested Feature Flags

Use flags for:

- `textbook_import_enabled`
- `ai_content_generation_enabled`
- `content_review_enabled`
- `contrast_pair_enabled`
- `sentence_transformation_enabled`
- `constrained_translation_enabled`
- `speaking_enabled`

## Execution Gates To Resolve Early

Tasks `1` and `2` can start before these are decided. The dependent tasks below must not start, or be considered complete, until their gate is resolved:

- OCR path for paper textbook capture
  Blocks Task `3` textbook import implementation.
- AI provider and model for candidate generation
  Blocks Task `4` AI generation and any end-to-end generation tests.
- Reviewer workflow boundary: in-app only vs in-app plus admin SQL tooling
  Blocks Task `9` review workflow completion and operational handoff.
- Indonesian answer-normalization policy
  Blocks completion of Tasks `5`, `6`, and `7`, because evaluation rules must be stable before these exercise types can be shipped.

This decision can remain deferred until after the text-first rollout:

- which later non-text exercise family should be enabled first after the text rollout

## Recommended Execution Order

Execute these tasks first:

1. Task 1: freeze the inventory
2. Task 2: add staging schema
3. Task 3: build textbook intake
4. Task 4: add reviewed AI generation
5. Task 9: add review UI
6. Task 5: contrast pair
7. Task 6: sentence transformation
8. Task 7: constrained translation
9. Task 8: speaking contracts only
10. Task 10: session-builder selection rules
11. Task 11: verification and deferred-work note

---

Plan complete and saved to `docs/plans/2026-04-03-remaining-exercise-types-and-textbook-ai-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
