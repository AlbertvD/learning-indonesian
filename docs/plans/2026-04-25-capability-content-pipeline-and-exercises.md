# Capability Content Pipeline and Exercise Generation

**Date:** 2026-04-25
**Status:** Draft v1
**Scope:** Redesign the content creation and publishing pipeline so lessons, dialogue, podcasts, audio, grammar, and morphology generate validated learning capabilities and exercise assets.
**Companion:** `2026-04-25-capability-based-learning-architecture.md`

---

## 1. Goal

Make the content pipeline produce learning-ready capabilities, not just database rows. Every published capability must have enough approved artifacts to render at least one valid exercise or be explicitly marked exposure-only.

The pipeline should prevent these failure classes:

- active content without learner-language meaning
- schedulable capability without renderable exercise
- audio capability without audio
- cloze capability without valid blank and answer
- morphology production without a root-derived answer key
- grammar contrast with ambiguous answer
- podcast segment promoted to review before it is comprehensible enough
- dialogue line scheduled without translation, cloze, roleplay, or audio path

---

## 1.1 MVP Scope

The first implementation slice should be deliberately narrow. The pipeline should prove the capability framework with a small set of concrete capability types before adding podcasts, rich roleplay, or full morphology production.

MVP schedulable capabilities:

```text
text_recognition
meaning_recall
form_recall
contextual_cloze
audio_recognition
dictation
one grammar/pattern recognition or contrast capability
```

MVP pipeline surfaces:

- generate capability plans from existing lessons
- validate required artifacts before publish
- produce a capability health report
- block schedulable-but-unrenderable capabilities
- preview supported exercise assets in admin

Deferred until the core seam is proven:

- podcast phrase mining
- dialogue roleplay production
- morphology production beyond one controlled pilot
- free production grading
- shadowing scoring
- natural-speed detailed listening assessment

This is a YAGNI guard. The target model supports richer content, but the first slice should remove the current failure mode before expanding the product surface.

---

## 2. Current Problem

The current pipeline mostly publishes content objects:

```text
learning_items
item_meanings
item_contexts
exercise_variants
grammar_patterns
```

The session engine then infers reviewability from those rows. This worked while the app was mostly vocabulary review, but it is brittle for a richer system.

The 2026-04-24 incident showed the failure mode: some items were schedulable by FSRS but not renderable by the exercise layer.

The target pipeline publishes only after answering:

```text
What capability does this content create?
What artifacts does that capability require?
Are those artifacts present and reviewed?
Which exercises may render it?
When may the learner see it?
```

---

## 3. Target Pipeline Overview

```text
1. Intake
2. Source normalization
3. Content unit extraction
4. Linguistic enrichment
5. Capability planning
6. Draft contract validation
7. Exercise asset generation
8. Human review
9. Publish gate and database write
10. Content health audit
```

Each stage writes versioned artifacts. Human edits must survive reruns.

Contract validation runs twice: once immediately after capability planning to catch impossible plans early, and once at publish time after reviewed exercise assets exist. A capability path must fail closed; if readiness cannot be proven, the capability is blocked or exposure-only, never silently scheduled.

---

## 4. Repository Layout Target

For textbook lessons:

```text
scripts/data/staging/lesson-N/
  source-metadata.json
  sections-catalog.json
  lesson.ts
  content-units.ts
  learning-items.ts
  grammar-patterns.ts
  morphology-patterns.ts
  dialogue-lines.ts
  audio-manifest.ts
  lesson-page-blocks.ts
  capabilities.ts
  exercise-assets.ts
  cloze-contexts.ts
  review-report.json
  publish-report.json
```

For podcast/story content:

```text
content/stories/<story_id>/
  00_raw/
  10_normalized/
  20_ocr/
  30_reviewed/
  40_spoken/
  50_sections/
  60_capabilities/
  70_exercises/
  80_audio/
  90_publish/
```

The exact folder names can be tuned, but the separation matters: source material, capability plan, exercise assets, and publish payload should be inspectable independently.

---

## 5. Stage Details

### 5.1 Intake

Collect source metadata before generating content.

Required fields:

