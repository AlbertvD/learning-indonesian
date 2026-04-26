# Content Pipeline and Quality Gates

Audience: a future content creation session, linguist agent, reviewer, or developer extending the pipeline.

This document explains how the content pipeline is intended to create high-quality Indonesian learning content and how the current branch supports that with staged files, capability projection, validation, review roles, and publish gates.

## 1. Pipeline Goal

The content pipeline should not merely import textbook rows or generate exercises. It should prove that every reviewable learning capability is:

```text
linguistically meaningful
pedagogically appropriate
backed by approved artifacts
renderable as at least one exercise
safe to schedule for the learner
traceable back to a source
```

The core failure the new pipeline prevents is this:

```text
content exists in the database
FSRS schedules it
the exercise UI cannot render it correctly
```

The pipeline solves that by making capabilities and contracts explicit before content becomes reviewable.

## 2. Current Repository Shape

Textbook-derived staged content lives under:

```text
scripts/data/staging/lesson-N/
```

Capability-era examples include:

```text
scripts/data/staging/lesson-1/content-units.ts
scripts/data/staging/lesson-1/capabilities.ts
scripts/data/staging/lesson-1/exercise-assets.ts
scripts/data/staging/lesson-1/lesson-page-blocks.ts
scripts/data/staging/lesson-9/morphology-patterns.ts
scripts/data/staging/podcast-warung-market/podcast-segments.ts
scripts/data/staging/podcast-warung-market/podcast-phrases.ts
scripts/data/staging/podcast-warung-market/capabilities.ts
scripts/data/staging/podcast-warung-market/exercise-assets.ts
```

Pipeline support files include:

```text
scripts/lib/content-pipeline-output.ts
scripts/generate-staging-files.ts
scripts/lint-staging.ts
scripts/publish-approved-content.ts
scripts/materialize-capabilities.ts
scripts/check-capability-health.ts
```

Tests include:

```text
scripts/__tests__/capability-staging.test.ts
scripts/__tests__/content-units-staging.test.ts
scripts/__tests__/lesson-page-blocks.test.ts
scripts/__tests__/materialize-capabilities.test.ts
scripts/__tests__/check-capability-health.test.ts
```

## 3. Pipeline Stages

The target pipeline has these stages:

```text
1. Intake
2. Source normalization
3. Content unit extraction
4. Linguistic enrichment
5. Capability planning
6. Draft contract validation
7. Exercise asset generation
8. Review
9. Publish gate
10. Database write
11. Post-publish health audit
```

The current branch implements the capability-era staging shapes, validators, materialization, and migrations needed to start this process. It does not yet provide a complete web-based Content Workshop or fully automated multi-agent orchestration.

## 4. Intake

Intake records what source is being processed.

For textbook lessons, intake should capture:

```text
source id
lesson number
title
source pages or sections
learner language
level
license/source ownership
```

For podcasts or stories, intake should additionally capture:

```text
audio source
transcript source
timecodes
voice/audio policy
usage rights
```

Quality purpose:

```text
Every generated item must be traceable back to a source.
No reviewable content should exist without provenance.
```

## 5. Source Normalization

Source normalization turns raw content into stable, reviewable input.

For textbook lessons:

```text
extract lesson sections
normalize Indonesian text
separate Dutch explanations/translations
preserve source order
preserve page/section references
```

For podcasts:

```text
align transcript and audio
split into segments
identify phrases worth mining
preserve timecodes
mark long segments as exposure-only unless transformed into targeted prompts
```

Quality purpose:

```text
Agents and reviewers work from stable source slices instead of raw, ambiguous material.
```

## 6. Content Unit Extraction

Content units are teachable objects. They are not automatically reviewable.

Supported or planned unit types:

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

A content unit should include:

```text
stable slug
unit type
canonical Indonesian text
normalized Indonesian text
source references
learner language
level
review status
metadata
```

Current implementation examples:

```text
lesson-1/content-units.ts
lesson-9/morphology-patterns.ts
podcast-warung-market/podcast-segments.ts
podcast-warung-market/podcast-phrases.ts
```

