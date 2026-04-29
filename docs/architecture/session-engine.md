# Session Engine

Current session code has two paths:

```text
legacy item queue:
  src/lib/sessionQueue.ts
  src/lib/sessionPolicies.ts

capability session path:
  src/lib/session/capabilitySessionLoader.ts
  src/lib/pedagogy/pedagogyPlanner.ts
  src/lib/session/sessionComposer.ts
```

The legacy queue still powers the normal item-based session UI. The capability path is the newer, fail-closed planner/composer path used for ready/published learning capabilities and capability review events.

## Legacy Item Queue

`buildSessionQueue` in `src/lib/sessionQueue.ts` builds `SessionQueueItem[]` from item state, skill state, meanings, contexts, exercise variants, lesson order, and exercise availability.

Current legacy modes are:

```text
standard
quick
backlog_clear
```

Lesson-scoped modes are not handled by the legacy queue. If `lesson_practice` or `lesson_review` reaches `buildSessionQueue`, it fails closed with an empty queue instead of falling back to global material.

Unsupported older modes such as `recall_sprint` and `push_to_productive` should not be documented as active behavior.

The legacy queue uses:

- item buckets for new, anchoring, due, and grammar;
- lesson gating for new vocabulary;
- `dailyNewItemsLimit` plus session size caps;
- stage-based exercise selection;
- `applyPolicies` after queue construction.

## Capability Session Path

The capability path is organized around capability rows rather than item-stage rows.

Important modules:

```text
src/lib/session/capabilitySessionLoader.ts
src/services/capabilitySessionDataService.ts
src/lib/pedagogy/pedagogyPlanner.ts
src/lib/pedagogy/loadBudgets.ts
src/lib/pedagogy/sessionPosture.ts
src/lib/session/sessionComposer.ts
src/lib/exercises/exerciseResolver.ts
```

The capability path uses:

- `learning_capabilities` for canonical capability identity;
- `learner_capability_state` for FSRS state;
- `capability_review_events` for capability answer history;
- source-progress gates before lesson-sequenced capabilities can be introduced;
- posture-aware load budgets for new capabilities, concepts, production, hidden audio, and source switches.

Capability session modes are:

```text
standard
lesson_practice
lesson_review
```

`standard` is the global Today path. `lesson_practice` and `lesson_review` are launched from an individual lesson page with `selectedLessonId` and `selectedSourceRefs`. They are selected-lesson only, FSRS-writing sessions: the loader filters due, active, and new capabilities to that lesson's source refs before the composer fills the session. `lesson_review` does not introduce new capabilities.

If the selected lesson scope is missing, the capability loader returns a fail-closed session plan with a critical diagnostic instead of borrowing content from the global path.

## Capability Introduction Order

For vocabulary, current projection creates:

```text
text_recognition
l1_to_id_choice
meaning_recall
form_recall
audio_recognition
dictation
```

`l1_to_id_choice` is the Dutch-to-Indonesian choice bridge. It uses `skillType: meaning_recall` only as a compatibility field; the separate capability row and `capabilityType` are the scheduling boundary.

## Related Specs

The learning-experience rules and implementation plan live here:

```text
docs/plans/2026-04-28-learning-experience-rules.md
docs/plans/2026-04-28-learning-experience-implementation-spec.md
docs/plans/2026-04-28-learning-experience-implementation-plan.md
```