```json
{
  "source_id": "lesson-10",
  "source_type": "textbook_lesson",
  "title": "...",
  "language": "id",
  "learner_language": "nl",
  "level_target": "A1",
  "source_pages": [10, 11],
  "license": "owned/coursebook/manual",
  "created_at": "..."
}
```

Podcast/story metadata additionally requires:

```json
{
  "source_url": "...",
  "license_url": "...",
  "audio_rights": "generated|owned|licensed",
  "voice_policy": "learner_spoken|natural_spoken|both"
}
```

### 5.2 Source Normalization

Convert raw input into stable, reviewable text and media.

Textbook:

- OCR pages
- normalize sections
- preserve source page and section references
- store confidence warnings

Podcast/story:

- verify transcript
- split into segments
- produce learner-spoken and natural-spoken variants when relevant
- preserve source transcript alignment

### 5.3 Content Unit Extraction

Extract normalized content units.

Unit types:

```text
word
phrase
sentence
dialogue_line
podcast_segment
podcast_phrase
grammar_pattern
morphology_pattern
affixed_form_pair
```

Every content unit must include:

```ts
interface StagedContentUnit {
  slug: string
  unitType: ContentUnitType
  canonicalText: string
  normalizedText: string
  sourceRefs: SourceRef[]
  language: 'id'
  learnerLanguage: 'nl' | 'en'
  level: string
  metadata: Record<string, unknown>
  reviewStatus: 'draft' | 'approved' | 'rejected' | 'deferred'
}
```

### 5.3.1 Lesson Page Block Generation

Textbook-derived lessons should also generate learner-facing page blocks. These blocks are not review items. They are the web-native lesson experience that creates exposure and source progress.

Generate `lesson-page-blocks.ts` with blocks such as:

```text
lesson_hero
lesson_goals
reading_section
inline_example
vocab_strip
dialogue_card
audio_moment
pattern_callout
noticing_prompt
micro_check
practice_bridge
lesson_recap
```

Example shape:

```ts
interface LessonPageBlock {
  slug: string
  blockType: LessonPageBlockType
  sourceRefs: SourceRef[]
  contentUnitSlugs: string[]
  capabilityKeys?: string[]
  emitsSourceProgress?: SourceProgressEvent[]
  metadata: Record<string, unknown>
  reviewStatus: 'draft' | 'approved' | 'rejected' | 'deferred'
}
```

Rules:

- Lesson blocks preserve source page/section provenance.
- Lesson blocks may reference capabilities, but must not activate them directly.
- Source progress events from lesson blocks feed the Pedagogy Planner.
- The lesson reader can render blocks without knowing raw textbook structure.
- The lesson page should feel like a modern web lesson, not a PDF reconstruction.

### 5.4 Linguistic Enrichment

Add the linguistic information needed for capability planning.

Vocabulary and phrases:

- learner-language meaning, represented as `meaning:l1`
- optional additional meanings such as `meaning:nl` or `meaning:en`
- part of speech
- accepted answer variants
- semantic group
- register
- usage note
- example context

Dialogue lines:

- speaker
- role/context
- learner-language translation, represented as `translation:l1`
- register notes
- cloze eligibility
- roleplay eligibility
- audio eligibility

Grammar patterns:

- pattern slug
- learner-language explanation, represented as `pattern_explanation:l1`
- examples
- confusion group
- prerequisites
- contrast patterns

Morphology patterns:

- root forms
- derived forms
- affix family
- allomorph rule
- semantic role
- examples
- exceptions
- contrast families

Podcast segments:

- transcript
- translation
- timecodes
- known-word coverage estimate
- target phrases
- gist question candidates
- audio quality status

### 5.5 Capability Planning

Generate `capabilities.ts` from content units and enrichment.

Example shape:

```ts
export const capabilities = [
  {
    canonicalKey: 'cap:v1:item:lesson-01/makan:text_recognition:id_to_l1:text:nl',
    sourceUnitSlug: 'makan',
    capabilityType: 'text_recognition',
    skillType: 'recognition',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: ['meaning:l1'],
    requiredSourceProgress: 'section_exposed',
    prerequisites: [],
    activationPolicy: 'default_intro',
    reviewStatus: 'approved',
    projectionVersion: 'capability-v1',
  },
]
```

