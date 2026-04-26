# Capability-Based Learning Architecture

**Date:** 2026-04-25
**Status:** Draft v1
**Scope:** Target architecture for redesigning Learning Indonesian around deep modules, learning capabilities, FSRS scheduling, pattern mastery, audio, podcasts, morphology, and richer learning experiences.
**Context:** Follows `docs/research/2026-04-25-skill-rotation-and-pedagogical-sequencing.md` and extends it into an app-level target architecture.

---

## 1. Goal

Create a pedagogically sound Indonesian mastery system that can grow beyond vocabulary review into listening, dialogue, morphology, grammar patterns, podcasts, fluency, and controlled production without accumulating brittle special cases.

The app should answer three questions for the learner:

1. What can I do now?
2. What should I learn or strengthen next?
3. What experience will move me forward today?

FSRS remains central, but only for scheduling active memory traces. Curriculum sequencing, prerequisite gating, content readiness, and learning-experience composition are app-level responsibilities.

---

## 2. Architectural Thesis

The current system is too centered on `learning_items` plus `stage`. That makes the session builder infer too much from item type and stage:

- Which skill is due?
- Which exercise can render?
- Which artifacts are present?
- Is the item pedagogically ready for production?
- Does the learner need text, audio, morphology, or grammar practice?

The target architecture replaces item/stage-driven scheduling with capability-driven scheduling.

```text
Content sources
  -> content units
    -> learning capabilities
      -> capability contracts
        -> pedagogy planner
          -> FSRS scheduler
            -> session composer
              -> exercise resolver
                -> experience player
                  -> mastery model
```

The key design move: a `learning_item`, `grammar_pattern`, `podcast_segment`, or `dialogue_line` is not itself what gets scheduled. A concrete `learning_capability` is scheduled.

Example:

```text
content unit: makan

capabilities:
- recognize text form: makan -> eten
- recognize audio form: hear makan -> eten
- recall form: eten -> makan
- contextual cloze: Saya ___ nasi -> makan
- dictation: hear makan -> type makan
```

---

## 3. Deep Module Vocabulary

This design uses the architecture vocabulary from `improve-codebase-architecture`:

- **Module**: anything with an interface and implementation.
- **Interface**: everything a caller must know to use the module correctly, including invariants and error modes.
- **Seam**: where an interface lives; a place behavior can vary without editing callers.
- **Adapter**: a concrete implementation behind a seam.
- **Depth**: leverage at the interface. A deep module hides a lot of behavior behind a small interface.
- **Leverage**: what callers get from depth.
- **Locality**: what maintainers get from depth.

The redesign should avoid creating many shallow modules that merely rename existing complexity. A module earns its keep if deleting it would scatter complexity across several callers.

---

## 4. Core Domain Concepts

### 4.1 Content Source

A source of learning material.

Examples:

- textbook lesson
- dialogue section
- podcast episode
- story transcript
- grammar pattern list
- morphology pattern list
- manually authored exercise set

A content source is not schedulable.

### 4.2 Content Unit

A normalized teachable object extracted from a content source.

Examples:

- word: `makan`
- phrase: `mau pesan`
- sentence: `Saya mau pesan nasi goreng.`
- dialogue line
- podcast segment
- grammar pattern: `di- passive`
- morphology pattern: `meN- nasal assimilation`
- affixed form pair: `tulis -> menulis`

A content unit may generate zero or more capabilities.

### 4.3 Learning Capability

A concrete thing the learner can do.

Examples:

- recognize `makan` in text
- hear `makan` and choose `eten`
- type `makan` from Dutch prompt
- complete a cloze sentence with `makan`
- parse `menulis` into `meN- + tulis`
- derive `menulis` from `tulis`
- distinguish `menulis` from `ditulis`
- understand the gist of a podcast segment
- shadow a dialogue line

Capabilities are the primary scheduling unit.

### 4.4 Capability Contract

