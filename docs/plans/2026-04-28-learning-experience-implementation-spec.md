# Learning Experience Implementation Spec

**Date:** 2026-04-28
**Status:** Draft for fresh-context review
**Source:** `docs/plans/2026-04-28-learning-experience-rules.md`

## 1. Goal

Turn the agreed learning-experience rules into implementation contracts for the capability layer, planner, composer, lesson progression, audio behavior, Practice, Progress, and documentation.

The product goal is a Dutch-first tutor loop:

```text
Today chooses the next useful session.
Lessons unlock coherent source material.
Practice gives intentional focus without exposing exercise internals.
Progress explains real learner ability in human language.
```

## 2. Non-Goals

This spec does not require:

- open-ended conversation grading;
- speech pronunciation scoring;
- external podcast subscriptions;
- a top-level Words page;
- full migration of the legacy session path in one slice.

## 3. Capability Model Changes

Add a separate Dutch-to-Indonesian choice bridge capability.

Working name:

```text
l1_to_id_choice
```

Semantics:

```text
Dutch prompt -> choose Indonesian form
```

This is not typed production. It needs its own capability identity and FSRS schedule once active.

Example for `rumah`:

```text
text_recognition:
  rumah -> huis

meaning_recall:
  rumah -> type/recall huis

l1_to_id_choice:
  huis -> choose rumah

form_recall:
  huis -> type rumah

audio_recognition:
  hear rumah -> huis

dictation:
  hear rumah -> type rumah
```

Projection rules:

- create `text_recognition` first for vocabulary;
- create `l1_to_id_choice` with `text_recognition` as prerequisite;
- create `form_recall` with `l1_to_id_choice` as preferred prerequisite, or with `text_recognition` as a compatibility fallback during migration;
- keep existing `meaning_recall` for Indonesian-to-Dutch typed meaning recall;
- do not collapse `l1_to_id_choice` and `form_recall` into the same mastery label.

Resolver rules:

- `l1_to_id_choice` resolves to `cued_recall`;
- `form_recall` resolves to typed recall or cloze-like production paths;
- `cued_recall` should no longer be treated as equivalent to full typed production.

Readiness and data-service rules:

- `capabilityContracts.ts` must map `l1_to_id_choice` to `cued_recall`, otherwise the capability will be blocked before the resolver runs;
- `capabilitySessionDataService.ts` must treat `l1_to_id_choice` as a lesson-sequenced item capability;
- `masteryModel.ts` must expose a separate mastery dimension for learner-facing `Kiezen`;
- health/promote scripts that reconstruct `ProjectedCapability` from database rows must accept the new capability type through shared TypeScript types and tests.

Skill type compatibility decision:

The capability-session path schedules by `learning_capabilities.id` and `canonicalKey`, not by the legacy item-level `SkillType`. Therefore `l1_to_id_choice` can initially use existing `skillType: 'meaning_recall'` for exercise/report compatibility while still having a separate FSRS schedule as a separate capability row.

This is intentional for the first slice. The authoritative distinction is:

```text
canonicalKey + capabilityType
```

not `skillType`.

A later legacy-session migration may add a distinct item-level skill type, but that is not required to make the capability path schedule `Kiezen` separately.

Evidence-shape requirement:

Source-progress and introduction gates must not infer `Kiezen` from `skillType` alone. Extend review evidence to include at least:

```ts
capabilityType?: CapabilityType
exerciseType?: ExerciseType
```

Vocabulary introduction/progression gates can then accept successful evidence from:

```text
capabilityType === 'text_recognition'
or capabilityType === 'l1_to_id_choice'
```

This keeps the bridge distinguishable even while its compatibility `skillType` remains `meaning_recall`.

Adapter requirement:

- `capabilitySessionDataService.ts` must populate `capabilityType` on recent review evidence from the joined `learning_capabilities.capability_type` value;
- recent capability evidence comes from `capability_review_events` joined by `capability_id` to `learning_capabilities`;
- each evidence row should carry `sourceRef` from `learning_capabilities.source_ref`, `capabilityType` from `learning_capabilities.capability_type`, compatibility `skillType` from capability metadata, and `exerciseType` from `answer_report_json.exerciseType` when present;
- a capability review counts as successful evidence when `answer_report_json.wasCorrect === true`; if that field is absent, use `rating > 1` as the compatibility fallback;
- source-progress gate tests must prove that `l1_to_id_choice` evidence with `skillType: 'meaning_recall'` satisfies vocabulary introduction;
- the same tests must prove that ordinary `meaning_recall` evidence without bridge `capabilityType` does not satisfy vocabulary introduction.

Learner-facing label:

```text
Kiezen
```

## 4. Session Posture Contract

Add a posture decision before composing Today:

```text
balanced
light_recovery
review_first
comeback
```

Inputs:

- last meaningful practice timestamp;
- last exposure timestamp;
- preferred session size;
- due count;
- available eligible new material count;
- mode (`standard`, `quick`, `backlog_clear`, and future focus modes).

Loader/Today data contract:

- `lastMeaningfulPracticeAt` comes from `learning_sessions` plus completed review attempts in both event tables. A session counts only when it lasted at least 5 minutes from `started_at` to `ended_at` and has at least 8 total attempts from the union of legacy `review_events` and capability `capability_review_events` with matching `session_id`. Capability-only sessions must reset practice recency.
- `lastMeaningfulExposureAt` comes from `learner_source_progress_state.last_event_at` for meaningful exposure states/events: `section_exposed`, `intro_completed`, `heard_once`, `pattern_noticing_seen`, `guided_practice_completed`, or `lesson_completed`. A bare `opened` event does not count.
- `dueCount` is the untruncated count of active learner capabilities whose `next_due_at <= now`, before applying the session limit.
- `eligibleNewMaterialCount` is counted after readiness, publication, source progress, prerequisite, current-source/path, and difficulty gates, but before applying posture/load-budget maximums.
- `mode` is the requested session mode before posture suppression or mode-specific budget rules.

The capability-session adapter should expose these as a small planning-signal snapshot so the loader does not guess from a truncated `SessionPlan`.

Meaningful practice threshold:

```text
completedExercises >= 8
and durationMinutes >= 5
```

Posture bands:

```text
same day or yesterday:
  balanced

2-3 days:
  light_recovery

4-7 days:
  review_first

8+ days:
  comeback
```

Backlog pressure is relative to preferred session size:

```text
light:
  due <= 0.5 * preferredSessionSize

medium:
  due <= 1.0 * preferredSessionSize

heavy:
  due <= 3.0 * preferredSessionSize

huge:
  due > 3.0 * preferredSessionSize
```

Huge backlog or 8+ day gap should force or strongly prefer comeback/review-first behavior.

## 5. Load Budget Contract

Budget ownership is split:

- `pedagogyPlanner.ts` owns new-capability eligibility and hard maximums for new material;
- `sessionComposer.ts` owns total block ordering, final limit, no-padding behavior, and session diagnostics;
- future runtime session code owns mid-session adaptation after repeated failures.

Budget categories:

- `maxNewCapabilities`
- `maxNewConcepts`
- `maxNewProductionTasks`
- `maxHiddenAudioTasks`
- `maxSourceSwitches`
- `targetSessionSize`
- `allowQueuePadding`

Recommended first-version budgets:

```text
balanced:
  targetSessionSize = preferredSessionSize
  maxNewCapabilities = floor(preferredSessionSize * 0.25)
  maxNewConcepts = 1
  maxNewProductionTasks = 1
  maxHiddenAudioTasks = no strict requirement; only eligible tasks
  maxSourceSwitches = 1
  allowQueuePadding = false

light_recovery:
  targetSessionSize = preferredSessionSize
  maxNewCapabilities = 2
  maxNewConcepts = 1, preferably 0 when backlog is medium
  maxNewProductionTasks = 0 for brand-new material
  maxHiddenAudioTasks = 1
  maxSourceSwitches = 1
  allowQueuePadding = false

review_first:
  targetSessionSize = preferredSessionSize
  maxNewCapabilities = 1 only if low-load and lesson-linked
  maxNewConcepts = 0
  maxNewProductionTasks = 0 for new material
  maxHiddenAudioTasks = due-only
  maxSourceSwitches = 0-1
  allowQueuePadding = false

comeback:
  targetSessionSize = min(preferredSessionSize, 8)
  maxNewCapabilities = 0
  maxNewConcepts = 0
  maxNewProductionTasks = 0
  maxHiddenAudioTasks = 0 by default
  maxSourceSwitches = 0
  allowQueuePadding = false
```

Filling priority:

```text
due fragile
due normal
prerequisite repair
recent lesson continuation
small new introduction
stretch task
```

The composer may return fewer than the preferred session size.

For comeback, 5-8 confidence-building items is the target when safe candidates exist. If fewer than 5 safe candidates exist, the composer should return the clean shorter session and should not emit the queue-drying warning. It may emit a separate non-blocking diagnostic later, but the first implementation can simply underfill.

## 6. Queue-Drying Warning Contract

Return a diagnostic when:

- good candidate count is below about 70% of preferred size;
- due backlog is light;
- no current lesson content remains eligible for introduction;
- next lesson is available but waiting for 2-minute lesson exposure or lesson audio exposure.

Do not warn for intentionally short modes/postures:

- quick;
- comeback;
- review-first when backlog is not light;
- backlog-clear.

Light recovery is not automatically suppressed. It can still show the queue-drying warning when due backlog is light and the next useful action is lesson exposure.

Suggested diagnostic code:

```text
learning_pipeline_drying_up
```

For the first implementation, use the existing `SessionDiagnostic` shape:

```text
severity: warn
reason: learning_pipeline_drying_up
details: learner-facing or UI-mappable explanation
```

Do not introduce `severity: info` unless `SessionDiagnostic` and all consumers are migrated in the same slice.

Learner-facing copy:

```text
Je bent bijna klaar met de huidige les.
Open de volgende les 2 minuten om nieuwe woorden en patronen klaar te zetten.
```

