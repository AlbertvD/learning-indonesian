# Slice 04: Capability-Aware Session Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit current session output against projected capability readiness without changing learner-visible behavior.

**Architecture:** Add diagnostic adapters that map existing session queue items to capability keys and report mismatches in dev/admin mode.

**Tech Stack:** TypeScript, Vitest, existing `src/lib/sessionQueue.ts`.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Shadow diagnostics only. Current `sessionQueue.ts` remains authoritative.

## Files

- Create: `src/lib/capabilities/sessionCapabilityDiagnostics.ts`
- Create: `src/__tests__/sessionCapabilityDiagnostics.test.ts`
- Modify: `src/lib/sessionQueue.ts` only behind a diagnostic flag.
- Modify: `src/lib/featureFlags.ts` to add `capabilitySessionDiagnostics` if needed.

## Interface

```ts
export interface SessionCapabilityDiagnostic {
  sessionItemId: string // from getStableSessionItemIdentity
  impliedCapabilityKey?: string
  readiness?: CapabilityReadiness
  severity: 'info' | 'warn' | 'critical'
  message: string
}

export function diagnoseSessionItems(input: {
  items: SessionQueueItem[]
  projection: CapabilityProjection
  health: CapabilityHealthReport
}): SessionCapabilityDiagnostic[]
```

## Rules

- Diagnostic code must not filter, reorder, or mutate the current session queue.
- Missing mapping is a warning unless the item is intended to be capability-supported.
- Blocked capability selected by current session is critical.
- Legacy-only item types are allowed but visible as unmapped.

## Verification

Run:

```bash
bun run test -- src/__tests__/sessionCapabilityDiagnostics.test.ts src/__tests__/sessionQueue.test.ts
bun run build
```

## Acceptance Criteria

- Diagnostics can explain whether each current session item maps to a ready capability.
- No learner-visible session behavior changes.
- Feature flag VITE_CAPABILITY_SESSION_DIAGNOSTICS is disabled by default and can disable all diagnostics.
- Diagnostics use stable session item identity and do not depend on queue array index.

## Out Of Scope

- New session composer.
- Exercise resolver changes.
- Review write changes.
