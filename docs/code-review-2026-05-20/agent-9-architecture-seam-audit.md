# Agent 9: Architecture seam audit

**Date:** 2026-05-20
**Reviewer:** Agent 9 (cross-slice architecture seams)
**Branch:** chore/exercises-ui-cleanup
**Files reviewed:** ~70 (whole-repo greps + 11 module barrels + 4 module specs + CLAUDE.md + scripts/migrations dir)

## Files reviewed

Barrels opened:
- `src/lib/capabilities/index.ts`
- `src/lib/session-builder/index.ts`
- `src/lib/distractors/index.ts`
- `src/lib/exercises/builders/index.ts`
- `src/components/page/primitives/index.ts`
- `src/components/exercises/primitives/index.ts`
- `scripts/lib/pipeline/lesson-stage/index.ts`
- `scripts/lib/pipeline/capability-stage/index.ts`

Specs compared:
- `docs/current-system/modules/capabilities.md`
- `docs/current-system/modules/session-builder.md`
- `docs/current-system/modules/lesson-renderer.md`
- `docs/current-system/modules/experience.md`

Other:
- `CLAUDE.md`
- `tsconfig.app.json`, `tsconfig.node.json` (path alias scope)
- `scripts/migrations/` directory listing
- Spot-reads on `src/lib/useExerciseScoring.ts`, `src/pages/Session.tsx`, `src/services/capabilityContentService.ts`, `src/lib/capabilities/renderContracts.ts`, `src/lib/session-builder/builder.ts`/`adapter.ts`, `src/lib/capabilities/capabilityScheduler.ts`

---

## Findings summary

| Check | Findings |
|---|---:|
| 1 — Barrel bypass | 1 |
| 2 — Spec-vs-exports drift | 0 (specs match barrels for the 4 specs that exist) |
| 3 — Inverted dependencies | 3 |
| 4 — Single-caller invariants | 1 |
| 5 — Module cycles | 2 |
| 6 — Layering violations | 0 |
| 7 — Pipeline shortcuts | 1 |
| 8 — Out-of-order calls | 0 |
| 9 — CLAUDE.md "always / never" rules | 1 |

Total: 9 findings.

---

## Findings

### Check 1 — Barrel bypass

#### F9-1: scripts/ reaches past the capabilities barrel into internals via relative paths

- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** bypassed-barrel
- **Module:** `src/lib/capabilities/`
- **Total bypass sites:** 17 (scripts only — every production `src/` caller routes through `@/lib/capabilities`)
- **Evidence (worst offenders):**
  - `scripts/check-capability-health.ts:5` — `import { projectCapabilities } from '../src/lib/capabilities/capabilityCatalog'`
  - `scripts/check-capability-health.ts:12-14` — pulls `validateCapability`, `ArtifactIndex`, `itemSlug` from three separate internal files
  - `scripts/materialize-capabilities.ts:10-14` — imports types + `hasApprovedArtifact` + `projectCapabilities` + `validateCapabilities` from four internal files
  - `scripts/promote-capabilities.ts:3-5` — three separate internal imports
  - `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:17-19` — pipeline-stage code reaches into `capabilityTypes.ts`, `canonicalKey.ts`, `itemSlug.ts`
- **Why it survives:** the capabilities-spec §"Consumers (production)" explicitly sanctions this ("Scripts continue to use relative paths into specific files until they are migrated"). Driver is the missing `@/*` path alias in `tsconfig.node.json` — there is no `tsconfig` under `scripts/` and `tsconfig.app.json:paths` only covers `src`. So scripts cannot use the barrel even if they wanted to.
- **Recommendation:** Add `"paths": { "@/*": ["../src/*"] }` (or a `scripts/tsconfig.json` carrying it) and migrate the 17 sites to `@/lib/capabilities`. Until then, every new internal file silently becomes part of the public surface as soon as any script imports it.
- **Estimated effort:** small

