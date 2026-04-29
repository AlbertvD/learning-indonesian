# Slice 09: Capability Session Composer MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compose the standard daily session from due active capabilities and eligible new capabilities behind a disabled-by-default feature flag.

**Architecture:** Add a Session Composer Module that consumes Scheduler, Pedagogy Planner, and Exercise Resolver outputs while keeping old sessionQueue as fallback. The module composes; it does not activate capabilities or write review state.

**Tech Stack:** TypeScript, existing `src/lib/sessionQueue.ts`, `src/pages/Session.tsx`, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`

---

## Scope

Standard daily session only. Flat adapter into existing exercise shell. No rich block UI yet.

## Prerequisites

- Slice 01A capability migration flags are implemented and tested as disabled by default.
- Slice 01A stable session item identity exists for idempotency inputs.
- Slice 06 Review Processor shadow comparison is clean enough for the selected cohort.
- Slice 07 Scheduler Adapter exists for active due capability reads.
- Slice 07A Pedagogy Planner exists for eligible new capability recommendations.
- Slice 08 Exercise Resolver exists for capability-to-exercise render plans.
- Review Processor idempotency tests and stale scheduler snapshot tests pass.
- Compatibility review writes are enabled behind `VITE_CAPABILITY_REVIEW_COMPAT=true` for the target environment.
- Fallback and rollback path to current `sessionQueue.ts` behavior is documented.

## Files

- Create: `src/lib/session/sessionComposer.ts`
- Create: `src/lib/session/capabilitySessionLoader.ts`
- Create: `src/lib/session/sessionPlan.ts`
- Create: `src/__tests__/sessionComposer.test.ts`
- Create: `src/__tests__/capabilitySessionLoader.test.ts`
- Modify: `src/pages/Session.tsx` to call the async capability loader only behind `VITE_CAPABILITY_STANDARD_SESSION`.
- Keep: `src/lib/sessionQueue.ts` as the synchronous fallback path; do not call async composer from inside it.
- Read: `src/lib/featureFlags.ts` capability migration flags from Slice 01A; do not reimplement flag parsing.

## Interface

```ts
export interface SessionPlan {
  id: string
  mode: 'standard'
  title: string
  blocks: SessionBlock[]
  recapPolicy: RecapPolicy
}

export interface PendingActivationSessionItem {
  capabilityId: string
  canonicalKeySnapshot: string
  activationRequest: CapabilityActivationRequest
  requiredActivationOwner: 'review_processor'
}

export function composeSession(request: SessionRequest): Promise<SessionPlan>
export function loadCapabilitySessionPlan(request: SessionRequest): Promise<SessionPlan>
```

## Feature Flags

Use the explicit capability migration flags from Slice 01A; they must default to false when undefined or empty:

```text
VITE_CAPABILITY_SESSION_DIAGNOSTICS
VITE_CAPABILITY_REVIEW_SHADOW
VITE_CAPABILITY_REVIEW_COMPAT
VITE_CAPABILITY_STANDARD_SESSION
VITE_LESSON_READER_V2
```

Do not use the existing `parseEnvFlag` default-true behavior for these flags. Slice 09 should only consume the Slice 01A flags and may add composer-specific tests proving the off path remains unchanged.

## Rules

- Feature flag off: `src/pages/Session.tsx` continues calling the existing synchronous `sessionQueue.ts` path.
- Feature flag on: `src/pages/Session.tsx` enters an async loading state, calls `loadCapabilitySessionPlan`, and fails closed on loader errors by showing a safe retry/error state with diagnostics.
- The existing session path is a rollback adapter only when `VITE_CAPABILITY_STANDARD_SESSION=false`; do not automatically fall back to legacy scheduling while the capability flag is enabled.
- Do not change the synchronous return type of the current `sessionQueue.ts` seam in this slice.
- Due ready active capabilities first.
- New introductions only through Pedagogy Planner eligibility.
- Composer may include eligible new capabilities as pending activation items, but it must not persist activation.
- Activation is persisted only by Review Processor on the first committed answer/introduction-completion review.
- Honor source progress gates.
- Enforce daily/standard load budget.
- Use Exercise Resolver for every review item and omit/log failed resolutions.
- Output can be adapted to current `SessionQueueItem` shell for MVP.

## Verification

Run:

```bash
bun run test -- src/__tests__/sessionComposer.test.ts src/__tests__/capabilitySessionLoader.test.ts src/__tests__/sessionQueue.test.ts src/__tests__/sessionFlow.test.tsx src/__tests__/featureFlags.test.ts
bun run build
```

## Acceptance Criteria

- Feature flag off: current session behavior unchanged.
- Feature flag on: standard session contains no blocked capabilities.
- Feature flag on: loader errors do not schedule legacy content; operators must disable the flag to roll back.
- Async loader integration is explicit in `Session.tsx`; no Promise is returned from the existing synchronous session queue function.
- Pending activation items carry enough data for Review Processor, but Session Composer does not write activation state.
- Answer submission uses Review Processor compatibility path before full cutover.
- Capability migration flags are disabled by default.

## Out Of Scope

- Quick/backlog/listening modes.
- Lesson Reader.
- Rich Experience Player blocks.
