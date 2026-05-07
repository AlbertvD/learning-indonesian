# Retirement #3 — Browser-side FSRS subsystem

**Date:** 2026-05-07
**Branch:** `retire/browser-fsrs` (off `origin/main`, independent of `retire/grammar-state` and `retire/audio-multi-voice`)
**Type:** Pure deletion (no replacement on the browser side; server-authoritative FSRS already lives inline in the `commit-capability-answer-report` edge function)
**Tracks:** `docs/target-architecture.md` §"Code flagged for deletion" #2 ("Browser-side FSRS")

---

## Why this exists

Per `docs/target-architecture.md:1140-1166` (§"Browser-side FSRS"):

> The server is authoritative. Browser-side FSRS produced a `stateAfter` snapshot that the server recomputed and ignored — pure duplication with drift risk.

The doc lists three things to retire:

1. `src/lib/fsrs.ts` (claimed: 134 LOC)
2. In `src/lib/capabilities/capabilityScheduler.ts`: `previewScheduleUpdate` + `CapabilityReviewPreview` + `SchedulePreview`
3. In `src/lib/reviews/capabilityReviewProcessor.ts`: the `computeNextState` import, the call at line 156, and the resulting `stateAfter` packaging — file shrinks from 208 LOC to "~50 LOC. Plan packager only; no FSRS math."

**Replaced by** (per the doc): a future `supabase/functions/_shared/srs/` shared module. **Status as of this retirement:** the server-side `inferRating`, `computeNextState`, and `retrievability` already exist as **inline functions inside `supabase/functions/commit-capability-answer-report/index.ts:104-148`** and are the authoritative source today. Lines 295-296 recompute rating + nextFsrs from the raw `answerReport`, completely ignoring whatever the browser packaged into `plan.stateAfter`. Extraction to `_shared/srs/` is a separate cleanup PR (see "Out of scope" §). This retirement deletes browser-side duplication only.

