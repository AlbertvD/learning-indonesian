# Text-First Exercise And Textbook Content Specification

**Date:** 2026-04-03
**Status:** Proposed
**Depends On:** `docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md`, `docs/plans/2026-04-03-remaining-exercise-types-and-textbook-ai-plan.md`
**Audience:** Product, design, frontend, backend, content operations, analytics
**Execution Prerequisite:** Implement this spec in the learning-app repo or worktree that contains `src/`, `scripts/`, and `package.json`; the current `AI Governance` workspace is docs-only.

---

## 1. Goal

Extend the Indonesian learning app so it is technically ready to support all planned exercise families, while implementing and enabling only the text-based content path first for textbook-driven words, phrases, sentences, and grammar.

This specification defines:
- what exercise families are live at launch
- how textbook content enters the system
- how AI-generated content is reviewed and published
- how published content becomes eligible for the session engine
- how grammar is woven into mixed sessions
- how beginner learners are handled

This specification does not introduce:
- grammar-specific scheduling or a dedicated `learner_grammar_state`
- live speaking delivery at launch
- listening-only exercise delivery at launch
- automated pronunciation scoring
- fully automated publication with no human review

---

## 2. Launch Scope

### 2.1 Already-live exercise families

Treat these as already implemented and available:
- `recognition`
- `typed_recall`
- `cloze`

### 2.2 Text-based exercise families to implement and enable now

These exercise families must be implemented and schedulable in the first rollout:
- `cued_recall`
- `contrast_pair`
- `sentence_transformation`
- `constrained_translation`

Launch note:
- `cued_recall` is a lightweight reverse-direction multiple-choice variant that bridges `recognition` and `typed_recall`
- the textbook-driven families in this section, `contrast_pair`, `sentence_transformation`, and `constrained_translation`, must also be publishable through the approved-content pipeline

### 2.3 Contract-ready but disabled at launch

These exercise families may have schema, payload, and component support, but must not be scheduled in the first rollout:
- `speaking`

### 2.4 Explicitly deferred

The following are out of scope for this launch:
- live speaking enablement
- listening-only exercise families
- pronunciation scoring
- open-ended conversation grading
- grammar-specific due-state scheduling

---

## 3. Product Principles

### 3.1 Text-first rollout

The first rollout must only depend on text-based prompts and text-evaluated answers.

Audio may exist in payloads as optional enrichment, but:
- no launch exercise type may require audio to function
- the scheduler must not depend on audio availability
- no listening-only or speaking-only path may be required for completion

### 3.2 Interwoven grammar

Grammar must appear inside normal mixed sessions.

The system must not:
- create a separate learner-facing grammar mode
- create a grammar-only due queue
- track grammar with a separate scheduler state at launch

Instead, grammar must be expressed through:
- grammar-tagged contexts
- grammar-aware exercise payloads
- exercise-selection rules

### 3.3 Human-reviewed publication

AI-generated textbook content must never be published directly into live learner sessions.

All AI-generated exercise content must pass through:
- staging
- review
- approval
- canonical publication

### 3.4 Rollout control separate from content availability

The session engine must use both:
- approved published content availability
- an explicit exercise availability registry

This allows the system to be technically ready for a content type without making it live immediately.

---

## 4. High-Level System Model

The system has 4 layers.

### 4.1 Source layer

Source content comes from:
- paper textbook pages
- OCR output derived from textbook pages
- optional existing lessons or lesson sections

### 4.2 Staging layer

The staging layer stores:
- textbook pages
- grammar patterns
- AI-generated exercise candidates
- candidate review state

### 4.3 Canonical live layer

The canonical live layer stores:
- `learning_items`
- `item_contexts`
- `item_context_grammar_patterns`
- `exercise_variants`

This is the only layer the session engine may read for scheduled learner content.

### 4.4 Session layer

The session layer:
- reads live learner state and live published content
- checks exercise availability
- constructs a mixed queue
- chooses exercise type and payload
- records review outcomes

---

## 5. Launch Exercise Inventory

### 5.1 Exercise families

The exercise catalog must contain all technically supported exercise families:
- `recognition`
- `cued_recall`
- `typed_recall`
- `cloze`
- `contrast_pair`
- `sentence_transformation`
- `constrained_translation`
- `speaking`

### 5.2 Exercise metadata

Each exercise type must define metadata including:
- `content_focus` (`vocabulary`, `grammar`, `mixed`, `production`)
- `requires_audio`
- `requires_grammar_pattern`
- `requires_manual_approval`