All other barrels (`session-builder`, `distractors`, `exercises/builders`, `page/primitives`, `exercises/primitives`, `lesson-stage`, `capability-stage`) are clean for production code — only test files import internals, which the capabilities-barrel comment explicitly allows.

### Check 2 — Spec-vs-exports drift

No drift between barrel exports and the spec §2 "Public interface" sections for `capabilities`, `session-builder`, `lesson-renderer`, `experience`. Specifically verified:

- Capabilities barrel exports every symbol the spec §2 lists (`projectCapabilities`, `validateCapability`, `validateCapabilities`, `isExposureOnly`, `RENDER_CONTRACTS`, `ContractInputShapes`, `BuilderInputFor`, `RawProjectorInput`, `projectBuilderInput`, `exerciseTypesForCapability`, `requiredArtifactsFor`, `supportsSourceKind`, `getDueCapabilities`, `getDueCapabilitiesFromRows`, `hasApprovedArtifact`, `ARTIFACT_KINDS`, `buildCanonicalKey`, `normalizeLessonSourceRef`, `itemSlug`, the type re-exports).
- Session-builder barrel exports `buildSession`, `sessionBuilderAdapter`, `createSessionBuilderAdapter`, `audibleTextFieldsOf`, `collectAudibleTexts`, `capabilityDisplay`, `exerciseLabel`, `skillLabel`, `CAPABILITY_DISPLAY`, and the model types. Spec §2 frames `loadCapabilitySessionPlan` + `resolveCandidate` as "Internal entry points also exported from `builder.ts`" — consistent with their absence from the barrel.
- LessonReader has the 2 consumers the spec names (Lesson.tsx, LocalPreview.tsx) and no others.

Note: `lesson-stage/runner.ts:268` exports `collectLessonPageTexts` that is NOT in `lesson-stage/index.ts`. Only its tests import it. Not strictly a drift — pure internal helper.

### Check 3 — Inverted dependencies

#### F9-2: src/lib/ imports a type from src/components/

- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** inverted-dependency
- **Evidence:**
  - `src/lib/useExerciseScoring.ts:9` — `import type { OptionState } from '@/components/exercises/primitives'`
- **Why it's wrong:** `lib/` is the lower layer; `components/` is the upper layer. Even a type-only import couples `lib` to a presentational primitive's choice of state vocabulary. If `OptionState` is genuinely shared, the type belongs in `lib/` (or `types/`) and `ExerciseOption` should consume it from there.
- **Recommendation:** Move `OptionState` to `src/lib/useExerciseScoring.ts` (or a new `src/types/exerciseScoring.ts`) and import it from there in both `useExerciseScoring.ts` and `ExerciseOption.tsx`.
- **Estimated effort:** trivial

#### F9-3: src/lib/ imports type aliases from src/services/

- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** inverted-dependency
- **Total sites:** 8
- **Evidence:**
  - `src/lib/capabilities/capabilityScheduler.ts:1` — `import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/services/capabilityService'`
  - `src/lib/session-builder/model.ts:3`, `pedagogy.ts:8`, `adapter.ts:25` — same three type aliases from `@/services/capabilityService`
  - `src/lib/session-builder/audibleTexts.ts:13` — `CapabilityRenderContext` from `@/services/capabilityContentService`
  - `src/lib/lessons/lessonExperience.ts:1`, `src/lib/preview/localPreviewContent.ts:1` — `Lesson`, `LessonPageBlock` from `@/services/lessonService`
  - `src/lib/reviews/capabilityReviewProcessor.ts:1` — `CapabilityReadinessStatus`, `CapabilityPublicationStatus` from `@/services/capabilityService`
- **Why it's wrong:** `services/` is the upper, IO-bound layer; `lib/` is the lower, pure-logic layer. A clean hexagonal seam puts shape definitions in `lib/` (or `types/`) and lets `services/` consume them. Today `lib/` is parameterised by `services/` types — the architectural arrows point the wrong way. Type-only mitigates the runtime cost but compile-time coupling remains.
- **Recommendation:** Promote these row-shape type aliases (`CapabilityPublicationStatus`, `CapabilityReadinessStatus`, `Lesson`, `LessonPageBlock`, `CapabilityRenderContext`) into `src/lib/capabilities/`, `src/lib/lessons/`, or a thin `src/types/db/`. Services can then re-export them for back-compat.
- **Estimated effort:** small

