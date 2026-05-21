# Agent 1: Capability runtime & scheduling

**Date:** 2026-05-20
**Files reviewed:** 30

## Files reviewed

- /Users/albert/home/learning-indonesian/src/lib/capabilities/index.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/capabilityTypes.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/capabilityCatalog.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/capabilityContracts.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/capabilityScheduler.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/canonicalKey.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/itemSlug.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/renderContracts.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/artifactRegistry.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/__tests__/itemSlug.test.ts
- /Users/albert/home/learning-indonesian/src/lib/capabilities/__tests__/renderContracts.test.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/index.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/builder.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/adapter.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/compose.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/pedagogy.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/loadBudget.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/labels.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/audibleTexts.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/drying.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/model.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/knownWordCoverage.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/__tests__/compose.test.ts
- /Users/albert/home/learning-indonesian/src/lib/session-builder/__tests__/labels.test.ts
- /Users/albert/home/learning-indonesian/src/lib/mastery/masteryModel.ts
- /Users/albert/home/learning-indonesian/src/lib/reviews/capabilityReviewProcessor.ts
- /Users/albert/home/learning-indonesian/src/services/capabilityService.ts
- /Users/albert/home/learning-indonesian/src/services/capabilityReviewService.ts
- /Users/albert/home/learning-indonesian/src/services/capabilityContentService.ts
- /Users/albert/home/learning-indonesian/src/services/capabilityContentService.internal.ts
- /Users/albert/home/learning-indonesian/src/services/learnerStateService.ts
- /Users/albert/home/learning-indonesian/src/services/exerciseReviewService.ts
- /Users/albert/home/learning-indonesian/src/services/exerciseAvailabilityService.ts
- /Users/albert/home/learning-indonesian/src/services/learningItemService.ts
- /Users/albert/home/learning-indonesian/src/services/__tests__/capabilityContentService.test.ts
- /Users/albert/home/learning-indonesian/src/services/__tests__/capabilityContentService.internal.test.ts
- /Users/albert/home/learning-indonesian/src/pages/Session.tsx (cross-reference only)
- /Users/albert/home/learning-indonesian/src/hooks/useProgressData.ts (cross-reference only)

## Findings

### F1-1: `dimensionForCapability` misses `root_derived_recall` — drops it into `'exposure'` bucket

- **Severity:** blocker
- **Category:** bug
- **Evidence:**
  - `src/lib/mastery/masteryModel.ts:152-177` — the switch handles `root_derived_recognition` → `'morphology'` (line 173), but `root_derived_recall` is not a case at all and falls through to `default: return 'exposure'`.
  - Compare with `src/lib/session-builder/pedagogy.ts:166` (`case 'root_derived_recall': return 4`) and `labels.ts:74` (entry exists) — every other place that switches on `CapabilityType` handles it. Mastery is unique in missing it. Result: morphology recall reviews are aggregated into the unrelated `'exposure'` dimension on the Progress / overview screen.
- **Recommendation:** Add `case 'root_derived_recall': return 'morphology'`. Consider replacing the loose `switch` with an exhaustive `as const` map keyed by `CapabilityType` so adding a new type is a compile error (mirrors the `CAPABILITY_DISPLAY` pattern at `labels.ts:79`).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-2: `learningItemService` has zero production callers — 11 methods are dead

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/services/learningItemService.ts:13-141` — exports `getLearningItems`, `getLearningItem`, `getMeanings`, `getMeaningsBatch`, `getContexts`, `getContextsBatch`, `getItemContextsByLesson`, `getAnswerVariants`, `getAnswerVariantsBatch`, `getExerciseVariantsByContext`, `getItemContextGrammarPatterns`, `getGrammarPatternsByItem`.
  - Grep across `src/` finds zero non-test callers — only `src/__tests__/learningItemService.test.ts:34,41` references it. Equivalent reads now live inline in `capabilityContentService.ts:100-141` (`fetchLearningItemsByKey`, `fetchMeanings`, `fetchContexts`, `fetchAnswerVariants`, `fetchActiveVariants`). Each side keeps its own copy of the same chunkedIn-or-naked-`.in()` decision.
- **Recommendation:** Delete the service + its test file, OR move the shared `chunkedIn` patterns into a single helper that `capabilityContentService` consumes. If kept for future use, mark `@deprecated` and remove from the public barrel.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-3: `exerciseAvailabilityService` has zero production callers, but `validateCapability` still carries an `exerciseAvailability` opt-in param

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/services/exerciseAvailabilityService.ts:1-58` — full service with 1-hour memoised reads of the `exercise_type_availability` table. No production caller (`grep -rn "exerciseAvailabilityService\." src/` → only `src/__tests__/exerciseAvailability.test.ts`).
  - `src/lib/capabilities/capabilityContracts.ts:48` — `validateCapability` declares `exerciseAvailability?: ExerciseAvailabilityIndex` and line 126 filters `readyExercises` against it. The sole production caller (`src/lib/session-builder/adapter.ts:305`) calls `validateCapability({ capability: projection, artifacts: artifactIndex })` — never passes `exerciseAvailability`. The filter is a no-op in practice.
  - One test passes it (`src/__tests__/capabilityContracts.test.ts:112`), so the parameter is well-tested but the data path that would feed it is unwired.