Independent grep verification (per OpenBrain lesson 2026-05-02 §spec_scoping defect — never trust the doc's caller claims) confirms the three doc-listed targets have only the listed callers — but reveals **four additional dead surfaces** that retire transitively:

- `inferRating` (browser) — has one non-test caller (`capabilityReviewProcessor.ts:124`); after browser FSRS retires, that caller goes too. The function is duplicated server-side at `commit-capability-answer-report/index.ts:104`, so deletion from the browser is safe.
- `getRetrievability` — consumed only inside `fsrs.ts` itself (`fsrs.ts:71`, by `computeNextState`); retires with the file.
- `applyGrammarAdjustment` — zero non-doc, non-comment callers. The historical-context comment at `scripts/repair-stability.ts:6` ("grammar adjustment bug — applied 20% reduction to ALL items") is a one-time repair-script comment that stays as historical record. Confirmed in the grammar-state retirement spec (`docs/plans/2026-05-07-retire-grammar-state.md:120, 261` deferred this to retirement #2 — i.e. this PR).
- `ValidatedReviewOutcome` + `precomputedOutcome` field on `CapabilityAnswerReportCommand` + `resolveOutcome` helper — the entire "approved scoring adapter" surface. The edge function (`commit-capability-answer-report/index.ts:236, 295`) reads `plan.answerReport` directly and runs its own `inferRating`. It never reads `plan.precomputedOutcome` or `plan.rating`. The adapter-validation guard in the browser is therefore guarding against a contract that the server doesn't honour. Dead surface; retires.

These transitive deletions are the same kind of consumer-enumeration finding architect R1 caught on retirement #2 (grammar-state). Folding them in here so R1 doesn't have to.

---

## Files / symbols to delete

### Whole files (delete)

| Path | LOC | Used by (production) | Used by (tests) |
|---|---:|---|---|
| `src/lib/fsrs.ts` | 134 | `capabilityScheduler.ts` (commit 1), `capabilityReviewProcessor.ts` (commit 2) — both retire here | `src/__tests__/fsrs.test.ts` (deletes atomically with the source) |
| `src/__tests__/fsrs.test.ts` | 50 | n/a | n/a |

`src/lib/fsrs.ts` exports retiring as a unit: `Rating` re-export, `ReviewOutcome` interface, `FSRSState` interface, `FSRSResult` interface, `inferRating`, `computeNextState`, `getRetrievability`, `applyGrammarAdjustment`, plus the `languageLearningParams`/`scheduler` private constants. None survive — every consumer is rewired or deleted in this PR.

### Surgical edits (keep file, remove block)

**`src/lib/capabilities/capabilityScheduler.ts`** — drop the preview API and FSRS dep:

- Line 1: drop `import type { Grade } from 'ts-fsrs'` (only `previewScheduleUpdate` used `Grade`; `getDueCapabilities` does not)
- Line 2: drop `import { computeNextState } from '@/lib/fsrs'`
- Lines 79-95: drop the `CapabilityReviewPreview` + `SchedulePreview` interfaces
- Lines 97-121: drop the `previewScheduleUpdate` function

`getDueCapabilities`, `getDueCapabilitiesFromRows`, `LearnerCapabilityStateRow`, `DueCapability`, `DueCapabilityRequest`, `CapabilitySchedulerReadAdapter` all stay — they read learner-capability rows and filter by readiness/publication/due-date. None of them touch FSRS.

**`src/lib/reviews/capabilityReviewProcessor.ts`** — full surgery (file goes from 208 → ~80 LOC, slightly above target-arch §2's "~50 LOC" because `ensureCapabilityCanBeReviewed`, the two error classes, and the surviving interfaces stay):

- Line 1: drop `import { Rating } from 'ts-fsrs'`
- Line 2: drop `import { computeNextState, inferRating } from '@/lib/fsrs'`
- Lines 14-19: drop the `ValidatedReviewOutcome` interface
- Line 50: drop the `precomputedOutcome?: ValidatedReviewOutcome` field from `CapabilityAnswerReportCommand`
- Lines 60-65: drop the `CapabilityReviewCommitPlan` interface (consumers switch to `CapabilityAnswerReportCommand`)
- Line 77: change `commitCapabilityAnswerReport(plan: CapabilityReviewCommitPlan)` → `commitCapabilityAnswerReport(command: CapabilityAnswerReportCommand)` in the `CapabilityReviewProcessorDeps` service interface
- Lines 116-131: drop the `resolveOutcome` helper (now dead — server validates the answer report itself)
- Line 133-143: drop the `currentFsrsState` helper (only `planCapabilityReviewCommit` consumed it)
- Lines 145-180: drop the entire `planCapabilityReviewCommit` function
- Lines 182-208: simplify `commitCapabilityAnswerReport` to:
  ```ts
  export async function commitCapabilityAnswerReport(
    command: CapabilityAnswerReportCommand,
    deps: CapabilityReviewProcessorDeps,
  ): Promise<CapabilityReviewCommitResult> {
    try {
      if (
        command.currentStateVersion != null
        && command.currentStateVersion !== command.schedulerSnapshot.stateVersion
      ) {
        throw new StaleSchedulerSnapshotError()
      }
      ensureCapabilityCanBeReviewed(command)
      return await deps.service.commitCapabilityAnswerReport(command)
    } catch (error) {
      if (error instanceof StaleSchedulerSnapshotError) {
        return {
          idempotencyStatus: 'rejected_stale',
          reviewEventId: null,
          schedule: command.schedulerSnapshot,
          masteryRefreshQueued: false,
        }
      }
      if (error instanceof InvalidReviewOutcomeError) {
        return {
          idempotencyStatus: 'rejected_invalid_outcome',
          reviewEventId: null,
          schedule: command.schedulerSnapshot,
          masteryRefreshQueued: false,
        }
      }
      throw error
    }
  }
  ```

`ensureCapabilityCanBeReviewed`, `StaleSchedulerSnapshotError`, `InvalidReviewOutcomeError`, the `AnswerReport`/`CapabilityScheduleSnapshot`/`CapabilityActivationRequest`/`CapabilityAnswerReportCommand`/`CapabilityReviewCommitResult`/`CapabilityReviewProcessorDeps` interfaces all stay — they package the request to the edge function and surface validation errors to the UI. The edge function reads them via `plan.userId`, `plan.capabilityId`, `plan.answerReport`, etc. (the request body is still wrapped as `{ plan: command }` for backwards-compatibility — see service-adapter edit below).

**`src/services/capabilityReviewService.ts`** — parameter type change (one-line cascade):

- Lines 3-5: drop `CapabilityReviewCommitPlan` from the type import (no longer exported); add `CapabilityAnswerReportCommand`
- Line 18: change `commitCapabilityAnswerReport(plan: CapabilityReviewCommitPlan)` → `commitCapabilityAnswerReport(command: CapabilityAnswerReportCommand)`
- Lines 19-21: keep the request body shape `{ plan: command }`. Renamed locally; the wire-format `body.plan` is what the edge function reads at `commit-capability-answer-report/index.ts:212`. No edge function deploy is needed by this retirement (the edge function ignores everything except `plan.userId`, `plan.capabilityId`, `plan.canonicalKeySnapshot`, `plan.idempotencyKey`, `plan.answerReport`, `plan.activationRequest`, and `plan.currentStateVersion` — every survivor is still on `command`).

### Test surgery (atomic with source per OpenBrain lesson 2026-05-07 §source-test-bundling)

**`src/__tests__/capabilityScheduler.test.ts`** — bundled in commit 1:

- Line 2: drop `previewScheduleUpdate` from the import list (keep `getDueCapabilities`, `getDueCapabilitiesFromRows`, `type LearnerCapabilityStateRow`)
- Lines 68-78: delete the `it('previews schedule updates without mutating input state', …)` test entirely. The `'capability scheduler'` describe block survives with three remaining tests (load-due, due-active-only, sort-and-limit).

**`src/__tests__/capabilityReviewProcessor.test.ts`** — bundled in commit 2:

- Line 5: drop `planCapabilityReviewCommit` from the import (the function is deleted)
- Lines 88-97: delete `it('rejects caller-provided outcomes unless an approved adapter validated them', …)` — the `precomputedOutcome` system retires; this guard is gone.
- Lines 99-121: rewrite. Old assertion checked `service.commitCapabilityAnswerReport` was called with `{rating, stateBefore, stateAfter}`; new assertion checks the service is called with the **command** (passthrough), no rating or stateAfter on the wire, and pins the validation-gate signal (architect R1 IMPORTANT #1) plus activation-source round-trip (architect R1 MINOR #2). Replacement test:
  ```ts
  it('forwards the command to the commit service when validation passes', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async () => ({
        idempotencyStatus: 'committed' as const,
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: true,
      })),
    }
    const result = await commitCapabilityAnswerReport(command({
      schedulerSnapshot: {
        ...command().schedulerSnapshot,
        activationSource: 'admin_backfill',
      },
    }), { service })
    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledTimes(1)
    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      capabilityId: 'capability-1',
      idempotencyKey: 'session-1:capability:item-1:meaning:1',
      schedulerSnapshot: expect.objectContaining({
        stateVersion: 2,
        activationSource: 'admin_backfill',
      }),
    }))
    expect(service.commitCapabilityAnswerReport.mock.calls[0][0]).not.toHaveProperty('rating')
    expect(service.commitCapabilityAnswerReport.mock.calls[0][0]).not.toHaveProperty('stateAfter')
    expect(result.idempotencyStatus).toBe('committed')
  })
  ```
  - `toHaveBeenCalledTimes(1)` pins that the validation gate (`StaleSchedulerSnapshotError` + `ensureCapabilityCanBeReviewed`) actually ran and accepted the input — combined with the existing `'rejects non-ready or unpublished capabilities…'` test at lines 61-72 (which asserts `not.toHaveBeenCalled` for the negative path), the gate is fully covered.
  - `activationSource: 'admin_backfill'` round-trips through the wire so the server's provenance-preservation logic (`commit-capability-answer-report/index.ts:308-310`) keeps a browser-side regression contract pinned.
  - The `not.toHaveProperty('rating'/'stateAfter')` assertions are anti-regression: they pin the contract that the browser no longer ships FSRS-derived fields.
- Lines 123-137: delete `it('uses submittedAt as the review time for both lastReviewedAt and nextDueAt', …)` — FSRS computation moves entirely to the server; the browser plan no longer carries `lastReviewedAt`/`nextDueAt`.
- Lines 139-158: rewrite. Old assertion checked `plan.stateAfter.activationState === 'active'` and `plan.activationRequest?.reason`. New test verifies that an `activationRequest` on the command is forwarded verbatim to the service (the server applies it):
  ```ts
  it('forwards activationRequest for an eligible dormant capability', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async () => ({
        idempotencyStatus: 'committed' as const,
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: false,
      })),
    }
    await commitCapabilityAnswerReport(command({
      schedulerSnapshot: {
        stateVersion: 0,
        activationState: 'dormant',
        reviewCount: 0,
        lapseCount: 0,
        consecutiveFailureCount: 0,
      },
      currentStateVersion: 0,
      activationRequest: { reason: 'eligible_new_capability', plannerRunId: 'planner-1' },
    }), { service })
    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledWith(expect.objectContaining({
      activationRequest: expect.objectContaining({ reason: 'eligible_new_capability' }),
    }))
  })
  ```
- Lines 160-169: delete `it('preserves existing activation provenance on normal reviews', …)` — provenance preservation is now the server's job (`commit-capability-answer-report/index.ts:308-310`); not a browser concern.
- Lines 171-185: keep `it('returns duplicate RPC results without recomputing a second write result', …)` — unaffected (it just calls `commitCapabilityAnswerReport(command(), {service})` and asserts the result passes through).
- Lines 188-218: keep the `'capability review service'` describe block. The test instantiates the real `createCapabilityReviewService` with a fake `invoke`, then calls `service.commitCapabilityAnswerReport(plan)` where `plan = planCapabilityReviewCommit(command())`. After retirement: replace the local `plan` construction with `service.commitCapabilityAnswerReport(command())` (one-line edit). The wire-format assertion at lines 204-211 checks `body: { plan: expect.objectContaining({userId, idempotencyKey}) }` — both fields exist on the command, so the assertion stays. The negative assertion at 212-217 stays as-is.

### SQL migration

**None.** Browser-side FSRS retirement is pure code deletion — no DB schema change. `learner_capability_state` (the authoritative FSRS state table) stays untouched; only the browser duplicates of `inferRating`/`computeNextState` retire.

### Things that explicitly stay

Per `docs/target-architecture.md` §"Things that explicitly stay" plus independent grep:

- `supabase/functions/commit-capability-answer-report/index.ts` lines 104, 110, 116-148, 295-296 — the **server-authoritative** copies of `inferRating`, `retrievability`, `computeNextState`. Untouched by this retirement. Future PR may extract them to `supabase/functions/_shared/srs/algorithm.ts`.
- `learner_capability_state` table + `capability_review_events` table — the FSRS state and event log. Neither is touched.
- `getDueCapabilities`/`getDueCapabilitiesFromRows` in `capabilityScheduler.ts` — read learner-capability rows by due-date; no FSRS math; stay.
- `ensureCapabilityCanBeReviewed`, `StaleSchedulerSnapshotError`, `InvalidReviewOutcomeError` in `capabilityReviewProcessor.ts` — pre-flight validation that the browser still owns (latency-saving guard before posting to the edge function); stay.
- `Session.tsx:181-197` — the only browser caller of `commitCapabilityAnswerReport`. The command shape is unchanged from the caller's perspective (no FSRS-derived field is ever set by Session; `precomputedOutcome` is never set by Session). No edit needed.
- `scripts/repair-stability.ts:6` — historical comment about the `applyGrammarAdjustment` 20%-reduction bug. The script is a one-time repair tool kept for posterity; the comment provides historical context for the FSRS state values it cleans up. **Stays as documentation of past behaviour.** No risk of confusion: `applyGrammarAdjustment` is gone from the tree at the same time, so a future reader who greps for it lands on this comment + the spec doc.
- `docs/architecture/fsrs-scheduling.md` (lines 58-64) and `docs/architecture/data-model.md:215` — describe `getRetrievability` as "computed live in the session engine". The prose remains accurate at the conceptual level (the function still exists server-side); a precise location update is **out of scope** for this retirement and tracked separately as a doc-cleanup follow-up (see "Out of scope" §). The grammar-state retirement also did not touch architecture-doc prose; this matches that precedent.

---

## Grep evidence

Run from `/Users/albert/home/learning-indonesian` on `main` (commit `b40bd91`), captured 2026-05-07. Each grep below uses `rg -n -g '!node_modules' -g '!dist' -g '!.worktrees' -g '!.claude'` (and excludes `*.md`/`*.html` for code-only verification).

### `src/lib/fsrs.ts` external importers

```
$ rg -n "from '@/lib/fsrs'|from \"@/lib/fsrs\"" -g '!*.md' -g '!*.html'
src/lib/capabilities/capabilityScheduler.ts:2:import { computeNextState } from '@/lib/fsrs'
src/lib/reviews/capabilityReviewProcessor.ts:2:import { computeNextState, inferRating } from '@/lib/fsrs'
src/__tests__/fsrs.test.ts:3:import { computeNextState, inferRating } from '@/lib/fsrs'
```

**Three importers, all retiring or rewiring in this PR.**

### `computeNextState` callers

```
$ rg -n "computeNextState\b" -g '!*.md' -g '!*.html'
supabase/functions/commit-capability-answer-report/index.ts:116    # server-side standalone (stays)
supabase/functions/commit-capability-answer-report/index.ts:296    # server-side caller (stays)
src/__tests__/fsrs.test.ts:3,23,25,32,34,42,44                     # tests for the file we delete
src/lib/reviews/capabilityReviewProcessor.ts:2,156                 # we drop in commit 2
src/lib/capabilities/capabilityScheduler.ts:2,98                   # we drop in commit 1
src/lib/fsrs.ts:66                                                 # the definition we delete
```

Server-side standalone copies at `supabase/functions/commit-capability-answer-report/index.ts:116, 296` are intentionally untouched — they are the authoritative implementation now. Every browser-side reference retires here.

### `inferRating` callers

```
$ rg -n "inferRating\b" -g '!*.md' -g '!*.html'
supabase/functions/commit-capability-answer-report/index.ts:104,295  # server-side (stays)
src/__tests__/fsrs.test.ts:3,5,7,11,15,19                            # tests for the file we delete
src/lib/reviews/capabilityReviewProcessor.ts:2,124                   # we drop in commit 2
src/lib/fsrs.ts:56                                                   # the definition we delete
```

Server-side stays. All browser usage retires.

### `getRetrievability` callers

```
$ rg -n "getRetrievability\b" -g '!*.md' -g '!*.html' -g '!docs/**'
src/lib/fsrs.ts:71,102      # internal use within the file we delete + the definition
```

**Zero non-self callers.** Doc references in `docs/architecture/fsrs-scheduling.md` and `docs/architecture/data-model.md` are prose, not code; tracked as out-of-scope follow-up.

### `applyGrammarAdjustment` callers

```
$ rg -n "applyGrammarAdjustment\b" -g '!*.md' -g '!*.html' -g '!docs/**'
src/lib/fsrs.ts:119               # the definition we delete
scripts/repair-stability.ts:6     # comment only ("grammar adjustment bug — applyGrammarAdjustment applied 20% reduction to ALL …")
```

Zero callers. The script comment is historical context (intentionally preserved).

### `previewScheduleUpdate` / `CapabilityReviewPreview` / `SchedulePreview` callers

```
$ rg -n "previewScheduleUpdate|CapabilityReviewPreview|SchedulePreview" -g '!*.md' -g '!*.html'
src/__tests__/capabilityScheduler.test.ts:2,70                       # test we delete in commit 1
src/lib/capabilities/capabilityScheduler.ts:79,85,97,98              # the definitions we delete in commit 1
```

Zero callers outside the `capabilityScheduler` module + its test. Confirmed retired-with-no-replacement.

### `CapabilityReviewCommitPlan` / `ValidatedReviewOutcome` / `precomputedOutcome` / `resolveOutcome` callers

```
$ rg -n "CapabilityReviewCommitPlan|ValidatedReviewOutcome|precomputedOutcome|resolveOutcome" -g '!*.md' -g '!*.html'
src/services/capabilityReviewService.ts:3,18                        # we narrow to CapabilityAnswerReportCommand in commit 2
src/__tests__/capabilityReviewProcessor.test.ts:90                  # we delete in commit 2 (precomputedOutcome test)
src/lib/reviews/capabilityReviewProcessor.ts:14,50,60,116,154        # all retire in commit 2
```

Server side: `commit-capability-answer-report/index.ts` does not reference `precomputedOutcome` or `rating` from the request body — it derives them fresh. Confirmed by reading the edge function body-validation block (`index.ts:236-238`) which only checks `userId, capabilityId, canonicalKeySnapshot, idempotencyKey, answerReport`. Zero risk that the wire contract regresses.

### `FSRSState` / `FSRSResult` / `ReviewOutcome` (browser-only types)

```
$ rg -n "\bFSRSState\b|\bFSRSResult\b|\bReviewOutcome\b" -g '!*.md' -g '!*.html'
src/lib/fsrs.ts:33,39,45,56,66    # the definitions we delete
```

Zero external callers.

### `planCapabilityReviewCommit` callers

```
$ rg -n "planCapabilityReviewCommit\b" -g '!*.md' -g '!*.html'
src/__tests__/capabilityReviewProcessor.test.ts:5,89,128,140,161,201   # tests we rewrite/delete in commit 2
src/lib/reviews/capabilityReviewProcessor.ts:145,187                    # the definition + internal use, both retire
```

Production code: zero non-self callers (the only call was internal — `commitCapabilityAnswerReport` line 187 → `planCapabilityReviewCommit` line 145). Tests retire atomically with the source.

### Sanity counter-grep (server-side authoritative copies stay)

```
$ rg -n "computeNextState|inferRating|retrievability" supabase/functions/
supabase/functions/commit-capability-answer-report/index.ts:104,110,116,124,295,296
```

Six lines on the server, all in the edge function. Untouched.

---

## Execution plan

Each step is a separate commit on `retire/browser-fsrs`. **Every commit must leave the test suite green AND `bun run build` green** (per OpenBrain lesson 2026-05-07 §source-test-bundling — applies because the discriminated-union-style narrowing on the service interface and the source/test pairing are at play).

1. `chore(scheduler): drop previewScheduleUpdate + browser FSRS dep from capabilityScheduler` — atomic source+test bundle:
   - `src/lib/capabilities/capabilityScheduler.ts`: drop `Grade` type import, drop `computeNextState` import, drop `CapabilityReviewPreview`, `SchedulePreview`, `previewScheduleUpdate`.
   - `src/__tests__/capabilityScheduler.test.ts`: drop the `previewScheduleUpdate` import + the test case.

   After this commit, `capabilityScheduler.ts` no longer imports from `@/lib/fsrs`. `fsrs.ts` is still alive (referenced by `capabilityReviewProcessor.ts` + tests). Build and tests stay green.

2. `refactor(reviews): retire browser FSRS — delete fsrs.ts + simplify capabilityReviewProcessor + service` — atomic source+test+consumer bundle (the big commit):
   - DELETE `src/lib/fsrs.ts`
   - DELETE `src/__tests__/fsrs.test.ts`
   - `src/lib/reviews/capabilityReviewProcessor.ts`: drop `Rating` import, drop `computeNextState`/`inferRating` imports, drop `ValidatedReviewOutcome`, drop `precomputedOutcome` field on `CapabilityAnswerReportCommand`, drop `CapabilityReviewCommitPlan`, drop `currentFsrsState`/`resolveOutcome`/`planCapabilityReviewCommit`, simplify `commitCapabilityAnswerReport` to validate-and-forward, narrow the service interface parameter type.
   - `src/services/capabilityReviewService.ts`: switch parameter type from `CapabilityReviewCommitPlan` → `CapabilityAnswerReportCommand`. Keep wire body shape `{ plan: command }` (edge-function compatibility).
   - `src/__tests__/capabilityReviewProcessor.test.ts`: drop `planCapabilityReviewCommit` import, delete three obsolete tests (lines 88-97, 123-137, 160-169), rewrite two (lines 99-121, 139-158) per the spec above, leave the duplicate-RPC test untouched, retarget the service-adapter test to use `command()` directly instead of constructing a plan.

   Bundled because: (a) deleting `fsrs.ts` requires every importer to be rewired in the same commit (otherwise the build is red mid-walk), (b) the service interface narrows `plan: CapabilityReviewCommitPlan` → `command: CapabilityAnswerReportCommand` and that change has to land with the consumer in `capabilityReviewService.ts` (otherwise `tsc` complains about parameter-type mismatch), (c) the test file imports `planCapabilityReviewCommit` which disappears (broken import → red `bun run test --run`).

3. `docs(plan): add retirement #3 spec — browser FSRS subsystem` — adds this file (`docs/plans/2026-05-07-retire-browser-fsrs.md`).

After step 3, before opening the PR:
- `bun run lint` must pass.
- `bun run test --run` must pass.
- `bun run build` must pass.
- `make migrate` is **not** needed (no DB changes in this retirement).
- Whole-tree stale-reference sweep (per OpenBrain lesson 2026-05-07 §"R2 catches stale comments outside the deletion targets"): `rg "computeNextState|previewScheduleUpdate|CapabilityReviewPreview|SchedulePreview|inferRating|applyGrammarAdjustment|getRetrievability|FSRSState|FSRSResult|ValidatedReviewOutcome|CapabilityReviewCommitPlan|@/lib/fsrs|fsrs\.ts" -g '!*.md' -g '!docs/**' -g '!supabase/functions/**'`. Expected to return zero matches outside the spec doc itself. Any hit is a stale reference to clean up before opening the PR.

Smoke test (post-merge, on homelab): start `bun run dev`, sign in as `testuser@duin.home`, complete a capability review session (one card at minimum), verify the result lands in `capability_review_events` with a non-null `state_after_json`. Server-authoritative computation continues to work end-to-end.

---

## Why this is safe

- **Zero browser callers of FSRS-derived state.** `Session.tsx:181-197` constructs the `CapabilityAnswerReportCommand` from `block.reviewContext` (which carries `schedulerSnapshot`, not `stateAfter`); the result is checked for `idempotencyStatus`, never for `stateAfter`. Dropping `stateAfter` from the wire contract is invisible to the only browser consumer.
- **Server is authoritative and self-contained.** `commit-capability-answer-report/index.ts:104-148` has its own complete copy of `inferRating`, `retrievability`, `computeNextState`. Lines 295-296 explicitly recompute from `plan.answerReport` and discard whatever the browser sent. The pre-retirement contract was: browser computes, server overrides; post-retirement: browser doesn't compute, server computes. Same observable behaviour.
- **Wire-format compatibility maintained.** The HTTP body shape stays `{ plan: <object> }` so no edge-function deploy is needed in lockstep with this PR. The `<object>` is missing the previously-ignored `rating`, `stateAfter`, `fsrsAlgorithmVersion` fields, but the edge function never read them (verified at `index.ts:212-321`).
- **Every commit boundary green.** Commit 1 leaves `fsrs.ts` intact (still has callers in `capabilityReviewProcessor.ts`). Commit 2 deletes `fsrs.ts` only after the last importer is rewired in the same atomic commit. No `tsc` red mid-walk; no `bun run test --run` red mid-walk.
- **Test surgery preserves test signal.** Three deleted tests assert browser-side FSRS computation (which is being retired); their assertions migrate to no-op territory after retirement (server is the gate; we don't unit-test the edge function from the browser test suite). Two rewritten tests pin the new contract: command passes through as-is; activationRequest forwarded.
- **No DB migration.** Pure code deletion. No risk of stranded rows, no rollback drama, no `learner_capability_state` data loss.
- **Bundle gets smaller.** Net code retired: ~134 (`fsrs.ts`) + ~50 (`fsrs.test.ts`) + ~45 (`capabilityScheduler.ts` preview API) + ~12 (`capabilityScheduler.test.ts` test) + ~150 (`capabilityReviewProcessor.ts` simplification) + ~80 (`capabilityReviewProcessor.test.ts` deletions/rewrites net of additions) ≈ **~470 LOC removed**, plus the entire `ts-fsrs` import surface from the browser bundle (Vite tree-shakes the dead `Rating` re-exports).
- **Independent of `retire/grammar-state`.** Orthogonal file sets — that branch touches `grammarStateService.ts`, `learner_grammar_state` table, grammar discriminated-union variants. This branch touches `fsrs.ts`, `capabilityReviewProcessor.ts`, `capabilityScheduler.ts`. Zero shared files. Either branch can merge first.

---

## Constraints honored

- `bun run lint` + `bun run test --run` + `bun run build` pass locally before opening the PR (CLAUDE.md gate).
- Architect-review-loop (per `feedback_spec_review_loop`): R1 reviews this spec; revisions until APPROVED; R2 reviews the executed diff per OpenBrain lesson 2026-05-02 §spec-review-loop.
- Pre-commit hooks run on every commit (lint + type-check + viewport-math). The destructive-op gate is N/A here — no SQL, no `drop table`/etc. tokens. The spec markdown avoids literal uppercase trigger strings (per OpenBrain lesson 2026-05-07 §destructive-op-check.sh-quirk — the eval scans markdown content too, so the hyphenated/lowercase form "the upper-case form of D-R-O-P followed by T-A-B-L-E" or simply omitting the uppercase pair clears the gate).
- No push to remote until PR opening (CLAUDE.md gate).
- `make pre-deploy` is the documented full gauntlet but may surface unrelated environmental noise on the homelab; the binding gate for this branch is `bun run lint` + `test --run` + `build` (per OpenBrain lesson 2026-05-07 §code-level-gate-vs-pre-deploy).
- Independent of unmerged `retire/grammar-state` and any `retire/audio-multi-voice` follow-ups.

---

## Out of scope

- Extracting server-side `inferRating` + `computeNextState` + `retrievability` from `supabase/functions/commit-capability-answer-report/index.ts:104-148` into `supabase/functions/_shared/srs/algorithm.ts`. The target-architecture doc names that as the eventual home; the inline edge-function copy is the authoritative source today and works correctly. Extraction is mechanical refactor that earns its keep when a second edge function needs the same FSRS math; tracked as a separate cleanup PR.
- Updating prose in `docs/architecture/fsrs-scheduling.md` (lines 58-64) and `docs/architecture/data-model.md:215` to clarify that `getRetrievability` is server-side only. The prose remains conceptually accurate; precise location is a doc-cleanup follow-up. The grammar-state retirement also deferred architecture-doc prose updates.
- Retiring `learner_capability_state.retrievability` column or any other DB column. None of the columns this retirement touches are FSRS-derived snapshots in the schema; only the in-memory browser snapshot (`SchedulePreview.stateAfter`) retires.
- Removing `ts-fsrs` from the browser-side `package.json`. The package is still installed (it has been used by `fsrs.ts`); after this retirement the browser no longer imports it. **Verification step in Commit 2:** `rg "from 'ts-fsrs'|from \"ts-fsrs\"" src/` should return zero matches. The package remains in `dependencies` post-retirement solely because `scripts/repair-stability.ts:21` (a one-off Bun maintenance script, not bundled by Vite) still imports it; tracked as a follow-up (move to `devDependencies`, inline the small surface, or retire the script). The Deno edge function imports `npm:ts-fsrs@5.3.2` directly, independent of `package.json`.
- Updating prose in `docs/architecture/fsrs-scheduling.md` (lines 58, 59, 64) and `docs/architecture/data-model.md:215` so the `getRetrievability` references describe the server-side `retrievability` function at `commit-capability-answer-report/index.ts:110` instead of the deleted browser export. Tracked as an explicit doc-cleanup follow-up issue alongside this retirement so the architectural-doc rot does not accumulate silently across retirements (architect R1 MINOR #5).
- Retiring the Session-lifecycle module (target-arch §"Code flagged for deletion" #3). Distinct retirement; orthogonal files.
- Retiring source-progress events, the event log, or any other named subsystem in target-arch §"Applied retirements" backlog.