#### F9-4: scripts/ pipeline code reaches into src/lib/ internals via 4×6 relative paths

- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** inverted-dependency
- **Note:** This is the *runtime* direction of F9-1 viewed structurally. Pipeline (`scripts/lib/pipeline/capability-stage/`) and runtime (`src/lib/capabilities/`) should share types via a shared package, not via `../../../../../src/lib/...` traversals.
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:17-19` — five-dot traversal
  - `scripts/lib/pipeline/capability-stage/lint/duplicateItems.ts:24` — five-dot
  - `scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts:24` — five-dot
  - `scripts/lib/pipeline/capability-stage/adapter.ts:26` — four-dot
  - `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts:25-27` — four-dot ×3
- **Why it's wrong:** Pipeline depends on runtime types (`CapabilityType`, `ProjectedCapability`, `CAPABILITY_PROJECTION_VERSION`). If runtime modules ever delete/rename one of these, the pipeline breaks silently because there's no barrel acting as a contract. The deep relative paths also make refactors mechanically harder.
- **Recommendation:** Pair with F9-1 — once scripts can `import from '@/lib/capabilities'`, this collapses into "scripts use the barrel" too.
- **Estimated effort:** small (joint fix with F9-1)

### Check 4 — Single-caller invariants

#### F9-5: CLAUDE.md "loadCapabilitySessionPlanForUser" — symbol does not exist

- **Severity:** blocker (doc drift on a load-bearing invariant)
- **Category:** architecture-violation
- **Subtype:** stale-claim-in-CLAUDE
- **Evidence:**
  - `CLAUDE.md:267` claims: "`src/pages/Session.tsx:110` is the only production caller of any session builder, and it always invokes `loadCapabilitySessionPlanForUser({ enabled: true, ... })`."
  - `grep -rn "loadCapabilitySessionPlanForUser"` across `src/`, `scripts/` returns ZERO matches.
  - Actual production caller: `Session.tsx:101` (not :110) calls `buildSession(...)`. `Session.tsx:12` imports `buildSession` from `@/lib/session-builder`.
  - The closest real symbol is `loadCapabilitySessionPlan` (no "ForUser" suffix), exported from `src/lib/session-builder/builder.ts:208` — and even that one is test-only, NOT the production entry point (the spec at `docs/current-system/modules/session-builder.md:108-109` calls it out as test-only).
- **Why it matters:** This is the single-caller invariant that CLAUDE.md uses to anchor "runtime is unified." Anyone grepping for `loadCapabilitySessionPlanForUser` to verify the claim finds nothing and concludes the invariant is wrong (when in fact only the symbol name + line number rotted). The substantive invariant (Session.tsx is the only production caller of any session builder) is intact — `buildSession` is grepped to exactly 2 sites: the barrel + `Session.tsx`.
- **Recommendation:** In `CLAUDE.md:267`, replace "`loadCapabilitySessionPlanForUser({ enabled: true, ... })`" with "`buildSession({ enabled: true, ... })`" and update `Session.tsx:110` → `Session.tsx:101`. Same paragraph: "the new builders in `src/lib/exercises/builders/`" is also worth re-verifying — those builders haven't moved but the surface they expose is now governed by `RENDER_CONTRACTS`, which the paragraph doesn't mention.
- **Estimated effort:** trivial

The substantive invariant (one production caller per session builder) is otherwise intact:

| Symbol | Production callers (verified) |
|---|---|
| `buildSession` | `src/pages/Session.tsx:101` only |
| `loadCapabilitySessionPlan` | tests only (`src/__tests__/capabilitySessionLoader.test.ts:2`) |
| `LessonReader` | `Lesson.tsx:226`, `LocalPreview.tsx:80` only — matches spec |

### Check 5 — Module cycles

#### F9-6: capabilities ↔ session-builder cycle (acknowledged in spec)

- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** module-cycle
- **Evidence:**
  - `src/lib/session-builder/{builder.ts:8, adapter.ts:18, pedagogy.ts:4, labels.ts:1}` → `@/lib/capabilities`
  - `src/lib/capabilities/capabilityScheduler.ts:2` → `@/lib/session-builder` (`SessionMode` type)
  - `src/lib/capabilities/renderContracts.ts:20` → `@/lib/session-builder` (`SessionBlock` type)
- **Why it persists:** `SessionMode` and `SessionBlock` are session-builder concepts but the scheduler needs `SessionMode` to scope due queries and `renderContracts.ts` references `SessionBlock` in a type comment / API surface. Type-only imports prevent runtime cycles but the conceptual back-pointer remains — capabilities should not know what a session looks like.
- **Recommendation:** Move `SessionMode` (a string-literal union) to either `@/types/learning` or a thin `@/lib/types/session.ts`. `SessionBlock`'s appearance in `renderContracts.ts:20` looks unused; if it is, drop the import. Result: the dependency arrow runs cleanly one direction.
- **Estimated effort:** small

#### F9-7: capabilities ↔ exercises cycle (already partly mitigated via leaf module)

- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** module-cycle
- **Evidence:**
  - `src/lib/exercises/{exerciseRenderPlan.ts:1, exerciseResolver.ts:8, builders/index.ts:11, builders/types.ts:15}` → `@/lib/capabilities` (many)
  - `src/lib/capabilities/renderContracts.ts:19` → `@/lib/exercises/resolutionReasons` (one)
- **Why it's OK in practice:** The capabilities spec §5 documents this: "`lib/exercises/resolutionReasons.ts` — leaf module owning `ResolutionReasonCode`. Created in PR #65 to break what would otherwise be a circular import." Because `resolutionReasons.ts` itself imports nothing back from capabilities, the leaf pattern keeps the cycle from being load-bearing.
- **Why it's still worth a finding:** `resolutionReasons.ts` does not actually live in the *exercises* module in any conceptual sense — it's a generic reason-code enum that happens to be physically located there. Moving it under `src/lib/capabilities/resolutionReasons.ts` (or `src/lib/types/`) would let `exercises → capabilities` become a strict one-direction dependency and eliminate the cycle entirely instead of mitigating it.
- **Recommendation:** Either rename the leaf to `src/lib/types/resolutionReasons.ts`, or accept the current state and document why the leaf lives under `exercises/`.
- **Estimated effort:** trivial

### Check 6 — Layering violations

No findings. Verified:

- UI (`src/components/`, `src/pages/`) does NOT import from `scripts/` (0 matches for `from '.*scripts/'`).
- Runtime (`src/`) does NOT import from `evals/` or `e2e/` (0 matches).
- `evals/` contains only bash scripts (no TS).
- `e2e/` contains 4 Playwright `.spec.ts` files — none imported from runtime.
- `tools/review/` is a standalone sub-app with its own `node_modules/` — no runtime imports.

### Check 7 — Pipeline shortcuts

#### F9-8: ~12 ad-hoc scripts write to capability tables outside the publish pipeline

- **Severity:** cleanup (the architecture intentionally allows admin maintenance scripts; the risk is that the surface keeps growing)
- **Category:** architecture-violation
- **Subtype:** pipeline-shortcut
- **Evidence (worst offenders, all write to `learning_capabilities` / `capability_artifacts` / `learning_items` directly without going through `capability-stage/`):**
  - `scripts/promote-capabilities.ts:255-305` — `.update()` on `learning_capabilities` + `.delete()` on `capability_artifacts`
  - `scripts/triage-residual-capabilities.ts:135-165` — `.delete()` + `.update()` on `learning_capabilities` (lesson_id reassignment)
  - `scripts/repair-item-meanings.ts:77-87` — `.delete()` then `.insert()` on `item_meanings`
  - `scripts/cleanup-annotations.ts:104-119` — `.update()` then `.delete()` on `learning_items`
  - `scripts/reactivate-dialogue-chunks.ts:128-179` — `.update({ is_active: true })` on `learning_items`
  - `scripts/extract-cloze-items.ts:202-236` — `.upsert()` to `learning_items`, `item_meanings`, `item_contexts`
  - `scripts/seed-learning-items.ts:69-95` — `.upsert()` + `.delete()` on `learning_items` / `item_meanings` / `item_answer_variants`
  - `scripts/publish-grammar-candidates.ts:203-248` — three `.upsert()` calls on `learning_items` family tables
  - `scripts/seed-cloze-contexts.ts:104` — `.upsert()` on `learning_items`
  - `scripts/dev-stage-force.ts:113-133` — `.update()` on `learner_capability_state` (admin sandbox script — OK in principle)
  - `scripts/seed-drying-scenario.ts:118-134` — admin scenario seeding (OK in principle)
- **Why it matters:** The CLAUDE.md/process-doc contract says capability writes go through `capability-stage`. The repair/cleanup/triage/reactivate scripts bypass the stage's validators (`countParity`, `contentNonEmpty`, `seedIntegrity`). If `extract-cloze-items.ts` writes an invariant-violating row, the pipeline's `make migrate-idempotent-check` / `check-supabase-deep` will catch it on the next live run, but the bypass means the row can briefly exist in a state the pipeline would never produce.
- **Recommendation:** Audit which of these scripts are still needed post-pipeline-stabilisation. Anything that *should* be a pipeline operation (e.g. `publish-grammar-candidates.ts`, `extract-cloze-items.ts`, `seed-learning-items.ts`) should funnel through `capability-stage/`'s adapter. The genuine maintenance utilities (`triage-residual-capabilities.ts`, `repair-item-meanings.ts`, `cleanup-annotations.ts`) deserve a docstring at the top stating "this bypasses capability-stage deliberately because X."
- **Estimated effort:** medium (scoping audit is small; consolidation is larger)

### Check 8 — Out-of-order calls

No findings. Verified:

- Only `scripts/publish-approved-content.ts:54, 65` calls `runLessonStage` and `runCapabilityStage` together; A precedes B. The capability-stage runner additionally throws at `scripts/lib/pipeline/capability-stage/runner.ts:127` if invoked without `lessonId` from Stage A — defense in depth.
- `scripts/run-lesson-stage-only.ts:17` calls Stage A alone; never invokes B. Legal per its name.
- No file calls both stages in reverse order.

### Check 9 — CLAUDE.md "always / never" rule verification

#### F9-9: CLAUDE.md "capability projection version stamp" + a few stale process notes

- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** stale-claim-in-CLAUDE
- **CLAUDE.md rules verified and PASS:**
  - "All Supabase queries use `.schema('indonesian')`" — 0 production violations (grep `supabase.from('...'` outside test files: 0 results that lack `.schema('indonesian')`).
  - "Never query the `public` schema directly" — 0 violations (grep `schema('public')` / `schema('auth')` outside node_modules: 0 results).
  - "The `vocabulary` table is not read at runtime" — 0 violations (grep `from('vocabulary'` in `src/`: 0 results).
  - "Schema changes go in `scripts/migration.sql`, not `scripts/migrations/*.sql`" — `scripts/migrations/` contents all date from 2026-05-{07,08,14} (within the documented paper-trail window); no fresh additions outside `migration.sql`.
  - "Never `console.error` as the only error handling" — spot-checks at `src/pages/Session.tsx:140` and `src/components/page/primitives/useSeamContract.ts:29-39` all pair console.error with either `logError` + `setError` (Session) or render-time dev assertions (seam contract). No naked-console.error catches found in `src/pages/`.
- **CLAUDE.md rules verified and FAIL:**
  - Line 267: `loadCapabilitySessionPlanForUser` — see F9-5.
  - Line 267: "`Session.tsx:110` is the only production caller" — actual line is 101.
  - Line 267: "Legacy `buildSessionQueue` was retired in retirement #7" — verified retired (0 grep results outside doc files), so this claim is correct.
- **Recommendation:** Bundle the CLAUDE.md fix in F9-5. Add a CLAUDE.md hygiene cron / a CI grep that fails if any "`Session.tsx:N`"-style claim in CLAUDE.md doesn't match the actual line.
- **Estimated effort:** trivial

---

## Top 5 most architecturally damaging findings

1. **F9-5 (Check 4) — CLAUDE.md cites a phantom symbol (`loadCapabilitySessionPlanForUser`) at a wrong line (`:110` not `:101`)** for the load-bearing "only production caller" invariant. This is the worst hit because CLAUDE.md is the file every agent reads first; a wrong cite there warps every downstream investigation.
2. **F9-3 (Check 3) — `src/lib/` imports row-shape types from `src/services/`** at 8 sites (`session-builder/{model,adapter,pedagogy,audibleTexts}.ts`, `capabilities/capabilityScheduler.ts`, `lessons/lessonExperience.ts`, `preview/localPreviewContent.ts`, `reviews/capabilityReviewProcessor.ts`). Arrow points the wrong way through every hexagonal seam.
3. **F9-8 (Check 7) — ~12 maintenance scripts write directly to `learning_capabilities` / `capability_artifacts` / `learning_items`** bypassing `capability-stage/`. The pipeline's invariants live in one place; the bypass paths don't enforce them.
4. **F9-1 (Check 1) — 17 scripts/ sites bypass the capabilities barrel via relative paths.** Sanctioned by spec but only because `tsconfig.node.json` lacks the `@/*` alias — the seam is structurally undefendable until that's added.
5. **F9-6 (Check 5) — capabilities ↔ session-builder cycle** (`SessionMode` and `SessionBlock` consumed back into capabilities). Type-only so no runtime hazard, but conceptually capabilities should know nothing about sessions.

---

## Open questions for orchestrator

1. **F9-1 + F9-4 are the same problem viewed two ways** (no `@/*` alias for scripts, so they must use relative paths, so the barrel is undefendable from outside `src/`). Should the canonical fix be tracked as one item or two?
2. **F9-8 (pipeline shortcuts)** — does the team want a clean-line policy ("only `capability-stage/` writes to these tables") or does it want to keep specific maintenance scripts as documented exceptions? My audit assumed the former; if the latter, the finding shrinks.
3. **F9-6 / F9-7 (cycles)** — I deliberately rated these `nice-to-have` because both are admitted in the capabilities spec. If the architect would rather see them gone, escalate to `cleanup` and bundle with the lib/services type cleanup in F9-3.

## Coverage notes

- Did not exhaustively walk every barrel symbol vs. every spec sentence — only verified that the major surfaces named in spec §2 are present in `index.ts`. A line-by-line audit could find more drift.
- `docs/current-system/modules/` has only 4 specs but several modules deserve specs (per CLAUDE.md "When to create a module spec"): `src/lib/lessons/`, `src/lib/exercises/`, `src/lib/mastery/`, `src/lib/reviews/`, `src/lib/distractors/`, `src/lib/preview/`, the three pipeline stages, and the UI deep modules (`exercises/primitives/`, `page/primitives/`). Their absence is a separate finding category Agent 9's brief doesn't cover — flagging it here so the orchestrator can assign if relevant.
- `scripts/lib/pipeline/podcast-stage/` has no `index.ts` barrel — just `podcastProjectionRules.ts` + an `INVENTORY.md`. Not a finding in itself (the stage might be smaller than the other two), but if the team wants symmetry it's a TODO.
- Did NOT re-verify all CLAUDE.md "always/never" rules exhaustively — the 6 highest-impact ones were spot-checked. Lower-impact rules (e.g. "use Mantine's notifications.show", "use `setTimeout(0)` after sign-in for user-progress fetches") not checked here.
