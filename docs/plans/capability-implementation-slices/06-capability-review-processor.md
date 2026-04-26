# Slice 06: Capability Review Processor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the atomic and idempotent write path for capability answer reports, review events, first-review activation, and learner capability FSRS state.

**Architecture:** Add a Review Processor Module that owns answer persistence, validated grading/rating outcomes, TypeScript FSRS computation, schedule updates, counters, idempotency, version snapshots, and rollback semantics behind one database commit seam.

**Tech Stack:** TypeScript, Supabase RPC in the `indonesian` schema, ts-fsrs, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Capability-native review write path, initially shadow or compatibility mode. No new session composer yet.

## Prerequisites

- Slice 01A exists and provides disabled-by-default `VITE_CAPABILITY_REVIEW_SHADOW` and `VITE_CAPABILITY_REVIEW_COMPAT` flags.
- Slice 01A exists and provides stable `sessionItemId` plus explicit `attemptNumber`/idempotency key construction.
- Slice 05 capability tables exist in the `indonesian` schema with RLS/grants verified.

## Files

- Create: `src/lib/reviews/capabilityReviewProcessor.ts`
- Create: `src/__tests__/capabilityReviewProcessor.test.ts`
- Modify: `src/lib/reviewHandler.ts` only behind compatibility/shadow feature flags from Slice 01A.
- Modify or add service: `src/services/reviewEventService.ts` / `src/services/capabilityReviewService.ts`
- Create source-of-truth RPC migration: `scripts/migrations/2026-04-25-capability-review-rpc.sql`
- If the current migration runner only accepts `scripts/migration.sql`, copy the RPC migration content there for execution only.

## Interface

```ts
export interface CapabilityAnswerReportCommand {
  userId: string
  sessionId: string
  sessionItemId: string
  attemptNumber: number
  idempotencyKey: string
  capabilityId: string
  canonicalKeySnapshot: string
  answerReport: AnswerReport
  precomputedOutcome?: ValidatedReviewOutcome
  schedulerSnapshot: CapabilityScheduleSnapshot
  currentStateVersion?: number
  artifactVersionSnapshot: Record<string, unknown>
  activationRequest?: CapabilityActivationRequest
  submittedAt: string
}

export interface CapabilityActivationRequest {
  reason: 'eligible_new_capability' | 'intro_completion_review'
  plannerRunId?: string
  sourceProgressSnapshot?: Record<string, unknown>
}

export interface CapabilityReviewCommitResult {
  idempotencyStatus: 'committed' | 'duplicate_returned' | 'rejected_stale' | 'rejected_invalid_outcome'
  reviewEventId: string
  activatedCapabilityStateId?: string
  schedule: CapabilityScheduleSnapshot
  masteryRefreshQueued: boolean
}

export function commitCapabilityAnswerReport(command: CapabilityAnswerReportCommand): Promise<CapabilityReviewCommitResult>
```

## Database RPC Seam

Create one schema-qualified RPC as the atomic commit seam. Do not reimplement FSRS math in PL/pgSQL in this slice; the existing implementation is TypeScript/`ts-fsrs`, so the Review Processor computes the proposed state transition before calling the RPC.

```sql
create or replace function indonesian.commit_capability_answer_report(p_command jsonb)
returns jsonb
language plpgsql
security definer
as $$
-- validate auth/user ownership, idempotency, snapshots, activation, event insert, FSRS state update, and result JSON
$$;
```

Service adapter call shape:

```ts
await supabase
  .schema('indonesian')
  .rpc('commit_capability_answer_report', { p_command: command })
```

RPC requirements:

- Verify `auth.uid()` matches `p_command->>'userId'` unless the caller is an explicitly privileged server/admin path.
- Check duplicate `(user_id, idempotency_key)` before changing state and return the original result for duplicates.
- Verify the current capability has `readiness_status = 'ready'` and `publication_status = 'published'` before creating/reusing active learner state or committing a review.
- Lock the target `learner_capability_state` row, or create and lock it when valid activation is requested.
- Compare `schedulerSnapshot` and `currentStateVersion` to current DB state before applying FSRS changes.
- Compare `stateBefore` in the Review Processor's commit plan to the locked DB row before applying `stateAfter`.
- Verify `fsrsAlgorithmVersion`, rating, state version increment, due-date monotonicity rules, and counter deltas are structurally valid; the RPC validates snapshot consistency and ownership, while TypeScript Review Processor owns FSRS math.
- Insert exactly one `indonesian.capability_review_events` row per committed attempt.
- Update `indonesian.learner_capability_state` and counters in the same transaction.
- Return the committed schedule snapshot and idempotency status.
- Grant execute deliberately and add RLS/policy notes in the migration.
- Include rollback SQL to drop/revoke the RPC and disable compatibility flags.

## Ownership Rules

- Callers submit an answer report. They do not get to directly decide final FSRS state.
- The TypeScript Review Processor either grades/rates the answer report itself or validates a `precomputedOutcome` from an approved scoring adapter, then computes `stateAfter` with the existing `ts-fsrs` implementation.
- A caller-provided outcome without validation is rejected.
- UI code must not call the RPC directly with hand-authored FSRS state. The only app adapter that builds `p_command.stateAfter` is `capabilityReviewProcessor.ts`.
- The Review Processor owns first-review activation for eligible dormant capabilities. It creates or reuses the `learner_capability_state` row with `activation_state = 'active'`, initialized FSRS state, and activation provenance before applying the review.
- Pedagogy Planner may recommend activation. Session Composer may include a pending activation item. Neither writes activation state.

## Review Plan and Atomic Commit Requirements

The Review Processor has two phases:

1. TypeScript planning phase in `capabilityReviewProcessor.ts`: validate or infer the final `ValidatedReviewOutcome`, compute the proposed `stateAfter` with `ts-fsrs`, and build the RPC command.
2. Database commit phase in `indonesian.commit_capability_answer_report(p_command jsonb)`: atomically verify the command is still current and persist it.

The database commit phase performs these steps inside one transaction:

1. Check `idempotencyKey` and return the original result for duplicates.
2. Load current capability, artifact fingerprint, and learner state.
3. Compare `schedulerSnapshot`, `currentStateVersion`, and `stateBefore` to current state.
4. Reject stale submissions unless a documented recompute path is used.
5. Verify capability `readiness_status = 'ready'` and `publication_status = 'published'`.
6. If the capability is eligible dormant and `activationRequest` is valid, create/reuse the active learner state row idempotently.
7. Validate `stateAfter` structure, rating, algorithm version, state version increment, and counter deltas from the TypeScript plan.
8. Insert `capability_review_events` with answer report, scheduler snapshot, state-before/state-after, and artifact version snapshots.
9. Update learner capability FSRS state.
10. Update lapse and consecutive failure counters.
11. Queue mastery refresh if needed.

## Verification

Run:

```bash
bun run test -- src/__tests__/capabilityReviewProcessor.test.ts src/__tests__/reviewHandler.test.ts src/__tests__/sessionItemIdentity.test.ts
bun run build
```

Supabase/RPC verification:

```text
select to_regprocedure('indonesian.commit_capability_answer_report(jsonb)');
call or select the RPC twice with the same idempotency key in a test database and verify only one review event and one FSRS state update occur.
verify stale scheduler snapshots return `rejected_stale` without changing learner state.
```

## Acceptance Criteria

- Duplicate submission does not apply FSRS twice.
- Stale scheduler or artifact snapshots are rejected or explicitly recomputed in one transaction.
- Non-ready, unpublished, retired, blocked, exposure-only, deprecated, or unknown capabilities cannot be activated or reviewed through the RPC.
- First committed review for an eligible dormant capability activates it idempotently with provenance.
- Caller-provided outcomes are accepted only through validated scoring adapters.
- RPC lives in the `indonesian` schema with grants/RLS/auth checks documented.
- Legacy review path remains available.
- Shadow mode can compare old and new outcomes without changing user-visible behavior.

## Out Of Scope

- Scheduler due-list replacement.
- New Exercise Resolver.
- UI changes.