Quality purpose:

```text
The pipeline can review and reason about a word, phrase, pattern, or podcast segment before it generates review tasks.
```

## 7. Lesson Page Blocks

Lesson page blocks are learner-facing lesson content. They create exposure and source progress, not FSRS review state.

Examples:

```text
hero
section
exposure
practice_bridge
recap
```

Current implementation:

```text
scripts/data/staging/lesson-1/lesson-page-blocks.ts
src/lib/lessons/lessonExperience.ts
src/components/lessons/LessonReader.tsx
```

A lesson page block can reference:

```text
source refs
content unit slugs
capability keys
source progress event
payload for UI rendering
```

Quality purpose:

```text
The learner can experience the lesson as a modern web page before any content becomes review debt.
```

Key rule:

```text
Lesson reader emits source progress. It does not activate FSRS.
```

## 8. Linguistic Enrichment

Linguistic enrichment adds the information needed to make content useful and safe.

Vocabulary enrichment:

```text
Dutch meaning
accepted answers
part of speech
semantic group
usage note
example context
register note
```

Grammar enrichment:

```text
pattern explanation
examples
confusion group
prerequisites
contrast patterns
```

Morphology enrichment:

```text
root
surface form
affix family
allomorph rule
exceptions
formal/spoken register
example sentence
```

Podcast enrichment:

```text
transcript segment
translation
timecoded phrase
gist prompt
known-word estimate
audio quality status
```

Quality purpose:

```text
Exercises should be generated from reviewed linguistic facts, not from guesses scattered through UI code.
```

## 9. Capability Planning

Capability planning decides what concrete learner skills a content unit can produce.

Examples:

```text
text_recognition
meaning_recall
form_recall
contextual_cloze
audio_recognition
dictation
podcast_gist
pattern_recognition
pattern_contrast
root_derived_recognition
root_derived_recall
```

Current implementation:

```text
src/lib/capabilities/capabilityTypes.ts
src/lib/capabilities/canonicalKey.ts
src/lib/capabilities/capabilityCatalog.ts
scripts/data/staging/*/capabilities.ts
```

A capability declares:

```text
canonical key
source kind
source ref
capability type
skill type
direction
modality
learner language
required artifacts
source progress requirement
prerequisites
difficulty
goal tags
projection version
```

Quality purpose:

```text
The pipeline explicitly states what the learner may practice and under what conditions.
```

## 10. Capability Contracts

A capability contract says what must exist before the capability can be scheduled or rendered.

Current implementation:

```text
src/lib/capabilities/artifactRegistry.ts
src/lib/capabilities/capabilityContracts.ts
scripts/check-capability-health.ts
```

Artifact kinds include:

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

Readiness statuses:

```text
ready
blocked
exposure_only
deprecated
unknown
```

Quality purpose:

```text
A capability with missing artifacts is blocked, not silently scheduled.
```

## 11. Exercise Asset Generation

The pipeline should generate or author exercise assets only where quality requires linguistic judgment.

Runtime-generated exercise families:

```text
recognition_mcq
typed_recall
basic listening_mcq
basic dictation
simple cloze when context exists
```

Pipeline-authored exercise assets:

```text
high-quality cloze contexts
contrast pairs
sentence transformations
constrained translations
morphology root-derived prompts
allomorph drills
podcast gist/detail questions
dialogue roleplay prompts
shadowing packages
```

Current implementation examples:

```text
scripts/data/staging/lesson-1/exercise-assets.ts
scripts/data/staging/podcast-warung-market/exercise-assets.ts
src/lib/exercises/exerciseResolver.ts
```

Quality rule:

```text
If quality depends on linguistic judgment, author and review it in the pipeline.
If quality depends on selecting from known approved facts, generate it at runtime.
```

## 12. Agents and Review Roles

The current repo does not contain a full multi-agent orchestration runtime. It does, however, define clear roles that can be performed by humans or AI agents in future content sessions.

