# Slice 08: Exercise Resolver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve ready capabilities into exercise render plans without session code knowing exercise-specific content rules.

**Architecture:** Add an Exercise Resolver Module whose Interface is the only place that maps capability plus artifacts to renderable exercises and explicit non-renderable failures.

**Tech Stack:** TypeScript, React exercise registry, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`

---

## Scope

Resolution layer and tests. Existing exercise components remain largely unchanged.

## Files

- Create: `src/lib/exercises/exerciseResolver.ts`
- Create: `src/lib/exercises/exerciseRenderPlan.ts`
- Create: `src/__tests__/exerciseResolver.test.ts`
- Modify: `src/components/exercises/registry.ts` if needed to accept `ExerciseRenderPlan`.
- Modify existing exercise tests only to add resolver-path coverage.

## Interface

```ts
export type ExerciseResolutionFailureReason =
  | 'capability_not_ready'
  | 'missing_required_artifact'
  | 'no_supported_exercise_family'
  | 'fallback_blocked'
  | 'device_constraints_blocked'

export type ExerciseResolutionResult =
  | { status: 'resolved'; plan: ExerciseRenderPlan }
  | { status: 'failed'; reason: ExerciseResolutionFailureReason; details: string; missingArtifacts?: ArtifactKind[] }

export interface ExerciseResolutionInput {
  capability: ProjectedCapability | LearningCapabilityRow
  readiness: CapabilityReadiness
  artifactIndex: ArtifactIndex
  learnerPreferences?: ExercisePreferences
  deviceContext?: DeviceContext
}

export function resolveExercise(input: ExerciseResolutionInput): ExerciseResolutionResult
```

## Rules

- Refuse anything except `ready` capability readiness.
- Return explicit failure result instead of random fallback.
- Do not revive blocked capability through legacy exercise variants.
- Runtime-generated exercises are allowed only when required facts are approved.
- Device context may influence rendering choice but not capability semantics.
- The caller must handle `failed` by omitting the item from the session and logging diagnostics; it must not silently substitute an unrelated legacy card.

## First Capability Types

- text recognition
- meaning recall
- form recall
- contextual cloze
- audio recognition
- dictation
- grammar/pattern recognition or contrast

## Verification

Run:

```bash
bun run test -- src/__tests__/exerciseResolver.test.ts src/__tests__/exerciseShellRegistryPath.test.tsx
bun run build
```

## Acceptance Criteria

- Supported current exercises can be represented as render plans.
- Blocked capability cannot resolve.
- Missing artifact yields a typed failure reason.
- No-exercise-family and blocked-fallback cases are tested.

## Out Of Scope

- New exercise UI designs.
- Session composer switch.
- Review write changes.