A declaration of what artifacts are required before a capability may become active or renderable.

Examples:

```text
text recognition requires: meaning:l1
form recall requires: meaning:l1, base_text, accepted_answers:id
cloze requires: cloze_context, cloze_answer
listening recognition requires: audio_clip, meaning:l1
phrase dictation requires: audio_clip, accepted_answers:id
morphology derivation requires: root_derived_pair, allomorph_rule, accepted_answers:id
podcast gist requires: audio_segment, transcript_segment, podcast_gist_prompt, cloze_answer
```

### 4.5 Capability State

Learner-specific state for an active capability.

Contains:

- FSRS stability
- FSRS difficulty
- next due time
- last reviewed time
- success/failure/lapse counts
- activation state
- optional mastery flags

### 4.6 Derived Mastery

A learner-facing summary derived from capabilities.

Examples:

- vocabulary item mastery
- pattern mastery
- listening mastery
- dialogue readiness
- morphology production strength

Stages such as `new`, `anchoring`, `retrieving`, `guided_use`, and `maintenance` may remain as derived UI labels, but they should not be the source of scheduling truth.

---

## 5. Capability Identity Contract

Capability identity is load-bearing. FSRS state, review events, mastery, migration, and analytics all depend on stable capability IDs.

A capability ID must be deterministic, stable across reruns, language-aware when the learner-language artifact matters, version-aware when the reviewed task changes materially, and aliasable when a capability is renamed or split.

The first implementation should use canonical text keys, then materialize UUID rows later without changing the canonical key.

Canonical key grammar:

```text
cap:v1:<source_kind>:<source_ref>:<capability_type>:<direction>:<modality>:<learner_language_or_none>
```

Rules:

- `cap` and `v1` are literal prefixes.
- `source_kind` is one of `item`, `pattern`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, or `affixed_form_pair`.
- `source_ref` is a stable source-unit reference, not learner-facing text.
- For existing DB-backed content, `source_ref` is `<table>/<primary_key>`, for example `learning_items/8b8c...`.
- For staged content before DB insertion, `source_ref` is `<source_id>/<unit_slug>`, for example `lesson-01/makan`.
- Any literal `:` or `%` inside a segment must be percent-encoded. Slash is allowed only inside `source_ref`.
- `learner_language_or_none` is `nl`, `en`, or `none`. Use `none` only when the task has no learner-language artifact.
- Material changes to capability type, direction, modality, learner language, or reviewed task semantics require a new key unless an alias proves equivalence.
- Non-material text edits, typo fixes, source metadata edits, or artifact improvements keep the key but update fingerprints.

Examples:

```text
cap:v1:item:learning_items/8b8c...:text_recognition:id_to_l1:text:nl
cap:v1:item:learning_items/8b8c...:form_recall:l1_to_id:text:nl
cap:v1:item:learning_items/8b8c...:audio_recognition:audio_to_l1:audio:nl
cap:v1:pattern:grammar_patterns/meN-active:root_to_derived:root_to_form:text:nl
cap:v1:podcast_segment:warung-01/42000-56000:segment_gist:audio_to_gist:audio:nl
```

Every projected capability carries:

```ts
projectionVersion: 'capability-v1'
canonicalKey: string
sourceFingerprint: string
artifactFingerprint: string
```

When a capability changes identity:

- rename: create an alias from old key to new key only if the reviewed task is unchanged
- split: retire the old key and map to one or more replacement keys with `migration_confidence`
- merge: map old keys to a replacement only when the reviewed task is equivalent
- incompatible change: retire the old key; do not migrate FSRS state

Alias storage:

```text
old_canonical_key
new_canonical_key
alias_reason
migration_confidence
created_at
```

Fingerprint rules:

- `sourceFingerprint` changes when canonical source text, source references, or linguistic annotations change.
- `artifactFingerprint` changes when required artifacts, answer keys, audio clips, or accepted answers change.
- Fingerprint changes do not automatically change identity; they trigger compatibility checks.
- If compatibility checks fail, the old key is retired and the replacement key starts with fresh learner state.