- **Recommendation:** Either wire the service into the adapter (call `getAllAvailability()` once, pass to `validateCapability`) or delete both the service and the parameter. Half-wiring is the worst of both: production silently ignores DB toggles authors set.
- **Estimated effort:** small (delete) or medium (wire)
- **Cross-slice dependency:** null

### F1-4: `capabilityService` runtime methods are unused — service is a type-host only

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/services/capabilityService.ts:38-73` — defines `listCapabilities`, `getCapabilityByCanonicalKey`, `upsertCapability`. Grep across `src/` + `scripts/` finds zero production callers; only `src/__tests__/capabilityService.test.ts` exercises them.
  - Production consumers (`src/lib/session-builder/adapter.ts:25`, `src/lib/session-builder/model.ts:3`, `src/lib/capabilities/capabilityScheduler.ts:1`, `src/lib/session-builder/pedagogy.ts:8`, `src/lib/reviews/capabilityReviewProcessor.ts:1`) only import the two enum types `CapabilityReadinessStatus` + `CapabilityPublicationStatus`. The Supabase reads themselves (`learning_capabilities` rows) happen inline in the adapter (`adapter.ts:267-273`).
- **Recommendation:** Move the two enum types to `src/lib/capabilities/capabilityTypes.ts` (where every other capability enum already lives) and delete `capabilityService.ts` + its tests, OR document the service as "exists for direct admin reads" and add a single production caller. The current state is type-host-pretending-to-be-a-service.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-5: Half-retired `learnerStateService` — six of its seven methods are dead, the seventh reads a no-new-writes table

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/services/learnerStateService.ts:17-94` — `getItemState` (17), `getSkillStates` (29), `getSkillStatesBatch` (40), `upsertItemState` (52), `applyReviewToSkillState` (66) all have zero production callers (greps find only test files).
  - `getItemStates` (line 7) has one caller — `src/hooks/useProgressData.ts:87` — feeding `itemsByStage` on the Progress page. But the underlying table `learner_item_state` is documented as "write paths retired; rows preserved as historical record" in `docs/current-system/data-model.md:26,180`. For capability-era users this returns empty stages.
  - `applyReviewToSkillState` (66) calls RPC `apply_review_to_skill_state` which is also part of the retired SM-2 write path.
- **Recommendation:** Delete the five dead methods. For `getItemStates`, follow the documented follow-up: replace the consumer with a capability-aware `itemsByStage` derived from `learner_capability_state` (per data-model.md:224), then delete the service entirely.
- **Estimated effort:** small (delete methods); medium (Progress page rewire)
- **Cross-slice dependency:** Agent 5 if they own the Progress page; the consumer is `useProgressData.ts`.

### F1-6: Spec drift — CLAUDE.md + `modules/capabilities.md` both cite a `requiredSourceProgress.kind: 'legacy_projection'` field that no longer exists