### Structurer Agent

Owns:

```text
source segmentation
content unit extraction
source refs
lesson page block draft
basic translation alignment
```

Checks:

```text
no source-less content
stable slugs
correct section order
no accidental duplicate units
```

### Linguist Agent

Owns:

```text
Dutch meanings
register notes
part of speech
accepted answers
pattern explanations
morphology rules
ambiguity detection
```

Checks:

```text
meaning is correct for context
answer variants are not too broad
register is marked where relevant
forms are standard or explicitly colloquial
```

### Capability Planner Agent

Owns:

```text
capability list
canonical key stability
required artifacts
source progress requirements
prerequisites
exposure-only decisions
```

Checks:

```text
no reviewable capability without a contract
no production task before recognition prerequisites
lesson-sequenced capabilities require source progress
```

### Exercise Author Agent

Owns:

```text
cloze quality
contrast pairs
sentence transformations
constrained translation prompts
morphology drills
podcast comprehension prompts
```

Checks:

```text
prompt has one intended answer or clear accepted variants
wrong options are plausible but not unfair
exercise tests the intended capability
exercise level matches the learner
```

### Reviewer Agent

Owns:

```text
final language correctness
pedagogical usefulness
ambiguity review
artifact approval
contract compliance
```

Checks:

```text
approved artifacts satisfy contracts
blocked items explain why they are blocked
deferred items are not published as reviewable
```

### Publisher Agent

Owns:

```text
running validation
idempotent database writes
publish report
post-publish health checks
schema/cache checks
```

Checks:

```text
publish does not create broken capabilities
capability keys are unique
exercise assets resolve
blocked/exposure-only statuses are preserved
```

## 13. Review Gates

The content pipeline should use multiple gates.

### Gate 1: Shape Validation

Runs on staged files.

Checks:

```text
required files exist
exports have expected names
content unit slugs are stable
lesson page blocks have valid source refs
capability keys follow grammar
known artifact kinds only
```

Current support:

```text
scripts/lint-staging.ts
scripts/__tests__/capability-staging.test.ts
scripts/__tests__/content-units-staging.test.ts
scripts/__tests__/lesson-page-blocks.test.ts
```

### Gate 2: Draft Contract Validation

Runs after capability planning.

Checks:

```text
every capability has a stable key
required artifacts are valid typed artifact kinds
source progress requirements are valid
prerequisites point to planned or existing capabilities
capability has a plausible resolver path
```

This gate can run before all artifacts are final. Its job is to catch impossible plans early.

### Gate 3: Linguistic Review

Runs before approval.

Checks:

```text
translation correctness
register fit
accepted answer quality
ambiguity
level fit
pattern explanation accuracy
morphology rule correctness
```

Review result states:

```text
draft
approved
blocked
deprecated
rejected
deferred
```

Only approved artifacts can satisfy review-ready contracts.

### Gate 4: Final Contract Validation

Runs before publish.

Checks:

```text
required artifacts exist
required artifacts are approved
at least one exercise family can render
feature/availability gates allow rendering
exposure-only capabilities do not create FSRS state
blocked capabilities do not become active
language-dependent artifacts match learner language
```

Current support:

```text
src/lib/capabilities/capabilityContracts.ts
scripts/check-capability-health.ts
```

### Gate 5: Publish Gate

Runs inside publishing.

Checks:

```text
idempotent upsert order
foreign key resolution
canonical key uniqueness
exercise variant references
source progress references
publish report completeness
```

Current support:

```text
scripts/publish-approved-content.ts
scripts/materialize-capabilities.ts
scripts/migrations/2026-04-25-*.sql
```

Important capability-era boundary:

```text
publish-approved-content.ts writes catalog rows, but capability rows remain readiness_status = unknown and publication_status = draft.
promote-capabilities.ts is the reviewed release gate that can move validated capabilities to ready/published.
capability sessions can only schedule ready/published capabilities.
```

This means publishing makes content queryable for inspection and health checks, but it does not create learner review debt. After publishing, run:

```text
npx tsx scripts/promote-capabilities.ts --lesson <N> --dry-run
npx tsx scripts/promote-capabilities.ts --lesson <N> --apply
```

Only run the apply command after the dry-run lists the exact capabilities to promote and the reviewer accepts that report.

### Gate 6: Post-Publish Health Audit

Runs against database-backed content.

Checks:

```text
active capabilities with missing artifacts
capabilities with no resolvable exercise
orphaned learner state
missing audio objects
invalid cloze blanks
bad podcast timecodes
blocked capabilities accidentally active
```

Current support is the first capability health script. A broader database-backed recurring audit remains a next step.

## 14. Exercise Types Created by the Pipeline

The pipeline can create or support these exercise categories.

### Vocabulary

```text
recognition_mcq:
  generated from Indonesian form plus Dutch meaning

typed_recall:
  generated from Dutch meaning plus accepted Indonesian forms

meaning_recall:
  generated from Indonesian form plus accepted Dutch meanings

cloze:
  requires approved cloze context and answer

cloze_mcq:
  requires approved cloze context, answer, and options
```

### Audio

```text
listening_mcq:
  requires audio clip plus meaning

dictation:
  requires audio clip plus accepted Indonesian answer
```

### Grammar and Patterns

```text
contrast_pair:
  authored minimal contrast and explanation

sentence_transformation:
  authored source sentence, instruction, accepted answers

constrained_translation:
  authored Dutch prompt, required pattern, accepted answers, disallowed shortcuts

pattern_cloze:
  authored cloze that tests a pattern rather than only vocabulary
```

### Morphology

```text
derived_to_root:
  recognize derived form and identify root

root_to_derived:
  produce derived form from root

allomorph_choice:
  choose the correct affix shape

affix_contrast:
  distinguish active/passive/derivational forms
```

### Podcast and Listening Input

```text
segment_exposure:
  exposure-only by default

segment_gist:
  audio segment plus transcript plus gist prompt

phrase_audio_recognition:
  timecoded phrase plus meaning

phrase_dictation:
  short phrase audio plus accepted Indonesian answer

shadowing:
  audio clip plus transcript segment, initially self-rated or exposure-only
```

## 15. How Quality Is Enforced

Quality is enforced by making every layer explicit:

```text
source refs prevent orphaned content
content units prevent raw text dumping
capabilities prevent vague scheduling
contracts prevent missing artifacts
review statuses prevent draft content from becoming reviewable
exercise resolver prevents unrenderable tasks
review processor prevents non-idempotent state writes
health checks detect broken content after publish
```

The deepest rule is:

```text
A capability path must fail closed.
```

If the pipeline cannot prove readiness, the content should become:

```text
blocked
exposure_only
deferred
```

It should not become active FSRS review work.

## 16. Current Limitations and Next Pipeline Steps

Built now:

```text
capability staging examples
content unit staging examples
lesson page block staging examples
podcast and morphology pilot staging
capability projection and identity
contract validation
health script foundation
publish/materialization support
migrations for core capability tables and review RPC
local preview for lesson experience
```

Still needed before making this the default content operations system:

```text
real Supabase publish smoke test
admin Content Workshop UI
database-backed recurring health audit
full artifact approval workflow
agent prompt templates/checklists stored in repo
publish reports written as durable artifacts
end-to-end capability review commit test with real rendered exercises
```

## 17. Safe Operating Procedure for a New Content Session

1. Choose a source scope, such as one lesson or one podcast segment.
2. Create or update staged content units.
3. Add lesson page blocks for learner exposure.
4. Add linguistic enrichments and accepted answers.
5. Generate capability drafts with deterministic canonical keys.
6. Run staging tests and linting.
7. Generate or author exercise assets only where needed.
8. Review all language-sensitive artifacts.
9. Run capability contract validation.
10. Publish to a test Supabase instance.
11. Run health checks.
12. Preview the lesson/experience in browser.
13. Only then consider enabling learner-facing flags for that content.