When `learning_capabilities` becomes a table, UUID `id` is an internal row ID. The canonical key remains the durable external identity.

```sql
learning_capabilities (
  id uuid primary key,
  canonical_key text not null unique,
  projection_version text not null,
  ...
)
```

Early migration may store `capability_key text` in `learner_capability_state`. The roadmap must include an explicit key-to-UUID materialization, validation, and backfill step before foreign keys become authoritative.

---

## 6. Module Ownership Matrix

Several modules touch the question "can this be shown?" Ownership must be explicit to avoid shallow, duplicated abstractions.

| Decision | Owning module | Non-owner rule |
|---|---|---|
| What capabilities can exist for a content unit? | Capability Catalog | Does not inspect learner state or feature rollout |
| Are required artifacts present and approved? | Capability Contract | Does not decide whether the learner is ready |
| Is an exercise family globally enabled? | Availability Gate | Does not override blocked capability readiness |
| Should this learner activate a ready capability? | Pedagogy Planner | Does not update FSRS or render exercises |
| Which active capabilities are due? | FSRS Capability Scheduler | Does not choose exercise UI |
| Which exercise renders one capability? | Exercise Resolver | Must fail closed if capability readiness is not ready |
| How is an answer graded and persisted? | Review Processor | Owns atomic state/event update |
| What does mastery mean to the learner? | Mastery Model | Reads evidence; does not mutate scheduling state |

Capability readiness is fail-closed. Legacy `exercise_type_availability` may remain fail-open for old session paths, but capability-composed sessions must not schedule blocked capabilities.

---

## 7. Learner-Language Artifact Policy

The app is currently Dutch-first but has English profile/content support. The capability model must not hard-code `meaning_nl` unless the product explicitly becomes Dutch-only.

Target artifact notation:

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

Capability contracts should use `meaning:l1` when the current learner language is acceptable, and `meaning:nl` only when a Dutch-specific exercise or explanation is required. `accepted_answers:l1` stores accepted learner-language answers for meaning recall. `accepted_answers:id` stores accepted Indonesian-form answers for form recall, dictation, and production tasks.

For the single-user homelab case, the first MVP may set `l1 = nl`, but artifact kinds remain parameterized so English rows do not become accidental orphans.

---

## 8. Typed Artifact Registry

The target `capability_artifacts` model must not become an untyped pile of reference strings. The registry defines artifact kinds, quality states, and reference rules.

Initial artifact kinds:

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

Quality statuses:

```text
draft
approved
blocked
deprecated
```

Capability contracts may treat only `approved` artifacts as review-ready unless a mode explicitly allows admin preview. Use real foreign keys where referenced objects live in the app database. Use external URI/storage references only for raw media or source documents.

`exposure_only` is a capability readiness state, not an artifact quality status.

Contracts and examples must use only registry artifact kinds. Legacy or human-friendly terms such as `examples`, `target_answer`, `transcript`, `gist_prompt`, `root_derived_pairs`, `accepted_answers`, or `audio span` may appear in UI copy, but code and specs should map them to the registry names above.

---

## 9. Atomic Review Commit Contract

Capability reviews must be at least as reliable as the existing `apply_review_to_skill_state` path.

One review commit should atomically cover:

1. idempotency check
2. review event insert
3. capability FSRS state update
4. lapse/consecutive failure update
5. optional derived event enqueue for goals/mastery

Every answer report must include an idempotency key:

```text
session_id + session_item_id + attempt_number
```

Duplicate submits return the already-committed result.

The review processor must record the scheduler snapshot used by the exercise and compare it with current state. If state changed since session build, the processor must either apply an atomic additive update using current counters or reject and ask the client to refresh. The default should mirror the current safe behavior: update counters atomically server-side.

