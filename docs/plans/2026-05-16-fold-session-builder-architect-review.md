# Architect review: session-builder fold

**Date:** 2026-05-16
**Reviewer:** architect agent
**Verdict:** APPROVE WITH CHANGES

## Summary

The before-spec is accurate and complete on the surface a fold author needs. The fold plan is coherent with the locked target architecture, and the deletion list is well-evidenced. Three issues need attention before approval: (1) the plan piggy-backs a posture deletion that has at least three concrete consequences the plan does not call out (orchestrator threading, `orderedReadyCapabilities` dead-code, `PedagogyInput.posture?` type field); (2) one citation path in §2.2 is wrong (`i18n.ts` lives at `src/lib/i18n.ts`, not `src/i18n.ts`); (3) the queue-drying wiring (§4.1) is the only product addition that is real net-new behaviour and warrants either a clearer scope justification or extraction to PR-B. Everything else is sound.

## Findings

### [SHOULD-FIX] - Posture deletion leaves a chain of code that the plan does not enumerate

**Where:** plan §2.2 (deletions) and §3.1 (extract triple resolver-loop)

**What:** The plan says "delete `sessionPosture.ts`, `sessionPlanningSignals.ts`, and the four posture branches in `loadBudgets.ts`." That deletion ripples further than the plan describes. Concretely, after `SessionPosture` is removed:

1. **Orchestrator threading** — `capabilitySessionLoader.ts:23` declares `posture?: SessionPosture` on `CapabilitySessionLoaderInput`, and `:280` passes `posture: input.posture` into `planLearningPath(...)`. Both need removal. The plan does not mention either site.
2. **Dead reordering in the planner** — `pedagogyPlanner.ts:128-134` (`orderedReadyCapabilities`) only triggers `balancedIntroductionPriority` sort when `input.posture === 'balanced'`. Once posture is gone, that branch is unreachable. The fold should either (a) delete the reordering and accept input order, or (b) make the priority sort unconditional. The before-spec §3.3 currently says "in balanced posture, sorted by `balancedIntroductionPriority`...else input order" — note this means the priority ordering is *already* unreachable today (Session.tsx never passes `posture`), which is fine to surface explicitly in the before-spec.
3. **`PedagogyInput.posture?`** at `pedagogyPlanner.ts:71` — the optional field on the public input type. Remove with the rest.
4. **`LoadBudgetInput.posture?`** at `loadBudgets.ts:9` — same.
5. **`balancedIntroductionPriority`** at `pedagogyPlanner.ts:119-126` and `isPattern`/related helpers may have callers only in the dead reordering. Audit for orphaning.

**Why it matters:** the fold plan claims "no change to the high-stakes planner rules" (§Goal), but removing the priority reorder *is* a behavioural change to introduction ordering — even if it never fires in production today. The plan needs to either explicitly say "delete the unreachable reorder" or "promote the reorder to unconditional," not leave it as an emergent side-effect.

**Fix:** add a §2.2.1 (or extend §2.2) enumerating the five sites above. State explicitly which behavioural choice is made for the priority reorder.

---

### [SHOULD-FIX] - Wrong path for i18n strings in §2.2

**Where:** plan §2.2 last row — `i18n.ts:217-222`, `i18n.ts:224-232`, `i18n.ts:510-518`

**What:** The plan cites `i18n.ts` at the project root, but the file actually lives at `src/lib/i18n.ts`. Verified by direct read: `/Users/albert/home/learning-indonesian/src/i18n.ts` does not exist; `/Users/albert/home/learning-indonesian/src/lib/i18n.ts` does and contains the cited blocks at the cited line ranges (NL: 217–222 posture, 224–232 skillLabels; EN: 503–508 posture, 510–518 skillLabels).

**Why it matters:** mechanical fold work; the wrong path will look like a missing file and stall the executor. Minor, but worth fixing for plan hygiene.

