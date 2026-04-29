# Capability Architecture Migration Roadmap

**Date:** 2026-04-25
**Status:** Draft v2
**Scope:** Incremental path from the current item/stage/session-queue architecture to the capability-based learning architecture.
**Companions:**
- `2026-04-25-capability-based-learning-architecture.md`
- `2026-04-25-capability-content-pipeline-and-exercises.md`
- `2026-04-25-learning-experience-ui-audio-mastery.md`

---

## 1. Goal

Migrate safely toward capability-driven learning without breaking the current app, losing learner history, or forcing a big-bang rewrite.

The first migration goal is not richer UI. It is eliminating this failure class:

```text
schedulable state points at content that cannot render
```

Only after that is prevented should the app move session composition, FSRS state, mastery UI, podcasts, morphology, and richer experiences onto the capability model.

---

## 2. Migration Principles

1. **Add seams before replacing behavior.** Build projection, validation, review processing, and diagnostics beside the current model first.
2. **Use compatibility adapters.** Current `learning_items`, `learner_skill_state`, `review_events`, and `exercise_variants` continue working during transition.
3. **Move one session path at a time.** Start with standard daily review only.
4. **Protect learner state.** Existing FSRS history is mapped conservatively and never discarded during migration.
5. **Fail closed on capability paths.** If capability readiness cannot be proven, the capability does not schedule.
6. **Keep stages as derived UI labels.** Stages do not regain scheduling authority.
7. **Make the interface the test surface.** Each phase adds a deep Module whose Interface can be unit-tested.
8. **Keep old and new writes coexisting until verified.** Review events and learner state should dual-read or shadow-write before any cutover.
9. **Feature-flag every behavior switch.** Projection and health scripts can be unconditional; user-visible behavior changes must be reversible.

---

## 3. Phase 0: Context and ADR Baseline

### Goal

Record the domain language and key architectural decisions before implementation.

### Tasks

1. Create `CONTEXT.md` with core domain terms:
   - content source
   - content unit
   - learning capability
   - capability contract
   - typed artifact
   - activation
   - reviewable
   - exposure-only
   - mastery
   - pattern
   - modality
   - learner language

2. Create `docs/adr/0001-capability-based-learning-core.md`.

3. Create `docs/adr/0002-stages-are-derived-not-scheduling-authority.md`.

4. Create `docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md`.

5. Create `docs/adr/0004-capability-review-commits-are-atomic-and-idempotent.md`.

### Acceptance Criteria

- New specs use consistent terms.
- Future architecture reviews have decisions to respect.
- No runtime behavior changes.

---

## 4. Phase 1: Capability Identity and Projection, No DB Migration

### Goal

Generate deterministic capabilities in TypeScript from current data without changing persistence.

### New Module

```text
src/lib/capabilities/capabilityCatalog.ts
```

### Interface

```ts
projectCapabilities(input: CurrentContentSnapshot): CapabilityProjection
```

### Output Shape

```ts
interface CapabilityProjection {
  projectionVersion: string
  capabilities: ProjectedCapability[]
  aliases: CapabilityAlias[]
  diagnostics: ProjectionDiagnostic[]
}
```

Each projected capability must include:

```text
canonicalKey
sourceKind
sourceRef
capabilityType
direction
modality
learnerLanguage when relevant
sourceFingerprint
artifactFingerprint
projectionVersion
```

Example canonical keys:

```text
cap:v1:item:learning_items/<item_id>:text_recognition:id_to_l1:text:nl
cap:v1:item:learning_items/<item_id>:form_recall:l1_to_id:text:nl
cap:v1:item:learning_items/<item_id>:audio_recognition:audio_to_l1:audio:nl
cap:v1:pattern:grammar_patterns/<pattern_id>:pattern_recognition:form_to_pattern:pattern:nl
```

### MVP Capability Types

- `text_recognition`
- `meaning_recall`
- `form_recall`
- `contextual_cloze`
- `audio_recognition`
- `dictation`
- one grammar/pattern capability

### Acceptance Criteria

- Unit tests cover word, phrase, sentence, dialogue line, grammar pattern, and audio-capable item.
- Projection is deterministic: same input produces same canonical keys and same diff.
- Projection emits aliases for renames or source-id changes where safe.
- No session behavior changes.

---

## 5. Phase 2: Capability Contract Validator and Health Script

### Goal

Centralize reviewability checks and expose blocked capabilities before changing sessions.

### New Module

```text
src/lib/capabilities/capabilityContracts.ts
```

### Interface