During migration, capability review commits should either write `review_events` with a `capability_key` extension, or write `capability_review_events` and maintain compatibility views for goals/progress. Do not switch session composition to capabilities until the review/write path is capability-aware.

---

## 10. Deep Module Candidates

### 10.1 Content Source Module

**Purpose:** Normalize source material into content units.

**Interface:**

```ts
loadContentBundle(scope: ContentScope): Promise<ContentBundle>
```

**Interface invariants:**

- Returns normalized content units, not raw source-specific rows.
- Keeps source provenance for every unit.
- Does not decide which capabilities are active.
- Does not perform FSRS scheduling.

**Hidden implementation:**

- Supabase rows
- staging files
- podcast transcripts
- audio timestamps
- lesson sections
- morphology pattern metadata
- grammar pattern metadata

**Adapters:**

- Supabase content adapter
- staging-file adapter
- podcast transcript adapter
- future import adapter

**Depth test:** If deleted, source-specific loading rules spread across planner, session composer, exercise resolver, and admin UI. This module is deep.

### 10.2 Capability Catalog Module

**Purpose:** Convert content units into capabilities.

**Interface:**

```ts
getCapabilities(bundle: ContentBundle): LearningCapability[]
getCapability(capabilityId: string): LearningCapability
```

**Interface invariants:**

- Capabilities are content-source agnostic.
- Every capability has a source unit, skill, direction, modality, prerequisites, and required artifacts.
- The catalog may describe dormant capabilities that are not yet active for the learner.
- Projection is deterministic and emits canonical capability keys.
- The same input bundle and projection version must emit the same capability set and diff.

**Hidden implementation:**

- item type rules
- grammar pattern rules
- morphology pattern rules
- dialogue rules
- podcast segment rules
- audio modality rules

**Depth test:** If deleted, every feature must rediscover which skills exist for each content type. This is the central deep module.

### 10.3 Capability Contract Module

**Purpose:** Prove a capability is safe to activate or schedule.

**Interface:**

```ts
validateCapability(
  capability: LearningCapability,
  artifacts: ArtifactIndex,
): CapabilityReadiness
```

**Readiness result:**

```ts
type CapabilityReadiness =
  | { status: 'ready'; allowedExercises: ExerciseKind[] }
  | { status: 'blocked'; missingArtifacts: ArtifactKind[]; reason: string }
  | { status: 'exposure_only'; reason: string }
  | { status: 'deprecated'; replacementKey?: string }
  | { status: 'unknown'; reason: string }
```

**Interface invariants:**

- Blocked capabilities must never be activated for FSRS review.
- Exposure-only content can appear in input/listening experiences but not as due review.
- Readiness must be deterministic for a given capability and artifact index.
- Readiness is fail-closed in all capability-composed sessions.

**Hidden implementation:**

- translation checks
- cloze checks
- audio checks
- transcript alignment checks
- distractor pool checks
- answer-key checks
- dialogue reviewability checks
- morphology example checks

**Depth test:** This module prevents schedulable-but-unrenderable content. Deleting it recreates the original incident class.

### 10.4 Pedagogy Planner Module

**Purpose:** Decide which ready capabilities should become active for the learner.

**Interface:**

```ts
planLearningPath(input: PedagogyInput): LearningPlan
```

**Interface invariants:**

- Only ready capabilities may be activated.
- Prerequisites must be respected unless explicitly overridden by a mode.
- Source progress gates must be respected for lesson-sequenced core content.
- New capability load must be bounded.
- FSRS does not decide introduction; it schedules after activation.
- Planner owns only activation eligibility, pacing, and prerequisite overrides.

**Hidden implementation:**

- lesson order
- source progress state
- prerequisite graph
- known-word coverage
- new-load pacing
- grammar readiness
- morphology sequencing
- podcast comprehensibility
- production unlock rules

**Example rules:**