Capability planner rules:

- Generate only capabilities that are pedagogically meaningful for the unit.
- Generate deterministic canonical keys using the identity contract in the architecture spec.
- Capabilities may be generated as dormant if not yet appropriate for the learner.
- Capabilities may be marked exposure-only when useful for input but not FSRS review.
- Every capability must declare required artifacts.
- Every lesson-sequenced capability must declare `requiredSourceProgress`.
- Every capability must declare at least one allowed exercise family or defer to resolver defaults.
- Every capability must declare learner language when any artifact is language-dependent.
- Any incompatible change to a capability contract must create a new canonical key or an explicit alias/migration rule.

Source progress values:

```text
none
opened
section_exposed
intro_completed
heard_once
pattern_noticing_seen
guided_practice_completed
lesson_completed
```

Recommended defaults:

```text
text_recognition:
  requiredSourceProgress = section_exposed

form_recall:
  requiredSourceProgress = intro_completed

audio_recognition:
  requiredSourceProgress = heard_once

contextual_cloze:
  requiredSourceProgress = section_exposed

pattern_recognition:
  requiredSourceProgress = pattern_noticing_seen

pattern_production:
  requiredSourceProgress = guided_practice_completed

podcast segment exposure:
  requiredSourceProgress = none
```

Pipeline responsibility stops at declaring the exposure requirement. The Pedagogy Planner decides whether the learner's actual source progress and evidence satisfy that requirement.

### 5.5.1 Draft Contract Validation

Run draft validation immediately after capability planning.

Draft validation answers:

- Does every capability have a stable canonical key?
- Do required artifacts use known typed artifact kinds?
- Do prerequisites point to planned or existing capabilities?
- Does every lesson-sequenced capability declare a valid required source progress value?
- Is the capability in the MVP set or explicitly deferred?
- Can the resolver theoretically render at least one allowed exercise family if artifacts are later approved?

Draft validation does not require every artifact to exist yet. It prevents the team from authoring exercises for an invalid or unowned capability plan.

### 5.6 Exercise Asset Generation

Generate only assets that require linguistic judgment.

Runtime-generated exercises:

- basic recognition MCQ
- typed recall
- simple listening MCQ
- basic dictation
- runtime cloze when approved cloze context exists

Pipeline-authored assets:

- high-quality cloze contexts
- grammar explanations
- contrast pairs
- sentence transformations
- constrained translations
- morphology root-to-derived prompts
- allomorph drills
- dialogue roleplay prompts
- podcast gist/detail questions
- transcript gap prompts
- shadowing line packages

Rule:

```text
If quality depends on linguistic judgment, author and review it in the pipeline.
If quality depends on selecting from known facts, generate it at runtime.
```

---

## 6. Capability Contract Validation

Final contract validation runs before publish, after human review and exercise asset generation. It is stricter than draft validation.

### 6.1 General Rules

For every capability:

- required artifacts must exist
- artifacts must be approved or explicitly allowed as draft for admin preview only
- at least one exercise must be resolvable
- prerequisites must refer to existing capabilities
- blocked capabilities must not publish as active
- exposure-only capabilities must not create FSRS state
- language-dependent artifacts must match the learner language of the capability
- readiness is fail-closed for capability sessions: unknown or stale artifact status means blocked

### 6.2 Vocabulary Contracts

```text
text_recognition:
  requires meaning:l1

meaning_recall:
  requires meaning:l1, accepted_answers:l1

form_recall:
  requires meaning:l1, base_text, accepted_answers:id

contextual_cloze:
  requires cloze_context, cloze_answer, translation:l1

cloze_mcq:
  requires cloze_context, cloze_answer, accepted_answers:id

audio_recognition:
  requires audio_clip, meaning:l1

dictation:
  requires audio_clip, accepted_answers:id
```

### 6.3 Dialogue Contracts

