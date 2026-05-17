---
status: shipped
implementation: PR #57
merged_at: 2026-05-17
implementation_paths:
  - src/lib/session-builder/loadBudget.ts
supersedes: []
---

# Honor profile `preferredSessionSize` in standard mode

**Date:** 2026-05-17
**Status:** shipped (PR #57, merged 2026-05-17)

## Goal

Make `mode = 'standard'` sessions fill to the learner's `profile.preferredSessionSize` whenever the eligible-capability pool can supply enough cards. Today the standard-mode budget caps new introductions at ~25% of session size, so a learner with `preferredSessionSize = 25` but a small due queue gets 6–12 cards even when hundreds of new caps are eligible.

## Why

### The bottleneck

Verified against live DB on 2026-05-17 for `albert@duin.home` (`preferred_session_size = 25`, 8 lessons activated):

| Pool | Count |
|---|---|
| Due caps right now | 6 |
| Active caps total | 59 |
| Eligible dormant caps (lesson activated + ready+published + state absent) | 2,037 |
| Of those, passing the prerequisite gate | 527 |

The planner's three passes produce:

1. **Due pass** → 6 cards
2. **New-introductions pass** → capped at `min(openSlots, max(1, floor(25 * 0.25))) = 6` cards
3. **Practice-review pass** → SKIPPED in standard mode

Net session: 6 + 6 = **12 cards**, with a hard ceiling of 12 even though 527 caps are eligible. Often less, because the per-type caps (`maxNewPatterns = 1, maxNewConcepts = 1, maxNewProductionTasks = 1`) further constrain the mix to the available type distribution.

### The two affected populations

| Learner profile | Current behaviour | Why the cap hurts |
|---|---|---|
| **New learner** (few caps available, low sessionSize ~15) | Cap of `floor(15 * 0.25) = 3` new caps, but they only have ~5 eligible total | **The cap is never the bottleneck** — the eligible pool is. Removing it doesn't change new-learner experience at all. |
| **Experienced learner** (many caps eligible, sessionSize ~20–30) | Cap of 5–7 new caps regardless of eligible pool size | **Sessions stay artificially short.** Profile preference is silently ignored — the user gets a fraction of what they asked for. |

### Why the 25% rule was originally tuned

The comment in `loadBudget.ts` doesn't say. The implied pedagogy: "new content shouldn't dominate a session — keep introduction load ≤25% of what's familiar." But this was tuned for the original `preferredSessionSize = 15` default (= 3 new max), and the rule was never re-examined when profile session size became a user-tunable preference.

The rule's pedagogical weight is also undercut by the documentation: it has **no ADR**, **no design-doc rationale**, **no module-spec invariant**, and **no inline comment in `loadBudget.ts:45` defending it**. The session-builder spec §3.4 (line 205) merely *describes* the formula, never defends it. By contrast, load-bearing pedagogical decisions in this codebase get explicit ADRs (e.g., ADR 0003 for FSRS on capabilities). The 25% rule's silence is itself evidence that it's a default-tuning artifact, not an architectural commitment.

The product intent — *the learner's chosen session size is the contract* — should win over an unjustified cognitive-load formula. If the learner has set 25, they get 25.

## Architecture

### The change

In `src/lib/session-builder/loadBudget.ts`, the `standard` branch's budget converges with the `lesson_practice` branch's budget. Both modes now produce:

```typescript
{
  allowNewCapabilities: openSlots > 0,
  maxNewCapabilities: openSlots,          // ← was: min(openSlots, floor(targetSize * 0.25))
  maxNewPatterns: openSlots,              // ← was: 1
  maxNewConcepts: openSlots,              // ← was: 1
  maxNewProductionTasks: openSlots,       // ← was: 1
  maxHiddenAudioTasks: targetSessionSize, // unchanged (effectively unlimited)
  maxSourceSwitches: 1,                   // unchanged (standard) / 0 (lesson_practice — keep distinct)
  targetSessionSize,
  allowQueuePadding: false,
  reason: openSlots > 0 ? 'standard_daily_budget' : 'review_backlog_exhausts_budget',
}
```

`openSlots = max(0, targetSessionSize - dueCount)` — same as today. The new-cap pass can fill *every* open slot if eligible caps are available, instead of being capped at 25%.

### What this changes in the worst case

For a learner with sessionSize=25, no due, and 527 eligible new caps after the prereq gate:

- **Today:** 0 due + 6 new = 6 cards
- **After:** 0 due + 19 new = 19 cards (capped by eligible pool's actual mix and openSlots = 19)

In the absolute worst case — a learner with sessionSize=25, no due, and an eligible pool of 25 form_recall caps — they'd see 25 form_recall introductions in one session. That's heavy but matches their stated preference. Per `§Audience`, this is acceptable for the current 9-user user base; revisit if a future user reports the firehose feeling.

### What this doesn't change

- **Due caps always run first.** If you have 25+ due, the new-cap pass doesn't fire at all (`openSlots = 0`).
- **Lesson activation gate** (Decision 3b) still applies — new caps only surface for activated lessons.
- **Prerequisite gate** still applies — capabilities depending on satisfied keys still get suppressed.
- **`recent_failure_fatigue`** still applies — caps with 2+ consecutive failures in last hour still suppressed.
- **`lesson_review`** mode unchanged — still emits zero new content (it's a review-only mode by design).
- **`lesson_practice`** mode unchanged — already uses `openSlots` for everything.
- **`maxSourceSwitches = 1`** stays in standard mode (lesson_practice uses 0; the two modes have different scoping rules, so this stays distinct).

## Scope

This plan does:
1. Change the `standard` branch of `decideLoadBudget` in `src/lib/session-builder/loadBudget.ts` to set all four `maxNew*` fields to `openSlots`.
2. Update the inline rationale comment to cite the audience reality + the spec.
3. Update existing tests in `src/__tests__/loadBudgets.test.ts` that assert the old `maxNewPatterns: 1` and add a new test for the sessionSize=25 expectation.
4. Update `docs/current-system/modules/session-builder.md` §3.4 (Budgets) to describe the new rule.
5. Update `docs/current-system/modules/session-builder.md` §4 (Invariants) if the 25% rule is named as an invariant anywhere (it isn't, per a grep; no change needed but verify).

This plan does NOT:
- Add an early-practice fill pass (Option 2 from the discussion that produced this plan). Deferred unless removing the cap turns out to underdeliver.
- Touch the `lesson_practice` or `lesson_review` budget branches.
- Touch the planner's per-cap suppression rules (prereq, fatigue, lesson activation).
- Change the profile schema or default `preferredSessionSize`.
- Touch the composer's slice-at-limit behaviour.

## Sequencing

One PR. The change is ~20 lines including tests and the inline comment + module spec edit.

| PR | Title | Touches |
|---|---|---|
| **PR-1** | Honor profile sessionSize in standard mode budget | `src/lib/session-builder/loadBudget.ts`, `src/__tests__/loadBudgets.test.ts`, `docs/current-system/modules/session-builder.md` |

## Per-PR acceptance criteria

### PR-1 — Honor profile sessionSize in standard mode budget

- [ ] `src/lib/session-builder/loadBudget.ts` standard branch sets `maxNewCapabilities = openSlots`, `maxNewPatterns = openSlots`, `maxNewConcepts = openSlots`, `maxNewProductionTasks = openSlots`.
- [ ] The inline comment block above the standard branch explains the rationale (profile preference wins over the 25% pedagogy heuristic) and cites this plan.
- [ ] `src/__tests__/loadBudgets.test.ts` updated:
  - The existing "standard mode reserves most work for reviews" test no longer asserts `maxNewPatterns: 1`; instead asserts `maxNewPatterns >= openSlots` (the new contract).
  - New test added: "standard mode fills openSlots with new caps at large session sizes" — asserts that `decideLoadBudget({mode: 'standard', preferredSessionSize: 25, dueCount: 6})` returns `maxNewCapabilities: 19` (was 6).
  - New test added: "standard mode review-backlog branch still emits zero new caps" — regression guard for the `openSlots = 0` case.
- [ ] **Planner-level integration test** added in `src/__tests__/loadBudgets.test.ts` (or `capabilitySessionLoader.test.ts` if better-placed) that exercises `planLearningPath` end-to-end. The test must:
  - Pass `mode: 'standard'`, `preferredSessionSize: 25`, `dueCount: 6` with a `readyCapabilities` array of ≥25 entries (all eligible — passing prereqs, lesson activated, ready+published).
  - Assert `eligibleNewCapabilities.length === 19` (= `openSlots`).
  - This guards against a future refactor in `pedagogy.ts` that re-caps silently while the load-budget unit test stays green. The unit test verifies the budget *contract*; this integration test verifies the planner *honours* the contract end-to-end.
- [ ] `docs/current-system/modules/session-builder.md` §3.4 (Budgets) rewritten to describe the new rule:
  - Standard mode now matches lesson_practice mode in its new-cap budget (both `openSlots`).
  - The 25% rule is described as historical (cite this plan).
- [ ] `bun run test` green.
- [ ] `bun run lint` clean.
- [ ] Manual smoke test: log in as `albert@duin.home`, open `/session?mode=standard`, verify session has > 12 cards (target: closer to 25 given the eligible pool).

## Supabase Requirements

### Schema changes
**N/A.** Pure logic change in `loadBudget.ts`. No tables, no columns, no RLS, no grants.

### homelab-configs changes
- [ ] PostgREST: **N/A**, no new schema exposure.
- [ ] Kong: **N/A**.
- [ ] GoTrue: **N/A**.
- [ ] Storage: **N/A**.

### Health check additions
**N/A.** No server-side concerns.

## Behaviour changes the user will notice

After PR-1 ships:

1. **Standard sessions reach `preferredSessionSize` when the eligible pool can supply enough caps.** For `albert@duin.home` specifically: sessions go from ~12 to ~25 (limited by openSlots and the eligible pool).
2. **New cap mix can be heavier than 25% on light-due days.** A learner with sessionSize=25 and 0 due gets 19 new caps (was 6). For users with many caps in pipeline, this is the desired more-practice behaviour. For brand-new learners, no change — their eligible pool is the bottleneck, not the budget.
3. **`lesson_practice` mode unchanged** — already filled openSlots.
4. **`lesson_review` mode unchanged** — still review-only.

## Audience + product evidence

Same audience as the Decision 3b rollout: 9 users total, 2 active reviewers (developer + test account). The behaviour change ships without a feature flag because:

- For 7 of 9 users (3 lessons activated, 0 review events in 30 days), the eligible pool is small enough that the budget cap doesn't bind today — no change in their experience.
- For the developer (8 lessons, 25 sessionSize), this is the intended fix to a known bottleneck.
- For the test account, it doesn't matter.

If a non-test signup arrives and reports the firehose feeling, the per-type cap layer can be reintroduced as a follow-up scaling rule (e.g., `maxNewProductionTasks = max(1, floor(targetSize / 5))`).

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A learner with a deep eligible pool of one capability type gets a monotone session (e.g., 25 text_recognition cards) | Medium | UX feels repetitive | Per-type variety constraints (`maxNewPatterns: 1` etc.) gave variety; we're trading variety for fullness. If reports come in, scale per-type caps with session size in a follow-up. |
| Removing the 25% rule introduces cognitive overload | Low (current audience) | Subjective fatigue | The audience is alpha-stage; the developer is the only active recipient and explicitly wants this change. Revisit if the user base grows. |
| Test fixtures elsewhere assume `maxNewPatterns: 1` and silently regress | Low | Test failure (caught immediately) | Grep before PR: `rg "maxNewPatterns: 1\|maxNewConcepts: 1\|maxNewProductionTasks: 1" src/__tests__/ scripts/__tests__/ docs/`. Update any matches. Architect-verified on 2026-05-17 that only `src/__tests__/loadBudgets.test.ts` matches in the test set; `docs/current-system/modules/session-builder.md` §3.4 references the 25% formula and is on PR-1's spec-edit checklist. |
| The module spec at `docs/current-system/modules/session-builder.md` falls out of date if the change lands without spec update | Medium | Doc drift compounds | PR-1 includes the spec edit as a checklist item. CLAUDE.md "Module spec drift is treated like a code regression" applies. |

## Frontmatter lifecycle

- Today, on this plan being written: `status: draft`.
- When architect signs off: `status: approved`.
- When PR-1 opens: `status: implementing`, `implementation: PR #<N>`.
- When PR-1 merges: `status: shipped`, `merged_at: <date>`, `implementation_paths: ['src/lib/session-builder/loadBudget.ts']`.
