# Session Engine

The runtime session engine is the capability path:

```text
capability session path:
  src/lib/session/capabilitySessionLoader.ts
  src/lib/pedagogy/pedagogyPlanner.ts
  src/lib/session/sessionComposer.ts
```

It is the fail-closed planner/composer path used for ready/published learning capabilities and capability review events. The legacy item queue (`sessionQueue.ts` + `sessionPolicies.ts`) was retired in retirement #7 (2026-05-08); see `docs/plans/2026-05-08-retire-legacy-lib-root.md`.

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