### 5.3 Availability registry

Add a master availability table named `exercise_type_availability`.

Purpose:
- define which exercise types may be authored
- define which exercise types may be scheduled
- separate rollout control from content presence

Required columns:
- `exercise_type` primary key
- `session_enabled` boolean
- `authoring_enabled` boolean
- `requires_approved_content` boolean
- `rollout_phase` text
- `notes` text nullable
- `created_at`
- `updated_at`

Launch seed values:
- `recognition`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `cued_recall`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `typed_recall`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `cloze`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = false`
- `contrast_pair`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `sentence_transformation`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `constrained_translation`: `session_enabled = true`, `authoring_enabled = true`, `requires_approved_content = true`
- `speaking`: `session_enabled = false`, `authoring_enabled = true`, `requires_approved_content = true`

The session engine may only schedule an exercise type when:
- `exercise_type_availability.session_enabled = true`
- if `requires_approved_content = true`, approved published content exists for that type
- if `requires_approved_content = false`, live content exists under the existing retention-first model
- required feature flags pass

---

## 6. Data Model

### 6.1 Existing base tables reused

This specification reuses the existing retention-first structures, including:
- `learning_items`
- `item_contexts`
- `learner_item_state`
- `learner_skill_state`
- `review_events`

### 6.2 New table: `textbook_sources`

Purpose:
- store textbook-level source metadata

Required columns:
- `id`
- `source_name`
- `source_type` (`paper_textbook`)
- `publisher` nullable
- `edition` nullable
- `language` nullable
- `created_at`
- `updated_at`

### 6.3 New table: `textbook_pages`

Purpose:
- store staged OCR/imported textbook page material

Required columns:
- `id`
- `textbook_source_id`
- `page_number`
- `raw_ocr_text`
- `ocr_confidence` nullable
- `import_batch_id` nullable
- `needs_manual_review`
- `created_at`
- `updated_at`

Uniqueness:
- unique on `(textbook_source_id, page_number)`

### 6.4 New table: `grammar_patterns`

Purpose:
- represent grammar targets referenced by live contexts and exercise variants

Required columns:
- `id`
- `slug`
- `name`
- `short_explanation`
- `complexity_score` integer
- `confusion_group` nullable
- `introduced_by_source_id` nullable
- `created_at`
- `updated_at`

Rules:
- `complexity_score` is required for grammar-aware scheduling adjustments
- `confusion_group` is used for interleaving similar forms

### 6.5 New table: `item_context_grammar_patterns`

Purpose:
- link live contexts to one or more grammar patterns

Required columns:
- `id`
- `context_id`
- `grammar_pattern_id`
- `is_primary` boolean
- `created_at`

Rules:
- a live context may have multiple grammar patterns
- at most one linked grammar pattern may have `is_primary = true`

### 6.6 New table: `generated_exercise_candidates`

Purpose:
- store staged AI-generated candidate content before publication

Required columns:
- `id`
- `textbook_source_id`
- `textbook_page_id`
- `candidate_type` (`context`, `exercise_variant`, `grammar_pattern`)
- `exercise_type`
- `review_status`
- `prompt_version`
- `model_name`
- `generated_payload_json`
- `reviewer_notes` nullable
- `approved_publication_target` nullable
- `created_at`
- `updated_at`

Allowed `review_status` values:
- `pending_review`
- `approved`
- `rejected`
- `published`

Source-of-truth rule:
- `generated_exercise_candidates.review_status` is the single source of truth for candidate review state

### 6.7 Derived view: `content_review_queue`

Purpose:
- provide reviewer-facing queue access without becoming its own state store

Rules:
- this must be a derived database view or service projection
- it must not store independent review status
- it must read from `generated_exercise_candidates`

### 6.8 New table: `exercise_variants`

Purpose:
- store published exercise payloads that the session engine can schedule

Required columns:
- `id`
- `exercise_type`
- `learning_item_id`
- `context_id`
- `grammar_pattern_id` nullable
- `payload_json`
- `answer_key_json`
- `source_candidate_id`
- `is_active`
- `created_at`
- `updated_at`

Rules:
- each variant must reference exactly one live `context_id`
- each grammar-aware variant must reference exactly one `grammar_pattern_id`
- variants must only be created from approved candidates
- at launch, `exercise_variants` are required for newly published textbook-driven `contrast_pair`, `sentence_transformation`, `constrained_translation`, and contract-ready `speaking`
- existing live `recognition`, `typed_recall`, and `cloze` flows, plus the lightweight `cued_recall` variant added in this rollout, may continue using their current payload-building logic from canonical live tables

---

## 7. Canonical Publication Model

### 7.1 Review ownership

Reviewer actions must mutate candidate state first.

The review system must not create a second canonical state outside:
- `generated_exercise_candidates.review_status`

### 7.2 Hybrid learning-item resolution

Before publication, the system must resolve a canonical live `learning_item`.

For word-focused textbook content:
- attempt to reuse an existing canonical word or phrase `learning_item`
- if no appropriate canonical item exists, create a new word- or phrase-level `learning_item`

For full-sentence textbook content:
- attempt to reuse an existing canonical sentence-level `learning_item`
- if no appropriate canonical sentence item exists, create a new sentence-level `learning_item`

### 7.3 Publication targets

`publishApprovedCandidate` must:
1. resolve the canonical `learning_item`
2. upsert a live `item_contexts` row linked to that `learning_item`
3. upsert `item_context_grammar_patterns` links when grammar applies
4. insert or update one `exercise_variants` row for the live exercise payload
5. mark the candidate as `published`

### 7.4 Publication safety

`publishApprovedCandidate` must refuse publication when:
- candidate state is not `approved`
- required live links cannot be resolved
- the target exercise type is not `authoring_enabled`

### 7.5 Scheduler read contract

The session engine may read only from:
- live `learning_items`
- live `item_contexts`
- live `item_context_grammar_patterns`
- live `exercise_variants`
- `exercise_type_availability`

The session engine must not read directly from:
- `generated_exercise_candidates`
- `content_review_queue`

---

## 8. Textbook Intake And AI Generation

### 8.1 Import flow

Textbook import must support:
- OCR JSON input
- imported page images
- idempotent page upserts
- page-level confidence markers

When OCR confidence is low or text is incomplete:
- set `needs_manual_review = true`

### 8.2 Candidate generation

At launch, AI generation must generate and enable candidates for:
- `contrast_pair`
- `sentence_transformation`
- `constrained_translation`

At launch, AI generation may also create contract-ready candidates for:
- `speaking`

Every generated candidate must include:
- textbook source reference
- textbook page reference
- target exercise type
- grammar pattern reference when applicable
- prompt text
- explanation text
- answer-key data

Variant-specific requirements:
- `contrast_pair` candidates must include explicit contrast options
- `sentence_transformation` candidates must include source sentence and transformation instruction
- `constrained_translation` candidates must include source-language prompt and target-pattern constraint
- `speaking` candidates must include prompt/scenario contract only

### 8.3 Review UI behavior

The review UI must show:
- source page preview
- grammar explanation preview
- answer-key preview
- live publication target preview
- approve or reject actions

---

## 9. Exercise Payload Contracts

### 9.1 Shared payload fields

Every live exercise payload may carry:
- `exerciseVariantId`
- `exerciseType`
- `learningItemId`
- `contextId`
- `grammarPatternId` nullable
- `sourceText`
- `translationText` nullable
- `audioPath` nullable
- `explanationText` nullable

Launch rule:
- audio fields may exist, but text-first exercises must not require them

### 9.2 `cued_recall`

Purpose:
- supported reverse-direction recall from meaning cue to Indonesian form

Required payload fields:
- `promptMeaningText`
- `cueText` nullable
- `options` exactly 4 at launch
- `correctOptionId`
- `explanationText` nullable

Evaluation:
- exact option selection against `correctOptionId`

Implementation rule:
- reuse the same option-selection shell and distractor-generation logic as `recognition` when possible

Primary learner skill facet:
- `meaning_recall`

### 9.3 `contrast_pair`

Purpose:
- early grammar discrimination for confusable forms

Required payload fields:
- `promptText`
- `targetMeaning`
- `options` exactly 2 at launch
- `correctOptionId`
- `explanationText`

Evaluation:
- exact option selection against `correctOptionId`

Primary learner skill facet:
- `recognition`

### 9.4 `sentence_transformation`

Purpose:
- productive manipulation of sentence form

Required payload fields:
- `sourceSentence`
- `transformationInstruction`
- `acceptableAnswers`
- `hintText` nullable
- `explanationText`

Evaluation:
- normalize learner answer
- compare against normalized `acceptableAnswers`

Primary learner skill facet:
- `form_recall`

### 9.5 `constrained_translation`

Purpose:
- productive translation with a required grammar target

Required payload fields:
- `sourceLanguageSentence`
- `requiredTargetPattern`
- `acceptableAnswers`
- `disallowedShortcutForms` nullable
- `explanationText`

Evaluation:
- normalize learner answer
- require match against approved acceptable answers
- reject explicit disallowed shortcuts when defined

Primary learner skill facet:
- `meaning_recall`

### 9.6 `speaking`

Purpose:
- preserve future readiness without launch scheduling

Required payload fields:
- `promptText`
- `targetPatternOrScenario` nullable
- `transcript` nullable
- `selfRating` nullable
- `confidenceScore` nullable

Launch rule:
- `speaking` must not be scheduled while `exercise_type_availability.session_enabled = false`

Primary learner skill facet:
- `spoken_production`

---

## 10. Skill-Facet Model

The domain model must explicitly support these primary facets:
- `recognition`
- `form_recall`
- `meaning_recall`
- `spoken_production`

If `meaning_recall` is not currently present, it must be added rather than overloading `form_recall`.

Review outcome writes must:
- update only the mapped primary facet for the exercise variant completed
- use the same facet mapping used by the scheduler

---

## 11. Grammar Weaving Rules

### 11.1 Launch position

Grammar must be woven into the normal mixed queue.

The system must not:
- create a separate grammar queue
- create grammar-only daily targets
- create a dedicated grammar due-state table

### 11.2 Grammar-aware content detection

A queued item is considered grammar-aware when:
- the selected live context has at least one linked `grammar_pattern`

### 11.3 Grammar-aware adjustments

When grammar-aware content is selected:
- `grammar_patterns.complexity_score` may reduce stability growth
- `grammar_patterns.confusion_group` must inform interleaving
- grammar-aware new prompt caps must apply for new learners

---

## 12. Session Engine Eligibility Rules

This specification extends the March 30 session engine design. Existing due/weak/new sourcing remains unchanged unless overridden here.

An exercise type is eligible for scheduling only when:
1. `exercise_type_availability.session_enabled = true`
2. the exercise type passes feature-flag checks
3. if `requires_approved_content = true`, approved published live content exists for that type
4. if `requires_approved_content = false`, live content exists under the existing retention-first model
5. required live payload fields are present for the selected content path

If any condition fails:
- the type is not eligible for that session

Authoring rule:
- content may still be authored and approved when `authoring_enabled = true` but `session_enabled = false`

---

## 13. New Learner Definition

Treat a learner as `new` when:
- `account_age_days < 30`
- `stable_item_count < 50`

Exit `new` learner mode when either:
- `account_age_days >= 30` and `stable_item_count >= 50`
- `successful_recall_review_count >= 200`

---

## 14. New Learner Session Defaults

### 14.1 Session sizing

Set:
- `target_session_minutes = 15`
- user-facing controls may clamp this between `10` and `20`
- `estimated_beginner_seconds_per_interaction = 18`
- `session_interaction_cap = floor(target_session_minutes * 60 / estimated_beginner_seconds_per_interaction)`

### 14.2 New-item burden

Set daily `new_items_target` with exact rules:
- if `due_review_count > 40`: `0`
- else if `due_review_count > 20`: `2`
- else: `8`

### 14.3 Grammar-targeted new prompts

If `new_items_target = 0`:
- `grammar_targeted_new_prompt_cap = 0`

Else if approved grammar prompts are available:
- `grammar_targeted_new_prompt_cap = min(2, max(1, floor(new_items_target / 4)))`

### 14.4 Queue composition

The beginner queue should:
- start with a few easier wins before the hardest production prompts
- mix due review, weak items, and the computed `new_items_target`
- weave grammar prompts into the middle of the queue
- cap consecutive prompts of the same exercise type at `2` when alternatives exist
- avoid adjacent confusable items when alternatives exist

### 14.5 Mid-session overload rule

If either occurs:
- scored accuracy on the first `8` prompts is below `0.6`
- there are `2` consecutive `again` outcomes on new content

Then:
- set remaining session `new_items_target = 0`
- finish with due review only

### 14.6 Queue trimming rule

When candidate work exceeds `session_interaction_cap`, trim the queue in this exact order:
1. keep due review first
2. keep weak items second
3. keep new items last

Inside the trimmed queue:
- preserve interleaving when possible
- preserve exercise variety when possible

---

## 15. FSRS Mapping For New Learners

These are launch-facing defaults and must be treated as relative implementation guidance rather than hard-coded permanent tuning.

### 15.1 Difficulty

Initialize:
- vocabulary items around `5.0` to `5.5`
- grammar-tagged exemplars around `5.7` to `6.3`
- confusable grammar-tagged exemplars around `6.3` to `6.8`

### 15.2 Initial stability

Initialize:
- vocabulary items around `1.5` to `2.2` days
- grammar-tagged exemplars around `1.0` to `1.5` days
- difficult or confusable grammar-tagged exemplars around `0.8` to `1.2` days

### 15.3 Retrievability target

Use:
- `R_target` near `0.8`

### 15.4 Review outcome behavior

Use these launch adjustments:
- conservative interval growth during the first month
- reduce grammar-tagged `good` and `easy` stability growth by roughly `15%` to `25%` versus plain vocabulary
- reduce confusable grammar-tagged `good` and `easy` growth by roughly `30%`
- after `again` on grammar-tagged prompts, retry same day or next day
- after `again` on plain vocabulary prompts, allow slightly looser retry behavior than grammar

### 15.5 Early interval cap

Cap maximum interval to about `20` to `30` days during the first `30` to `60` days.

Relax only after the learner shows stable retention on a meaningful number of items.

### 15.6 Session-level summary

For new learners:
- `new items/day`: `5` to `12`
- `grammar-targeted new prompts/day`: `0` to `2`
- `session length`: `10` to `20` minutes
- `queue ordering`: interleave confusable items whenever possible
- `modality`: text-first; audio optional when already present

Implementation note:
- apply grammar-related FSRS adjustments to grammar-tagged items and live `exercise_variants`, not to a separate `learner_grammar_state`

---

## 16. Scheduler Selection Rules For New Text-Based Families

### 16.1 Supported reverse-direction vocabulary recall

For low-confidence reverse-direction vocabulary recall where free typing is not yet appropriate, prefer:
- `cued_recall`

`cued_recall` should sit between `recognition` and `typed_recall` in effective difficulty.

### 16.2 Early grammar exposure

For early grammar-heavy exposures, prefer:
- `contrast_pair`

### 16.3 Mid-stage grammar practice

For mid-stage grammar-heavy practice, prefer:
- `sentence_transformation`
- `constrained_translation`

### 16.4 Disabled non-text families

The scheduler must not select:
- `speaking` while `exercise_type_availability.session_enabled = false`

### 16.5 Approved-content-only rule

The scheduler must never select:
- unapproved candidates
- unpublished staged content

---

## 17. Feature Flags

Use feature flags for:
- `textbook_import_enabled`
- `ai_content_generation_enabled`
- `content_review_enabled`
- `cued_recall_enabled`
- `contrast_pair_enabled`
- `sentence_transformation_enabled`
- `constrained_translation_enabled`
- `speaking_enabled`

Rule:
- feature flags are an additional gate, not a replacement for `exercise_type_availability`

---

## 18. Verification Requirements

Implementation is not complete unless all of the following are verified:

### 18.1 Schema and typing

Verify:
- textbook staging types compile
- publication types compile
- availability registry types compile

### 18.2 Content pipeline

Verify:
- textbook pages import idempotently
- AI candidates carry provenance and answer keys
- review state is canonical on candidates
- approved candidates publish into live stores correctly

### 18.3 Exercise delivery

Verify:
- `cued_recall` renders and grades correctly
- `contrast_pair` renders and grades correctly
- `sentence_transformation` renders and grades correctly
- `constrained_translation` renders and grades correctly
- `speaking` contracts remain valid but disabled

### 18.4 Scheduler behavior

Verify:
- new learners receive conservative defaults
- queue trimming follows due > weak > new
- grammar-aware text exercises appear interwoven in the queue
- disabled exercise families are not scheduled
- textbook-driven exercise families require approved published content
- `cued_recall` and the already-live retention-first families can still schedule from the existing live content path

---

## 19. Launch-Deferred Items

These are explicitly deferred beyond this specification’s launch scope:
- live speaking enablement
- pronunciation scoring
- listening dictation
- open conversation exercises
- grammar-specific scheduling and dedicated grammar state tracking
- fully automated publication with no human review

---

## 20. Implementation Notes

This specification is intended to be implemented together with:
- the existing retention-first session engine design from March 30
- the rollout and sequencing plan from April 3

If implementation conflicts with those documents:
- this specification is the source of truth for scope, scheduling eligibility, publication flow, and beginner behavior