- Do not activate phrase dictation before audio recognition.
- Do not activate `meN-` production before recognition and root parsing.
- Do not mine a podcast phrase if the segment has too many unknown words.
- Do not force productive recall on content that has only been seen once.

**Source progress gates:**

Lesson progress should gate new core content, but not as a single brittle `lesson_done` boolean. The planner should reason over source progress states:

```text
not_started
opened
section_exposed
intro_completed
guided_practice_completed
lesson_completed
```

Capabilities may declare a required source progress level:

```text
text_recognition:
  requires section_exposed

form_recall:
  requires intro_completed or text_recognition evidence

audio_recognition:
  requires heard_once and text_recognition introduced

pattern_recognition:
  requires pattern_noticing_seen or section_exposed

pattern_production:
  requires guided_practice_completed and recognition evidence
```

The rule is intentionally asymmetric:

- new lesson-sequenced capabilities normally require the learner to have reached the relevant lesson section
- old review, remediation, and targeted practice may use learner evidence instead of lesson progress
- podcasts and stories may be exposure-only before any mined capability becomes reviewable
- learner-selected exploration may create exposure, but should not automatically create FSRS debt

### 10.5 FSRS Capability Scheduler Module

**Purpose:** Schedule active capabilities.

**Interface:**

```ts
getDueCapabilities(request: DueRequest): Promise<DueCapability[]>
previewScheduleUpdate(review: CapabilityReviewPreview): SchedulePreview
```

**Interface invariants:**

- FSRS state belongs to a capability.
- A due capability must be reviewed with an exercise that advances that same capability.
- Multiple due capabilities for the same content unit may be spread across sessions to avoid unnatural repetition.
- The scheduler does not commit learner state. It computes due lists and schedule previews only.
- The Review Processor is the only module that writes review events and learner FSRS state.

**Hidden implementation:**

- FSRS parameters
- retrievability computation
- next due time
- stability/difficulty update
- lapse handling
- read adapters for learner capability state

### 10.6 Session Composer Module

**Purpose:** Compose a coherent learning experience.

**Interface:**

```ts
composeSession(request: SessionRequest): Promise<SessionPlan>
```

**Session modes:**

- daily
- quick
- backlog clear
- listening focus
- podcast
- morphology workshop
- pattern practice
- dialogue rehearsal
- productive recall

**Interface invariants:**

- Returns an ordered `SessionPlan`, not raw database rows.
- Does not know source-specific artifact details.
- Does not run FSRS itself.
- Does not grade answers.

**Hidden implementation:**

- warm input
- due capability selection
- new introduction selection
- grammar/pattern distribution
- podcast segment flow
- dialogue roleplay flow
- recap construction

### 10.7 Lesson Experience Module

**Purpose:** Render book-derived lessons as modern web-native learning pages and emit source progress events.

**Interface:**

```ts
getLessonExperiencePlan(request: LessonExperienceRequest): Promise<LessonExperiencePlan>
```

**Interface invariants:**

- Returns lesson page blocks, not raw textbook rows.
- Preserves source provenance without forcing a PDF-like UI.
- Emits source progress events; does not activate capabilities directly.
- May reference capability keys for practice bridges, but does not run FSRS.
- Must support mobile, tablet, and desktop layouts from the same plan.

**Hidden implementation:**

- editorial lesson flow
- section structure
- responsive layout hints
- source page references
- inline reveal configuration
- audio moments
- practice bridges
- source progress event mapping

**Example blocks:**

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

**Responsive expectations:**

- Mobile: single-column flow, large tap targets, inline/collapsible controls.
- Tablet: reading column with optional sticky rail or docked panels.
- Desktop: readable text column with side progress rail and companion panel.

**Depth test:** If deleted, textbook display rules, source progress recording, and practice bridge logic spread across lesson pages, session composer, pipeline output, and UI components.

### 10.8 Exercise Resolver Module

**Purpose:** Choose the best exercise render plan for a capability.

**Interface:**

