# Slice 03: Capability Contract Validation and Health Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate projected capabilities against typed artifacts and report ready, blocked, exposure-only, deprecated, and unknown states.

**Architecture:** Add a Capability Contract Module whose Interface is the single seam for schedulability and fail-closed readiness.

**Tech Stack:** TypeScript, Vitest, existing scripts under `scripts/`.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`

---

## Scope

Add validation and a script report. No session behavior changes and no DB writes.

## Files

- Create: `src/lib/capabilities/artifactRegistry.ts`
- Create: `src/lib/capabilities/capabilityContracts.ts`
- Create: `src/__tests__/capabilityContracts.test.ts`
- Create: `scripts/check-capability-health.ts`
- Create: `scripts/__tests__/check-capability-health.test.ts` with extracted pure report/exit-code logic
- Modify: `package.json` only if adding a script alias such as `check:capabilities`

## Interface

```ts
export type CapabilityReadiness =
  | { status: 'ready'; allowedExercises: ExerciseKind[] }
  | { status: 'blocked'; missingArtifacts: ArtifactKind[]; reason: string }
  | { status: 'exposure_only'; reason: string }
  | { status: 'deprecated'; replacementKey?: string }
  | { status: 'unknown'; reason: string }

export type ArtifactQualityStatus = 'draft' | 'approved' | 'blocked' | 'deprecated'

export function validateCapability(input: {
  capability: ProjectedCapability
  artifacts: ArtifactIndex
  exerciseAvailability?: ExerciseAvailabilityIndex
}): CapabilityReadiness

export function validateCapabilities(input: {
  projection: CapabilityProjection
  artifacts: ArtifactIndex
}): CapabilityHealthReport
```

## Artifact Registry

Use the canonical registry from the architecture docs, including `meaning:l1`, `meaning:nl`, `meaning:en`, `translation:l1`, `accepted_answers:l1`, `accepted_answers:id`, `base_text`, `cloze_context`, `cloze_answer`, `exercise_variant`, `audio_clip`, `audio_segment`, `transcript_segment`, `root_derived_pair`, `allomorph_rule`, `pattern_explanation:l1`, `pattern_example`, `minimal_pair`, `dialogue_speaker_context`, `podcast_gist_prompt`, `timecoded_phrase`, and `production_rubric`.

`exposure_only` is not an artifact quality status. It is a capability readiness state.

## Validation Rules

- Unknown readiness behaves as blocked for scheduling.
- Artifact quality statuses are `draft`, `approved`, `blocked`, and `deprecated`.
- Only `approved` artifacts can satisfy learner-facing capability readiness.
- `draft` artifacts can render in admin preview only.
- `blocked` and `deprecated` artifacts must fail closed for learner scheduling, with a blocked readiness reason rather than silently counting as present.
- `exerciseAvailability` is an optional Availability Gate adapter that may only tighten `allowedExercises`; it must never turn blocked, unknown, exposure-only, or deprecated readiness into ready.
- `meaning_recall` requires `meaning:l1` and `accepted_answers:l1`.
- `form_recall` requires `meaning:l1`, `base_text`, and `accepted_answers:id`.
- Audio capabilities require approved audio artifacts.
- Contextual cloze requires `cloze_context`, `cloze_answer`, and `translation:l1` so learner feedback can explain the intended meaning.
- Pattern recognition requires `pattern_explanation:l1` and at least one typed `pattern_example`; do not rely on untyped prose such as "approved examples".

## Health Report Inputs and Exit Codes

- Default fixture/staged input: `scripts/data/staging/lesson-1`.
- The script must also support an explicit `--staging scripts/data/staging/lesson-N` path.
- `bun scripts/check-capability-health.ts` exits `0` when it can produce a report, even if it finds blocked capabilities.
- `bun scripts/check-capability-health.ts --strict` exits nonzero only when CRITICAL findings exist, such as malformed canonical keys, unknown artifact kinds, or schedulable blocked capabilities.

## Verification

Run:

```bash
bun run test -- src/__tests__/capabilityContracts.test.ts scripts/__tests__/check-capability-health.test.ts
bun scripts/check-capability-health.ts --help
bun scripts/check-capability-health.ts --staging scripts/data/staging/lesson-1
bun scripts/check-capability-health.ts --staging scripts/data/staging/lesson-1 --strict
bun run build
```

## Acceptance Criteria

- Existing unrenderable/orphan content reports blocked.
- No blocked capability is counted as reviewable.
- The report can run without Supabase credentials by using `scripts/data/staging/lesson-1` or test fixtures.
- `--strict` behavior is documented and tested.

## Out Of Scope

- Changing session selection.
- Creating capability DB tables.
- Publishing new content format.