```ts
validateCapability(capability, artifactIndex): CapabilityReadiness
validateCapabilities(capabilities, artifactIndex): CapabilityHealthReport
```

### Readiness States

```text
ready
blocked
exposure_only
deprecated
unknown
```

For capability scheduling, `unknown` behaves as `blocked`.

### First Contracts

- text recognition requires `meaning:l1`
- meaning recall requires `meaning:l1` and `accepted_answers:l1`
- form recall requires `meaning:l1`, `base_text`, and `accepted_answers:id`
- contextual cloze requires approved cloze context and answer key
- audio recognition requires approved audio clip and `meaning:l1`
- dictation requires approved audio clip and accepted answers
- grammar/pattern capability requires approved examples and `pattern_explanation:l1`

### Script

```bash
bun scripts/check-capability-health.ts
```

### Early Publish Hook

Newly generated staging content should run this validator before publish even while old content still uses projection-only diagnostics. This moves validation earlier without requiring a full database migration.

### Acceptance Criteria

- Script reports blocked, ready, deprecated, unknown, and exposure-only capabilities.
- Existing orphan or unrenderable content appears as blocked, not ready.
- No blocked capability is counted as reviewable in diagnostics.
- New staging publish fails for schedulable-but-unrenderable capabilities.
- No user-visible session behavior changes.

---

## 6. Phase 3: Capability-Aware Session Diagnostics

### Goal

Compare current session output to capability readiness before changing session construction.

### Changes

- Add debug/admin mode to the current session builder.
- For every selected exercise, identify the implied capability canonical key.
- Validate that implied capability is ready.
- Log mismatch warnings in dev/admin mode.
- Add a report showing which current exercise branches cannot map to a capability.

### Acceptance Criteria

- Current sessions can be audited capability-by-capability.
- Any exercise that cannot map to a capability is flagged.
- Diagnostics show whether a skipped item was blocked, missing artifacts, deprecated, or unmapped.
- No user-visible behavior changes.

---

## 7. Phase 4: Capability Tables and Constraints

### Goal

Materialize capabilities and learner capability state while preserving current state.

### Schema

Minimum tables:

```text
learning_capabilities
capability_artifacts
learner_capability_state
capability_review_events or extension path for current review_events
```

Required properties:

- `learning_capabilities.canonical_key` is unique.
- capability rows store projection version, source fingerprint, and artifact fingerprint.
- capability rows store `readiness_status` and `publication_status`; these are not learner activation state.
- learner state is unique by `(user_id, capability_id)` once UUID foreign keys are authoritative.
- artifact rows use typed artifact kinds and quality statuses.
- lookup or check constraints exist for capability type, direction, modality, learner activation state, readiness status, publication status, artifact kind, and quality status.
- indexes exist for source lookup, due capability selection, capability artifacts by kind, and review events by user/time.

### Phase 4A: Materialize Capabilities by Canonical Key

Create `learning_capabilities` with UUID row IDs, but treat `canonical_key` as the authoritative identity during this subphase.

Tasks:

- Upsert projected capabilities by canonical key.
- Store source fingerprint, artifact fingerprint, projection version, readiness status, and publication status.
- Store aliases in a dedicated alias table or compatibility mapping file.
- Verify each canonical key resolves to exactly one UUID row.
- Verify each alias resolves to an active replacement, retired key, or explicit incompatible-change decision.

Acceptance criteria:

- No duplicate canonical keys.
- No alias cycles.
- Blocked, exposure-only, deprecated, and unknown-readiness capabilities can exist for diagnostics.
- Only ready and published capabilities are eligible for learner state.

### Phase 4B: Backfill Learner State Through Canonical Keys

Before authoritative UUID foreign keys are enabled, backfill learner capability state through canonical keys.

Tasks:

- Map current skill rows to capability canonical keys.
- Resolve canonical keys to UUID capability IDs.
- Insert learner state only for ready capabilities with clear mappings.
- Report unmapped, ambiguous, deprecated, blocked, and exposure-only rows.
- Keep old state authoritative until the report has been reviewed.

Acceptance criteria:

- Every inserted learner capability state row points to exactly one ready capability UUID.
- Ambiguous rows are reported rather than guessed.
- Existing learner state remains untouched.
- A rollback can drop capability state without damaging legacy state.

### Phase 4C: Enable Authoritative Foreign Keys

After Phase 4A and 4B are clean, make UUID `capability_id` foreign keys authoritative for learner state, artifacts, and review events.

Acceptance criteria:

- `learner_capability_state.capability_id` has a valid FK to `learning_capabilities.id`.
- `capability_artifacts.capability_id` has a valid FK to `learning_capabilities.id`.
- Review events can store both `capability_id` and canonical key snapshot for audit.
- Due capability queries no longer rely on text-key joins.

### Grammar Migration Policy

Legacy `learner_grammar_state` is not precise enough to become detailed pattern mastery.

Migration rules:

- Map only what the legacy evidence supports.
- Recognition-like grammar history may map to `pattern_recognition` with `migration_confidence = inferred`.
- Do not create production, contrast, or morphology capability mastery unless exercise history proves it.
- Ambiguous grammar rows stay in legacy state and appear as migration gaps.

### Learner Language Policy

The MVP product can default to Dutch (`nl`), but the data model must keep artifacts parameterized as `meaning:l1`, `translation:l1`, and `pattern_explanation:l1`. This avoids hard-coding `meaning_nl` into the capability seam.

### Acceptance Criteria

- Existing learner state remains untouched.
- Capability rows materialize with stable canonical keys.
- Blocked capabilities can be materialized with capability readiness status for diagnostics but cannot create learner FSRS state.
- Clear skill-state mappings populate learner capability state.
- Ambiguous mappings are reported, not guessed.

---

## 8. Phase 5: Capability Review Processor, Shadow First

### Goal

Create the capability-native answer submission and review-write path before any capability-composed session becomes authoritative.

### New Module

```text
src/lib/reviews/capabilityReviewProcessor.ts
```

### Interface

```ts
commitCapabilityReview(command): CapabilityReviewCommitResult
```

### Atomic Commit Contract

A commit must atomically perform:

1. idempotency check using `session_id + session_item_id + attempt_number`
2. insert capability review event
3. update learner capability FSRS state
4. update lapse and consecutive failure counters
5. record artifact/capability version used at answer time
6. enqueue derived mastery refresh when needed

If the same idempotency key is submitted twice, the processor returns the previous committed result rather than applying FSRS twice.

### Coexistence With Current Writes

Migration starts in shadow mode:

```text
current review processor remains authoritative
capability review processor receives mirrored commands where mapping is clear
shadow result is compared to current result in logs/admin diagnostics
```

Then compatibility mode:

```text
current UI submits through a compatibility adapter
adapter writes old review/state and capability review/state in one transaction where possible
old path remains readable as fallback
```

Only after this path is verified can a capability session composer become user-visible.

### Acceptance Criteria

- Duplicate submissions do not double-apply FSRS.
- Stale session snapshots are rejected or recomputed explicitly.
- Old and new review events can coexist without breaking current progress pages.
- Capability state updates are transactionally consistent with review events.
- Tests cover success, failure, duplicate submission, stale capability version, and rollback behavior.

---

## 9. Phase 6: Capability Scheduler Adapter

### Goal

Create an FSRS scheduler module for capability state after the write path exists.

### New Module

```text
src/lib/capabilities/capabilityScheduler.ts
```

### Interface

```ts
getDueCapabilities(request): DueCapability[]
applyCapabilitySchedulePreview(review): CapabilitySchedulePreview
```

The actual committed update remains owned by the Review Processor. The scheduler can calculate previews and due lists, but it should not independently write learner state.

### Adapters

- current `learner_skill_state` adapter
- new `learner_capability_state` adapter

This is a real seam because two adapters exist during migration.

### Acceptance Criteria

- Tests prove FSRS preview behavior matches existing update semantics.
- Due capability selection can run in shadow mode beside current due item selection.
- Scheduler excludes blocked, deprecated, exposure-only, and unknown-readiness capabilities.
- No production session switched yet.

---

## 10. Phase 7: Exercise Resolver

### Goal

Resolve exercises from capabilities instead of item/stage branches.

### New Module

```text
src/lib/exercises/exerciseResolver.ts
```

### Interface

```ts
resolveExercise(capability, context): ExerciseRenderPlan
```

### First Capability Types

- text recognition
- form recall
- meaning recall
- contextual cloze
- audio recognition
- dictation
- grammar contrast or pattern recognition

### Rules

- Resolver only accepts ready capabilities.
- Resolver returns explicit failure reasons, not silent random fallbacks.
- Resolver must not revive blocked capabilities by choosing a legacy exercise variant.
- Runtime exercise generation is allowed only when the contract says all required facts are approved.

### Acceptance Criteria

- Resolver can reproduce current exercise choices for supported capabilities.
- Resolver refuses blocked capabilities.
- Resolver returns explicit fallback reason when no exercise is available.
- Tests no longer need to call `selectExercises` for supported paths.