- **Severity:** cleanup
- **Category:** spec-drift
- **Subtype:** spec-vs-exports-drift
- **Evidence:**
  - CLAUDE.md:275 — claims lessons 1-3 use a "Legacy projection (`requiredSourceProgress.kind: 'none', reason: 'legacy_projection'` in `src/lib/capabilities/capabilityTypes.ts:96`)".
  - `src/lib/capabilities/capabilityTypes.ts:96` (actual) — that line is `  | 'production_rubric'` (an `ArtifactKind` enum entry). No `requiredSourceProgress` field exists anywhere in the module; the comment at `src/lib/capabilities/capabilityContracts.ts:11` explicitly says: "Replaces the retired `requiredSourceProgress.kind === 'none' && reason === 'exposure_only'` field-based escape hatch."
  - `docs/current-system/modules/capabilities.md:217` — repeats the same stale "legacy projection for lessons 1-3" claim citing `capabilityTypes.ts:96`.
- **Recommendation:** Update CLAUDE.md's "Bridge into capability runtime" cell and the module spec to reflect that the field is gone — the legacy-vs-pipeline split is purely about *authoring* (the lessons 1-3 row is now identical to lessons 4+ at runtime), not about a code escape hatch.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-7: Spec drift — `modules/session-builder.md` cites a placeholder-only `CAPABILITY_DISPLAY` map that has since been populated

- **Severity:** nice-to-have
- **Category:** spec-drift
- **Evidence:**
  - `docs/current-system/modules/session-builder.md:328` ("Known limitations"): "Per-capability descriptions are placeholder. `CAPABILITY_DISPLAY` entries carry `label` only; `description` and `example` fields are stub for PR-D to author."
  - Same file at line 255 explicitly says "All 12 descriptions and most examples authored in PR-D" — internally contradicts itself.
  - `src/lib/session-builder/labels.ts:20-79` — every entry has populated `label`, `description`, and (for 10 of 12) `example`. The test `labels.test.ts:5-41` enforces non-empty descriptions and no-placeholder strings.
- **Recommendation:** Delete the §6 stale limitations entry.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-8: Spec drift — three docs still reference `loadCapabilitySessionPlanForUser` post-rename to `buildSession`

- **Severity:** nice-to-have
- **Category:** spec-drift
- **Evidence:**
  - CLAUDE.md:267 — "always invokes `loadCapabilitySessionPlanForUser({ enabled: true, ... })`". Actual function is `buildSession` (`src/lib/session-builder/builder.ts:371`); `Session.tsx:101` calls `buildSession`.
  - `docs/current-system/capability-system-handoff.md:15` — `-> loadCapabilitySessionPlanForUser` in a flow diagram.
  - `docs/current-system/modules/experience.md:173` — references `src/lib/session/capabilitySessionLoader.ts` (file moved to `src/lib/session-builder/builder.ts` in the fold).
- **Recommendation:** Update the three doc cites. Per CLAUDE.md's own gate ("Session.tsx:110 is the only production caller"): the actual line is 101 and the function is `buildSession`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** Agent who reviews experience.md.