```text
dialogue_text_recognition:
  requires translation:l1

dialogue_cloze:
  requires translation:l1, cloze_context, cloze_answer, dialogue_speaker_context

dialogue_role_response:
  requires dialogue_speaker_context, accepted_answers:id, production_rubric

dialogue_shadowing:
  requires audio_clip, transcript_segment, dialogue_speaker_context
```

Short or formulaic dialogue lines may remain exposure-only or display-only if they are not good review targets.

### 6.4 Morphology Contracts

```text
pattern_recognition:
  requires pattern_explanation:l1, pattern_example

derived_to_root:
  requires root_derived_pair

root_to_derived:
  requires root_derived_pair, allomorph_rule, accepted_answers:id

affix_contrast:
  requires minimal_pair, pattern_explanation:l1, cloze_answer

pattern_sentence_production:
  requires production_rubric, accepted_answers:id, pattern_explanation:l1
```

### 6.5 Grammar Contracts

```text
contrast_pair:
  requires minimal_pair, cloze_answer, pattern_explanation:l1

sentence_transformation:
  requires pattern_example, production_rubric, accepted_answers:id, pattern_explanation:l1

constrained_translation:
  requires translation:l1, pattern_example, accepted_answers:id, pattern_explanation:l1

pattern_cloze:
  requires cloze_context, cloze_answer, pattern_explanation:l1
```

### 6.6 Podcast Contracts

```text
segment_exposure:
  requires audio_segment, transcript_segment
  no FSRS state

segment_gist:
  requires audio_segment, transcript_segment, podcast_gist_prompt, cloze_answer

phrase_audio_recognition:
  requires audio_segment, timecoded_phrase, meaning:l1

phrase_dictation:
  requires audio_clip, accepted_answers:id

shadowing:
  requires audio_clip, transcript_segment
```

Podcast capabilities should be conservative. Long segments should usually be exposure-only unless transformed into short, targeted capabilities.

### 6.7 Typed Artifact Registry

The pipeline must use typed artifact kinds, not ad hoc strings. The initial registry should align with the architecture spec:

```text
meaning:l1
meaning:nl
meaning:en
translation:l1
accepted_answers:l1
accepted_answers:id
base_text
cloze_context
cloze_answer
exercise_variant
audio_clip
audio_segment
transcript_segment
root_derived_pair
allomorph_rule
pattern_explanation:l1
pattern_example
minimal_pair
dialogue_speaker_context
podcast_gist_prompt
timecoded_phrase
production_rubric
```

Artifact statuses:

```text
draft
approved
blocked
deprecated
```

Only `approved` artifacts can satisfy review-ready contracts. Admin preview may render draft artifacts, but the publish gate and capability session path must not. `exposure_only` is a capability readiness state, not an artifact quality status.

### 6.8 Ownership Matrix

This pipeline implements the ownership matrix from the architecture spec.

```text
Capability Catalog:
  owns canonical capability identity, source provenance, and projection diffs

Capability Contract:
  owns required artifacts, readiness, exposure-only classification, and fail-closed blocking

Pedagogy Planner:
  owns activation timing, prerequisites, load budgets, and progression rules

Exercise Resolver:
  owns choosing a renderable exercise for a ready capability

Review Processor:
  owns answer events, idempotency, FSRS updates, and learner state writes

Publisher:
  owns idempotent database writes and publish reports
```

The pipeline must not let ownership drift. For example, the publisher may run validation, but it does not invent readiness rules; those belong to the Capability Contract module.

---

## 7. Review Roles

### 7.1 Structurer

Owns:

- section structure
- content unit extraction
- translations
- register notes
- source traceability

### 7.2 Capability Planner

Owns:

- capability list
- prerequisites
- activation policy
- exposure-only classification
- difficulty metadata

### 7.3 Exercise Author

Owns:

- cloze contexts
- morphology drills
- grammar variants
- dialogue roleplay prompts
- podcast comprehension prompts

### 7.4 Reviewer

Owns:

- language correctness
- pedagogical usefulness
- ambiguity checks
- contract compliance
- level fit

### 7.5 Publisher

Owns:

- idempotent publish
- contract validation
- database writes
- post-publish health checks
- report generation

---

## 8. Publishing Behavior

Publish should proceed in this order:

1. Load staging files.
2. Validate source metadata.
3. Validate content units.
4. Validate capability plan shape and canonical keys.
5. Validate artifacts.
6. Validate final capability contracts.
7. Upsert content units.
8. Upsert capabilities by canonical key.
9. Upsert fact and media artifacts after resolving capability canonical keys to capability IDs.
10. Upsert authored exercise assets.
11. Upsert exercise-asset artifact links after referenced exercise assets exist.
12. Mark publish state in staging.
13. Run post-publish health audit.

Failure behavior:

- Contract failures block publish for the affected capability.
- Critical source failures block the whole lesson/source.
- Non-critical optional artifacts may mark capabilities as blocked or exposure-only.
- Publish report must list every skipped, blocked, deferred, and exposure-only capability.
- During script-only phases, blocked capabilities may exist only in the publish report.
- Once `learning_capabilities` exists, blocked capabilities should be materialized with `readiness_status = blocked` or equivalent so diagnostics can explain why they are unavailable.
- Blocked materialized capabilities must never create learner FSRS state.

---

## 9. Content Health Audit

Add a recurring audit script independent of publishing.

```bash
bun scripts/check-content-health.ts
```

Audit categories:

- active capabilities with missing artifacts
- capabilities with no resolvable exercise
- FSRS states pointing to inactive/blocked capabilities
- audio capabilities with missing storage object
- cloze capabilities with invalid blank
- morphology capabilities with missing answer key
- podcast capabilities with bad timecodes
- orphaned content units
- deprecated artifacts still referenced by active capabilities

Output:

```text
PASS / WARN / CRITICAL
counts by source
sample rows
suggested repair action
```

This becomes the regression guard for the 2026-04-24 incident class.

---

## 10. Admin UI: Content Workshop

The content pipeline needs a web UI, not only scripts.

Pages:

- Source overview
- Lesson page blocks
- Content units
- Capabilities
- Contract health
- Exercise assets
- Audio QA
- Publish report

Capability card should show:

```text
Capability: root_to_derived tulis -> menulis
Status: blocked
Missing: allomorph_rule explanation
Allowed exercises: none
Suggested action: route to morphology author
```

Ready capability card:

```text
Capability: audio_recognition makan
Status: ready
Artifacts: meaning:l1, audio_clip
Allowed exercises: listening_mcq, hear_and_match
Activation: after text recognition success >= 1
```

The first admin version should stay small: source overview, capability health, and exercise preview. Full authoring workflows can wait until the health and publish gates are trusted.

Lesson page block review can start as read-only preview plus source-progress diagnostics. Full drag-and-drop lesson authoring is not required for the MVP.

---

## 11. Supabase Requirements

Target schema additions are described in the architecture spec. First implementation can be lighter:

First DB migration minimum tables, aligned with roadmap Phase 4:

- `learning_capabilities`
- `capability_artifacts`
- `learner_capability_state`

Optional until later:

- `content_units` if existing `learning_items` / `grammar_patterns` remain the source units
- `capability_review_events` if current `review_events` can be extended first

RLS:

- Content tables: authenticated read, service role write.
- Learner source progress: row-owner read/write with `WITH CHECK (user_id = auth.uid())` for direct learner progress capture.
- Learner capability state: row-owner read; writes only through the Review Processor RPC/write owner.
- Review events: row-owner read; inserts only through the Review Processor RPC/write owner.

Health checks:

- verify new tables
- verify grants
- verify RLS
- verify required indexes
- verify PostgREST schema cache after migration
- verify unique canonical keys
- verify foreign-key integrity between capabilities and artifacts where the referenced artifact is materialized
- verify lookup/check constraints for capability types, artifact kinds, activation states, quality statuses, directions, and modalities

---

## 12. Open Questions

Phase-specific non-blocking questions:

1. Should `capabilities.ts` be human-reviewed or generated and reviewed via UI only?
2. Should podcast phrase mining require explicit learner approval before activation?
3. Should morphology patterns be authored manually first, then later generated from corpus analysis?
4. How strict should distractor-pool validation be for beginner lessons with small vocabulary pools?