**Fix:** update the three cites in §2.2 to `src/lib/i18n.ts`. The EN posture range is `:503-508`, not implied to be at `:510-518`. The §6 acceptance criterion "i18n strings for `posture.*` and `skillLabels.*` are removed (both NL + EN dictionaries)" remains correct.

---

### [SHOULD-FIX] - Queue-drying wiring (§4.1) is a real product feature; plan understates the scope risk

**Where:** plan §4.1 + §6 acceptance + §10 deferrals

**What:** §4.1 wires queue-drying into the live builder, which means adding two new adapter-derived fields (`currentLessonHasEligibleIntroductions`, `nextLessonNeedsExposure`) and a Mantine `<Alert>` in `Session.tsx`. Two concrete concerns:

1. **Suppression logic change.** The plan replaces `isIntentionallyShort` (which inspects `posture` and `backlogPressure`) with "don't fire when `dueCount > preferredSessionSize`." `queueDrying.ts:22` also already requires `backlogPressure === 'light'` to fire at all — `decideBacklogPressure` lives in `sessionPosture.ts` and is also being deleted. So **the wiring depends on a function being deleted in the same PR**. The plan needs to either (a) keep `decideBacklogPressure` (and a slimmed `loadBudgets.ts` `decideBacklogPressure` site or relocate it), or (b) drop the backlog-pressure check entirely and rewrite `drying.ts` from scratch. Either way, the change is bigger than "wire it up."
2. **Behavioural newness vs. mechanical refactor.** A fold-scope audit (per `feedback_fold_scope_audit.md` in user memory) would flag this. The plan justifies it as "net additive complexity is small" — but a new diagnostic surfacing to the player UI is a user-visible change that wasn't there before. The recency badge (§4.2) is appropriately split into PR-B; queue-drying deserves the same treatment.

**Why it matters:** mixing a refactor and a product addition in one PR makes the diff hard to review for regression. If drying-warning copy or trigger threshold is wrong, rolling it back also rolls back the fold.

**Fix:** either (a) **strongly preferred** — move §4.1 into PR-B (or its own PR-C), make the fold PR pure relocation + deletion + local cleanups + §4.3 label structure; or (b) keep §4.1 in PR-A but spell out the drying.ts rewrite (drop `BacklogPressure`/`SessionPosture` types, rewrite `isIntentionallyShort`, define exact new suppression rule, list the two new adapter fields with derivation logic). Option (a) is mechanically simpler and aligns with the user's no-smuggling rule.

---

### [SHOULD-FIX] - Before-spec §3.3 is silent that the priority reorder is already unreachable today

**Where:** before-spec §3.3 ("Planner — suppression-rule engine")

**What:** The first paragraph says "Walks ordered candidates via `orderedReadyCapabilities`...in balanced posture, sorted by `balancedIntroductionPriority`...else input order." Verified accurate. But this misses that `Session.tsx:97-107` never passes `posture`, so the orchestrator never sets it, so `input.posture !== 'balanced'` is always true, so the balanced sort is **unreachable today**. The before-spec §6 ("Known limitations") lists the posture branches in `loadBudgets.ts` as unreachable but does not mention this related unreachability in the planner.

**Why it matters:** an honest before-spec is the diff target for the fold. If the spec implies the priority reorder is live but it isn't, the fold author may preserve it under the assumption that they're carrying behaviour forward.

**Fix:** add a sentence in §3.3 and/or §6 stating that `orderedReadyCapabilities`'s priority sort branch is unreachable at runtime today because `posture` is never threaded from Session.tsx.

---

### [SHOULD-FIX] - Plan does not address the target-architecture file roster gap

**Where:** plan §1.1 (relocations) and §6 (acceptance "10 files")

