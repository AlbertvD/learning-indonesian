# Architect re-review: session-builder fold

**Date:** 2026-05-16
**Reviewer:** architect agent (pass 2)
**Verdict:** APPROVE

## Summary

All 5 SHOULD-FIX items from pass 1 are correctly addressed in the updated plan and before-spec. The 3 NICE-TO-HAVE items are also resolved. No new issues introduced by the corrections. The plan is ready to execute.

## Per-finding status

### 1. [SHOULD-FIX] Posture deletion ripples — **RESOLVED**

Verified the new §2.2.1 ("Posture-ripple sites") enumerates all five sites explicitly:

- `capabilitySessionLoader.ts:23` — `posture?: SessionPosture` on `CapabilitySessionLoaderInput` → "Remove the field."
- `capabilitySessionLoader.ts:280` — `posture: input.posture` forwarded into `planLearningPath(...)` → "Remove the forward."
- `pedagogyPlanner.ts:71` — `PedagogyInput.posture?` → "Remove the field."
- `loadBudgets.ts:9` — `LoadBudgetInput.posture?` → "Remove the field."
- `pedagogyPlanner.ts:128-134` — `orderedReadyCapabilities` priority reorder → **"Delete the reorder entirely."** Explicit decision recorded with reasoning: branch is unreachable today, promoting to unconditional would be new opinionated ordering. `balancedIntroductionPriority` at `:119-126` named as also orphaned and deleted.

The behavioural choice (delete vs. promote) is committed and justified. Acceptance criterion 6.1 reinforces it ("`pedagogy.ts` no longer contains `orderedReadyCapabilities` or `balancedIntroductionPriority`. Candidates walk in input order.").

### 2. [SHOULD-FIX] Wrong i18n path — **RESOLVED**

§2.2 last row now reads `src/lib/i18n.ts:217-222` + `:503-508` (`posture.*`), `:224-232` + `:510-518` (`skillLabels.*`). EN posture range corrected to `:503-508`. §4.1 also cites `src/lib/i18n.ts:223` for the drying copy. §6.1 acceptance ("i18n strings for `posture.*` (NL `:217-222`, EN `:503-508`) and `skillLabels.*` (NL `:224-232`, EN `:510-518`) are removed") matches.

### 3. [SHOULD-FIX] Queue-drying scope — **RESOLVED**

The plan takes path (a) preferred in the original review: queue-drying is split into its own **PR-B**. Verified:

- §4 introduction explicitly says "each is small, additive, and **lives in its own PR** — not bundled with the fold. The fold PR (PR-A) is pure refactor."
- §4 cites the original architect review by name, acknowledging the no-smuggling rule.
- §4.1 also spells out the `drying.ts` rewrite in concrete detail (new `QueueDryingInput` shape without `SessionPosture`/`BacklogPressure`, new `shouldSuppressDryingWarning` / `shouldFireDryingWarning` rules, builder wiring, adapter extension, Session.tsx Alert). So both (a) and (b) are satisfied — even if a reviewer disagrees with the split, the rewrite is fully specified.
- §5 sequencing table lists PR-A through PR-D with explicit dependencies. PR-B depends on PR-A.
- §6.2 contains PR-B-specific acceptance criteria.

This is the strongest fix in the revision.

### 4. [SHOULD-FIX] Before-spec silent on priority-reorder unreachability — **RESOLVED**

Verified the before-spec at `docs/current-system/modules/session-builder.md`:

- §3.3 now contains a dedicated paragraph ("Note: the priority-sort branch is unreachable at runtime today.") explaining why — `Session.tsx:97-107` does not pass `posture`, so `input.posture` is always undefined, so the priority sort branch is dead. Names the `balancedIntroductionPriority` helper at `:119-126` and notes it survives only via tests.
- §6 ("Known limitations and follow-ups") has a new dedicated bullet "Unreachable priority reorder in `pedagogyPlanner.ts`" that mirrors the §3.3 note and connects to the broader posture-branch unreachability.

The cross-reference between §3.3 and §6 in the spec is clean.

### 5. [SHOULD-FIX] Target-architecture file roster divergence — **RESOLVED**

Verified §10 now contains a new subsection "Divergences from the target-architecture file roster" that enumerates all four divergences:

- **`itemIdentity.ts`** — not created; sessionItemIdentity.ts deleted in §2.1; target-spec entry obsolete.
- **`signals.ts`** — not created; deleted with rest of posture system in §2.2; target-spec entry obsolete.
- **`eligibility.ts`** — not created; lesson-activation check stays inline in `pedagogy.ts:258`. Explicitly framed as a deferral with rationale ("extracting it would not change behaviour and adds a file for clarity-only reasons").
- **`drying.ts`** — added to roster, not in target spec which absorbs into `compose.ts`. Three reasons given (rewrite size, compose focus, independent testability).

Closes with "These are deliberate, documented divergences" and recommends a future target-architecture revision fold the corrections back in. Exactly what pass 1 asked for.

### 6. [NICE-TO-HAVE] LOC criterion aggressive — **RESOLVED**

§6.1 now reads "`builder.ts` orchestrator shrinks measurably (target ≤220 LOC, down from 366) and contains one shared `resolveCandidate` helper called by three passes. **The behavioural acceptance is the dedup; the LOC number is informational.**"

The behavioural criterion (one shared `resolveCandidate` helper called by three passes) is load-bearing; the LOC number is informational. Threshold also moved from 200 → 220 as suggested.

### 7. [NICE-TO-HAVE] Risks missing entries — **RESOLVED**

§8 risks table now contains both missing rows:

- **PlannerSessionMode collapse** — explicit row with grep-based mitigation ("Grep `PlannerSessionMode` before and after — should go from N hits to 0").
- **`decideBacklogPressure` deletion cascade** — explicit row with grep-based mitigation ("`grep -rln 'decideBacklogPressure' src/` before deletion — confirm only the deleted files reference it. PR-B reintroduces the concept inline inside `drying.ts` if needed").

Additionally a defensive row about the RecapScreen label switch was added (see #8). The table is now nine rows, up from six.

### 8. [NICE-TO-HAVE] RecapScreen migration non-regressive — **RESOLVED**

Verified §3.3 now has an explicit paragraph:

> **Note: this is a deliberate UX change.** The recap primary label flips from exercise-type wording to capability-type wording — e.g. "Recognition MCQ" / "Cued Recall" become "Tekst herkennen" / "Indonesisch kiezen". Exercise-type detail can still surface as a small caption (`exerciseLabel(...)`) if desired, but the headline now answers *what skill* not *what UI shape*. Agreed during scoping when the 7-family taxonomy was rejected in favour of per-capability copy.

§3.3 also covers the exhaustiveness assertion (`satisfies Record<CapabilityType, CapabilityDisplay>`) so the `l1_to_id_choice` gap and any future capability additions are caught by TS.

§6.1 acceptance ("`RecapScreen.tsx` consumes `capabilityDisplay(...).label` for the primary line. `exerciseLabel(...)` remains available but is no longer the recap headline.") and §8 risks row ("RecapScreen primary-label switch ... Deliberate UX change per §3.3. Smoke test #5 in §9 verifies the new wording renders. Worth a short release note.") reinforce the contract.

## New issues

None. The corrections are internally consistent. Spot-checked cross-references:

- §2.2 → §2.2.1 link works (§2.2.1 elaborates on the file-deletion table).
- §4.1 → §2.2.1 dependency (drying rewrite depends on `decideBacklogPressure` deletion) is documented in both directions.
- §5 PR sequencing matches §6 per-PR acceptance subsections (6.1/6.2/6.3/6.4 ↔ PR-A/B/C/D).
- §10 "Divergences" subsection's four bullets align with §2 deletions (itemIdentity, signals) and §1 file mapping (drying).
- Before-spec §3.3 + §6 unreachability notes match the fold plan's §2.2.1 deletion decision.

## Final verdict

**APPROVE.** All 5 SHOULD-FIX findings are RESOLVED. All 3 NICE-TO-HAVE findings are RESOLVED. No NEW-ISSUE findings. The plan is ready to execute starting with PR-A.

Relevant absolute paths:

- `/Users/albert/home/learning-indonesian/docs/plans/2026-05-16-fold-session-builder-design.md`
- `/Users/albert/home/learning-indonesian/docs/current-system/modules/session-builder.md`
- `/Users/albert/home/learning-indonesian/docs/plans/2026-05-16-fold-session-builder-architect-review.md` (pass 1)
- `/Users/albert/home/learning-indonesian/docs/plans/2026-05-16-fold-session-builder-architect-review-2.md` (this review)