```ts
resolveExercise(input: ExerciseResolutionInput): ExerciseRenderPlan
```

**Interface invariants:**

- The chosen exercise must advance the requested capability.
- Exercise type is an implementation detail, not the learning model.
- Fallbacks are explicit and contract-checked.
- The resolver must not revive blocked capabilities via fallback.

**Hidden implementation:**

- feature flags
- published exercise variants
- runtime-generated exercise options
- audio availability
- device preferences
- modality preferences

### 10.9 Review Processor Module

**Purpose:** Convert an answer into state changes.

**Interface:**

```ts
processAnswer(report: AnswerReport): Promise<ReviewOutcome>
```

**Interface invariants:**

- The report identifies the reviewed capability.
- The processor handles grading, FSRS rating inference, event logging, and schedule update.
- Callers do not manually update learner state.
- State update and review event persistence follow the atomic review commit contract.

**Hidden implementation:**

- answer normalization
- fuzzy matching
- hint handling
- latency handling
- FSRS rating inference
- review event insert
- capability state update
- goal impact signals

### 10.10 Mastery Model Module

**Purpose:** Derive progress and recommendations from capability states.

**Interface:**

```ts
getMasteryOverview(userId: string): Promise<MasteryOverview>
getPatternMastery(patternId: string, userId: string): Promise<PatternMastery>
```

**Interface invariants:**

- Mastery is derived, not manually advanced by exercises.
- Weakest-link gates matter; averages must not hide production weakness.
- The model must explain the recommended practice target.

**Hidden implementation:**

- capability grouping
- modality weighting
- pattern mastery gates
- retrievability thresholds
- stability thresholds
- recommendation ranking

---

## 11. Data Model Target

This is a target model, not necessarily the first migration.

### 11.1 `content_units`

Canonical normalized units from all sources.

```sql
id uuid primary key
unit_type text -- word, phrase, sentence, dialogue_line, podcast_segment, grammar_pattern, morphology_pattern, affixed_form
source_type text -- lesson, podcast, story, manual, imported
source_id uuid/text
canonical_text text
normalized_text text
language text
metadata_json jsonb
is_active boolean
version integer
created_at timestamptz
updated_at timestamptz
```

### 11.2 `learning_capabilities`

Concrete schedulable/dormant abilities.

```sql
id uuid primary key
canonical_key text not null unique
projection_version text not null
content_unit_id uuid references content_units(id)
capability_type text
skill_type text
direction text
modality text -- text, audio, mixed, production, pattern
prerequisite_capability_ids uuid[]
required_artifacts text[]
difficulty text
activation_policy text
readiness_status text -- ready, blocked, exposure_only, deprecated, unknown
publication_status text -- draft, published, retired
version integer
metadata_json jsonb
created_at timestamptz
updated_at timestamptz
```

Required indexes and constraints:

```sql
create index idx_learning_capabilities_source on learning_capabilities(content_unit_id);
create index idx_capability_artifacts_capability_kind on capability_artifacts(capability_id, artifact_type);
create index idx_learner_capability_due on learner_capability_state(user_id, activation_state, next_due_at);
create index idx_capability_review_events_user_time on capability_review_events(user_id, created_at);
```

Use CHECK constraints or lookup tables for learner activation states, capability readiness statuses, publication statuses, artifact quality statuses, capability types, directions, modalities, and artifact kinds.

`readiness_status` belongs to the capability or a materialized health table. It is not learner state. Blocked, exposure-only, deprecated, and unknown-readiness capabilities may be materialized for diagnostics, but they must not create learner FSRS rows or appear in due capability lists.

### 11.3 `capability_artifacts`

Links capabilities to meanings, cloze contexts, audio clips, transcripts, answer keys, and authored exercise assets.

```sql
id uuid primary key
capability_id uuid references learning_capabilities(id)
artifact_type text
artifact_ref_type text
artifact_ref_id uuid/text
quality_status text -- draft, approved, blocked, deprecated
metadata_json jsonb
version integer
created_at timestamptz
updated_at timestamptz
```