### F1-9: Type holes — `from(table: string): any` is duplicated across five capability/service files

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/services/capabilityService.ts:34` — `from(table: string): any`
  - `src/services/capabilityContentService.ts:69` — same shape
  - `src/lib/session-builder/adapter.ts:29` — same shape
  - `src/lib/mastery/masteryModel.ts:103` — same shape
  - Each `SupabaseSchemaClient` interface is locally redeclared with `from(): any`, defeating type-checking of every chained call. PostgREST query builder has typed helpers (`createClient<Database>`) — none of these consume them.
- **Recommendation:** Extract a single `SupabaseSchemaClient` interface, ideally with `from()` returning a typed `PostgrestQueryBuilder<...>`. Or generate the Database types and stop hand-rolling the seam. At minimum the local declarations should be deduped.
- **Estimated effort:** medium (proper) / trivial (dedupe)
- **Cross-slice dependency:** Agent who reviews Supabase plumbing.

### F1-10: `compose()` is declared `async` but never awaits anything

- **Severity:** nice-to-have
- **Category:** inefficiency
- **Evidence:**
  - `src/lib/session-builder/compose.ts:48` — `export async function compose(input: ComposeSessionInput): Promise<SessionPlan>`. Body is purely synchronous (no `await`).
  - `src/lib/session-builder/builder.ts:135-142, 360-368` await it but only because the signature says they must. `missingLessonScopePlan` (`builder.ts:125`) also returns `Promise<SessionPlan>` despite a sync body.
- **Recommendation:** Drop `async` (return `SessionPlan` directly) or eliminate `compose`'s sole sync-async wrapper. Pure functions returning Promises are a small but real cost (extra microtask + harder debugging).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-11: `compose()`'s `INTERLEAVE_WINDOW` is hard-coded; no test covers the window-boundary case

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/lib/session-builder/compose.ts:127` — `const INTERLEAVE_WINDOW = 3`. The interleave swap loop at `compose.ts:130-148` iterates `[i - window, i)` — i.e. positions 0..2 when i=3, so a same-source-ref pair at positions (0, 3) IS detected as "within window" (the test at `compose.test.ts:81-89` confirms position-3 collides with position-0). But the spec at `compose.ts:130-135` describes the window as "preceding INTERLEAVE_WINDOW = 3 blocks share the same `block.renderPlan.sourceRef`" — which reads as "positions 0..2 looking back from position 3" i.e. gap of 3 *is* a collision. Behaviour and comment agree on a 3-block lookback (gap≥4 needed to clear).
  - `session-builder.md:294` confirms "Prevents back-to-back retrievals... window = 3 preceding blocks". OK.
  - However: when the algorithm walks position `i` and finds a same-ref `j > i+1` later, it swaps blocks[i] ↔ blocks[swapWith]. After the swap, `blocks[i]` holds a *different* ref, but the algorithm does not re-validate `blocks[swapWith]` against ITS new neighbourhood — the swap could introduce a new violation at position `swapWith`. The tests (`compose.test.ts:103-123`) verify only the global "≥3 gap" final property; they don't catch this. The current data shape rarely hits it, but it's a latent correctness issue.
- **Recommendation:** Either (a) re-validate `swapWith` after swap, or (b) add a test that constructs an input where a forward swap creates a new local violation, to make the trade-off explicit.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-12: `decideLoadBudget` exposes `maxNewConcepts` that no caller reads

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/lib/session-builder/loadBudget.ts:13` — `maxNewConcepts: number` field of `LoadBudgetDecision`. Set at lines 29, 38, 53.
  - `src/lib/session-builder/pedagogy.ts` — applies `maxNewPatterns`, `maxNewProductionTasks`, `maxHiddenAudioTasks`, `maxNewCapabilities` (lines 305, 309, 313, 317) but never `maxNewConcepts`. Grep across `src/` confirms no other consumer. Same for `maxSourceSwitches` and `allowQueuePadding`.
- **Recommendation:** Drop the three unused fields (`maxNewConcepts`, `maxSourceSwitches`, `allowQueuePadding`) from the type and the three branches, OR wire them into the planner. The comment "`maxSourceSwitches: 1` stays distinct from lesson_practice" at loadBudget.ts:55 implies intent but the planner doesn't honour it.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-13: `knownWordCoverage.ts` is unwired — module spec says so but it's not exported from the barrel either

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/lib/session-builder/knownWordCoverage.ts:1-95` — full module, exports `isKnownWordCoverageSatisfied`.
  - `src/lib/session-builder/index.ts` — does NOT re-export it.
  - Only consumer: `src/__tests__/knownWordCoverage.test.ts`. Spec at `modules/session-builder.md:25` admits "Not yet wired — survives as documentation per fold plan §10".
