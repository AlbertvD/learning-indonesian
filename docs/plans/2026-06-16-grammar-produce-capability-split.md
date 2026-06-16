---
status: shipped
reviewed_by: [architect, data-architect]   # architect APPROVE 2026-06-16; data-architect APPROVE 2026-06-16 (CRITICAL-1 + MAJOR-1 folded in)
adr: 0017
implementation: PR #pending
merged_at: 2026-06-16
implementation_paths:
  - src/lib/capabilities/capabilityTypes.ts
  - src/lib/capabilities/renderContracts.ts
  - src/lib/capabilities/capabilityCatalog.ts
  - scripts/lib/pipeline/capability-stage/projectors/grammar.ts
  - scripts/lib/pipeline/capability-stage/satellitePresence.ts
  - src/lib/session-builder/pedagogy.ts
  - src/lib/session-builder/labels.ts
  - src/lib/analytics/mastery/masteryModel.ts
  - src/components/progress/GrammarPatternList.tsx
  - src/components/experience/buildFeedbackInput.ts
  - scripts/check-supabase-deep.ts
supersedes: []
---

# Grammar-Pattern Production Capability Split — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mint a new productive capability `produce_grammar_pattern_cap` so the two production exercises (`transform_sentence_ex`, `translate_sentence_ex`) are scheduled as a *produce*-level skill instead of being mislabelled under `recognise_grammar_pattern_cap` — making every grammar pattern emit three honestly-levelled capabilities (recognise → contrast → produce).

**Architecture:** Pure render-routing + catalog change. The typed grammar-exercise tables are keyed by `grammar_pattern_id` (not capability), so the 1,471 authored rows are repointed by routing alone — no data move, no migration (`capability_type` is bare `text`). Production is gated after contrast by a linear `prerequisiteKeys` chain. The single shared renderability predicate (`satellitePresence.ts`) is narrowed (recognise→cloze-only) and extended (produce→transform∪translate) so reconciliation + health checks stay correct. Grammar production surfaces as a third per-pattern progress chip, reusing the existing `pattern_use` mastery dimension (no new dimension).

**Tech Stack:** TypeScript, Vitest + @testing-library/react, Bun, Supabase (PostgREST), the capability-stage pipeline (`scripts/lib/pipeline/capability-stage/`).

**Architecture grounding** (CLAUDE.md / `feedback_plan_grounding`): every touched runtime module — `lib/capabilities/`, `lib/session-builder/`, `lib/exercise-content/`, `lib/analytics/` (incl. mastery) — is **LOCKED** in `docs/target-architecture.md:175-181`. This plan lands entirely within their existing seams (catalog enum, `renderContracts`, mastery-dimension fold, progress chip) plus the `capability-stage` projector; it adds **no new module, no fold target, and crosses no module boundary** (`target-architecture.md:67` DAG rule respected — no new imports from `services/`/`components/` into `lib/`). Module specs consulted: `docs/current-system/modules/{capabilities,session-builder,exercise-content,analytics-mastery,capability-stage-vocabulary}.md`. Decision record: **ADR 0017**; model doc §7.6 + §8.

---

## Decision summary (the resolved design)

| Aspect | Decision |
|---|---|
| New cap | `produce_grammar_pattern_cap`, `produce_mode`, `grammar_pattern_src` |
| Routing | `recognise`→`choose_missing_word_ex` only · `contrast`→`choose_correct_form_ex` · `produce`→`transform_sentence_ex` + `translate_sentence_ex` |
| Prereq chain | linear: `recognise → contrast → produce` (`produce.prerequisiteKeys = [contrastKey]`) |
| Phase | `produce → 4`; fix `recognise → 3` (inert for grammar, coherence only) |
| Renderability | one predicate, three arms (narrow recognise→cloze, add produce→transform∪translate) |
| Progress UI | third "Produceren" chip per pattern; **no** new mastery dimension (fold `produce` into `pattern_use`) |
| Cutover | additive — no migration, no truncate, no `--regenerate`; republish grammar lessons |

## Supabase Requirements

### Schema changes
- **New tables / columns:** **None.** `learning_capabilities.capability_type` is bare `text` with no CHECK (`scripts/migration.sql:1335,1364`), so the new value needs no DDL. The `(source_ref, capability_type)` unique index (`migration.sql:1357`) already accommodates a third distinct cap per pattern.
- **RLS policies:** None — `learning_capabilities` policies are type-agnostic (authenticated read; service_role write). No change.
- **Grants:** None.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema/table).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage buckets — **N/A**.