---

## 11. Phase 8: Capability Session Composer MVP

### Goal

Build a new session composer for the standard daily session only, after capability writes and resolving are safe.

### New Module

```text
src/lib/session/sessionComposer.ts
```

### Interface

```ts
composeSession(request): SessionPlan
```

### MVP Behavior

- Use due active capabilities first.
- Use ready new text capabilities next.
- Include only supported resolver paths.
- Enforce load budgets from the learning experience spec.
- Keep current UI shell by adapting flat `due_review` blocks into existing exercise UI.

### Feature Flag Boundary

```text
capability_session_diagnostics: logs only
capability_review_shadow: writes shadow events only
capability_review_compat: current UI writes through compatibility adapter
capability_standard_session: standard daily session uses SessionPlan adapter
```

No richer block-based experience should be enabled by `capability_standard_session`; it should remain a flat adapter until the Experience Player exists.

### Acceptance Criteria

- Feature flag controls new composer.
- Standard daily session works with capability composer.
- Old session builder remains available as fallback.
- No blocked capabilities enter a session.
- Answer submission uses the capability Review Processor path, not the legacy-only path.

---

## 12. Phase 9: Content Pipeline Capability Output

### Goal

Make new content publish capability plans and contracts using the validated pipeline spec.

### Staging Additions

- `content-units.ts`
- `capabilities.ts`
- `exercise-assets.ts`
- `publish-report.json`

### Publish Changes

- Validate canonical keys before publish.
- Validate typed artifact references.
- Publish only ready, blocked-for-diagnostics, or exposure-only capabilities.
- Never publish blocked capabilities as active.
- Record skipped and deferred capabilities in the publish report.

### First Slice

One new or regenerated lesson should publish only the MVP capability set. Admin UI should show source overview, capability health, and exercise preview. Full content authoring UI is deferred.

### Acceptance Criteria

- One lesson can be published with capability metadata.
- Existing lessons still work through projection.
- Publish blocks schedulable-but-unrenderable capabilities.
- Publish report explains every skipped, blocked, deferred, and exposure-only capability.

---

## 13. Phase 10: Mastery Model MVP

### Goal

Derive learner-facing mastery from capability state without overclaiming.

### New Module

```text
src/lib/mastery/masteryModel.ts
```

### Interface

```ts
getContentUnitMastery(unitId, userId): ContentUnitMastery
getPatternMastery(patternId, userId): PatternMastery
getMasteryOverview(userId): MasteryOverview
```

### MVP Surfaces

- capability strength by item
- pattern recognition vs production
- listening track strength
- weakest capabilities list
- evidence count and confidence level
- `not_assessed` where there is no evidence

### Acceptance Criteria

- Progress page can show at least one capability-based mastery panel.
- Pattern mastery shows weakest-link recommendation.
- UI labels avoid unsupported claims such as broad fluency.
- Existing goal system remains compatible.

---

## 14. Phase 11: Learning Experience Player

### Goal

Move from queue-only sessions to block-based experiences after the core capability path is stable.

### New Module

```text
src/components/experience/ExperiencePlayer.tsx
```

### MVP Blocks

- warm input
- due review
- new introduction
- recap

Later blocks:

- podcast listening
- morphology workshop
- dialogue rehearsal
- production task

### Acceptance Criteria

- Daily tutor session renders as a `SessionPlan`.
- Exercise frame still handles individual exercises.
- Recap explains which capabilities changed.
- Rich blocks do not require adding special cases to `sessionQueue.ts`.

---

## 15. Phase 12: Lesson Reader Redesign

### Goal

Replace the clunky book-derived lesson display with a modern web-native lesson reader that creates source progress and connects naturally to practice.

### New Module

```text
src/components/lessons/LessonReader.tsx
src/lib/lessons/lessonExperience.ts
```

### MVP Blocks

- lesson hero
- lesson goals
- reading section
- inline example
- vocab strip
- dialogue card
- audio moment
- pattern callout
- noticing prompt
- micro-check
- practice bridge
- lesson recap

### Responsive Requirements

- Mobile: single-column flow, large tap targets, inline/collapsible controls.
- Tablet: reading column with optional sticky rail or docked panels.
- Desktop: readable text column with side progress rail and companion panel.

### Acceptance Criteria

- One textbook lesson renders as a polished lesson page, not a PDF-like import.
- Lesson blocks preserve source provenance.
- Lesson reader emits source progress events.
- Practice bridges reference capability keys without activating capabilities directly.
- Mobile and desktop layouts both work without separate lesson definitions.

