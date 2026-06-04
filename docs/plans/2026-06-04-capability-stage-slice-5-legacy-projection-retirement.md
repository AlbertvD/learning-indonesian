---
status: approved
implementation: TBD                          # PR # assigned when 5a opens
reviewed_by: [architect, data-architect]     # both round-2 APPROVE, 2026-06-04
supersedes: []
parent_epic: "#98"
issue: "#147"
---

# Capability Stage — Slice 5: Legacy-Projection Retirement + Global No-Disk Gate

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Capability Stage read *only* from the database — retire the staging-derived `buildCapabilityStagingFromContent → projectCapabilities` regeneration, re-source the residual cap/content-unit kinds from the typed DB tables, kill the last `exercise_variants` writer, and flip the global no-file-I/O enforcement gate ON (epic #98 User Story 10).

**Architecture:** Two PRs following the program's additive→subtractive / code-first→migration rhythm (Slices 1–3, 4a/4b). **PR 5a** adds DB-native emitters for the residual kinds (audio caps, affixed caps, `content_units`, POS) *alongside* the staging path, key-set-excluded to avoid double-writes, with a parity assertion proving byte-identical output — provably inert. **PR 5b** removes every staging-derived projector path + the regeneration + `stagingWriteback` + all loader staging reads + the step-10 `exercise_variants` writer, flips the global no-disk gate, reworks dry-run to DB-only, and ships a one-shot cleanup migration.

**Tech Stack:** TypeScript, Bun, Vitest, Supabase (PostgREST + `indonesian` schema), the existing `scripts/lib/pipeline/capability-stage/` deep module.

---

## Grounding (CLAUDE.md plan-grounding rule)

- **Module placement / fold fit.** Slice 5 lands inside the capability-stage deep module (`scripts/lib/pipeline/capability-stage/`) — the ADR-0011/0012 redesign target. It **removes** the staging-derived projection, which `docs/target-architecture.md` and **ADR 0012** explicitly want gone ("the Capability Stage reads only the DB"). This is the fold's *completion*, not fold-target drift — no new code is added to any file slated for folding.
- **Module spec.** `docs/current-system/modules/capabilities.md` (verified 2026-06-04) already pre-declares `artifactRegistry.ts`'s `ARTIFACT_KINDS` as *"retained only for the Slice-5-owned (#147) legacy staging regeneration"* (`:22`, `:90`) — Slice 5 retires it. **`projectCapabilities` lives in `src/lib/capabilities/capabilityCatalog.ts`** (imported via `@/lib/capabilities`), NOT in `content-pipeline-output.ts`; it is NOT deleted (`materialize-capabilities.ts:2`, `check-capability-health.ts:7` still import it). What `content-pipeline-output.ts` *owns* and the runner retires is `buildContentUnitsFromStaging` / `buildCapabilityStagingFromContent` / `buildArtifactsForCapability` — these stay in the file but lose their **runner** caller (podcast/`materialize` keep theirs; grep before deleting any).
- **Data model.** `content_units` survives per data-model-target **Decision E** (`docs/plans/2026-05-21-data-model-target.md:447`) — identity-only; `payload_json`/column drop is a *separate* migration. Slice 5 re-sources its identity from the DB and stops writing `payload_json`.
- **ADR 0012 deviation (tracked debt).** POS enrichment stays in the capability stage (DB-native) rather than relocating to the Lesson Stage as ADR 0012 prescribes. Add a one-line amendment to ADR 0012 noting this tracked exception (see Task 5b.12).

## Resolved design (from grill-with-docs 2026-06-04 — live-DB grounded)

| # | Decision | Resolution |
|---|---|---|
| D1 | step-10 `exercise_variants` writer + the supposed L5/7/8 `!usePatternPath` gap | **Retire the writer outright, no precursor.** Live DB: **all 10 lessons are `usePatternPath`**; the grammar branch is already skipped everywhere; 716 `exercise_variants` rows are stale + app-unread (`coverageService.ts:69`). Zero runtime regression. |
| D2 | cap-less `sentence`/`dialogue_chunk` `learning_items` (157) | **Stop writing + actively delete.** Cap-less, pool-excluded (`loadFromDb.ts:265`), reader-visibility comes from `lesson_sections` (ADR 0014 §M4). One-shot SQL delete (cascade satellites + 70 orphan `content_units`). |
| D3 | `content_units` re-source | **Identity-only from the DB, stop writing `payload_json`.** Sections/items/affixed are byte-identical (inert). **Grammar units re-key** curated-slug → pattern-path `l{N}-${stableSlug(title)}` so `content_unit.source_ref == capability.source_ref` (Decision E amendment 2026-06-04) — an intended delta, not inert; old grammar units swept in 5b.10, bridge re-derived by `source_ref` match. |
| D4 | `cloze-contexts.ts` ownership vs #148 | **Slice 5 removes the read + retires `projectCloze`.** **Preserve** the 1167 authored cloze `item_contexts` (ADR 0011 seed-once) as #148's DB substrate — #148 emits the activating caps DB-natively → no double-remove. |
| D5a | POS after `projectVocab` dies | **DB-native `enrichPos` stays in the capability stage.** Load-bearing (663/671 carry POS; runtime `cascade.ts` tiers on it; Lesson Stage has no POS enricher). |
| D5b | slicing + dry-run | **PR 5a (additive + parity) → PR 5b (subtractive cutover + migration).** **Dry-run reworked to DB-only** (`loadLessonForDryRun` is staging-coupled → deleted). |

**Deletion asymmetry (ADR 0011/0014 sub-decision):** `sentence`/`dialogue_chunk` `learning_items` = de-harvest dead-weight → **DELETE**. Cloze `item_contexts` = authored carrier sentences, currently unreachable (0 item-cloze caps) → **PRESERVE** for #148.

## Supabase Requirements

### Schema changes
- **No new tables/columns.** PR 5b ships a **one-shot cleanup** (not DDL) in `scripts/migration.sql`. **⚠ The cascade blast radius is larger than "cap-less dead weight" — see the live-probe results below; an archive pre-flight is mandatory.**
- **Live-probe results (service-key, 2026-06-04 — record in the PR per `feedback_post_pr_verification`):**
  - The 157 target items (`source_type='lesson'`, `item_type IN ('sentence','dialogue_chunk')`) carry cascading rows: **`learner_item_state`=37, `learner_skill_state`=37, `review_events`=113, `content_flags`=7** — all `learning_item_id … ON DELETE CASCADE` (migration.sql:176/194/215/726). These are **legacy SM-2 scheduler rows** (#150's retirement target; NOT read by the capability runtime — the runtime uses `learner_capability_state`/`capability_review_events`). `review_events.learning_item_id` was made *nullable* (migration.sql:809) but its **FK action is still CASCADE** — deleting the items destroys 113 review records. → **Archive all four tables' affected rows to a timestamped dump before `make migrate`** (Task 5b.10). No `capability_review_events` rows reference these items (cap-less).
  - `content_units` orphans: **70** match `'learning_items/' || normalized_text`, **72** match `'learning_items/' || lower(trim(base_text))`, **2 are MISSED by the `normalized_text` predicate** (empirical: for these legacy de-harvested rows `normalized_text="saya ke pasar"` lacks the trailing punctuation that `lower(trim(base_text))="saya ke pasar."` retains — the historical normalizer that wrote these old rows' `normalized_text` differs from the current `itemSlug`=`toLowerCase().trim()`, so which key form `content_units.source_ref` used is uncertain). **The spec's original `normalized_text` predicate undercounts.** → use the form-agnostic orphan-existence sweep in Task 5b.10 (covers both forms regardless of the historical key).
- The two DELETEs (exact SQL in Task 5b.10):
  - `learning_items` (157) — cascades `item_contexts`/`item_answer_variants`/`item_meanings` (+ the 4 legacy scheduler tables above) via FK.
  - `content_units` orphan sweep — `content_units` has **no FK** to `learning_items`, so delete every `unit_kind='learning_item'` row whose `source_ref` no longer resolves to a live item (bulletproof + idempotent; catches all 72 + any pre-existing orphans).
- **RLS / grants:** N/A — no new tables; existing policies unaffected.
- **`exercise_variants` table DROP is OUT of scope** — owned by #102/4c (#153). Slice 5 only removes the *writer*; the 716 stale rows persist until 4c drops the table.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema exposure.
- [ ] Kong: N/A.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- **Remove** the dead check in `scripts/check-supabase-deep.ts:179–200` ("`exercise_variants` exist for every lesson that has candidates") — a dead invariant once the writer dies (Task 5b.11).
- The global `noDiskReads.test.ts` `globalNoFileIO` assertion flips from `it.skip` → `it` (Task 5b.9) — this is the slice's headline gate.
- No new `check-supabase.ts` (functional) additions needed; parity is asserted in-suite + by live re-publish diff.

---

# PR 5a — Additive DB-native re-source + parity gate (provably inert)

**Branch:** `feat/slice-5a-db-native-residual-resource`
**Invariant for the whole PR:** the staging path still runs; every new emitter is key-set-excluded from the staging bundle exactly as Slices 1–3 did (`runner.ts:535–542`). Re-publishing any lesson produces **identical** caps/items/content_units vs `main`. No gate flip, no removals.

### Task 5a.0: Worktree + baseline
**Step 1:** `git worktree add ../li-slice5a -b feat/slice-5a-db-native-residual-resource main && cd ../li-slice5a && bun install` (per `memory/feedback_worktree_bun_install`).
**Step 2:** Run the existing suite to confirm green baseline: `bun run test -- scripts/lib/pipeline/capability-stage` → expect PASS.

### Task 5a.1: Audio-cap emission from typed item rows

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` (extend `projectItemsFromTypedRows`)
- Test: `scripts/lib/pipeline/capability-stage/__tests__/projectors/vocab.test.ts`

Today the staging bundle carries `audio_recognition` + `dictation` caps (635 each); the typed path (`projectItemsFromTypedRows`) emits only the 4 base text caps. Extend it to also emit the 2 audio caps for any word/phrase item present in `audioClipsByNormalizedText` (already loaded from `audio_clips` by `loadStageAOutputsFromDb`). The canonical keys MUST match the staging-derived keys exactly (build from the same `itemSlug`/capability-type inputs — see `capabilityCatalog.ts`) so the key-set exclusion + `retireOrphanedCapabilities` see them as the same caps.

**Step 1: Write the failing test** — a word item whose `normalized_text` is in the audio map yields 6 caps (4 base + `audio_recognition` + `dictation`); an item NOT in the map yields 4.
**Step 2:** `bun run test -- vocab.test.ts -t audio` → FAIL.
**Step 3:** Implement: thread `audioClipsByNormalizedText` into `projectItemsFromTypedRows`; for each item with audio, push the 2 audio caps using the catalog's canonical-key builder. Distractor tables are NOT written for audio caps (mirror current behaviour — audio caps have no distractor satellite).
**Step 4:** `bun run test -- vocab.test.ts` → PASS.
**Step 5:** Commit: `feat(capability): emit audio caps from typed rows + audio_clips (#147 5a)`.

### Task 5a.2: Affixed-cap emission from `lesson_section_affixed_pairs`

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/projectors/affixedCapabilities.ts`
- Test: `scripts/lib/pipeline/capability-stage/__tests__/projectors/affixedCapabilities.test.ts`

Today affixed caps (`root_derived_recognition`/`root_derived_recall`, 4 rows) are emitted via the `morphology-patterns.ts` regeneration (the Option-A deferral). Replace with a pure emitter that builds the 2 caps per pair from the DB rows already loaded by `fetchAffixedPairsFromDb` (`loadFromDb.ts:843`). Canonical keys + `sourceRef` MUST equal the staging-derived ones (the DB row's `source_ref` is byte-identical — verified in Slice 3, runner.ts:903–907) so the typed `affixed_form_pairs` projector (`projectors/morphology.ts`, runner step 7c) still joins on `cap.sourceRef`.

**Step 1:** Failing test — 2 DB pairs → 4 caps with the expected canonical keys + `source_kind='affixed_form_pair'` + `lessonId` stamped.
**Step 2:** Run → FAIL.
**Step 3:** Implement `projectAffixedCapabilities({ pairs, lessonId })` reusing the canonical-key helpers in `@/lib/capabilities`.
**Step 4:** Run → PASS.
**Step 5:** Commit: `feat(capability): emit affixed caps from lesson_section_affixed_pairs (#147 5a)`.

### Task 5a.3: DB-driven `content_units` builder (identity-only)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/projectors/contentUnits.ts`
- Test: `scripts/lib/pipeline/capability-stage/__tests__/projectors/contentUnits.test.ts`

Replace `buildContentUnitsFromStaging` (`content-pipeline-output.ts:217`) with a DB-driven builder that emits `content_unit_key`/`unit_slug`/`source_ref`/`source_section_ref`/`unit_kind`/`display_order` from: `loaded.sections` (lesson_section units), `itemDbResult.items` (word/phrase learning_item units — **NOT** sentence/dialogue, which are being dropped), `patternDb.categories` (grammar_pattern units), and the affixed pairs (affixed_form_pair units). **`payload_json` is emitted empty/`{}`** (Decision E — unread; column drop deferred).
- **Sections / items / affixed:** reuse the *exact* key/slug helpers (`contentUnitKey`, `stableSlug`, `sourceRefForLearningItem`, `affixedFormPairSourceRef`) from `content-pipeline-output.ts` — these ARE byte-identical to the staging-derived rows (inert).
- **⚠ Grammar units re-key (Decision E amendment, 2026-06-04 — NOT inert; data-architect-validated):** the legacy staging builder keyed grammar units off the curated `pattern.slug` (`grammar-patterns.ts`), which is irreproducible from the DB. **Do NOT re-derive the slug** — `projectPatternsFromCategories` (`projectors/grammar.ts:181-280`) applies a **collision tie-break** (`-${display_order}` suffix when two categories in a lesson share a title-slug, `:203-204`) plus a `normalizeLessonSourceRef` wrap (`:207`); a naive `l{N}-${stableSlug(title)}` would diverge from the cap on any collision. **Instead, the content_units builder CONSUMES the pattern path's projected output** (`patternProjection.patternPlans[].slug` / `.sourceRef`, already computed in the runner) for the grammar units — so `content_unit.source_ref` is the EXACT cap `source_ref` (`lesson-{N}/pattern-l{N}-…`, collision-disambiguated), by construction. This **changes** every grammar content_unit key vs the legacy curated-slug rows — a deliberate one-time re-key, so grammar units are an **expected delta** in the parity gate (5a.6). The old curated-slug grammar units are swept in 5b.10; the bridge re-points by `source_ref` match (5a.5). (Sequencing: the grammar-unit emission needs `patternProjection`, so it's wired after `projectPatternsFromCategories` in the runner — 5a.5.)

**Step 1:** Failing tests: (a) sections/items/affixed identity fields match the staging builder for a fixture lesson, `payload_json === {}`; (b) **grammar units are built from the pattern path's `PatternPlan[]`** — assert each grammar `content_unit.source_ref` equals the corresponding plan's `.sourceRef` (== the cap `source_ref`); use a realistic VERBOSE title fixture (e.g. `title: 'Bukan — ontkenning van zelfstandig naamwoorden'`), NOT a pre-slugified one (the original draft rigged `title: 'word-order'`, masking the divergence); (c) **collision-fixture test** — two categories in one lesson whose titles slugify to the same base → assert the grammar units inherit the pattern path's `-${display_order}` disambiguated slugs (i.e. the builder consumes plan output, not a re-derivation that would collide).
**Step 2–4:** Implement + green.
**Step 5:** Commit: `feat(capability): DB-driven content_units builder, grammar units pattern-path-aligned (#147 5a)`.

> **Parity note:** the parity gate (5a.6) has TWO allowed deltas, both intended: (1) the staging builder emits learning_item units for sentence/dialogue items; the DB builder omits them (deleted in 5b.10). (2) grammar units change slug (curated → `l{N}-` aligned). Both are allowlisted; everything else (sections, word/phrase items, affixed) must be byte-identical. Encode both deltas explicitly in the parity assertion.

### Task 5a.4: DB-native `enrichPos`

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/enrichPos.ts` + `runner.ts:219–284` (the enrichment block)
- Test: `scripts/lib/pipeline/capability-stage/__tests__/enrichPos.test.ts` (extend)

Rewire so POS enrichment never touches staging: read the lesson's word/phrase items from `itemDbResult.items` + existing `learning_items.pos` from the DB, run the LLM POS pass only for null-pos items, and write `learning_items.pos` directly (a small adapter `updateLearningItemPos(supabase, normalizedText, pos)`; the idempotent upsert already preserves pos on UPDATE, so this is the sole writer). `enrichLevel` becomes a pure projector field set from `loaded.lesson.level`. Delete `writeLearningItemsWithEnrichedPos` usage from the enrichment block (its file is removed in 5b.5). Ordering: run the POS backfill **after** the item insert (step 5b) so rows exist.

**Step 1:** Failing test — TWO paths (B2): (a) INSERT path — a new item with null pos → `updateLearningItemPos` is called with `(normalized_text, pos)` after the item insert and the row ends with pos populated; (b) UPDATE-idempotency path — an item with existing pos → `enrichPos` skips it (the idempotent upsert preserves pos). `cascade.ts` tiers on pos, so a permanently-null pos on new items is a real distractor-quality regression.
**Step 2–4:** Implement + **wire `updateLearningItemPos` as a runner integration step** (post-insert, after step 5b). The runner must call it before returning, replacing the `writeLearningItemsWithEnrichedPos` staging write.
**Step 5:** Commit: `feat(capability): DB-native enrichPos writing learning_items.pos directly (#147 5a)`.

> **B2 HANDOFF LOCK (5a → 5b):** Task 5b.5 MUST NOT delete `writeLearningItemsWithEnrichedPos` until this task's `updateLearningItemPos` is wired in the runner **and** the parity gate (5a.7 live re-publish) confirms newly-published word/phrase items land non-null pos. Existing items are safe (`upsertLearningItemIdempotent` preserves pos on UPDATE); the risk is *new* items getting permanent null pos. Verify in 5a.7: publish a lesson, assert its word/phrase items have pos.

### Task 5a.5: Wire residual emitters into the runner (additive, key-set-excluded)

**Files:** Modify `scripts/lib/pipeline/capability-stage/runner.ts`
- **Append the new audio + affixed caps to `allCapabilities`** (`runner.ts:556`, the `[...stagedCapabilities, ...dialogueClozeCaps]` array) AND add their keys to `newPathEmittedKeys` (`runner.ts:436`) so the staging bundle no longer double-writes them. **The append is load-bearing for affixed:** step 7c `projectAffixedFormPairs` (`runner.ts:915`) filters `allCapabilities` for `sourceKind='affixed_form_pair'` and joins on `cap.sourceRef` — if the new affixed emitter's caps aren't in `allCapabilities`, step 7c emits **zero** affixed rows and affixed exercises silently vanish (the Slice-3 second-consumer trap, `feedback_enumerate_consumers_before_removing_read`). Audio caps similarly must reach `upsertCapabilities`.
- Call the DB `content_units` builder. **Pass it `patternProjection.patternPlans`** (computed by `projectPatternsFromCategories` at runner.ts:445 — so the builder call is sequenced after it) so grammar units take the plans' exact `slug`/`sourceRef` (collision-disambiguated). Feed the builder's output to `upsertContentUnits` **instead of** `staging.contentUnits` (keep the staging regeneration running for now — its output is unused for the upsert). Re-derive the `capability_content_units` junction (step 6) off the DB content_units; preserve the existing `relationshipKind` mapping. **Grammar units now join the bridge by direct `source_ref` match** (`content_unit.source_ref == capability.source_ref`) — cleaner than the legacy staging `contentUnitSlugs` metadata, which is gone. Verify every grammar cap finds its content_unit by this match (no orphan caps), and that the non-grammar kinds' junction derivation is unchanged.
- The staging path (`projectVocab`/`projectGrammar`/`projectCloze`) STILL runs. This task only *redirects the writes* to the DB-native sources, leaving staging as a now-redundant shadow.

**Step 1:** Extend `runner.itemCutover.test.ts` / add `runner.residualCutover.test.ts` asserting audio + affixed caps come from the new emitters and are excluded from the staged bundle.
**Step 2–4:** Implement + green.
**Step 5:** Commit: `feat(capability): wire DB-native residual emitters, exclude from staging bundle (#147 5a)`.

### Task 5a.6: Parity gate

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/verify/residualParity.ts` + `__tests__/verify/residualParity.test.ts`

A pure comparator asserting the DB-native residual output (audio caps, affixed caps, content_units identity) is set-equal to the staging-derived output for a fixture, **modulo TWO allowlisted deltas** (both intended): (1) sentence/dialogue learning_item content_units (omitted — deleted in 5b.10); (2) grammar content_units (re-keyed curated-slug → `l{N}-` pattern-path slug). Everything else (sections, word/phrase item caps + content_units, affixed) must be byte-identical. This is the inert-ness proof for the genuinely-inert surfaces.
- **Fixture MUST include at least one `sentence`/`dialogue_chunk` item** (data-arch N2) so the sentence/dialogue allowed-delta path is exercised — assert it's in `allowedDelta`, not a parity failure (else vacuous).
- **Fixture MUST include at least one grammar category with a verbose (non-pre-slugified) title** so the grammar re-key delta is exercised — assert the new `l{N}-` unit is the expected change vs the old curated-slug unit, not a spurious parity failure. **Negative assertion (data-arch N1):** assert the DB-native builder output contains NO unit in the old curated-slug form (no `pattern-{curated}` that isn't `pattern-l{N}-…`) — catches a builder bug that emits BOTH old and new (duplicate) as a parity failure, the cheap early catch before 5b.10's sweep.
- **Assert the affixed join survives the new key builder** (arch #3): the new affixed emitter's `cap.sourceRef` MUST equal the `lesson_section_affixed_pairs.source_ref` it joins to in step 7c — assert byte-equality, not just canonical-key equality.

**Step 1–4:** TDD the comparator; green.
**Step 5:** Commit: `test(capability): residual parity gate for the DB-native re-source (#147 5a)`.

### Task 5a.7: Live re-publish + parity verification

**Step 1:** Snapshot live counts (caps by type/source_kind, content_units by unit_kind, learning_items by item_type) via a service-key probe (pattern: `NODE_TLS_REJECT_UNAUTHORIZED=0 bun <probe>` — `memory/project_capability_stage_program_status` DB query pattern).
**Step 2:** Re-publish all 10 lessons: `for n in 1 2 3 4 5 6 7 8 9 10; do bun scripts/publish-approved-content.ts $n; done` (per-lesson loop — `memory/feedback_publish_loop_per_lesson`).
**Step 3:** Re-probe; assert deltas are zero (caps/content_units/items identical — the residual re-source is byte-equal). Record in the PR description (per `memory/feedback_post_pr_verification`).
**Step 4:** `make pre-deploy` → green.
**Step 5:** Open PR 5a. **Reviewers: architect + data-architect** (writer/reader-shape change). Do NOT merge until both sign off.

---

# PR 5b — Subtractive cutover + global gate flip + cleanup migration

**Branch:** `feat/slice-5b-no-disk-cutover` (cut from merged 5a).
**Code-first, then migration** (4a/4b shape). Every removal below is safe *because* 5a proved the DB-native path is byte-equal.

### Task 5b.1: Retire `projectVocab` staging path
**Files:** `runner.ts` (steps 3, 9), delete `projectors/vocab.ts`'s `projectVocab` (keep `projectItemsFromTypedRows`).
- Remove the step-9 `for (const plan of vocab.perItemPlans)` loop (`runner.ts:967–987`) — word/phrase items are fully written by the typed path (step 5b); sentence/dialogue items are intentionally dropped.
- Remove `projectVocab` import + call + `vocab.*` references (`deferredDialogueKeys`, `contextualClozeCapabilities` — already unused).
- Remove `propagateDialogueTranslationsToLearningItems`. **Before removing, grep-prove no surviving consumer depends on it having run** (data-arch S5): the dialogue-cloze path reads `l.translation_nl` directly from `loadDialogueFromDb` (`runner.ts:471`), NOT from the propagated `dialogue_chunk` items — so it's independent. Record the grep in the PR. (It fed only the deferred-dialogue gate in the now-gone `projectVocab`.)
**Test:** `runner.itemCutover.test.ts` updated — no staged item writes; `bun run test -- runner` PASS.
**Commit:** `refactor(capability): retire projectVocab staging path (#147 5b)`.

### Task 5b.2: Retire `projectGrammar` staging path + step-10 `exercise_variants` writer
**Files:** `runner.ts` (steps 3, 8, 10), `projectors/grammar.ts` (`projectGrammar` deleted; keep `projectPatternsFromCategories`).
- Delete step 10 entirely (`runner.ts:989–1055`) — both the grammar branch (`insertExerciseVariantGrammar` + the PR-4 dual-write typed-row block) and the vocab branch (`insertExerciseVariantVocab`). The typed grammar rows are written by the pattern path (step 5d); 0 lessons use the legacy branch (all `usePatternPath`).
- Remove the now-dead `legacyVariantsLanded`/`legacyVariantCount`/`markCandidatesPublished` staging write-back #1 (`runner.ts:1057–1071`).
- `grammarPatternUpsert` (step 8): when `usePatternPath` it already uses `patternResult`; the `!usePatternPath` else-branch (`upsertGrammarPatterns(grammar.grammarPatterns)`) is dead → remove `grammar.grammarPatterns` path.
- Remove the adapter exports that lose all callers: `insertExerciseVariantGrammar`, `insertExerciseVariantVocab`, `findContextIdBySourceText`, `fetchGrammarPatternIdsBySlug` (verify no other caller first), `buildGrammarExerciseRow` if unused.
**Test:** `runner.patternCutover.test.ts` still green; add an assertion that no code path calls an `exercise_variants` insert (the `noExerciseVariantsReader.test.ts` sibling already guards reads — add a writer guard or extend it).
**Commit:** `refactor(capability): retire legacy exercise_variants writer (step 10) (#147 5b)`.

### Task 5b.3: Retire `projectCloze` + step 11 + the `cloze-contexts.ts` read
**Files:** `runner.ts` (steps 3, 11), delete `projectors/cloze.ts`, `validators`/adapters tied to it.
- Remove `projectCloze` + the step-11 `for (const plan of cloze.plans)` loop (`runner.ts:1073–1088`) and `upsertClozeContext` (the cloze `item_contexts` writer). **The existing 1167 cloze `item_contexts` rows are LEFT IN THE DB** (ADR 0011 seed-once; #148's substrate) — this only stops *re-seeding*.
- Remove the `upsertClozeContext` adapter export (no remaining caller).
**Test:** runner suite green; add a **grep-guard test** `__tests__/enforcement/noClozeWriter.test.ts` (data-arch N3) that fails if any `capability-stage/` source imports or calls `upsertClozeContext` — mirrors the `noDiskReads` pattern; guards #148's substrate against accidental re-seed. (A passive note-test is too weak.)
**Commit:** `refactor(capability): retire projectCloze + cloze-contexts re-seed (#147 5b)`.

### Task 5b.4: Kill the staging regeneration
**Files:** `runner.ts:286–342`
- Delete the `buildContentUnitsFromStaging` / `buildCapabilityStagingFromContent` calls, the `staging.contentUnits/capabilities/exerciseAssets` reassignments, and the **3 `writeFileSync` snapshots** (content-units.ts / capabilities.ts / exercise-assets.ts).
- Remove the imports from `content-pipeline-output` (the functions stay in that file for podcast/`materialize-capabilities` callers — verify via `grep -rn buildCapabilityStagingFromContent scripts/`).
- The legacy `stagedCapabilities` bundle (`runner.ts:516–561`) collapses: with no staging regeneration, `staging.capabilities` is empty. Re-derive `allCapabilities` purely from the typed emitters (item base + audio + affixed + pattern + dialogue cloze). **Enumerate each filter/validator that operated on the staging bundle and state where it goes** (arch #4 — this is the riskiest removal):
  - `isOverHarvestedItemCap` filter (`runner.ts:542`) — **DELETE**: it dropped sentence/dialogue item caps from the staging bundle; the typed path never emits them, so the filter has no input.
  - `newPathEmittedKeys` exclusion (`:535`) + `usePatternPath` pattern exclusion (`:536`) — **DELETE**: they prevented double-writes from the staging bundle, which no longer exists.
  - `validateLessonIdPresence(allCapabilities)` (`:585`) — **KEEP**, re-pointed at the typed-emitter `allCapabilities` (still the right invariant).
  - `validateItemSourceRefResolvability(allCapabilities, staging.learningItems)` (`:590`) — **KEEP but REPOINT** its second arg from `staging.learningItems` (gone in 5b.6) to the typed `itemDbResult.items` (map to `{ base_text }`). Without this repoint it references a deleted symbol.
- **Wire the pre-write gate's `learningItems` input from the typed path** (data-arch N1): the `runCapabilityGatePreWrite` call site (`runner.ts:350–353`) currently passes `staging.learningItems`; after 5b.6 that's empty and CS4/CS4b/CS19/CS20/CS5 pass *vacuously*. Repoint the input to `itemProjection.perItemPlans` (mapped to the validator's shape; adjust the `gate.ts` param type if it narrows) so the checks keep real coverage.
- Confirm `retireOrphanedCapabilities`'s `emittedKeys` now covers 100% of live caps (the parity probe from 5a.7 is the proof).
**Test:** runner suite green; the no-disk markers in `runner.ts` drop (no more `writeFileSync`); a test asserting the pre-write validators receive a non-empty item set.
**Commit:** `refactor(capability): remove staging-derived regeneration, repoint validators to typed path (#147 5b)`.

### Task 5b.5: Delete `stagingWriteback.ts`
**Files:** delete `scripts/lib/pipeline/capability-stage/stagingWriteback.ts` + its tests; remove all imports (`markCandidatesPublished`, `markLearningItemsPublishedOrDeferred`, `markLearningItemsDeferralsOnly`, `writeLearningItemsWithEnrichedPos` — staging write-back #2 at `runner.ts:1210–1233`).
> **B2 LOCK:** do NOT remove `writeLearningItemsWithEnrichedPos` until Task 5a.4's DB-native `updateLearningItemPos` is wired in the runner AND 5a.7 confirmed new items land non-null pos. See Task 5a.4's handoff note.
**Commit:** `refactor(capability): delete stagingWriteback (#147 5b)`.

### Task 5b.6: Remove ALL loader staging reads + rework dry-run to DB-only
**Files:** `loader.ts`
- Delete `loadStagingFiles`, `readStagingFile`, `loadLessonForDryRun`, and the `staging` field from `LoadedLesson`. `loadLesson` returns Stage-A-from-DB only.
- **Dry-run rework:** `runCapabilityStage` dry-run now REQUIRES a real `lessonId` + Supabase client (Stage A must have run). Remove the `input.dryRun ? null : createClient()` fallback that allowed staging-only dry-run (`runner.ts:212`). Dry-run = "load from DB, run pre-write validators, short-circuit before writes." Update the `--dry-run` CLI shim contract + `docs/process/content-pipeline.md`.
- Every downstream consumer of `staging.*` must already be gone (Tasks 5b.1–5b.5) — `tsc` is the proof; fix any stragglers.
**Test:** `loadFromDb.test.ts` + a new `loader` test asserting no `fs` import remains; runner dry-run test reworked to inject `loadFromDb`.
**Commit:** `refactor(capability): DB-only loader + dry-run, remove staging reads (#147 5b)`.

### Task 5b.6b: Retire the `lint-staging.ts` capability pre-flight (BLOCKER — staging-snapshot + `validateExerciseAssets` consumer)
**Files:** `scripts/lint-staging.ts:654–671`, `scripts/publish-approved-content.ts:63–73`, `runner.ts` (`buildLintStagingCommand`)

`publish-approved-content.ts:65` runs `buildLintStagingCommand` → `scripts/lint-staging.ts` as the publish **pre-flight**, which reads `ctx.contentUnits`/`ctx.capabilities`/`ctx.exerciseAssets` (the 3 staging snapshots Task 5b.4 stops writing) and calls `validateContentUnits`/`validateCapabilityStaging`/`validateExerciseAssets` (`content-pipeline-output.ts:720` → `ARTIFACT_KINDS`). It is the **only** non-test runtime caller of `validateExerciseAssets`/`ARTIFACT_KINDS-const`, so Task 5b.7's deletion *requires* this first, and 5b.4 leaves lint reading empty/stale snapshots. This is the known `lint-staging` decomposition gap (`memory/project_lint_staging_stage_specific_gates`, noted on #98/#109).
- Remove the `validateContentUnits`/`validateCapabilityStaging`/`validateExerciseAssets` calls (`lint-staging.ts:657–670`) and the staging-snapshot reads that feed them. These capability-side checks are already relocated to the Capability Gate (CS14–CS22, `gate.ts`/`model.ts`).
- State explicitly what remains of the pre-flight after the snapshots stop being written. **Decision: the capability-side pre-flight is fully subsumed by the Capability Gate (runner pre-write + post-write), so the capability portion of `lint-staging` + `buildLintStagingCommand`'s call from `publish-approved-content.ts` is removed.** Keep any *lesson-stage* checks `lint-staging` still owns, if any (grep — most moved to the Lesson Gate per ADR 0013); if none remain, remove the pre-flight call entirely and note the Capability Gate is now the sole gate.
- Update `docs/process/content-pipeline.md` (the pre-flight is gone).
**Test:** `bun run test` green; a publish dry-run no longer invokes `lint-staging`.
**Commit:** `refactor(pipeline): retire lint-staging capability pre-flight, Capability Gate is sole gate (#147 5b)`.

### Task 5b.7: Retire `artifactRegistry.ts` `ARTIFACT_KINDS` + the 4b Option-A leftovers
**Files:** `src/lib/capabilities/artifactRegistry.ts`, `content-pipeline-output.ts` (`buildArtifactsForCapability`, `ArtifactKind`, `hasConcreteArtifactPayload`, `validateExerciseAssets`, `StagingExerciseAsset`)
- The module spec flags `ARTIFACT_KINDS` as retained ONLY for this regeneration. With the regeneration gone (5b.4), delete `artifactRegistry.ts` + `buildArtifactsForCapability` + the exercise-asset builders/validators if no caller remains (`grep` to confirm — podcast staging may still reference; if so, scope the removal to the lesson path).
- Update `docs/current-system/modules/capabilities.md` §`artifactRegistry.ts` / `ARTIFACT_KINDS` rows in the SAME commit (spec drift = code regression).
**Test:** `bun run test` + `bun run build` green.
**Commit:** `refactor(capability): retire ARTIFACT_KINDS + exercise-asset builders (#147 5b)`.

### Task 5b.8: (reserved) — confirm `content_units` junction + counts
Re-run the 5a.7 probe after 5b.1–5b.7 to confirm caps/content_units counts unchanged (minus the to-be-deleted sentence/dialogue units, still present until 5b.10). No code; a checkpoint.

### Task 5b.9: Flip the global no-disk gate
**Files:** `scripts/lib/pipeline/capability-stage/__tests__/enforcement/noDiskReads.test.ts`
- Empty `DISK_IO_ALLOWLIST` (remove `loader.ts`, `stagingWriteback.ts`, `runner.ts`).
- Flip `it.skip('globalNoFileIO: …')` → `it(…)` (`:247`).
**Step 1:** Run `bun run test -- noDiskReads` → **PASS** (this is the slice's headline gate — every capability-stage file is now disk-free).
**Step 2:** If any file still trips a marker, that's a real residual staging read — fix it, don't re-allowlist.
**Commit:** `test(capability): flip the global no-file-I/O gate ON (#147, epic #98 US10)`.

### Task 5b.10: One-shot cleanup migration (sentence/dialogue items + orphan content_units)
**Files:** `scripts/migration.sql` (teardown section, near the existing drops ~line 1905); a one-off archive script.

**Step 0 — MANDATORY pre-flight archive (the cascade destroys legacy learner state + review history).** Before authoring the DELETE, dump the rows that will cascade away via a SQL `COPY ... TO` (or `pg_dump --table`) to a timestamped file *outside* `docs/` (e.g. a `.sql`/`.csv` next to the migration paper trail): the 37 `learner_item_state` + 37 `learner_skill_state` + 113 `review_events` + 7 `content_flags` rows whose `learning_item_id` is one of the 157 targets. These are legacy SM-2 scheduler rows (#150's target, not read by the capability runtime), but `review_events` is nominally immutable — archive satisfies that. Extend the Rollback note to reference the archive.

**Step 1 — author the cleanup SQL** (idempotent — re-running is a no-op once rows are gone). Use an **orphan-existence sweep** for `content_units`, NOT a `normalized_text` predicate (the live probe found that predicate misses 2 of 72 orphans — punctuated bases where `normalized_text` ≠ `itemSlug(base_text)`):
  ```sql
  -- Slice 5 (#147): de-harvested sentence/dialogue learning_items are cap-less
  -- (ADR 0014). DELETE them — cascades item_contexts/item_answer_variants/
  -- item_meanings + the legacy SM-2 scheduler rows (learner_item_state ×37,
  -- learner_skill_state ×37, review_events ×113, content_flags ×7), all
  -- ON DELETE CASCADE (migration.sql:139–215/726). ARCHIVE those first (Step 0).
  delete from indonesian.learning_items
   where source_type = 'lesson' and item_type in ('sentence','dialogue_chunk');

  -- content_units has NO FK to learning_items (string source_ref). Sweep every
  -- learning_item unit whose source_ref no longer resolves to a live item — this
  -- is form-agnostic (catches both 'learning_items/'||normalized_text and
  -- ||itemSlug(base_text)) and idempotent. Removes the 72 orphans + any pre-existing.
  delete from indonesian.content_units cu
   where cu.unit_kind = 'learning_item'
     and not exists (
       select 1 from indonesian.learning_items li
        where 'learning_items/' || li.normalized_text = cu.source_ref
           or 'learning_items/' || lower(btrim(li.base_text)) = cu.source_ref
     );

  -- Grammar re-key sweep (Decision E amendment; data-architect M1 fix). The
  -- re-publish emitted NEW grammar units keyed 'lesson-{N}/pattern-l{N}-…'
  -- (== capability.source_ref). Sweep ONLY the OLD curated-slug units BY FORM,
  -- independent of capability state — sequence-safe (cannot over-delete the new
  -- units regardless of publish ordering) and idempotent. The pattern-path form
  -- always has 'pattern-l<digit>' (l + lesson number); curated slugs never do.
  -- (Rejected the `not exists (… cap …)` join form: it over-deletes if run before
  -- the 5a.7/5b.13 re-publish completes — data-architect M1.)
  delete from indonesian.content_units cu
   where cu.unit_kind = 'grammar_pattern'
     and cu.source_ref !~ '/pattern-l[0-9]';
  ```
  > The second clause's `lower(btrim(base_text))` mirrors `itemSlug` (`src/lib/capabilities/itemSlug.ts` = `toLowerCase().trim()`). Both forms are covered so no orphan is stranded regardless of which key `content_units.source_ref` used. Verify on the live DB after apply: zero `content_units` with `unit_kind='learning_item'` and no backing item.
**Step 2:** `make migrate-idempotent-check` → green (applies twice, second run is a no-op).
**Step 3:** Operator runs `make migrate` from the **main checkout** (worktrees lack `.env.local` — `project_capability_stage_program_status` 4b gotcha). The Step-0 archive must already exist.
**Commit:** `feat(migration): Slice 5 cleanup — drop cap-less sentence/dialogue items + orphan content_units (#147 5b)`.

### Task 5b.11: Retire the dead `exercise_variants` health check
**Files:** `scripts/check-supabase-deep.ts:179–200`
- Remove the "0 exercise_variants for <lesson>" check (the writer is gone; the table is #102/4c's to drop). Leave the `exercise_review_comments` orphan check (`:1167+`) — it still resolves legacy bridged comments until 4c.
**Commit:** `chore(checks): retire dead exercise_variants existence check (#147 5b)`.

### Task 5b.12: ADR 0012 amendment + module-spec sync
**Files:** `docs/adr/0012-stage-responsibilities-and-the-no-disk-capability-stage.md`, `docs/current-system/modules/capabilities.md`
- One-line amendment to ADR 0012: POS enrichment remains in the capability stage (DB-native) as tracked debt; relocation to the Lesson Stage is a follow-up.
- Sync `capabilities.md` (status, `last_verified_against_code`, the retired `artifactRegistry`/staging seams).
**Commit:** `docs: ADR 0012 POS exception + capabilities spec sync (#147 5b)`.

### Task 5b.13: Live verification + finish
**Step 1:** Re-publish all 10 lessons (per-lesson loop). Confirm zero disk reads at runtime (the gate test is the static proof; spot-check the publish logs show no staging-file access).
**Step 2:** Probe: caps by source_kind/type identical to 5a.7 minus the deleted sentence/dialogue items; `content_units` down by 70; `learning_items` down by 157; `exercise_variants` writer produced 0 new rows.
**Step 3:** Verify a live capability still renders via `capability_review_events` for a re-published lesson (per `memory/feedback_answer_log_check` — data existence ≠ feature works).
**Step 4:** `make pre-deploy` → green. Open PR 5b. **Reviewers: architect + data-architect** (delete migration + writer/reader-shape). Add the `Dev-Workflow-DB-Verified:` trailer only AFTER the live apply + probe.

---

## Acceptance criteria (issue #147)

- [ ] The Capability Stage performs **zero** staging-file reads; `noDiskReads.test.ts` `globalNoFileIO` is `it` and green (5b.9).
- [ ] All residual cap kinds (audio, affixed) emitted from typed DB tables (5a.1/5a.2).
- [ ] `content-units.ts` / `capabilities.ts` / `exercise-assets.ts` derivation + `stagingWriteback` removed (5b.4/5b.5).
- [ ] The legacy `exercise_variants` writer (step 10) is gone — no source kind writes `exercise_variants` (5b.2); unblocks #102's 4c (#153) drop.
- [ ] A live re-publish of every lesson produces identical caps/exercises with no disk read (5a.7 parity + 5b.13).
- [ ] `make pre-deploy` green (both PRs).

## Deploy ordering (PR 5b — per-spec, arch #6)

PR 5b is **code-first, then migration** (4a/4b shape). The read-shape deduction: the removed `exercise_variants` writer produces app-unread rows (`coverageService.ts:69`), and the one-shot DELETE removes cap-less, pool-excluded items — so the **writer/staging removal is a compatible-shape change** (deploy the code in either order vs the app). The **DELETE (5b.10) MUST run AFTER** the new code is deployed and AFTER the final per-lesson re-publish (5b.13): a re-publish between deploy and `make migrate` would otherwise re-emit nothing (the items are no longer projected) — but running the DELETE *before* the last re-publish risks a race only if the old code is still live. **Operator order: (1) merge + deploy 5b code → (2) re-publish all 10 lessons (5b.13) → (3) archive cascade rows (5b.10 Step 0) → (4) `make migrate` (the DELETE).** The global no-disk gate is a *build-time* test (no deploy coupling).

## Rollback

- **PR 5a** is additive + key-set-excluded — revert is a clean `git revert` (no schema change).
- **PR 5b** code-first: revert the code commits restores the staging path (the staging files still exist in the repo). The one-shot DELETE (5b.10) is **not reversible** from the migration — archive the 157 rows before applying (Task 5b.10 Step 2). If the delete must be undone, re-publish regenerates word/phrase items but NOT the de-harvested sentence/dialogue items (they're no longer emitted) — restore from the archive.

## Coordination

- **#102 / 4c (#153):** Slice 5b retires the last `exercise_variants` writer → 4c may then drop the table. Sequence 5b before 4c.
- **#148 (item-cloze):** Slice 5 removes the `cloze-contexts.ts` read but **preserves** the 1167 cloze `item_contexts`. #148 emits item-cloze caps DB-natively over those rows. No file is double-removed.
- **#150 (legacy SM-2 retirement):** the 157-item DELETE (5b.10) cascades 37 `learner_item_state` + 37 `learner_skill_state` + 113 `review_events` + 7 `content_flags` — all legacy-scheduler rows #150 retires wholesale. Slice 5 archives them; if #150 ships first, these counts shrink. Not read by the capability runtime either way.

## Non-goals / scope notes

- **"DB-only" = the publish runtime.** The standalone `check-capability-health.ts --staging` diagnostic mode legitimately reads staging fixtures and is OUT of scope — it is not the capability-stage runner and is not covered by the (directory-scoped) global no-disk gate (arch #9 / data N).
- **`check-capability-release-readiness.ts` grammar `source_ref` mismatch is PRE-EXISTING** (`:53`/`:130` — the gate passes a lesson `sourceRef` that already doesn't match the re-slugged grammar caps). The grammar re-key does NOT worsen it (data-architect consult, INFO); a separate cleanup can align the gate later. Out of Slice-5 scope.
- **Dry-run loses its no-service-key offline mode** (`loadLessonForDryRun` deleted, 5b.6). Post-redesign, dry-run-against-DB is the only meaningful mode (DB-authoritative). The CLI shim's own no-service-key branch (`publish-approved-content.ts:63–78`) is updated in 5b.6.