### Health check additions
- `scripts/check-supabase-deep.ts`: HC20 narrows to `recognise → choose_missing_word_ex` (cloze) only; **add** a per-type `produce → (transform_sentence_ex ∪ translate_sentence_ex)` report line off the same predicate. Both ride the single `findCapsMissingSatellite` predicate (no second definition of "renderable").
- `scripts/check-supabase.ts` (tier 1, anon): **N/A** (structural, not functional).

---

## Tasks

> Each task is TDD: write the failing test, see it fail, implement minimally, see it pass, commit. Run the full suite (`bun run test`) and `tsc -b` before the cutover tasks. Branch: `feat/grammar-produce-cap-split` (off `main`).

### Task 1: Add `produce_grammar_pattern_cap` to the capability catalog

**Files:**
- Modify: `src/lib/capabilities/capabilityTypes.ts` (union ~32-44; `CAPABILITY_TYPES` array ~46-59; `deriveSkillTypeFromCapabilityType` switch ~238-254)
- Test: `src/lib/capabilities/__tests__/capabilityTypes.test.ts`

**Step 1 — failing test:** assert `CAPABILITY_TYPES.includes('produce_grammar_pattern_cap')` and `deriveSkillTypeFromCapabilityType('produce_grammar_pattern_cap') === 'produce_mode'`.

**Step 2 — run, expect fail** (`bun run test capabilityTypes`): type error / missing value.

**Step 3 — implement:** add `'produce_grammar_pattern_cap'` to the `CapabilityType` union and the `CAPABILITY_TYPES` array; add a `case 'produce_grammar_pattern_cap': return 'produce_mode'` to the switch (group with the other `produce_*` cases).

**Step 4 — run, expect pass.**

**Step 5 — commit:** `feat(capabilities): add produce_grammar_pattern_cap type (ADR 0017)`

---

### Task 2: Route the production exercises to `produce`, recognise to cloze-only

**Files:**
- Modify: `src/lib/capabilities/renderContracts.ts` — `transform_sentence_ex` (~140-145), `translate_sentence_ex` (~146-151): `capabilityTypes: ['produce_grammar_pattern_cap']`. Leave `choose_missing_word_ex` (~119-131) at `['recognise_grammar_pattern_cap']` and `choose_correct_form_ex` (~132-139) at `['contrast_grammar_pattern_cap']`.
- Test: `src/__tests__/renderContractsValidatorMatrix.test.ts`

**Step 1 — failing test:** `exerciseTypesForCapability('produce_grammar_pattern_cap')` returns `['transform_sentence_ex','translate_sentence_ex']`; `exerciseTypesForCapability('recognise_grammar_pattern_cap')` returns `['choose_missing_word_ex']`.

**Step 2 — run, expect fail.**

**Step 3 — implement** the `capabilityTypes` edits above. The load-time `assertCapabilityTypesServed` (`renderContracts.ts:189-219`) will now require `produce_grammar_pattern_cap` to be served — Task 1 + this satisfy it.

**Step 4 — run, expect pass** (full module load must not throw the exhaustiveness assertion).

**Step 5 — commit:** `feat(capabilities): route grammar production exercises to produce cap`

---

### Task 3: Register the third cap in `capabilityCatalog.ts`