---

## 16. Phase 13: Podcast and Morphology Expansion

### Goal

Add the first non-vocabulary content sources to prove extensibility.

### Podcast MVP

- one story or podcast source
- segmented transcript
- slow/normal audio
- guided transcript
- gist questions
- 1-3 mined phrase capabilities
- exposure-only segment support

### Morphology MVP

- one pattern: `meN- active verbs`
- root-derived pairs
- recognition capability
- derived-to-root capability
- root-to-derived capability only after recognition evidence
- contrast with `di-` if content is ready

### Acceptance Criteria

- Both features use the same capability contract, scheduler, resolver, review processor, and mastery model.
- No new session-builder special-case branch for podcast or morphology.
- Morphology mastery remains facet-specific and does not overclaim production.

---

## 17. Testing Strategy

### Unit Tests

- capability projection and canonical key stability
- alias generation and incompatible-change handling
- contract validation and fail-closed readiness
- typed artifact registry validation
- review processor idempotency and rollback
- scheduler due selection
- exercise resolver refusal of blocked capabilities
- mastery aggregation and confidence labels
- session composition load budgets

### Integration Tests

- publish lesson with capabilities
- blocked capability does not schedule
- due capability resolves matching exercise
- review updates capability event and learner state atomically
- duplicate answer submission is idempotent
- grammar legacy state maps conservatively
- pattern mastery changes after reviews

### Content Tests

- staging contract validation
- distractor availability
- audio artifact existence
- transcript timecode validity
- morphology answer-key correctness
- learner-language artifact coverage

### Browser Tests

- daily session via capability composer
- listening exercise
- pattern practice
- progress mastery panel
- admin content health page

---

## 18. Risk Register

### Risk: Big-bang rewrite stalls

Mitigation: projection, validation, review shadow mode, and diagnostics precede behavior switch.

### Risk: Capability identity changes corrupt state

Mitigation: canonical key contract, aliases, projection versions, source fingerprints, and explicit incompatible-change rules.

### Risk: Review writes double-apply FSRS

Mitigation: idempotency keys and a single Review Processor owning committed state writes.

### Risk: Capability model becomes too abstract

Mitigation: start with concrete vocabulary/audio/grammar capability types and add only when needed.

### Risk: Existing FSRS history is hard to map

Mitigation: conservative backfill, keep old state authoritative during transition, mark ambiguous mappings.

### Risk: Pipeline complexity increases authoring burden

Mitigation: capability planner generates defaults; humans review exceptions and linguistically sensitive assets.

### Risk: UI becomes overwhelming

Mitigation: learner sees experiences and recommendations; admin sees capability details.

### Risk: Too much audio becomes tiring

Mitigation: audio appears gently in daily mode; listening focus is separate and governed by load budgets.

---

## 19. Recommended First Implementation Slice

Best first slice:

```text
Capability identity + projection + contract validation + health script + early publish gate
```

Why:

- Low risk.
- No user-visible behavior change.
- Directly addresses the bug class that triggered the redesign.
- Establishes domain language and canonical identity before state exists.
- Creates testable deep modules.
- Provides data for choosing the next migration step.

Files likely involved:

```text
CONTEXT.md
docs/adr/0001-capability-based-learning-core.md
docs/adr/0002-stages-are-derived-not-scheduling-authority.md
docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md
src/types/learning.ts
src/lib/capabilities/capabilityCatalog.ts
src/lib/capabilities/capabilityContracts.ts
src/__tests__/capabilityCatalog.test.ts
src/__tests__/capabilityContracts.test.ts
scripts/check-capability-health.ts
docs/architecture/capabilities.md
```

---

## 20. Open Questions Before Implementation

Implementation-blocking questions answered by this roadmap:

```text
MVP learner language:
  Dutch-first product settings, language-parameterized artifacts internally.

First grammar scope:
  include one recognition or contrast grammar/pattern capability after vocabulary/audio projection works.

Missing audio:
  generate blocked diagnostics for missing-audio capabilities, but do not create learner FSRS state.

Exposure-only:
  include exposure-only in projection from Phase 1 so diagnostics and future listening can see it.

sessionQueue.ts:
  freeze to bug fixes and adapter work during migration; do not add new pedagogic policy there.

Capability review commit path:
  implement as a single DB transaction boundary, preferably an RPC if Supabase client-side atomicity is otherwise weak.
```

Deferred non-blocking question:

1. How long should old and new review events coexist before removing compatibility reads?