## 7. Lesson Progression Contract

Current lesson source:

- explicit `Start/Continue lesson` sets current source immediately;
- 2 minutes in a lesson sets it as current source;
- meaningful lesson audio explanation can set it as current source.

New reviewable material should progress mostly sequentially:

- learner may browse ahead;
- Today should not silently introduce new reviewable material from a later lesson while previous lessons are not sufficiently introduced;
- next lesson becomes normal Today source after all authored content in the current lesson has been introduced, not mastered.

Introduction rules:

```text
Vocabulary:
  at least one successful evidence event with capabilityType text_recognition or l1_to_id_choice

Grammar/morphology:
  Dutch explanation exposure, text or audio
  plus one recognition/noticing success

Sentence/dialogue:
  exposure is enough for lesson progression

Audio:
  heard once is enough for lesson progression
```

Vocabulary does not require manual browsing of every word. The first recognition exercise may introduce the word.

## 8. Lesson Mix And Known-Word Coverage

A fresh lesson's first normal session must introduce at least one word before sentence or grammar practice.

Suggested normal fresh-lesson mix:

```text
2-4 new words
0-1 new grammar or morphology concept
0-1 sentence/context practice
1 light audio-supported item if available
no hard production for brand-new concepts
```

Known-word coverage:

```text
reading/context recognition:
  70-80% of key words introduced or recognizable

cloze/context recall:
  target word introduced
  surrounding sentence mostly familiar

sentence production/transformation:
  key vocabulary recallable

lesson exposure:
  no threshold
```

Grammar examples should use words from the current lesson, prior lessons, or very common already-seen words.

## 9. Audio Contract

Audio support and audio assessment are separate:

```text
audio support:
  visible Indonesian prompt also plays audio

audio assessment:
  hidden-text listening or dictation where answer depends on hearing
```

Session behavior:

- autoplay Indonesian audio on session prompts when an audio asset exists;
- add profile setting to disable session autoplay;
- visible-prompt audio support does not count against hidden-audio task budget;
- lesson reading remains tap-to-play except explicit audio blocks.

Progression:

```text
audio exposure with text visible
then audio_recognition
then dictation after audio recognition and form recall are started
```

## 10. Practice Contract

Practice is goal/concept based, not an exercise-type browser.

Goal entries:

```text
Luisteren oefenen
Indonesisch onthouden
Zwakke woorden herstellen
Patronen oefenen
Korte sessie
```

Concept entries:

```text
meN- oefenen
di- herkennen
-kan vs -i
sudah/belum
register/pronouns
```

Concept unlock:

- 2 minutes in lesson; or
- lesson audio explanation heard.

Practice can focus on the chosen topic but must still respect safety:

- unseen: explanation/recognition only;
- weak recognition: recognition and contrast;
- strong recognition: recall/production allowed;
- recent failures: step down difficulty;
- comeback: short and gentle.

## 11. Learner-Facing Labels

Use Dutch-first labels and hide internal jargon.

Mapping:

```text
Herkennen:
  Indonesian seen -> understand meaning

Kiezen:
  Dutch prompt -> choose Indonesian

Onthouden:
  Dutch prompt -> produce Indonesian

Gebruiken:
  use in phrase or sentence

Verstaan:
  Indonesian heard -> understand meaning

Opschrijven:
  Indonesian heard -> write Indonesian

Patronen:
  grammar/morphology understanding
```

Today should be compact. Progress or item detail can show per-item detail. Do not add a top-level Words page in this slice.

Session summary should be narrative first, expandable counts second.

## 12. Documentation Alignment

Update stale docs after implementation decisions land:

- `docs/architecture/README.md`
- `docs/architecture/session-engine.md`
- `docs/architecture/session-modes.md`
- `docs/architecture/session-policies.md`
- `docs/current-system/human-product-and-learning-guide.md`

These should stop describing old slot ratios, non-existent mode names, and `sessionEngine.ts` paths where current code uses `sessionQueue.ts`.

## 13. Migration And Release Notes

Adding `l1_to_id_choice` is additive, but it changes projection output and the release gate.

Migration/release requirements:

- database schema currently stores `capability_type` as text, so no enum migration is expected for the core capability table;
- `publish-approved-content.ts` will upsert new capability rows as `unknown`/`draft`;
- `promote-capabilities.ts` and health checks must validate the new capability through `capabilityContracts.ts` and `exerciseResolver.ts`;
- existing learner state does not need to be rewritten because the new bridge is a new capability, not a rename of an existing one;
- existing `form_recall` capabilities should not be deleted or aliased in this slice;
- new projected `form_recall` prerequisites can prefer `l1_to_id_choice`, while existing published rows keep their current canonical keys until a reviewed rematerialization/promote run;
- if rematerialization changes prerequisite metadata for an existing canonical key, run the capability release gate before promotion.
- staging relationship classification should treat `l1_to_id_choice` as introductory (`introduced_by`) rather than only looking for capability types that contain `recognition`;
- release tests must cover publish/materialize/health/promote handling for the bridge capability.