**What:** The locked target at `target-architecture.md:391-417` lists 12 files for `lib/session-builder/`: `index.ts`, `model.ts`, `builder.ts`, `eligibility.ts`, `pedagogy.ts`, `loadBudget.ts`, `compose.ts`, `audibleTexts.ts`, `itemIdentity.ts`, `labels.ts`, `signals.ts`, `adapter.ts`. The fold plan lands 10 files, omitting `eligibility.ts`, `itemIdentity.ts`, and `signals.ts`, and adding `drying.ts` (which the target spec folds into `compose.ts`).

The reasons differ per file:
- **`itemIdentity.ts`** — plan §2.1 deletes `sessionItemIdentity.ts` (superseded). Correct; the target spec is out of date here. Should be noted explicitly in plan §10 with "target spec's `itemIdentity.ts` is dropped — the helper was superseded by canonical-key block ids; the target spec entry is obsolete."
- **`signals.ts`** — plan §2.2 deletes `sessionPlanningSignals.ts`. Same situation; the target spec's `signals.ts` line is obsolete with the posture deletion. Should be noted in §10.
- **`eligibility.ts`** — target spec says this folds "lesson activation gate + capability filtering (folds `isLessonActivated` check)." Today that check lives inline in `pedagogyPlanner.ts:258` (`capability.lessonId != null && !input.activatedLessons.has(capability.lessonId)`). The plan does not extract it. This is a defensible deferral, but should be called out: "`eligibility.ts` from target spec is not created this fold; the lesson-activation check remains inline in `pedagogy.ts` for now."
- **`drying.ts`** — target spec absorbs queue-drying into `compose.ts`. Plan keeps `drying.ts` standalone. Defensible (better separation of concerns) but a divergence from the locked spec that deserves a one-line note.

**Why it matters:** the target architecture is "LOCKED" per the plan's own framing. Diverging from a locked spec without a one-line acknowledgement looks like spec-drift, not deliberate choice.

**Fix:** add a §10 sub-bullet "Divergences from the target architecture file roster (target spec is out of date on three entries)" listing the four bullets above.

---

### [NICE-TO-HAVE] - Acceptance criterion for `builder.ts ≤200 LOC` may be aggressive

**Where:** plan §6 ("`builder.ts` orchestrator is ≤200 LOC, down from 366")

**What:** Current `capabilitySessionLoader.ts` is 366 LOC. The plan claims the triple-loop extraction (§3.1) cuts ~80 LOC down to ~30 LOC + one helper, saving ~50 LOC. Plus removing the `enabled` gate, the `loadCapabilitySessionPlanForUser`/`loadCapabilitySessionPlan` split if collapsed, etc. Whether that lands under 200 LOC depends on:

- Whether `loadCapabilitySessionPlan` (the `CapabilitySessionDataSnapshot`-taking variant) stays as a separate exported entry for tests (plan §1.1 says yes, as a private helper — so still in the same file).
- Where the shared `resolveCandidate` helper lives (in `builder.ts` or extracted to a sibling file).
- How much of the per-pass meta-builder logic is inline vs. extracted.

It is plausible to land under 200 LOC, but the criterion is precise enough that a 215-LOC outcome would technically fail the gate.

**Why it matters:** specific LOC targets in acceptance criteria can force unhealthy compression (extract a one-line helper just to hit the number) or stall the PR.

**Fix:** soften to "`builder.ts` shrinks measurably (target ≤220 LOC) and the triple-loop is extracted into one helper called by three passes." The behavioural acceptance ("one shared `resolveCandidate` helper called by three passes") is the load-bearing part; the LOC number is informational.

---

### [NICE-TO-HAVE] - Risks table missing one entry

**Where:** plan §8

**What:** Two risks worth adding:

1. **`PlannerSessionMode` type narrowing.** Plan §2.2 says the type narrows to `'standard' | 'lesson_practice' | 'lesson_review'`. But `SessionMode` already has those three values exactly (`sessionPlan.ts:5`). So `PlannerSessionMode` collapses into `SessionMode` — the two types become identical. Risk: any test or call site that imports `PlannerSessionMode` will need updating; if it's the same type, also worth deleting one of the two names. Small clean-up that the plan doesn't flag.
2. **`decideBacklogPressure` deletion cascade.** Per the §4.1 finding above, `decideBacklogPressure` lives in `sessionPosture.ts` and is consumed by `loadBudgets.ts` posture branches (`:111, :127`) *and* by `queueDrying.ts` (transitively via the input shape). Verify no other callers exist before deletion — `grep -rln 'decideBacklogPressure' src/` should return only the deleted files.

**Fix:** add both as rows in the risks table with a one-line mitigation each (grep + verify).

---

### [NICE-TO-HAVE] - §3.3 label enrichment: validate `RecapScreen.tsx` migration is non-regressive

**Where:** plan §3.3 + §6 acceptance

**What:** Plan switches `RecapScreen.tsx:95` from `exerciseLabel(b.renderPlan.exerciseType)` to `capabilityDisplay(b.renderPlan.capabilityType).label`. Two concerns:

1. Current `sessionLabels.ts` is `Partial<Record<CapabilityType, string>>` — meaning some `CapabilityType` values are not in the map and fall back to `fallbackLabel` (underscore→space). The plan calls for all 12 types to be in the new `CAPABILITY_DISPLAY` table, including the missing `l1_to_id_choice`. Good. But: are all `capabilityType` values that the runtime emits actually present in the catalog? Worth a defensive `as const` assertion or a runtime fallback identical to today's `fallbackLabel`.
2. The before-spec §3.7 says "Only `exerciseLabel` has a runtime consumer (`RecapScreen.tsx:95`); `capabilityLabel` is missing the `l1_to_id_choice` entry." Switching the recap primary label from exercise to capability is a UX change — user sees "Tekst herkennen" instead of "Herkennen", for example. The plan should call this out as a *deliberate UX change* so reviewers don't think it's an accidental side-effect of the rename.

**Fix:** add a sentence to §3.3: "This swaps the primary recap label from exercise-type to capability-type — deliberate UX change agreed during scoping. User-facing copy: '<old: Herkennen> → <new: Tekst herkennen>' style. Subtitles render the new `description` field once content is authored in PR-C."

---

## Verified citations (sampled)

For audit-trail: I verified three citations from the before-spec by reading the cited file:line ranges:

1. **`capabilitySessionLoader.ts:324-365`** — `loadCapabilitySessionPlanForUser` signature. Verified exact — the function spans 324–364, returns `Promise<SessionPlan>`, throws on `!input.enabled` at 336–338.
2. **`capabilitySessionDataService.ts:299-300`** — `activeGoalTags: []` and `maxNewDifficultyLevel: 5`. Verified exact at those line numbers within the `plannerInput` literal.
3. **`pedagogyPlanner.ts:197-289`** — suppression-rule loop ordering. Verified — the rule order in the before-spec §3.3 table matches the code's `for ... if ... continue` cascade exactly (`capability_not_ready` at 202, `capability_not_published` at 206, lesson-scope at 211–217, `already_active_or_retired` at 222, `missing_prerequisite` at 226, `difficulty_jump` at 230–236, `recent_failure_fatigue` at 237, `wrong_session_mode` mode-allowance at 241, `not_useful_for_current_path` goal-tag at 251, `lesson_not_activated` at 258, then the four budget caps).

No drift in the sampled cites. Before-spec is trustworthy as a navigation document.

---

## Final verdict

**APPROVE WITH CHANGES.** The plan is structurally sound and the architecture is correct. The five SHOULD-FIX items above are mostly enumeration and labelling work; only the queue-drying §4.1 scope question requires a real decision (split to its own PR vs. spelling out the drying.ts rewrite in detail). Once those are addressed, this plan is ready to execute.

Re-review is requested after the SHOULD-FIX items land in the plan body.