- **Recommendation:** Either re-export through the barrel + wire into the planner, or delete (the tests are pure logic and don't depend on the larger module). Documentation-via-untested-module is the worst flavour of dead code because grep-by-name finds it and developers assume it's load-bearing.
- **Estimated effort:** trivial (delete) / large (wire — requires pipeline support)
- **Cross-slice dependency:** Agent who reviews the pipeline (key-word artifact emission).

### F1-14: `RENDER_CONTRACTS` includes `cloze` + `cloze_mcq` for `contextual_cloze`, but `supportedSourceKinds: ['item']` means `contextual_cloze` capabilities (which are emitted with sourceKind `dialogue_line`/`item` per Decision 5b) cannot all render

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/lib/capabilities/renderContracts.ts:73-82` — `cloze.supportedSourceKinds: ['item']`; `cloze_mcq.supportedSourceKinds: ['item']`. Both serve `contextual_cloze`.
  - `src/lib/capabilities/capabilityCatalog.ts:165-170` — Decision 5b comment says `contextual_cloze` capabilities are now emitted by `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` and "Removed reads of `input.dialogueLines` here." 
  - The validator (`capabilityContracts.ts:73-82`) returns `blocked` with `no_compatible_exercise_for_capability_type` when no exercise supports a cap's source kind, so any `contextual_cloze` capability emitted with sourceKind `dialogue_line` is permanently blocked — and `renderContracts.test.ts:144-148` explicitly asserts "no exercise supports dialogue_line source kind yet".
  - `modules/capabilities.md:215` documents this as a "known limitation" of the current ceiling.
- **Recommendation:** Documented limitation; not new rot — but the module spec, render-contract comments, and capability catalog should all carry the same wording so a future reader understands the gating happens at the contract layer and the catalog projector's source-ref choice is the unlock. Consider widening `supportedSourceKinds` in renderContracts as part of the next fold.
- **Estimated effort:** small (doc consolidation) / large (widen)
- **Cross-slice dependency:** null

### F1-15: `isPattern` heuristic in pedagogy.ts is fragile — relies on substring matching `capabilityType.includes('pattern')`

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/lib/session-builder/pedagogy.ts:98-105`:
    ```
    function isPattern(capability: PlannerCapability): boolean {
      return (
        capability.sourceKind === 'pattern'
        || capability.sourceKind === 'affixed_form_pair'
        || capability.capabilityType.includes('pattern')
        || capability.capabilityType.startsWith('root_derived_')
      )
    }
    ```
  - This depends on string shapes of the CapabilityType enum, which is otherwise type-safe. A new `cap_type` like `'sentence_pattern'` would be misclassified silently; renaming `pattern_recognition` would break the rule with no compile error.
- **Recommendation:** Replace with an explicit `as const` set of which capability types are "pattern-like", mirroring the `capabilityPhase` switch (lines 151-170) which is exhaustive over `CapabilityType`. The same applies to `isNewProductionTask` (107-114) and `isHiddenAudioTask` (116-122) — all three are list-of-strings that should be a `Set<CapabilityType>`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-16: `capabilityService.upsertCapability`'s `updated_at` is set client-side, racing against DB triggers

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/services/capabilityService.ts:62-66` — `updated_at: new Date().toISOString()`. Client wall-clock can drift.
  - `scripts/migration.sql:191` and surrounding — capability tables typically have DB-side `updated_at` triggers; setting client-side overrides them with potentially-skewed timestamps. (Even if no trigger exists today, the practice is fragile.)
  - Since the method has zero production callers (F1-4), the bug is dormant. But if/when it gets used, it lies about update times.
- **Recommendation:** Drop `updated_at` from the payload; let the DB own it. If kept, use `new Date(serverTime).toISOString()` from a session token, not local clock.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-17: `LearningCapabilityRow` declares `created_at`/`updated_at` as optional strings on a typed Supabase row — defeats nullability checks

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/services/capabilityService.ts:13-30` — `LearningCapabilityRow` has `id?: string`, `created_at?: string`, `updated_at?: string` despite the DB columns being `NOT NULL` (DB row reads always return them). Marking them optional means downstream code has to handle absent fields that the runtime never produces.
  - `LearningCapabilityDbRow` in `src/lib/session-builder/adapter.ts:51-67` declares them differently (omits `created_at`/`updated_at` entirely, marks `source_fingerprint: string | null` even though the read-path filter for `readiness_status='ready'` requires them populated). The two row shapes for the same table diverge.
- **Recommendation:** One canonical row type per table, sourced from generated DB types when available. At minimum, reconcile the two declarations.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-18: `validateCapability`'s `readinessOverride: 'exposure_only'` branch is unreachable

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/lib/capabilities/capabilityContracts.ts:54-58` — line 54 short-circuits for podcast source kinds via `isExposureOnly(capability)`. Line 57's `if (input.readinessOverride === 'exposure_only')` branch is then unreachable for podcast caps and meaningless for non-podcast caps (the comment at lines 13-20 makes "source kind alone is the load-bearing signal" explicit). No production caller passes `readinessOverride: 'exposure_only'`; only `capabilityContracts.test.ts` exercises it.
- **Recommendation:** Drop `'exposure_only'` from the `readinessOverride` union — keep just `'deprecated' | 'unknown'`. Update the test.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-19: `learnerStateService.applyReviewToSkillState` RPC payload silently drops the result type

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/services/learnerStateService.ts:91-94` — `return data as LearnerSkillState` despite the RPC `apply_review_to_skill_state` not being declared in any generated DB types. The `data` is `unknown` at this point (it's the return of a generic Supabase RPC call), and the cast is unsafe.
  - The retired write-path question (F1-5) overlaps — the method itself has no callers, so the type hole is dormant.
- **Recommendation:** If the method is kept, validate the RPC shape with a Zod schema or hand-rolled guard before casting. If retired (per F1-5), delete.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-20: `capabilityReviewService` swallows error type — declares `error: unknown` then throws it untouched

- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `src/services/capabilityReviewService.ts:8-14, 22` — the local `SupabaseSchemaClient` interface declares `error: unknown` on the `functions.invoke` return, then line 22 does `if (error) throw error`. Callers can't narrow the thrown value.
  - The processor (`src/lib/reviews/capabilityReviewProcessor.ts:101-130`) catches by `instanceof` against its own error classes — anything from the service throws through opaquely.
- **Recommendation:** Type `error` as `Error | null` (the supabase-js shape) or a `PostgrestError`. Then the processor's outer catch can branch on error code (e.g. network vs server) and surface a friendly notification per CLAUDE.md's error-handling rule. Currently a Functions-network failure becomes "Something went wrong" with no telemetry.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-21: `capabilityContentService.fetchActiveVariants` is not chunked; can overflow Kong's 8KB limit at scale

- **Severity:** nice-to-have
- **Category:** inefficiency
- **Evidence:**
  - `src/services/capabilityContentService.ts:132-141` — `fetchActiveVariants` uses naked `.in('learning_item_id', itemIds)` with no chunking.
  - `fetchLearningItemsById` (line 110) IS chunked via `chunkedIn` (line 111), with the comment "the distractor-pool path can pass several hundred ids ... A single IN clause overflows Kong's 8 KB request-line buffer".
  - `fetchContexts` (line 118), `fetchAnswerVariants` (line 125), and `fetchActiveVariants` (132) operate on `itemIds = items.map(i => i.id)` (line 264) — the same set that needs chunking when item counts grow. The test at `capabilityContentService.test.ts:21-36` has a `KONG_REQUEST_LINE_LIMIT_BYTES` guard but only fires per-call, not against a >50-id input.
- **Recommendation:** Route all four through `chunkedIn` (`fetchMeanings` already does at line 115).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-22: `logResolutionFailure` swallows every error including auth failures — silent dead-letter

- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `src/services/capabilityContentService.ts:171-189` — wraps the insert in `try { ... } catch {}` with the comment "Swallowed. Resolution result is unaffected." If `capability_resolution_failure_events` insert fails due to RLS or a missing grant, no log + no notification + no telemetry signal. The diagnostic still surfaces to the user via the diagnostic object (line 371), but operators can't see the write-path is broken.
- **Recommendation:** Replace `catch {}` with `catch (err) { logError({ page: 'session', action: 'logResolutionFailure', error: err }) }`. The whole point of `logError` (per CLAUDE.md "Logging") is to surface fire-and-forget failures without blocking the UI.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-23: `capabilityCatalog` doesn't emit `audio_recognition` capabilities for items without `meanings[0]` — language defaults to `'none'` and silently mismatches

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/lib/capabilities/capabilityCatalog.ts:62-130` — every capability uses `learnerLanguage: item.meanings[0]?.language ?? 'none'`. For an item with no meanings, every cap_type — including `audio_recognition` and `dictation` — gets `learnerLanguage: 'none'`.
  - Then the cap's canonical key (built at canonicalKey.ts:29) bakes in `'none'`, locking the row out of every future projection that the meaning gets added with `language: 'nl'` (the canonicalKey is the upsert key).
  - For items with at least one meaning, the language is fixed to whatever the FIRST meaning's language happens to be — ordering-dependent.
- **Recommendation:** Either project one capability *per language* (so an item with both NL and EN meanings gets two `text_recognition` caps, keyed differently), or canonicalise to a fixed `'nl'` and have the validator gate on meaning presence. Today it produces silently-different canonical keys based on insertion order.
- **Estimated effort:** medium
- **Cross-slice dependency:** Agent who reviews the pipeline / capability-stage adapter (where these rows are written).

### F1-24: `recentFailures` window is hard-coded to 1 hour; no test covers the boundary

- **Severity:** nice-to-have
- **Category:** TODO
- **Evidence:**
  - `src/lib/session-builder/pedagogy.ts:124-136` — `const recentWindowMs = 60 * 60 * 1000` is hard-coded inside `hasRecentFailureFatigue`. The `consecutiveFailures >= 2` threshold is also magic. No `pedagogy.test.ts` exists (see `Coverage notes`).
- **Recommendation:** Lift both into named constants at module top (`RECENT_FAILURE_WINDOW_MS`, `RECENT_FAILURE_THRESHOLD`) with citations to whatever pedagogic source they came from. Add a unit test exercising the boundary.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-25: `STAGING_STABILITY_THRESHOLD_DAYS` is documented as "tunable from review-event aggregates over weeks" but has no telemetry hook

- **Severity:** nice-to-have
- **Category:** TODO
- **Evidence:**
  - `src/lib/session-builder/pedagogy.ts:172-177` — the comment block says "Tune from review-event aggregates over weeks" but the value is hard-coded `1`. No observability path exists to see actual unlock-rate distribution; tuning would require either ad-hoc SQL or a new dashboard.
- **Recommendation:** Either accept the hard-code (delete the "tune" comment) or land the telemetry hook (likely a daily admin metric). Documentation that points at a non-existent feedback loop is worse than silence.
- **Estimated effort:** trivial (delete comment) / large (telemetry)
- **Cross-slice dependency:** null

### F1-26: Test gap — no unit test for `pedagogy.ts:planLearningPath` covering the receptive-before-productive staging gate

- **Severity:** nice-to-have
- **Category:** test-gap
- **Evidence:**
  - `src/lib/session-builder/__tests__/` contains `compose.test.ts` and `labels.test.ts` only. No `pedagogy.test.ts`.
  - The staging gate at `pedagogy.ts:266-287` is load-bearing for the receptive-before-productive invariant (ADR 0007 + 2026-05-18-capability-staging-gate.md). Today the only coverage is indirect via `capabilitySessionLoader.test.ts`. A direct planner-only test would isolate the `productive_capability_not_unlocked` reason from upstream resolution noise.
  - Same gap for `loadBudget.ts` — no `loadBudget.test.ts`.
- **Recommendation:** Add `pedagogy.test.ts` with one case per suppression rule (12 rules per the table at session-builder.md:171-184) + the `affixed_form_pair` morphology carve-out + the multi-source-ref unlock case. Add `loadBudget.test.ts` covering the three branches.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F1-27: `capabilityScheduler.ts` imports `SessionMode` from `@/lib/session-builder` — capabilities depends on session-builder

- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** cross-module-cycle
- **Evidence:**
  - `src/lib/capabilities/capabilityScheduler.ts:2` — `import type { SessionMode } from '@/lib/session-builder'`.
  - The module spec at `modules/capabilities.md:33` lists session-builder as a **downstream** consumer of capabilities. But `capabilityScheduler.ts` (a capabilities-internal file) imports from session-builder — making capabilities upstream of session-builder for `SessionMode` and session-builder upstream of capabilities for `getDueCapabilities` etc.
  - `DueCapabilityRequest.mode` (line 33) is never read by either `getDueCapabilities` or `getDueCapabilitiesFromRows` (which only filter by `now` + flags) — so the `SessionMode` type isn't even load-bearing here. Dead parameter on top of the cycle.
- **Recommendation:** Drop the `mode` field from `DueCapabilityRequest` (callers can pass it to the read adapter directly if needed). Removes the cross-module import. If the field is intended for future use, declare a leaf module — `src/lib/capabilities/session-modes.ts` — and re-import from session-builder.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-28: `compose.ts` declares `practiceReviewCapabilities` optional but `builder.ts` always passes it (possibly as `[]`)

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/lib/session-builder/compose.ts:35` — `practiceReviewCapabilities?: DueSessionCapabilityInput[]`.
  - `src/lib/session-builder/builder.ts:365` always sets it (either to the lesson-scoped result or `[]` — wait, line 273 conditions `isLessonScopedMode(input.mode)` and uses `: []` for non-lesson modes, so it's always an array).
  - Same for `diagnostics?: SessionDiagnostic[]` — always passed.
  - The `?` markers are vestigial — a future caller would assume passing nothing is OK, but the contract should be explicit.
- **Recommendation:** Drop the `?` on both fields.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-29: `dimensionForCapability` switch and `MasteryDimension` union must stay in sync — no exhaustiveness check

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/lib/mastery/masteryModel.ts:152-177` — plain `switch` with a `default: return 'exposure'`. No `_exhaustive: never` check, so the missing `root_derived_recall` case (F1-1) compiles cleanly.
  - Contrast with `src/lib/session-builder/pedagogy.ts:151-170` (`capabilityPhase`) which omits a default — the exhaustive switch forces TS to flag a missing case.
- **Recommendation:** Make `dimensionForCapability` exhaustive (drop `default`, add an `_exhaustive: never` after the last case). This catches F1-1 at compile time.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F1-30: `ProjectedCapability.sourceFingerprint` + `artifactFingerprint` declared `string` in types, but adapter coerces from `null`

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/lib/capabilities/capabilityTypes.ts:181-182` — both fields `string`.
  - `src/lib/session-builder/adapter.ts:158-159` — `sourceFingerprint: row.source_fingerprint ?? ''` and `artifactFingerprint: row.artifact_fingerprint ?? ''`. The DB row type (line 63-64) says `string | null`. Empty string is a sentinel for "unknown" that downstream code can't distinguish from "the empty fingerprint".
  - `loader.ts` then snapshots these into `artifactVersionSnapshot` (`builder.ts:90-95`) for the review-event payload — meaning a NULL-fingerprint capability gets a `""`-fingerprint in the review event, hiding the data-quality signal.
- **Recommendation:** Either make the field nullable through the type chain (and have the staleness check honour null), or fail closed (skip projection) when the row's fingerprint is null. The current silent coercion smudges the audit trail.
- **Estimated effort:** small
- **Cross-slice dependency:** null

## Open questions for orchestrator

- **PR #71 inbound-port barrel.** `src/lib/capabilities/index.ts` exists and is well-formed; the only barrel-bypass imports remaining are in `src/__tests__/` and the internal sibling import in `capabilityContentService.ts` for `capabilityContentService.internal.ts` — both explicitly allowed by the barrel's own comment. **Compliance verified.** Recommend keeping the barrel comment up to date; spec line `modules/capabilities.md:11` matches.

- **Cross-slice handoff on dead exercise-availability:** F1-3 implicates a UI surface — admin scripts may toggle `exercise_type_availability` rows expecting runtime effect. If Agent 5 (admin UI) or Agent 9 (scripts) owns that path, they should weigh in on whether to delete or wire.

- **Cross-slice: ExerciseRenderPlan and resolveExercise.** `src/lib/exercises/exerciseRenderPlan.ts`, `src/lib/exercises/exerciseResolver.ts`, `src/lib/exercises/builders/index.ts` are referenced repeatedly by the files I reviewed (capabilityContentService imports `buildForExerciseType`; session-builder/builder imports `resolveExercise`). Belongs to Agent 2 (exercises). Cross-slice findings I noticed but didn't include here: the resolver's interaction with `exerciseAvailability`, the builders' handling of `projectBuilderInput` reason codes, builders' usage of `audibleTextFieldsOf`.

- **Cross-slice: `useProgressData.ts` legacy reads.** F1-5 ties into the Progress page UI (`src/pages/Dashboard.tsx`, `src/pages/Progress`, `src/hooks/useProgressData.ts`) — likely Agent 5 or 6.

## Coverage notes

- I read all 30 files in the slice. No file skipped.
- Type-hole sweep included `as any`/`as unknown as`/`@ts-ignore`/`: any` — five `from(): any` declarations + the `as any` casts in `exerciseReviewService` (out of my slice's narrow brief but reviewed for completeness).
- Did NOT exercise tests (no `bun run test` execution); claims are based on code reads only.
- Did NOT trace through every `scripts/lib/pipeline/capability-stage/*` import of `src/lib/capabilities/*`; per the rules, scripts are out of slice. F1-23 (audio cap learnerLanguage) likely interacts with the pipeline projector's row write — flagged for Agent 9.