### 11.4 `learner_capability_state`

FSRS and activation state per learner and capability.

```sql
id uuid primary key
user_id uuid
capability_id uuid references learning_capabilities(id)
activation_state text -- dormant, active, suspended, retired
stability numeric
difficulty numeric
next_due_at timestamptz
last_reviewed_at timestamptz
success_count integer
failure_count integer
lapse_count integer
consecutive_failures integer
metadata_json jsonb
created_at timestamptz
updated_at timestamptz
unique(user_id, capability_id)
```

### 11.5 `capability_review_events`

Eventually replaces or extends `review_events`.

```sql
id uuid primary key
user_id uuid
capability_id uuid references learning_capabilities(id)
session_id uuid
exercise_type text
was_correct boolean
score numeric
latency_ms integer
hint_used boolean
raw_response text
normalized_response text
scheduler_snapshot jsonb
created_at timestamptz
```

---

## 12. Compatibility With Current Tables

The migration should be incremental.

Current tables can map into the target model:

```text
learning_items -> content_units
item_meanings -> capability_artifacts
item_contexts -> capability_artifacts and source provenance
exercise_variants -> authored exercise assets / capability_artifacts
grammar_patterns -> content_units of type grammar_pattern
learner_skill_state -> transitional learner_capability_state projection
learner_grammar_state -> transitional pattern capability state
review_events -> legacy event stream, later capability-linked
```

Do not big-bang rewrite the database. Add the capability layer beside the current model, then migrate scheduling and session composition gradually.

Grammar migration rule:

- do not pretend legacy `learner_grammar_state` contains per-capability evidence it did not record
- map it only to a coarse `pattern_practice_legacy` or `pattern_recognition` capability unless exercise history can safely infer the facet
- mark inferred splits with `migration_confidence = inferred`
- prefer conservative under-migration over overclaiming mastery

---

## 13. MVP Capability Set

The first implementation should not include every future feature. Start with:

```text
text_recognition
meaning_recall
form_recall
contextual_cloze
audio_recognition
dictation
one grammar/pattern capability
```

Defer until the seams prove themselves:

```text
podcast phrase mining
dialogue roleplay
morphology production
shadowing
free production
natural-speed podcast detail comprehension
```

---

## 14. Capability Examples

### 14.1 Vocabulary Word

```json
{
  "content_unit": "makan",
  "capabilities": [
    {
      "capability_type": "text_recognition",
      "skill_type": "recognition",
      "direction": "id_to_l1",
      "modality": "text",
      "required_artifacts": ["meaning:l1"]
    },
    {
      "capability_type": "meaning_recall",
      "skill_type": "meaning_recall",
      "direction": "id_to_l1",
      "modality": "text",
      "required_artifacts": ["meaning:l1", "accepted_answers:l1"]
    },
    {
      "capability_type": "form_recall",
      "skill_type": "form_recall",
      "direction": "l1_to_id",
      "modality": "text",
      "required_artifacts": ["meaning:l1", "base_text", "accepted_answers:id"]
    },
    {
      "capability_type": "audio_recognition",
      "skill_type": "recognition",
      "direction": "audio_to_l1",
      "modality": "audio",
      "required_artifacts": ["audio_clip", "meaning:l1"]
    },
    {
      "capability_type": "dictation",
      "skill_type": "form_recall",
      "direction": "audio_to_text",
      "modality": "audio",
      "required_artifacts": ["audio_clip", "accepted_answers:id"]
    }
  ]
}
```

### 14.2 Morphology Pattern

