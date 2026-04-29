# Slice 01A: Runtime Migration Safety Substrate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add disabled-by-default capability migration flags and stable session item identity before any diagnostics, shadow review, or compatibility write path can run.

**Architecture:** Add a small safety Module that prevents experimental capability behavior from turning on accidentally and gives later Modules a stable Interface for idempotency inputs.

**Tech Stack:** TypeScript, Vitest, existing `src/lib/featureFlags.ts`, existing `src/lib/sessionQueue.ts`.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Runtime safety only. No capability projection, persistence, diagnostics, review writes, or UI changes.

## Files

- Modify: `src/lib/featureFlags.ts`
- Create: `src/__tests__/featureFlags.test.ts`
- Create: `src/lib/session/sessionItemIdentity.ts`
- Create: `src/__tests__/sessionItemIdentity.test.ts`
- Modify: `src/types/learning.ts` only if adding optional identity fields to `SessionQueueItem`.
- Modify: `src/lib/sessionQueue.ts` only to attach stable identity metadata without changing ordering or selection behavior.

## Feature Flag Interface

Add a disabled-by-default parser for capability migration flags. Do not use the existing `parseEnvFlag`, because it treats undefined and empty values as enabled.

```ts
export function parseDisabledByDefaultFlag(key: string): boolean

export const capabilityMigrationFlags = {
  sessionDiagnostics: parseDisabledByDefaultFlag('VITE_CAPABILITY_SESSION_DIAGNOSTICS'),
  reviewShadow: parseDisabledByDefaultFlag('VITE_CAPABILITY_REVIEW_SHADOW'),
  reviewCompat: parseDisabledByDefaultFlag('VITE_CAPABILITY_REVIEW_COMPAT'),
  standardSession: parseDisabledByDefaultFlag('VITE_CAPABILITY_STANDARD_SESSION'),
  experiencePlayerV1: parseDisabledByDefaultFlag('VITE_EXPERIENCE_PLAYER_V1'),
  lessonReaderV2: parseDisabledByDefaultFlag('VITE_LESSON_READER_V2'),
}
```

Rules:

- `undefined`, empty string, `false`, and `0` mean disabled.
- `true` and `1` mean enabled.
- Unknown capability migration flags are disabled by default.
- Existing broad-availability exercise flags keep their current behavior until a separate cleanup decision.

## Stable Session Item Identity Interface

Current `SessionQueueItem` has no stable item id, and current review handling hard-codes attempt number behavior. Later slices need stable ids before they can safely compute idempotency keys.

```ts
export interface StableSessionItemIdentity {
  sessionItemId: string
  source: 'vocab' | 'grammar'
  sourceId: string
  skillType?: string
  grammarPatternId?: string
  capabilityKeyHint?: string
}

export function getStableSessionItemIdentity(item: SessionQueueItem): StableSessionItemIdentity
export function buildReviewIdempotencyKey(input: {
  sessionId: string
  sessionItemId: string
  attemptNumber: number
}): string
```

Identity rules:

- Vocab item id source: `exerciseItem.learning_item_id` or the current equivalent stable learning-item id.
- Grammar item id source: `grammarPatternId` plus exercise/pattern type.
- Include skill/exercise type where needed so two exercises for the same learning item do not collide.
- `sessionItemId` must be deterministic for the same generated queue item and independent of array index.
- `attemptNumber` is explicit input. Do not hide `attempt_number: 1` inside the review write path.

## Verification

Run:

```bash
bun run test -- src/__tests__/featureFlags.test.ts src/__tests__/sessionItemIdentity.test.ts src/__tests__/sessionQueue.test.ts
bun run build
```

## Acceptance Criteria

- Capability migration flags are disabled when env vars are missing or empty.
- Existing exercise/content flags are not changed accidentally.
- Every current `SessionQueueItem` can produce a stable `sessionItemId`.
- Review idempotency key construction is deterministic and tested.
- No learner-visible session behavior changes.

## Out Of Scope

- Capability diagnostics.
- Capability Review Processor.
- DB schema or RPC creation.
- Session composer.
