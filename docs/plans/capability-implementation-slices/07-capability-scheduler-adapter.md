# Slice 07: Capability Scheduler Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read due active capabilities and compute schedule previews without owning committed review writes.

**Architecture:** Add a Scheduler Module with two adapters during migration: legacy skill state and learner capability state.

**Tech Stack:** TypeScript, ts-fsrs, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Due reads and preview calculation only. Review Processor remains the only write owner.

## Files

- Create: `src/lib/capabilities/capabilityScheduler.ts`
- Create: `src/__tests__/capabilityScheduler.test.ts`
- Modify: `src/lib/fsrs.ts` only if shared helpers are needed.
- Modify: `src/services/learnerStateService.ts` only to add read adapter functions, not write behavior changes.

## Interface

```ts
export interface DueCapabilityRequest {
  userId: string
  now: Date
  mode: SessionMode
  limit: number
}

export function getDueCapabilities(request: DueCapabilityRequest): Promise<DueCapability[]>
export function previewScheduleUpdate(input: CapabilityReviewPreview): SchedulePreview
```

## Rules

- Exclude blocked, deprecated, exposure-only, unknown-readiness capabilities.
- Exclude dormant learner activation states.
- Do not mutate learner state.
- Spread multiple capabilities for the same content unit across sessions when requested by policy.

## Verification

Run:

```bash
bun run test -- src/__tests__/capabilityScheduler.test.ts src/__tests__/fsrs.test.ts
bun run build
```

## Acceptance Criteria

- Same FSRS math as current scheduler where inputs are equivalent.
- Due list can run in shadow mode beside current `sessionQueue.ts` due selection.
- Write attempts are impossible through this module Interface.

## Out Of Scope

- Session composition.
- Answer commits.
- Exercise rendering.