```json
{
  "content_unit": "meN-active-verb",
  "capabilities": [
    {
      "capability_type": "pattern_recognition",
      "skill_type": "recognition",
      "direction": "form_to_pattern",
      "required_artifacts": ["pattern_example", "pattern_explanation:l1"]
    },
    {
      "capability_type": "derived_to_root",
      "skill_type": "pattern_parse",
      "direction": "derived_to_root",
      "required_artifacts": ["root_derived_pair"]
    },
    {
      "capability_type": "root_to_derived",
      "skill_type": "pattern_production",
      "direction": "root_to_derived",
      "required_artifacts": ["root_derived_pair", "allomorph_rule", "accepted_answers:id"]
    },
    {
      "capability_type": "voice_contrast",
      "skill_type": "pattern_contrast",
      "direction": "contrast",
      "required_artifacts": ["minimal_pair", "pattern_explanation:l1", "cloze_answer"]
    }
  ]
}
```

### 14.3 Podcast Segment

```json
{
  "content_unit": "warung-breakfast-01:42000-56000",
  "capabilities": [
    {
      "capability_type": "segment_gist",
      "skill_type": "listening_comprehension",
      "direction": "audio_to_gist",
      "modality": "audio",
      "required_artifacts": ["audio_segment", "transcript_segment", "podcast_gist_prompt"]
    },
    {
      "capability_type": "phrase_audio_recognition",
      "skill_type": "recognition",
      "direction": "audio_to_l1",
      "modality": "audio",
      "required_artifacts": ["audio_segment", "timecoded_phrase", "meaning:l1"]
    },
    {
      "capability_type": "shadowing",
      "skill_type": "fluency",
      "direction": "audio_to_speech",
      "modality": "audio_production",
      "required_artifacts": ["audio_segment", "transcript_segment"]
    }
  ]
}
```

---

## 15. Session Plan Shape

The session composer should return a plan, not just a queue of exercises.

```ts
interface SessionPlan {
  id: string
  mode: SessionMode
  title: string
  blocks: SessionBlock[]
  recapPolicy: RecapPolicy
}

type SessionBlock =
  | { kind: 'warm_input'; items: InputMoment[] }
  | { kind: 'due_review'; items: ExerciseRenderPlan[] }
  | { kind: 'new_introduction'; items: IntroductionMoment[] }
  | { kind: 'pattern_workshop'; patternId: string; steps: WorkshopStep[] }
  | { kind: 'podcast_listening'; episodeId: string; steps: ListeningStep[] }
  | { kind: 'dialogue_rehearsal'; dialogueId: string; steps: DialogueStep[] }
  | { kind: 'production_task'; prompt: ProductionPrompt }
```

This lets the UI render richer experiences without each page inventing its own learning logic.

Compatibility note: early capability-composed sessions should return only flat `due_review` style exercise blocks that can be adapted into the current exercise shell. Rich blocks such as warm input, podcast listening, morphology workshop, and recap require the Experience Player and should not be squeezed into `SessionQueueItem`.

---

## 16. Non-Goals

This architecture spec does not require immediate implementation of:

- AI pronunciation scoring
- open-ended free conversation grading
- full podcast publishing pipeline
- full database replacement
- deleting current `learning_items`
- removing current stages from the UI

It defines the target seams so these features can be added later without distorting the core.

---

## 17. Open Questions

Implementation-blocking questions answered by this spec:

```text
Capability identity:
  use the `cap:v1:<source_kind>:<source_ref>:<capability_type>:<direction>:<modality>:<learner_language_or_none>` grammar.

First persistence step:
  start with projection and validation, then materialize UUID rows after canonical keys are stable.

Review transaction boundary:
  Review Processor owns the atomic commit for idempotency, review event insert, learner FSRS state update, counters, version snapshot, and derived mastery enqueue.

Learner language:
  MVP may default to Dutch, but artifact contracts remain language-parameterized.

Grammar migration:
  map conservatively and never infer production mastery from legacy recognition-like state.
```

Deferred non-blocking questions:

1. Should podcast capabilities be opt-in only until the learner explicitly saves phrases?
2. Should pattern mastery use strict weakest-link gates or weighted scoring with minimum thresholds?