**Files:**
- Modify: `src/lib/capabilities/capabilityCatalog.ts` (grammar block ~132-162; add a `produce_grammar_pattern_cap` entry mirroring the recognise/contrast shape: `sourceKind: 'grammar_pattern_src'`, `direction:'none'`, `modality:'text'`, `learnerLanguage:'none'`, `prerequisiteKeys` → the contrast cap's key). Update the stale routing comment (~132-133) to the new map.
- Test: `src/__tests__/capabilityCatalog.test.ts`

**Step 1 — failing test:** the catalog yields a `produce_grammar_pattern_cap` whose `prerequisiteKeys` is the contrast key for the same `source_ref`.

**Step 2 — run, expect fail.**

The entry MUST pass `skillType: 'produce_mode'` explicitly to the `createCapability` factory (the recognise cap passes `'recognise_mode'`, `capabilityCatalog.ts:139`) so the catalog matches `deriveSkillTypeFromCapabilityType`'s mapping (architect C4).

**Step 3 — implement.** ⚠️ **First confirm `capabilityCatalog.ts`'s role** (flagged unknown): is it a live cap emitter or a reference shape the projector mirrors? `grep` its importers. If reference-only, still add the entry for coherence; if a live emitter for any path, the entry is functionally required. (Grammar block is at `capabilityCatalog.ts:123-160`.)

**Step 4 — run, expect pass.**

**Step 5 — commit:** `feat(capabilities): catalog entry for produce_grammar_pattern_cap`

---

### Task 4: Emit 3 caps per pattern in the projector

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/projectors/grammar.ts` (`projectPatternsFromCategories`, capabilities array ~135-162). Add a third `CapabilityInput` for `produce_grammar_pattern_cap` with `prerequisiteKeys: [contrastKey]`. Compute `produceKey = buildCanonicalKey({...recognitionDraft, capabilityType:'produce_grammar_pattern_cap'})`.
  - **Downstream-by-construction (no extra code here):** because the runner flatMaps `plan.capabilities` for both the cap upsert *and* the `capability_content_units` junction write (`runner.ts:465-484`) and the orphan-retire emit set (`runner.ts:414`), extending this array is the single change that makes the produce cap land in all three. The produce cap shares the recognise/contrast `source_ref`, so it junctions to the same `content_unit`. Task 13 Step 3 verifies the junction row exists (data-architect CRITICAL-1).
- Test: `scripts/lib/pipeline/capability-stage/projectors/__tests__/grammarPatterns.test.ts`

**Step 1 — failing test:** one category projects exactly 3 caps; the produce cap's `prerequisiteKeys === [contrastKey]`; canonical keys are distinct.

**Step 2 — run, expect fail.**

**Step 3 — implement** (extend the array + the PatternPlan doc comment at ~45 "+ produce").

**Step 4 — run, expect pass.**

**Step 5 — commit:** `feat(capability-stage): project produce_grammar_pattern_cap per pattern`

---

### Task 5: Phase classification (coherence)

**Files:**
- Modify: `src/lib/session-builder/pedagogy.ts` `capabilityPhase` (~208-227): add `case 'produce_grammar_pattern_cap': return 4`; move `recognise_grammar_pattern_cap` from the Phase-4 group to the Phase-3 group (with `contrast`).
- Test: `src/__tests__/pedagogyPlanner.test.ts`

**Step 1 — failing test:** `capabilityPhase('produce_grammar_pattern_cap') === 4` and `capabilityPhase('recognise_grammar_pattern_cap') === 3`.

**Step 2 — run, expect fail (compile: non-exhaustive switch).**

**Step 3 — implement.**

**Step 4 — run, expect pass.**

**Step 5 — commit:** `refactor(pedagogy): phase taxonomy for grammar produce cap (coherence)`

---

### Task 6: Renderability predicate — one predicate, three arms

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/satellitePresence.ts` `findPatternCapsMissing` (~100-132). Change the `recognise_grammar_pattern_cap` arm from `recognitionUnion` to `cmSet` (cloze only). Add an arm: `produce_grammar_pattern_cap` → missing iff `!pid || !(stSet.has(pid) || ctSet.has(pid))` (transform ∪ translate). Update the header comment (~18-25) to the new three-arm map.
- Test: `scripts/lib/pipeline/capability-stage/__tests__/satellitePresence.test.ts`

**Step 1 — failing tests:** (a) a `recognise` cap whose pattern has transform/translate but **no cloze** row IS an offender; (b) a `produce` cap whose pattern has a transform row is NOT an offender; (c) a `produce` cap whose pattern has only a cloze row IS an offender.

**Step 2 — run, expect fail.**

**Step 3 — implement** the arm changes. **Remove (or rename to `produceSatelliteUnion`) the now-unused `recognitionUnion` variable** (`satellitePresence.ts:119`) — after narrowing the recognise arm to `cmSet`, the old `st ∪ ct ∪ cm` union is consumed by nothing and left in place would mislead future maintainers into thinking the union is still operative (data-architect MAJOR-1). The produce arm reads `stSet`/`ctSet` directly.

**Step 4 — run, expect pass.**

**Step 5 — commit:** `fix(capability-stage): renderability predicate narrows recognise to cloze, adds produce arm`

---

### Task 7: Live health check — narrow HC20, add produce report

**Files:**
- Modify: `scripts/check-supabase-deep.ts` HC19/HC20 block (~983-1058). Narrow HC20's wording to cloze-only. Add a third per-type filter `produceOffenders = offenders.filter(c => c.capability_type === 'produce_grammar_pattern_cap')` with its own pass/fail line (next free HC number; current max is HC28 per CONTEXT — use **HC29** unless taken, else next free; grep `HC2` to confirm). All three read the one `findCapsMissingSatellite` result.

**Step 1 — verify free HC number:** `grep -n "HC2[0-9]" scripts/check-supabase-deep.ts`.

**Step 2 — implement** the narrowed HC20 + new produce report line.

**Step 3 — run** (post-cutover, Task 11): `make check-supabase-deep` → all three green. (Pre-cutover it's vacuously green / shows produce caps absent — expected until republish.)

**Step 4 — commit:** `feat(health): HC for produce_grammar_pattern_cap renderability`

---

### Task 8: Mastery — fold produce into `pattern_use`, add grammar rung facet

**Files:**
- Modify: `src/lib/analytics/mastery/masteryModel.ts`:
  - `dimensionForCapability` (~139-170) — add `case 'produce_grammar_pattern_cap': return 'pattern_use'` (reuse, **no** new `MasteryDimension` union member).
  - **`interface GrammarTopicLabel` (~518-521)** — add `produce: GrammarDimensionProgress | null` (architect C1: it currently declares only `recognise` + `contrast`; the chip in Task 9 reads `topic.produce`, and the object literal would be an excess-property `tsc` error without this).
  - Grammar rung builder (~570-571) — add `produce: dimensionProgress(caps.filter(c => c.capabilityType === 'produce_grammar_pattern_cap'), now)` to the per-pattern structure; ensure the weakest-wins overall rung now spans all three facets.
  - **Update the stale prose comment (~549-551)** in the same commit — it says each pattern "splits into its two … dimensions — `recognise` … and `contrast`"; it is now three (data-architect MINOR-3).
- Test: the mastery model tests (grep `masteryModel` / `masteryFunnel` under `src/lib/analytics/mastery/__tests__/` + `src/__tests__/`).

**Step 1 — failing tests:** (a) a pattern with a strengthening produce cap exposes a `produce` facet; (b) `dimensionForCapability('produce_grammar_pattern_cap') === 'pattern_use'`; (c) **funnel-count assertion** (architect C2): the per-lesson/whole-learner grammar funnel tally rises by the produce caps (2→3 caps/pattern), and a pattern reaches "mastered" only when its produce cap does too — pin this with a count assertion so the shift is intended, not discovered.

**Step 2 — run, expect fail (compile: non-exhaustive switch).**

**Step 3 — implement.**

**Step 4 — run, expect pass.**

**Step 5 — commit:** `feat(analytics): grammar produce mastery facet (folded into pattern_use)`

---

### Task 9: Add the "Produceren" chip

**Files:**
- Modify: `src/components/progress/GrammarPatternList.tsx` (~69-70): add a third `<DimChip label={T.progress.grammarProduce} dim={topic.produce} rungLabel={rungLabel} />`. Add the `grammarProduce` label to `src/lib/i18n.ts` (NL + EN). Update the file header comment (~5-6).
- Test: `src/components/progress/__tests__/GrammarPatternList.test.tsx`

**Step 1 — failing test:** a pattern row renders three chips including "Produceren".

**Step 2 — run, expect fail.**

**Step 3 — implement.**

**Step 4 — run, expect pass.**

**Step 5 — commit:** `feat(progress): per-pattern Produceren chip`

---

### Task 10: `labels.ts` entry (tsc-forced)

**Files:**
- Modify: `src/lib/session-builder/labels.ts` (the `Record<CapabilityType, CapabilityDisplay>` ~60-79): add a `produce_grammar_pattern_cap` entry — Dutch label + description (e.g. label "Grammatica — produceren", desc "Pas de regel toe om een zin te maken"). The `as const satisfies Record<CapabilityType,…>` makes this **compile-forced**.

**Step 1 — run `tsc -b`, expect fail** (missing key).

**Step 2 — implement** the entry (author the NL text).

**Step 3 — run `tsc -b`, expect pass.**

**Step 4 — commit:** `feat(session-builder): label for produce_grammar_pattern_cap`

---

### Task 11: The hidden `Set` — `buildFeedbackInput.ts`

**Files:**
- Modify: `src/components/experience/buildFeedbackInput.ts:7` — add `'produce_grammar_pattern_cap'` to `GRAMMAR_CAPABILITY_TYPES`. ⚠️ This is a `new Set([...])` of strings — **tsc will NOT catch the omission** (the Phase-A trap). First read the file to confirm produce *should* be in the grammar set (it drives the feedback flow); it should, since transform/translate are grammar exercises.
- Test: add/extend a test asserting `buildFeedbackInput` treats a `produce_grammar_pattern_cap` block as grammar.

**Step 1 — failing test.**

**Step 2 — run, expect fail.**

**Step 3 — implement** (add to the Set after confirming intent).

**Step 4 — run, expect pass.**

**Step 5 — commit:** `fix(experience): treat produce grammar cap as grammar in feedback flow`

---

### Task 12: Resolve the two flagged unknowns

**Action (no code unless found):**
- Confirm `capabilityCatalog.ts`'s consumers (Task 3 note) — `grep -rn "capabilityCatalog" src/ scripts/`.
- Confirm whether `scripts/materialize-capabilities.ts` is a live second seeding path or dead — if live, ensure it emits 3 caps; if dead, note in the plan and leave untouched.
- `check-lesson-coverage.ts:58` counts grammar caps by `source_kind` (type-agnostic, won't break) but its reported count rises ~50% (2N→3N) (architect W2). Grep for any assertion/snapshot keyed off that count; update if found.

**Commit (if changes):** `chore: reconcile produce cap across secondary cap surfaces`

---

### Task 13: Full suite + type gate, then cutover (additive)

**Step 1 — gate:** `tsc -b` (0 errors) · `bun run test` (all green) · `bun run lint`.

**Step 2 — republish grammar-bearing lessons** (loop per lesson; `feedback_publish_loop_per_lesson` — one arg at a time):
```
for N in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do bun scripts/publish-approved-content.ts $N; done
```
(Use the published-lessons set; lesson-999 Common Words has no grammar.) Each republish adds the produce cap via `upsertCapabilitiesSkipIfExists`; the seeded-check skips exercise regeneration (1,471 rows preserved).

**Step 3 — verify (ground truth, not memory):**
- 97 × `produce_grammar_pattern_cap` caps now exist (one per pattern).
- **Every** one of the 97 patterns has ≥1 active `cloze_mcq_exercises` row (else its `recognise` cap soft-retires). Query and assert count == 97.
- **Every** one of the 97 patterns has ≥1 active row in (`sentence_transformation_exercises` ∪ `constrained_translation_exercises`) — else its **`produce` cap soft-retires** during republish (the reconcile at `runner.ts:600` covers `grammar_pattern_src`). This is the produce-arm analogue of the cloze check (architect C3). Assert count == 97.
- **Junction write is verified, not assumed** (data-architect CRITICAL-1): each produce cap gets its `capability_content_units` row implicitly via `runner.ts:465-484` (it flatMaps `plan.capabilities`, which Task 4 extends, and the produce cap shares the recognise/contrast `source_ref` → same `content_unit`). Because that write is implicit, assert it explicitly:
  ```sql
  -- expect 97 (one produce cap per pattern, each junctioned to its content_unit)
  select count(*) from indonesian.capability_content_units ccu
  join indonesian.learning_capabilities lc on ccu.capability_id = lc.id
  where lc.capability_type = 'produce_grammar_pattern_cap';
  ```
  A count < 97 means the projector→junction plumbing dropped the new cap — fail the cutover.
- `make check-supabase-deep` → HC19 / HC20 / produce-HC all green.

**Step 4 — gate + deploy:** `make pre-deploy` (lint + test + build + tier1 + tier2) — run even though no `.sql` changed, per the standing pre-deploy rule (architect W1); `make migrate-idempotent-check` is genuinely N/A (no migration). Then build image (GHA on push) + homelab container recreate (per `docs/process/deploy.md`).

---

### Task 14: Liveness gate (the done-bar)

**Per `feedback_answer_log_check` / ADR 0017 Consequences — data existence ≠ feature works:**
- In the running app, activate a grammar lesson, advance to a `produce_grammar_pattern_cap` review, answer a `transform_sentence_ex` or `translate_sentence_ex`.
- Confirm a real `capability_review_events` row lands for that cap (query by `capability_id`).
- Only then is the feature "shipped."

---

### Task 15: Close out docs (same PR)

- `docs/adr/0017-*.md`: confirm `Status` is Accepted (already flipped at design close-out 2026-06-16).
- `docs/current-system/capability-and-exercise-model.md` §8: mark the §7.6 split **shipped** (not "follow-up slice").
- This plan's frontmatter: `status: shipped`, add `implementation: PR #NN`, `merged_at`, `implementation_paths`.
- Update `docs/current-system/modules/capabilities.md` (and `analytics-mastery.md` if the rung facet count is documented) — same commit as code (spec-drift rule).
- Memory `project_capability_naming_rename_phaseA`: tick the §7.6 split done.

**Commit:** `docs: mark grammar produce split shipped (ADR 0017)`

---

## Review gate (before any implementation)

This plan touches the data model (a new capability type, the projector, the renderability predicate, a health check). Per CLAUDE.md it requires **both `architect` and `data-architect`** sign-off recorded in `reviewed_by:` before `status: approved`. The pre-commit `plan-review-gate` blocks an approved data-model plan missing `data-architect`.
