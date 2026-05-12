# Capability-stage module spec — Phase 2 of the pipeline rewrite

Status: DRAFT v5.2 (2026-05-10, applies user-direction patch — restate stage boundary unambiguously, retract muddled "known gap" framings, fix §4.1 vocab projector contradiction with §14)
Companion: `docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md` (lesson-stage / Phase 1 — depends on this completing first)
Architect-review-loop:
- Round 1 (v1) — NEEDS_REVISION (5 critical + 8 warning + 4 nit)
- Round 2 (v2) — NEEDS_REVISION (3 NEW critical, 7 warning, 4 nit; v2's "v1-premise-wrong" finding for C2 was itself wrong due to a silent grep failure on file with NEL line terminators)
- Round 3 (v3) — NEEDS_REVISION (1 NEW critical of same class as round-2 C3, 6 warning, 4 nit; architect explicitly approved all 3 round-2 critical fixes)
- Round 4 (v4) — NEEDS_REVISION (2 NEW critical [adapter surface gap, lessonId attachment unspecified in code samples] + 5 warning + 3 nit; round-3 C1 fix and W1-W6 fixes verified)
- Round 5 (v5) — APPROVE_WITH_NITS (architect: "ship it; further rounds would be polishing N-tier issues"); v5.1 patches W1+W2 doc-consistency fixes
- v5.2 — user-direction patch (no architect round): restates stage boundary as the §1 architectural rule, removes "known gap" / "ambiguity" framings that softened the rule across 5 rounds, fixes §4.1 vocab projector's stale "morphological variants" line that contradicts §14

## Revision log

### v4 → v5 (round 4 architect review fixes)

Round 4 architect verified all round-3 fixes successful. 2 NEW critical (same class as recurring "spec references undeclared symbols" issue) + 5 warnings + 3 nits — all addressed in v5:

- **Round-4 C1 — `adapter.findItemsWithClozeArtifact` + `adapter.recordWarning` not in §7.1 adapter surface.** v4 §4.4.2 used these methods but didn't declare them. v5: added both to §7.1.
- **Round-4 C2 — `lessonId` attachment unspecified in emission code.** §4.4.2's `createCapability(...)` returns `ProjectedCapability` without lessonId (factory only spreads `CapabilityDraft` which has no lessonId field). The §1.5.A.1 W6 adapter assertion would throw on every emit. **Architectural decision pinned in v5:** `projectCapabilities` stays unchanged (no widening of `CapabilityDraft`); each projector resolves `lessonId` once at the top of its run from its own DB context (already loaded), then attaches via `.map(cap => ({ ...cap, lessonId: resolvedLessonId }))` before passing to adapter. Updated §4.1, §4.2, §4.3, §4.4.1, §4.4.2 to show explicit attachment in code/step lists.
- **Round-4 W1 — stale "PR 7" / "post-PR-6" references.** Spec restructured to 6 PRs in v3 but kept some "PR 7" references. v5: replaced everywhere with "PR 6".
- **Round-4 W2 — G2 gate references PR 5 vs PR 6 inconsistency.** v5: G2 consistently references "PR 5 merges" (the morphology projector PR that consumes pos artifacts).
- **Round-4 W3 — publish-grammar-candidates.ts disposition undetermined.** v5 pins it: `item_context_grammar_patterns` rows are consumed at runtime by `src/services/learningItemService.ts:97-128` and `src/pages/ExerciseCoverage.tsx:47` (verified by `rg`). PR 2 thins publish-grammar-candidates.ts to retire ONLY the exercise_variants insert (lines 264-280, 326-339); the non-variant writes (sentence-level learning_items + item_contexts + item_context_grammar_patterns) stay until Phase 3 retires the per-item tables.
- **Round-4 W4 — PR 2 review checklist.** v5 §13 PR 2 adds a "Review checklist" subsection enumerating verification steps.
- **Round-4 W5 — `createCapability` import path.** v5 §4.4.2 states `import { createCapability } from '@/lib/capabilities/capabilityCatalog'`.
- **Round-4 N1, N2, N3** — cosmetic fixes applied.

### v3 → v4 (round 3 architect review fixes)

Round 3 architect approved the round-2 critical fixes (C1/C2 PR sequencing, C3 contextual_cloze rerouting). 1 new critical + 6 warnings + 4 nits — all addressed in v4:

- **Round-3 C1 — `createCapability` not exported.** §4.4.2's vocab projector code references `createCapability` and `CapabilityDraft` which are module-private in `capabilityCatalog.ts` (line 16, 34 — no `export` keyword). Same class of regression as round-2 C3. v4 fix: §13 PR 2's `capabilityCatalog.ts` modifications list explicitly adds `export` to both symbols. Verified by reading `src/lib/capabilities/capabilityCatalog.ts:16,34`.
- **Round-3 W1 — §4.1 still cites dead `item_contexts.source_lesson_id` path.** Round-2 W2 fix dropped it from §1.5.A.1 but missed §4.1 prose. v4 fix: §4.1 line corrected to flat-map invariance language.
- **Round-3 W2 — wrong line refs for migration backfill.** Cited `:1626-1654` but file is 116 lines; backfill is at `:86-99`. v4 fix: line refs corrected.
- **Round-3 W3 — §11.3 #2 conflates reads with writes.** Listed all 6 line refs (693, 734, 754, 757, 762, 951) as writes; only 693 + 734 are writes. v4 fix: §11.3 #2 disambiguated.
- **Round-3 W4 — §4.4.2 silently swallows missing text_recognition.** Code path `if (!textRecognitionKey) continue` should emit a WARNING for the data-integrity bug class. v4 fix: warning push added.
- **Round-3 W5 — PR 2 contextual_cloze emission picks up legacy seeded artifacts.** Benign but should be documented. v4 fix: §13 PR 2 coverage acknowledges this.
- **Round-3 W6 — `lessonId` field semantics ambiguous.** `ProjectedCapability.lessonId?: string | null` (camelCase, optional) vs §1.5.A.1's "explicitly written" rule. v4 fix: §1.5.A.1 documents adapter's camelCase→snake_case mapping + per-source-kind nullability.
- **Round-3 N1, N3, N4** — cosmetic fixes applied.
- **Round-3 N2** — minor inaccuracy noted as cosmetic; not changed.

### v2 → v3 (round 2 architect review fixes)

Round 2 architect review surfaced **3 NEW critical issues** that v2 introduced or failed to fix:

- **v2 C1 / round-2 C1+C2 (PR 2 sequencing built on wrong premise)**: v2 claimed `publish-approved-content.ts` does not write `exercise_variants` based on a `grep -c` that returned 0. Round-2 architect verified at lines 693, 734, 754, 757, 762, 951 — both `publish-approved-content.ts` AND `publish-grammar-candidates.ts` write `exercise_variants`. v2's grep failed silently due to the file's `NEL line terminator` encoding (`file` reports "Non-ISO extended-ASCII text"), which makes default grep treat the file as binary and emit no matches without erroring. `grep -a` and `rg` correctly find the matches.
   - **v3 fix**: PR sequencing restructured to 6 PRs. PR 2 now absorbs vocab + grammar projectors together so item + pattern capabilities migrate atomically when `publishCapabilityPipelineOutput` retires. §1.5.D, §11.3 #2, §13 PR 2, and the revision log are corrected.
   - **Verification methodology lesson**: spec author commits to using `grep -a` or `rg` for all future code grep verifications. Default grep is unsafe on this codebase's mixed-encoding files.

- **Round-2 C3 (`contextual_cloze` rerouting code doesn't compile)**: v2 §4.4.2 proposed adding `itemHasArtifact(item.id, 'cloze_context')` inside `projectCapabilities`, but that function is undefined and `CurrentLearningItem` has no artifact-existence flag. `projectCapabilities` is pure over `CurrentContentSnapshot`; introducing artifact lookups inside it breaks purity.
   - **v3 fix**: `contextual_cloze` rule MOVES OUT of `projectCapabilities`. Stays as projector-layer emission inside the vocab projector (which has DB access via the adapter). `capabilityCatalog.ts` only emits the 4-or-6 base item capabilities + 1 pattern_recognition + 1 pattern_contrast + morphology pairs. `contextual_cloze` is added by `vocab.ts:emitContextualClozeForItemsWithArtifacts` after the pure projection completes. §4.4.2 rewritten.

- **Round-2 W1-W7 + N1-N4**: all addressed inline.

### v1 → v2 (round 1 architect review fixes — superseded by round 2; kept for history)

v1 round-1 architect review surfaced 14 findings; v2 attempted fixes but introduced regressions on C2 + new gaps on C3:

- **v1 C1 (pos artifact kind)**: ✅ resolved via Option D — POS lives on `learning_items.pos` column. (No change in v3.)
- **v1 C2 (PR 1 sequencing)**: v2's "premise wrong" finding was itself wrong — see v3 fix above.
- **v1 C3 (splitAcceptedL1 example)**: ✅ corrected.
- **v1 C4 (content_units seam)**: ✅ documented as known gap with G5 pre-merge gate.
- **v1 C5 (lesson_id explicit writes)**: ✅ §1.5.A.1 added.
- **v1 W1-W8 + N1-N4**: all addressed in v2.

(Round-2 review found additional issues with v2's content_units handling, lesson_id rule edge cases, agent input-source consistency, and PR-2 mid-paragraph self-correction style — all carried forward into v3 fix list.)

---

## 1. Goal + scope

The lesson-stage spec (Phase 1) writes lesson reading content to DB deterministically. Stage B turns those DB rows into **learning capabilities** — schedulable units the runtime drills via FSRS. Today, capability creation is split across 7 scripts (`materialize-capabilities.ts`, `approve-staged-capability-artifacts.ts`, `promote-capabilities.ts`, `check-capability-health.ts`, `check-capability-release-readiness.ts`, `run-capability-release-gate.ts`, `auto-fill-capability-artifacts-from-legacy.ts`) plus a commingled write block at `publish-approved-content.ts:240-310`.

**This spec folds those into a single deep module at `scripts/lib/pipeline/capability-stage/`.** The module is DB-first (reads Stage A's published rows; never re-reads staging files), parallel by source kind, and the only home for capability-stage agent orchestration.

### The architectural rule (the stage boundary, plainly stated)

> **Lesson stage produces ALL lesson content** — anything the lesson reader needs to render. Mostly deterministic: one OCR-verifier agent + parser code; no other LLMs. Output: lessons, lesson_sections (with embedded items), lesson_page_blocks, audio_clips, content_units, grammar_patterns.
>
> **Capability stage produces ALL capability content** — anything FSRS scheduling + runtime exercise rendering needs. Heavy lifting: 6 agents + 3 deterministic projectors + 3 validators. Output: learning_capabilities, capability_content_units, capability_artifacts, exercise_variants, plus the `lesson_page_blocks.capability_key_refs[]` back-fill.
>
> **The DB is the seam.** Capability stage reads from DB only — never from staging files. Lesson stage's outputs are the canonical source of truth for everything Capability stage projects from.

This rule is the contract. Every §1.5 listing, every §4.x projector, every §5.x agent must conform. Where the lesson-stage spec's §1.5 list is incomplete (currently missing `content_units` and `grammar_patterns`), the gap is in lesson-stage spec's documentation, not in this architecture. Both belong in lesson-stage spec §1.5; lesson-stage spec amendment lands as a coordinated companion to this spec.

### 1.1 What this spec covers

A single deep module at `scripts/lib/pipeline/capability-stage/`, with:

1. **A typed public surface** — one entry function `runCapabilityStage(input): Promise<CapabilityStageReport>` plus 12 per-component entry points (3 projectors + 6 authoring agents + 3 validators).
2. **Three deterministic projectors** (vocab, grammar, morphology) — fan-out, write-disjoint, parallel-safe. Pure projection logic from `src/lib/capabilities/capabilityCatalog.ts` is reused.
3. **Six authoring-agent integrations** for capability-specific content authoring:
   - `vocab-exercise-creator` (existing — migrated)
   - `grammar-exercise-creator` (existing — migrated)
   - `cloze-creator` (existing — migrated)
   - `pos-tagger` (NEW agent definition)
   - `en-translator` (NEW agent definition)
   - `morphology-pair-generator` (NEW agent definition)
4. **Three validators** — health (DB validator), release-readiness (counts/blockers), promotion (ready/published flip).
5. **One adapter** — single Supabase I/O seam for the module.
6. **One runner** — orchestrator: fan-out projectors → fan-out authoring agents → backfill page-block FK → validators sequentially.
7. **Two new pure projection rules** in `src/lib/capabilities/capabilityCatalog.ts`:
   - `pattern_contrast` per pattern (currently missing — gap #10)
   - `contextual_cloze` rerouted from `dialogue_line` to item-source (currently dead — gap #5)
8. **Three new agent definitions** in `.claude/agents/`:
   - `pos-tagger.md`
   - `en-translator.md`
   - `morphology-pair-generator.md`

### 1.2 What this spec does NOT cover

| Item | Why deferred |
|---|---|
| Lesson-stage spec amendments (retire `catalog-lesson-sections.ts`, add deterministic `parser.ts`, replace LLM cataloguing with regex) | Companion amendment to lesson-stage spec; ships separately |
| Podcast pipeline | Separate `scripts/lib/pipeline/podcast-stage/` placeholder + future spec |
| Phase 3 legacy retirement (drop `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`; retire `seed-learning-items.ts`, `seed-cloze-contexts.ts`, `repair-item-meanings.ts`, `scripts/data/vocabulary.ts`) | Phase 3 spec; runtime readers must migrate first |
| Runtime modules' migration to read embedded items vs. `learning_items` | Phase 3 concern |
| Backfilling capability rows for already-published lessons under the new module | Phase 1 rollout step (re-publish all 9 lessons under `runLessonStage`, then run `runCapabilityStage` against each) |
| New `affixed_form_pairs` DB table | Decided in §1.6 — no new table; morphology pairs live as `capability_artifacts` rows |

### 1.3 Prerequisites

A two-step prerequisite chain must complete before this spec ships:

1. **Lesson-stage spec (Phase 1) lands.** `runLessonStage` exists; `lesson_sections.content` carries embedded items per GT5 + GT6.
2. **Phase 1 rollout completes for all 9 lessons.** `bun runLessonStage --lesson N --apply` runs once per lesson (1–9). After this step, every lesson's DB rows are on the canonical embedded-items shape; the `learning_items` + child tables are no longer being newly written for re-publishes.

Without step 2, the vocab projector reads from `lesson_sections.content` but finds no embedded items for lessons that haven't re-published, producing zero capabilities for them. The capability-stage spec is **strict to the canonical shape** — no transition reader, no fallback to `learning_items`. Forcing the rollout step is the single-source-of-truth gate.

The lesson-stage spec was just merged on this branch. Phase 1 rollout instructions land in lesson-stage's deployment runbook.

### 1.4 Pipeline structure

```
LESSON PIPELINE                              PODCAST PIPELINE
═══════════════                              ════════════════
photos → OCR → catalog → linguist agents     NotebookLM audio + transcript
   │                                            │
   ▼                                            ▼
Stage A (Phase 1): runLessonStage            Stage A (FUTURE): podcast-stage
   ↓ writes:                                    ↓ writes:
     lessons                                    podcasts (already exists)
     lesson_sections (embedded items)           podcast_segments (NEW table)
     lesson_page_blocks                          podcast_phrases (NEW table)
     audio_clips                                 audio_clips
     grammar_patterns                            ↓
   ↓                                          Stage B (FUTURE): podcast-capability-stage
   │  
   ▼
Stage B (THIS SPEC): runCapabilityStage
   reads DB lesson rows
   ↓
   ┌─ FAN-OUT 1 — projectors (deterministic, parallel, write-disjoint):
   │    ├── vocab projector       → 4 base capabilities/item + 2 audio if hasAudio
   │    ├── grammar projector     → 1 pattern_recognition + 1 pattern_contrast/pattern (gated)
   │    └── morphology projector  → 0 unless lesson introduces morphology rule;
   │                                 then N capabilities owned by this lesson, 
   │                                 spanning vocab from earlier lessons
   │
   ├─ FAN-OUT 2 — authoring agents (LLM-driven, parallel, capability-specific):
   │    ├── vocab-exercise-creator       → exercise_variants (curated distractors)
   │    ├── grammar-exercise-creator     → exercise_variants (contrast_pair etc.)
   │    ├── cloze-creator                → capability_artifacts (cloze_context)
   │    ├── morphology-pair-generator    → capability_artifacts (root_derived_pair) — only when invoked
   │    ├── pos-tagger                   → capability_artifacts (pos enrichment, cross-cutting)
   │    └── en-translator                → capability_artifacts (meaning:en, cross-cutting)
   │
   ├─ JOIN: backfill lesson_page_blocks.capability_key_refs[]
   │
   └─ SEQUENTIAL: health → promotion → release-readiness → DONE
```

Both fan-outs run write-disjoint by canonical-key prefix or artifact-kind, so the agent integrations and projectors don't conflict on the same DB rows.

### 1.5 Pipeline output per lesson — the canonical DB contract

For every lesson published by Stage A, the capability-stage module produces:

#### A. Capability rows (`learning_capabilities`)

- One row per `(source_kind, source_ref, capability_type, direction, modality, learner_language)` tuple, keyed by canonical_key (see `src/lib/capabilities/canonicalKey.ts`).
- `readiness_status` from `validateCapability` (one of `ready`, `blocked`, `unknown`, `deprecated`); `publication_status='draft'` until promotion.
- `metadata_json` carries `skillType`, `requiredArtifacts`, `prerequisiteKeys`, `difficultyLevel`, `goalTags`.

##### A.1 `lesson_id` write semantics — the pedagogical-prerequisite-driven rule (CRITICAL)

`learning_capabilities.lesson_id` is **explicitly written by every projector at upsert time** under v2. v1 implicitly relied on the legacy SQL backfill at `scripts/migrations/2026-05-07-retire-source-progress.forward.sql:86-99`, which derives lesson_id from page-block adjacency — that rule would assign `lesson-1.id` to a `beli→membeli` capability because `beli` is referenced from lesson 1's page blocks. That breaks the pedagogical-prerequisite-driven ownership rule (§14).

The projectors override the legacy backfill by writing `lesson_id` directly. The migration backfill stays in place for capability rows written before this spec lands; new writes always set lesson_id explicitly.

Per source kind:

| source_kind | lesson_id rule | Written by |
|---|---|---|
| `item` | The lesson whose `lesson_sections` row contains the embedded vocabulary item (`section.lesson_id` from `lesson_sections` JOIN). Since the vocab projector's input scope is `sourceRef = 'lesson-${n}'` and all sections in scope share the same parent lesson_id, every flat-mapped item inherits the same lesson_id — no per-item resolution needed. | vocab projector (§4.1) |
| `pattern` | The lesson that introduces the grammar pattern (`grammar_patterns.introduced_by_lesson_id` column — verified to exist in `migration.sql`) | grammar projector (§4.2) |
| `affixed_form_pair` | **The lesson that introduces the morphology rule** (the rule-introducing lesson — NOT the lesson where the underlying root vocabulary first appeared) | morphology projector (§4.3) |
| `dialogue_line` | Retires under §4.4.2 (rerouted to `item`-source via vocab projector's post-projection emission). G1 pre-merge gate verifies zero `dialogue_line` capability rows in production. | N/A |
| `podcast_segment`, `podcast_phrase` | Out of scope (podcast-stage spec) | N/A |

The morphology rule is the architectural keystone: a learner who hasn't activated the rule-introducing lesson never sees morphology capabilities, even when their vocabulary list contains the root word.

**Round-2 W4 defensive note:** the legacy migration backfill at `scripts/migrations/2026-05-07-retire-source-progress.forward.sql:86-99` derives lesson_id from page-block adjacency for capability rows where `lesson_id IS NULL`. With the projectors now writing lesson_id explicitly, the backfill is a no-op for new rows. **However**, if a future code path inserts a capability row without lesson_id (e.g., bug, partial PR), the next `make migrate` would silently mis-assign `lesson-1.id` to morphology capabilities (because their root vocab is referenced from lesson 1's page blocks). Mitigation in PR 6 cleanup: either (a) retire the migration backfill entirely once all capabilities have explicit lesson_id, OR (b) add defensive `AND source_kind != 'affixed_form_pair'` clause to the backfill.

**Round-3 W6 — `lessonId` field semantics:** `ProjectedCapability.lessonId?: string | null` (defined at `capabilityTypes.ts:164`) is currently camelCase + optional. Two adapter-layer rules close the type-vs-DB gap:

1. **Per source kind, the projector MUST set `lessonId` to a non-null string before calling `applyXxxPlan`.** The adapter asserts `lessonId !== null && lessonId !== undefined` for source kinds `item`, `pattern`, `affixed_form_pair`. Throws `lesson_id_missing_for_capability(canonicalKey)` on violation. Defence-in-depth: catches projector bugs at the adapter boundary rather than landing NULL DB rows.
2. **Field-name mapping:** the adapter's `applyXxxPlan` writers do `{ lesson_id: capability.lessonId }` in the upsert payload — single mapping site, snake_case in SQL, camelCase in TS. Documented in adapter.ts header comment.

A future spec can tighten `ProjectedCapability` to require `lessonId: string` (non-null) for the source kinds where this spec mandates it; deferred so the type stays compatible with the existing backward-compat path until Phase 3.

#### B. Capability artifact rows (`capability_artifacts`)

- One row per `(capability_id, artifact_kind, artifact_fingerprint)` tuple.
- `quality_status` ∈ {`draft`, `approved`, `blocked`, `deprecated`}.
- `artifact_json` payload conforms to per-kind contract (verified by `hasConcreteArtifactPayload` in `scripts/lib/content-pipeline-output.ts:55-99`).
- Artifact kinds populated:
  - **Auto-derivable** (deterministic): `base_text`, `meaning:l1`, `meaning:nl`, `accepted_answers:id`, `accepted_answers:l1`, `audio_clip` (pointer), `pattern_explanation:l1` (verbatim from grammar_patterns row), `pattern_example` (verbatim from grammar_patterns row).
  - **Agent-authored as `capability_artifacts` rows**: `cloze_context` + `cloze_answer` (cloze-creator), `exercise_variant` (pointer to exercise_variants row written by vocab/grammar agents), `root_derived_pair` + `allomorph_rule` (morphology-pair-generator), `meaning:en` (en-translator).
  - **Agent-authored to a NON-artifact location** (the C1 resolution): `pos` is written by pos-tagger to `learning_items.pos` (existing column at `migration.sql:1010` with CHECK constraint to the 12-value taxonomy at `:1016`). NOT a `capability_artifacts` row. Per-item, not per-capability — avoids redundant storage. In Phase 3 (when `learning_items` retires), pos migrates to `lesson_sections.content.items[i].pos` along with the rest of the table's contents (per lesson-stage spec §4 GT6 warning tier).

#### C. Capability ↔ content unit relationships (`capability_content_units`)

- One row per `(capability_id, content_unit_id, relationship_kind)` tuple.
- `relationship_kind` defaults to `referenced_by`.
- Derived from `capability.contentUnitSlugs` + DB lookup of content_unit ids by slug.

#### D. Exercise variant rows (`exercise_variants`)

- Authored by `vocab-exercise-creator` (curated distractors for `recognition_mcq`, `cued_recall`, vocab `cloze_mcq`) and `grammar-exercise-creator` (full exercise content for `contrast_pair`, `sentence_transformation`, `constrained_translation`, grammar `cloze_mcq`).
- Linked to `learning_items` (vocab) or `grammar_patterns` (grammar) via FK.
- `payload_json` contains the per-variant content; `is_active=true` for shipped variants.
- **Today the writers are `publish-approved-content.ts:693, 734` AND `publish-grammar-candidates.ts:264, 279, 328`.** Both scripts read `candidates.ts` staging file and write `exercise_variants` rows. publish-approved-content.ts handles both grammar variants (line 693, routed via `grammar_pattern_id`) and vocabulary variants (line 734, routed via `context_id`). publish-grammar-candidates.ts also creates sentence-level `learning_items`, `item_contexts`, and `item_context_grammar_patterns` links in addition to `exercise_variants`.
- **Migration:** both writers retire in PR 2 along with the migration of grammar-exercise-creator + vocab-exercise-creator into capability stage. The new module's adapter writes `exercise_variants` directly from agent JSON output — no intermediate `candidates.ts` staging file. Sentence-level item creation logic from `publish-grammar-candidates.ts` either retires (if those rows are no longer needed) or moves into capability-stage's grammar projector adapter step.
- **Stage A does NOT write to this table after PR 2 lands.**

#### E. Page-block FK back-fill (`lesson_page_blocks.capability_key_refs[]`)

- After all projectors complete, `runner.ts` issues a deterministic UPDATE per page-block row, populating `capability_key_refs[]` from the now-existing capability canonical keys whose `source_ref` matches the page-block's referenced content units.
- This is the JOIN step in fan-out architecture: depends on every projector having written its rows first.

#### F. Lifecycle transitions

- After projection + authoring + back-fill: capabilities exist as `readiness=??, publication=draft`.
- `health` validator runs `validateCapability` per row; sets readiness.
- `promotion` validator flips `readiness=ready, publication=published` for capabilities whose validators pass.
- `release-readiness` validator emits blockers/warnings; CLI exits non-zero on any blocker.

#### G. NOT produced by Stage B (Stage A's responsibility per the §1 architectural rule)

Lesson stage owns every table that holds reader-visible content:

- `lessons`, `lesson_sections` (with embedded items per §1 rule), `lesson_page_blocks` (other than `capability_key_refs[]` backfill), `audio_clips`, `content_units`, `grammar_patterns` — all Stage A.
- `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants` — legacy parallel infrastructure, retiring in Phase 3. Stage B writes to `learning_items.pos` only (the pos-tagger column update, transitional Phase 2 only); other columns are Stage A's transitional responsibility until Phase 3.
- `learner_capability_state`, `capability_review_events`, `learner_lesson_activation` — runtime / user-written.
- `podcasts`, `podcast_segments`, `podcast_phrases` — separate podcast pipeline.

##### G.1 Lesson-stage spec §1.5 amendment dependency

The lesson-stage spec's §1.5 currently lists 5 Stage A outputs (lessons, lesson_sections, lesson_page_blocks, audio_clips, long-form audio). Per the architectural rule in §1, the actual Stage A output set is 7: those 5 plus `content_units` and `grammar_patterns`. Both are reader-visible content the lesson reader uses (content_units feed `lesson_page_blocks.content_unit_slugs[]`; grammar_patterns hold pattern_explanation + examples that grammar sections render).

Verified at `publish-approved-content.ts:197-218` (content_units writes, inside `publishCapabilityPipelineOutput`) and `:449` (grammar_patterns writes, inside `publishContent`).

**Coordinated companion change:** lesson-stage spec amendment to add `content_units` and `grammar_patterns` as explicit §1.5 outputs. This is a documentation fix, not an architectural one — both tables are already Stage A's responsibility in code; the spec just hasn't enumerated them. Lands as G5 pre-merge gate before this spec's PR 1 opens.

##### G.2 `publishCapabilityPipelineOutput` is misnamed and gets split in PR 2

The current `publishCapabilityPipelineOutput` function at `publish-approved-content.ts:158-321` is a misnomer — it commingles Stage A writes (content_units at lines 197-218; lesson_page_blocks updates at 220-238) with Stage B writes (learning_capabilities + relationships + artifacts at 240-310). PR 2 splits the function:

- **Stage A writes (content_units + lesson_page_blocks without capability_key_refs[])** stay in lesson stage. They move to lesson-stage's adapter (where they belong per §1) and the function name retires. The PR 2 commit either renames or inlines them into `publishContent`.
- **Stage B writes (capabilities + relationships + artifacts)** move to capability-stage's adapter.
- The `capability_key_refs[]` back-fill on lesson_page_blocks moves to capability-stage (post-projection JOIN step, §7.2.1).

After PR 2, no function in `publish-approved-content.ts` writes anything Stage B should own; no function in capability-stage writes anything Stage A should own. The boundary is clean.

### 1.6 Supabase Requirements

#### Schema changes (land in `scripts/migration.sql`)

- **Decision: no new tables, no new columns, no new CHECK constraints.**
- Morphology pairs live as `capability_artifacts` rows with `artifact_kind='root_derived_pair'`. Verified against `src/lib/capabilities/capabilityTypes.ts:72`: `root_derived_pair` is in the `ArtifactKind` union; same for `allomorph_rule` (line 73) and `meaning:en` (line 61). Capability_artifacts is the right scope: morphology pairs only feed root_derived capability projection; they have no reader-display surface or other consumer.
- POS does NOT live as a `capability_artifacts` row (architect C1 fix). It writes to `learning_items.pos` (existing column at `migration.sql:1010` with CHECK constraint at `:1016`). No `'pos'` artifact kind needed; the existing `ArtifactKind` union does not include it and shouldn't be extended.
- `capability_artifacts.artifact_kind` has no CHECK constraint at the DB level today (verified at `scripts/migrations/2026-04-25-capability-core.sql:46` where the column is plain `text not null`). The TypeScript union at `capabilityTypes.ts:58-80` is the only authoritative enumeration. This is acceptable per the architect's note that the same precedent exists for `review_events.exercise_type`.

#### Backfills

- One-shot UPDATE: for capabilities already in DB (from previous publish-approved-content.ts runs), set `publication_status='draft'` if currently `'published'` (re-promotion under the new contract). Idempotent — `WHERE publication_status='published' AND lesson_id IN (subset)`. Optional; only needed if the new module's projection differs from the legacy projection's output. Verify before applying.

#### homelab-configs changes

- [x] N/A — PostgREST: `indonesian` schema already exposed.
- [x] N/A — Kong: no new origins or CORS headers.
- [x] N/A — GoTrue: no auth config changes.
- [x] N/A — Storage: no new buckets.

#### RLS preservation

No RLS changes. The four capability-related tables (`learning_capabilities`, `capability_content_units`, `capability_artifacts`, `exercise_variants`) keep their existing policies. Verify via `make check-supabase-deep` post-merge.

#### Health check additions (in `scripts/check-supabase-deep.ts`)

1. **HCC1** — Zero `learning_capabilities` rows with `readiness_status='ready'` AND any required artifact kind missing from `capability_artifacts`.
2. **HCC2** — Zero `lesson_page_blocks` rows with `capability_key_refs` referencing a canonical_key that doesn't exist in `learning_capabilities`.
3. **HCC3** — Zero `capability_content_units` rows referencing a non-existent `capability_id` or `content_unit_id` (FK integrity).
4. **HCC4** — For every published lesson, `learning_capabilities` count > 0 AND at least one `affixed_form_pair`-source capability if the lesson has a morphology rule pattern (otherwise N/A).

---

## 2. Module shape — `scripts/lib/pipeline/capability-stage/`

### Folder layout

```
scripts/
  run-capability-stage.ts                  # NEW thin entry — calls runCapabilityStage from the module
                                             retires run-capability-release-gate.ts (replaced by --gate flag)
  materialize-capabilities.ts              # KEPT as thin wrapper for backward compat → calls runVocabProjection
                                             (retires fully in a later cleanup)
  promote-capabilities.ts                  # KEPT as thin wrapper → calls runPromotion
                                             (retires fully in a later cleanup)
  check-capability-health.ts               # KEPT as thin wrapper → calls runHealthCheck
                                             (retires fully in a later cleanup)
  check-capability-release-readiness.ts    # KEPT as thin wrapper → calls runReleaseReadiness
                                             (retires fully in a later cleanup)
  approve-staged-capability-artifacts.ts   # RETIRES — staging file path retires; payloads come from DB
  auto-fill-capability-artifacts-from-legacy.ts  # KEPT as-is for legacy 1-3 backfill until Phase 3
  run-capability-release-gate.ts            # RETIRES — replaced by `run-capability-stage.ts --gate`

  lib/
    pipeline/
      capability-stage/
        index.ts                            # barrel — exports runCapabilityStage + per-component entries + types
        model.ts                            # CapabilityStageInput, CapabilityStageReport, projector reports,
                                              health/promotion/readiness types (re-exports as needed)
        runner.ts                           # runCapabilityStage orchestrator (the stage gate)
        projectors/
          index.ts                          # barrel
          vocab.ts                          # runVocabProjection (FIRST PR)
          grammar.ts                        # runGrammarProjection
          morphology.ts                     # runMorphologyProjection
        authoring/
          index.ts                          # barrel
          vocabDistractors.ts               # invokes vocab-exercise-creator agent
          grammarVariants.ts                # invokes grammar-exercise-creator agent
          clozeContexts.ts                  # invokes cloze-creator agent
          morphologyPairs.ts                # invokes morphology-pair-generator agent (NEW)
          posTagger.ts                      # invokes pos-tagger agent (NEW)
          enTranslator.ts                   # invokes en-translator agent (NEW)
        validators/
          index.ts                          # barrel
          health.ts                         # runHealthCheck (folds check-capability-health.ts core)
          readiness.ts                      # runReleaseReadiness (folds check-capability-release-readiness.ts core)
          promotion.ts                      # runPromotion (folds promote-capabilities.ts core)
        adapter.ts                          # the one Supabase write surface
        agentClient.ts                      # shared Anthropic SDK wrapper for agent invocations
        __tests__/
          runner.test.ts
          adapter.test.ts
          agentClient.test.ts
          projectors/
            vocab.test.ts
            grammar.test.ts
            morphology.test.ts
          authoring/
            vocabDistractors.test.ts
            grammarVariants.test.ts
            clozeContexts.test.ts
            morphologyPairs.test.ts
            posTagger.test.ts
            enTranslator.test.ts
          validators/
            health.test.ts
            readiness.test.ts
            promotion.test.ts
```

### Compliance with deep-module rules (target arch §1, §2, §Module conventions)

| Rule | Status |
|---|---|
| Narrow public API via `index.ts` | ⚠ — exports `runCapabilityStage` + 12 named per-component entries + 13 types (~26 symbols, above the 10-symbol soft cap). Each per-component entry is needed for backward-compat with thin CLI wrappers during incremental migration. **Commitment:** post-PR-6, surface narrows to `runCapabilityStage` + 2 types (3 symbols, well within cap). See §3.3 W2 commitment. |
| Hides significant logic | ✅ — 3 projectors + 6 authoring agents + 3 validators + adapter + agentClient + runner = 15 internal logic files. |
| `model.ts` for domain types | ✅ |
| `adapter.ts` is the I/O seam | ✅ — one file owns all Supabase reads/writes. |
| One job per module | ✅ — module's job: turn Stage A's DB rows into capability rows + artifacts + variants. |
| No back-edges | ✅ — module imports from `src/lib/capabilities/` (shared), `scripts/lib/content-pipeline-output.ts` (shared); does NOT import from `src/lib/session-builder/` etc. |
| Read and write are separate concerns | ✅ — projectors are read-then-pure-then-write; adapter is the only write site. |
| Sub-folders justified at ≥6 logic files OR distinct sub-aspects (target-arch line 112) | ✅ — module has 15 logic files total (well over the 6-file threshold for the module overall). Sub-folders `projectors/` (3), `authoring/` (6), `validators/` (3) represent **distinct sub-aspects** of the module's job (deterministic projection vs. agent-driven authoring vs. read-only validation), satisfying the rule's "or" clause. v1 architect's W3 reading was per-subfolder strict; the rule's actual test is module-level + distinct-aspects. |

### Folder naming

`capability-stage` mirrors `lesson-stage`. Internal subfolders use `projectors/`, `authoring/`, `validators/` as plural nouns (each contains a small set of related modules).

---

## 3. Public API — `runCapabilityStage`

### 3.1 Inputs

```ts
export interface CapabilityStageInput {
  lessonNumber: number          // resolves sourceRef = `lesson-${n}`
  dryRun: boolean               // dry-run mode: no DB writes, no agent invocations
  gate?: boolean                // gate mode: run validators only, exit 1 on blockers
  skipAuthoring?: {             // skip-individual-agent flags for incremental rollout
    vocabDistractors?: boolean
    grammarVariants?: boolean
    clozeContexts?: boolean
    morphologyPairs?: boolean
    posTagger?: boolean
    enTranslator?: boolean
  }
  skipProjectors?: {            // skip-individual-projector flags
    vocab?: boolean
    grammar?: boolean
    morphology?: boolean
  }
}
```

### 3.2 Outputs

```ts
export interface CapabilityStageReport {
  lessonNumber: number
  sourceRef: string
  projectors: ProjectorReport[]
  authoring: AuthoringReport[]
  pageBlockBackfill: { rowsUpdated: number; durationMs: number }
  health: CapabilityRuntimeHealthReport
  promotion: CapabilityPromotionPlan
  readiness: CapabilityReleaseReadinessReport
  passed: boolean
  totalDurationMs: number
}

export interface ProjectorReport {
  projector: 'vocab' | 'grammar' | 'morphology'
  invoked: boolean              // false if skipped by skipProjectors flag
                                  OR by morphology's automatic gate (no morphology rule in lesson)
  capabilitiesUpserted: number
  artifactsUpserted: number
  relationshipsUpserted: number
  warnings: string[]
  durationMs: number
}

export interface AuthoringReport {
  agent: 'vocab-exercise-creator'
       | 'grammar-exercise-creator'
       | 'cloze-creator'
       | 'morphology-pair-generator'
       | 'pos-tagger'
       | 'en-translator'
  invoked: boolean
  itemsProcessed: number
  itemsSkipped: number          // e.g. items already enriched
  artifactsWritten: number
  variantsWritten: number       // exercise_variants rows
  warnings: string[]
  durationMs: number
}
```

### 3.3 Public surface

```ts
// src/lib/pipeline/capability-stage/index.ts

// Umbrella entry — runs everything for a lesson
export function runCapabilityStage(input: CapabilityStageInput): Promise<CapabilityStageReport>

// Per-projector entries (incremental rollout, also called by thin CLI wrappers)
export function runVocabProjection(input: ProjectorInput): Promise<ProjectorReport>
export function runGrammarProjection(input: ProjectorInput): Promise<ProjectorReport>
export function runMorphologyProjection(input: ProjectorInput): Promise<ProjectorReport>

// Per-authoring-agent entries
export function runVocabDistractors(input: AuthoringInput): Promise<AuthoringReport>
export function runGrammarVariants(input: AuthoringInput): Promise<AuthoringReport>
export function runClozeContexts(input: AuthoringInput): Promise<AuthoringReport>
export function runMorphologyPairs(input: AuthoringInput): Promise<AuthoringReport>
export function runPosTagger(input: AuthoringInput): Promise<AuthoringReport>
export function runEnTranslator(input: AuthoringInput): Promise<AuthoringReport>

// Validators (kept callable individually for thin wrappers + the --gate flag chain)
export function runHealthCheck(input: HealthInput): Promise<CapabilityRuntimeHealthReport>
export function runReleaseReadiness(input: ReadinessInput): Promise<CapabilityReleaseReadinessReport>
export function runPromotion(input: PromotionInput): Promise<CapabilityPromotionPlan>

// Types (re-exports + new types from model.ts)
export type {
  CapabilityStageInput, CapabilityStageReport,
  ProjectorInput, ProjectorReport,
  AuthoringInput, AuthoringReport,
  HealthInput, ReadinessInput, PromotionInput,
  CapabilityRuntimeHealthReport, CapabilityPromotionPlan, CapabilityReleaseReadinessReport,
}
```

13 functions + 13 types. Above the soft cap of ~10 (target-arch §Public-API width, line 136), but the per-component entry points are required so the legacy thin CLI wrappers can keep their existing argv contracts intact during the incremental migration.

**W2 commitment (post-Phase-3 narrowing):** after PR 6 (CLI cleanup), the public surface narrows to:
```ts
export function runCapabilityStage(input): Promise<CapabilityStageReport>
export type { CapabilityStageInput, CapabilityStageReport }
```
3 symbols total — well within the soft cap. The per-component entries (12 functions) move to internal-only at that point; tests reach in via internal paths.

PR 7's net deletion includes the per-component re-exports from `index.ts` plus the thin wrapper CLIs that called them. Verification: `bun run test --run` clean after the narrowing; no caller outside the module imports a per-component entry post-PR-6.

---

## 4. Projectors (deterministic)

### 4.1 `projectors/vocab.ts` — `runVocabProjection`

#### Contract

**Input:**

```ts
ProjectorInput {
  lessonNumber: number
  sourceRef: string         // 'lesson-${n}'
  dryRun: boolean
}
```

**Logic:**

1. **(Round-4 C2)** `adapter.resolveLessonId(sourceRef)` — single DB query mapping `lesson-${n}` to `lessons.id`. The result is invariant for the projector's scope (one lesson per call); cached locally and attached to every emitted capability via `.map` post-projection.
2. `adapter.loadVocabRows(sourceRef)`:
   - `lesson_sections` rows for the lesson where `content->>'type' IN ('vocabulary','expressions','numbers','dialogue')`
   - Flat-maps `content.items[]` from each section into a single list
   - For each item: includes id (composed of slug from `indonesian` field), `base_text` (Indonesian), `meanings` (Dutch + optional English), `pos` if enriched, and audio_clip availability via `audio_clips` table lookup
3. Map rows → `CurrentLearningItem[]`:
   - `baseText` ← `indonesian`
   - `meanings[lang='nl'].text` ← `dutch`
   - `meanings[lang='en'].text` ← `english` (if present)
   - `acceptedAnswers.id` ← `[indonesian]` (canonical form only; **NO morphological variants** — per §14 pedagogical-prerequisite-driven ownership, lesson 1's form_recall for `beli` accepts `beli` only, not `membeli`/`dibeli`. Morphology testing happens via lesson-9-owned `root_derived_recall` capabilities, never by enriching earlier-lesson form_recall accepted_answers.)
   - `acceptedAnswers.l1` ← `splitAcceptedL1(dutch)` (deterministic slash/semicolon split; from `auto-fill-…ts:102-118`)
   - `hasAudio` ← `audio_clips` row exists for `(normalized_text, primary_voice)`
4. Build `CurrentContentSnapshot` with only `learningItems` populated; other arrays empty
5. Call `projectCapabilities(snapshot)` from `src/lib/capabilities/capabilityCatalog.ts:46`
6. Filter result to `sourceKind === 'item'` (defensive)
7. **(Round-4 C2)** Attach `lessonId` to every base capability: `baseCapabilities = baseCapabilities.map(c => ({ ...c, lessonId: resolvedLessonId }))`. This satisfies §1.5.A.1's W6 invariant before adapter writes.
8. **(Round-4 C2)** Run `emitContextualClozeForItemsWithArtifacts(items, baseCapabilities, resolvedLessonId, adapter)` per §4.4.2; concat results onto the capability list (each contextual_cloze cap is emitted with lessonId already attached).
9. For each projected capability, build draft artifacts:
   - `base_text` ← item.baseText
   - `meaning:l1` ← item.meanings[lang='nl'].text
   - `meaning:nl` ← item.meanings[lang='nl'].text
   - `meaning:en` ← item.meanings[lang='en'].text (if present; otherwise empty, en-translator fills later)
   - `accepted_answers:id` ← item.acceptedAnswers.id
   - `accepted_answers:l1` ← item.acceptedAnswers.l1
   - `audio_clip` (only for capabilities requiring it: audio_recognition, dictation) ← pointer to `audio_clips` row

**Output (via `adapter.applyVocabPlan`):**

- Idempotent upserts to `learning_capabilities` (sourceKind='item'), `capability_content_units`, `capability_artifacts`
- Each `learning_capabilities` row written with `lesson_id` set explicitly (§1.5.A.1) — the lesson whose `lesson_sections` row contains the embedded vocabulary item, resolved via `JOIN lesson_sections ON lesson_sections.id = section_id`. Per the flat-map invariance described in §1.5.A.1, all items in the projector's input scope share the same `lesson_id` (the one matching `sourceRef = 'lesson-${n}'`); no per-item resolution needed.
- `readiness_status` from `validateCapabilities(projection, artifactIndex)`, `publication_status='draft'`

**Invariants:**

- Capability count per item: 4 (text_recognition + meaning_recall + l1_to_id_choice + form_recall) + 2 if hasAudio (audio_recognition + dictation) = 4 or 6 depending on audio
- All capabilities have `lesson_id = <current lesson's id>` (from `lessons.id WHERE order_index = lessonNumber`)
- Idempotent: re-running with no source changes produces zero deltas

**Test acceptance criteria:**

- Returns 4 base capabilities per item (text_recognition, meaning_recall, l1_to_id_choice, form_recall) for items without audio
- Returns 6 capabilities per item (4 base + audio_recognition + dictation) for items with audio
- All capabilities have `lesson_id` set to the current lesson's UUID
- `accepted_answers:l1` correctly splits "kopen / aanschaffen / verkrijgen" into `["kopen", "aanschaffen", "verkrijgen"]` via `splitAcceptedL1`'s slash-and-whitespace separator (verified at `auto-fill-…ts:106` regex `/\s+\/\s+|\s*;\s*/`); a comma-separated input like "meneer, vader, u" returns the single-element array `["meneer, vader, u"]` because commas are not separators
- `audio_clip` artifact is a pointer payload (storagePath or url), not the audio bytes
- Re-running on same data is a no-op (idempotency)
- Throws on malformed `lesson_sections.content` (missing `indonesian` or `dutch`/`english` field per GT6 error tier)

**Folds from existing code:**

- Replaces the item branch of `loadStagedContentSnapshot` (`check-capability-health.ts:326-341`)
- Replaces the item portion of `publishCapabilityPipelineOutput` (`publish-approved-content.ts:240-310`, lines that handle `sourceKind='item'`)
- Reuses `projectCapabilities`, `validateCapabilities`, `splitAcceptedL1` (existing pure logic)

### 4.2 `projectors/grammar.ts` — `runGrammarProjection`

#### Contract

**Input:** same shape as 4.1.

**Logic:**

1. `adapter.loadGrammarRows(sourceRef)`:
   - `grammar_patterns` rows for the lesson
   - Linked `exercise_variants` rows (where the agent-authored grammar exercises live, written by `runGrammarVariants` in the authoring layer or pre-existing)
2. Build `CurrentGrammarPattern[]` with id, sourceRef, name, examples
3. Build `CurrentContentSnapshot` with only `grammarPatterns` populated
4. Call `projectCapabilities(snapshot)`. **Includes the new `pattern_contrast` projection rule** (see §4.5)
5. Filter to `sourceKind === 'pattern'` (defensive)
6. For each capability, build artifacts:
   - `pattern_explanation:l1` ← captured from `grammar_patterns.short_explanation` (verbatim from coursebook)
   - `pattern_example` ← captured from `grammar_patterns.examples[]`
   - `exercise_variant` ← pointer to existing `exercise_variants` row (if any). Required for `pattern_contrast`; optional for `pattern_recognition` (capability is `ready` even without a variant).

**Output (via `adapter.applyGrammarPlan`):**

The grammar projector mechanically follows the same lessonId-attach pattern as §4.1 (round-4 C2):

1. `resolvedLessonId = await adapter.resolveLessonId(sourceRef)` once at the top of the run.
2. After `projectCapabilities(snapshot)` returns the base pattern capabilities, attach via `.map(c => ({ ...c, lessonId: resolvedLessonId }))`.
3. Pass to `adapter.applyGrammarPlan(plan)`; the adapter's `assertLessonIdSet` defends against any forgotten attachment.

For `pattern`-source capabilities, the attached lessonId is **`grammar_patterns.introduced_by_lesson_id`** (the existing column, verified at `migration.sql`), which equals the projector's `sourceRef`-derived lesson id since the projector loads only the current lesson's grammar patterns.

- Idempotent upserts to `learning_capabilities` (sourceKind='pattern'), `capability_content_units`, `capability_artifacts`
- Capability rows + artifact rows for `pattern_recognition` and `pattern_contrast` (gated).

**Invariants:**

- Capability count per pattern: 1 (`pattern_recognition`) + 0 or 1 (`pattern_contrast`, gated on contrast_pair variant existing).
- `pattern_contrast` capability with no contrast_pair variant resolves to `readiness=blocked, missingArtifacts=['exercise_variant']`. Run `runGrammarVariants` to fix.

**Test acceptance criteria:**

- Returns 1 pattern_recognition per pattern always
- Returns 1 pattern_contrast per pattern only when a contrast_pair variant exists in `exercise_variants`
- Pattern_contrast is `readiness=ready` only if its required artifacts (incl. exercise_variant) are present
- Re-running is idempotent

**Folds from existing code:**

- Replaces the pattern branch of `loadStagedContentSnapshot:344-352`
- Adds the new `pattern_contrast` projection rule per §4.5 (a 14-LOC addition to `capabilityCatalog.ts:134-147`)

### 4.3 `projectors/morphology.ts` — `runMorphologyProjection`

#### Contract

**Input:** same shape as 4.1.

**Logic:**

1. **Pre-flight check (W4 fix)**: assert pos artifacts exist for vocab pool. The morphology projector reads `learning_items.pos` for verbs/nouns across lessons 1..N. If `pos IS NULL` for any candidate item, the projector emits a CRITICAL warning and aborts:
   ```
   morphology_projector_blocked: pos artifacts missing for items in lessons 1..N-1.
   Run `runPosTagger` for those lessons first.
   ```
   This prevents silent under-generation (lessons with un-tagged vocabulary would produce fewer pairs than the rule warrants).
2. **Gate detection:** Check whether the lesson introduces morphology rules:
   - `adapter.detectMorphologyRule(lessonNumber)`: queries `grammar_patterns` for the lesson; matches names against morphology-rule keywords (`meN-`, `di-`, `ber-`, `peN-`, `-an`, `-i`, `voorvoegsel`, `achtervoegsel`, `morfologie`)
   - Returns `null` if no morphology rule found → projector reports `invoked=false, capabilitiesUpserted=0` and exits (no error; expected for lessons 1-8 of the current 9-lesson set)
3. If a morphology rule is present:
   - `adapter.loadVocabPoolForMorphology(lessonNumber, posFilter)`:
     - All vocabulary items from lessons 1..lessonNumber (inclusive) where `learning_items.pos IN ('verb', 'noun')` (joins on the existing pos column, NOT on capability_artifacts)
   - `adapter.loadMorphologyPairs(sourceRef)`:
     - Existing `capability_artifacts` rows with `artifact_kind='root_derived_pair'` for the lesson (carry-forward from previous runs OR coursebook-explicit pairs captured by lesson stage's grammar parser)
4. Build `CurrentAffixedFormPair[]` from the carry-forward + agent-generated pairs (see §5.4)
5. Call `projectCapabilities(snapshot)` with affixedFormPairs populated
6. Filter to `sourceKind === 'affixed_form_pair'`
7. **Capability `lesson_id` is the rule-introducing lesson's id** (this lesson's id, NOT the lesson where the underlying root vocabulary first appeared). Implements the pedagogical-prerequisite-driven ownership rule (§1.5.A.1).

**Output (via `adapter.applyMorphologyPlan`):**

The morphology projector follows the same lessonId-attach pattern as §4.1 + §4.2 (round-4 C2), with one twist: the resolved lessonId for morphology capabilities is **the rule-introducing lesson's id** (the projector's input scope), NOT the lesson where the underlying root vocabulary first appeared.

1. `resolvedLessonId = await adapter.resolveLessonId(sourceRef)` resolves the rule-introducing lesson's id (e.g., lesson 9 for meN-).
2. After `projectCapabilities(snapshot)` emits the affixed-form-pair capabilities, attach `lessonId: resolvedLessonId` via `.map`.
3. Adapter `assertLessonIdSet` defends.

This is the architectural keystone of §1.5.A.1 + §14: morphology capabilities are owned by the rule-introducing lesson, not by the lesson where their root vocab lives. The runtime activation gate then handles the rest — a learner who hasn't activated lesson 9 sees no morphology capabilities, even when they've activated lesson 1 (where `beli` was first taught).

- Idempotent upserts to `learning_capabilities` (sourceKind='affixed_form_pair'), `capability_content_units`, `capability_artifacts`
- Every row written with `lesson_id = <rule-introducing lesson's id>` (verified explicitly per row before upsert via `assertLessonIdSet`).

**Output:** capability rows for `root_derived_recognition` + `root_derived_recall` per pair, owned by the rule-introducing lesson.

**Invariants:**

- For lessons without a morphology rule pattern: zero capabilities written (projector is a no-op).
- For lessons with a morphology rule: 2 capabilities per pair (root_derived_recognition + root_derived_recall).
- `lesson_id` for all morphology capabilities = rule-introducing lesson's id, NOT the lesson where the root was first introduced.

**Test acceptance criteria:**

- For lesson 1 (no morphology rule): returns `invoked=false, capabilitiesUpserted=0`
- For lesson 9 (introduces meN-): returns N capability pairs, each with `lesson_id = lesson-9.id`
- A pair `beli → membeli` (where beli is from lesson 1) has `lesson_id = lesson-9.id`, not lesson-1's id
- Re-running is idempotent

**Folds from existing code:**

- Replaces the affixed-form-pair branch of `loadStagedContentSnapshot:373-384`
- Replaces affix-related plan functions in `auto-fill-capability-artifacts-from-legacy.ts:351-371`
- Removes the `morphology-patterns.ts` staging file dependency (capability_artifacts is now the source of truth)

### 4.4 Two new pure projection rules in `src/lib/capabilities/capabilityCatalog.ts`

#### 4.4.1 Add `pattern_contrast` projection rule

**Current code at `capabilityCatalog.ts:134-147`:** emits only `pattern_recognition` per grammar pattern. Replace with:

```ts
for (const pattern of input.grammarPatterns) {
  const sourceRef = normalizeLessonSourceRef(pattern.sourceRef)
  const patternRecognitionCapability = createCapability({
    sourceKind: 'pattern',
    sourceRef,
    capabilityType: 'pattern_recognition',
    skillType: 'recognition',
    direction: 'none',
    modality: 'text',
    learnerLanguage: 'none',
    requiredArtifacts: ['pattern_explanation:l1', 'pattern_example'],
    difficultyLevel: 4,
  })
  capabilities.push(patternRecognitionCapability)
  capabilities.push(createCapability({
    sourceKind: 'pattern',
    sourceRef,
    capabilityType: 'pattern_contrast',
    skillType: 'recognition',
    direction: 'none',
    modality: 'text',
    learnerLanguage: 'none',
    requiredArtifacts: ['pattern_explanation:l1', 'pattern_example', 'exercise_variant'],
    prerequisiteKeys: [patternRecognitionCapability.canonicalKey],
    difficultyLevel: 5,
  }))
}
```

(W5 fix: `prerequisiteKeys` now references the local variable explicitly, matching the pattern at `capabilityCatalog.ts:56-77` where item-source capabilities use `[textRecognitionCapability.canonicalKey]`.)

The `exercise_variant` required artifact ensures `readiness=blocked` if no contrast_pair variant exists yet (gating per pedagogical correctness).

#### 4.4.2 Reroute `contextual_cloze` from `dialogue_line` to `item` (v3 round-2 C3 fix)

**Current code at `capabilityCatalog.ts:149-162`:** projects from `input.dialogueLines`, but `dialogueLines` is never populated.

**Replacement strategy: do NOT add the rule to `projectCapabilities`.** Round-2 architect correctly observed that `projectCapabilities` is pure over `CurrentContentSnapshot`; introducing artifact-existence lookups inside it breaks purity. Instead, the rule lives in the **vocab projector** (`projectors/vocab.ts`), which has DB access via the adapter.

**Change to `capabilityCatalog.ts`:** delete lines 149-162 (the `dialogueLines` loop) entirely. `projectCapabilities` no longer emits `contextual_cloze` from any source. Pure function shape preserved.

**Addition to `projectors/vocab.ts`:**

```ts
// projectors/vocab.ts — post-projection cloze emission
import { createCapability } from '@/lib/capabilities/capabilityCatalog'  // round-4 W5: import path
import type { ProjectedCapability, CurrentLearningItem } from '@/lib/capabilities/capabilityTypes'
import type { Adapter } from '../adapter'

async function emitContextualClozeForItemsWithArtifacts(
  items: CurrentLearningItem[],
  baseCapabilities: ProjectedCapability[],
  resolvedLessonId: string,           // round-4 C2: passed in from the projector's run-context
  adapter: Adapter,
): Promise<ProjectedCapability[]> {
  // Query DB once for all items in the lesson that have a cloze_context artifact
  const itemIdsWithCloze = await adapter.findItemsWithClozeArtifact(items.map(i => i.id))
  const result: ProjectedCapability[] = []
  for (const item of items) {
    if (!itemIdsWithCloze.has(item.id)) continue
    const sourceRef = `learning_items/${item.id}`
    const textRecognitionKey = baseCapabilities
      .find(c => c.sourceRef === sourceRef && c.capabilityType === 'text_recognition')
      ?.canonicalKey
    if (!textRecognitionKey) {
      // W4 round-3 fix: data-integrity bug — cloze artifact exists but no
      // text_recognition was projected. Surface as warning rather than silently skip.
      adapter.recordWarning(`cloze_context artifact exists for item ${item.id} but no text_recognition capability was projected — skipping contextual_cloze emission`)
      continue
    }
    // Round-4 C2 fix: explicit lessonId attachment via spread.
    // createCapability returns ProjectedCapability without lessonId; we add it here.
    result.push({
      ...createCapability({
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'contextual_cloze',
        skillType: 'form_recall',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage: item.meanings[0]?.language ?? 'none',
        requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
        prerequisiteKeys: [textRecognitionKey],
        difficultyLevel: 3,
      }),
      lessonId: resolvedLessonId,
    })
  }
  return result
}
```

The `adapter.findItemsWithClozeArtifact(itemIds)` query is a single DB read returning a Set of item ids that have at least one approved `cloze_context` artifact. This adds one round trip to the vocab projector's logic, no breaking changes elsewhere.

**Effect:** A learning item with a cloze_context artifact (authored by `cloze-creator`) gets a `contextual_cloze` capability. The capability is owned by the lesson where the item was introduced (per §1.5.A.1). Activation gating is automatic via the existing `lesson_id` column.

`createCapability` and `CapabilityDraft` are currently module-private in `capabilityCatalog.ts` (verified at lines 16, 34 — no `export` keyword). **PR 2 must add `export` to both** to satisfy the C1 round-3 fix. The change is listed explicitly in §13 PR 2's `capabilityCatalog.ts` modifications. Once exported, no duplication; the projector reuses the existing factory.

#### 4.4.3 Retire `dialogue_line` source kind from active projection

After 4.4.2, the `dialogue_line` source kind is unused by active projection. The `capabilitySourceKind` type definition at `capabilityTypes.ts:5-12` and the `CAPABILITY_SOURCE_KINDS` array at `:14-30` retain `dialogue_line` for backward-compat with existing DB rows (G1 pre-merge gate verifies zero such rows exist before retiring it from the type union in a future PR).

### 4.5 Test count prediction (per OpenBrain rule)

`projectCapabilities` test count after these changes:
- Existing tests for item-source: ~12
- Existing tests for pattern-source: ~3
- New tests: `pattern_contrast` emission (~3 tests), `contextual_cloze` emission from items (~3 tests), no `contextual_cloze` from dialogue_lines (~1 test)
- Predict: pre + 7

---

## 5. Authoring agents

Each authoring layer wraps a Claude Agent SDK call (or shells out to the Anthropic API directly via `agentClient.ts`). Each is parallel-safe with respect to others (write-disjoint), invoked from `runner.ts`'s authoring fan-out.

The shared `agentClient.ts` handles: API key from env, retry on rate-limit, idempotent JSON output parsing, prompt template loading from `.claude/agents/*.md`.

### 5.1 `authoring/vocabDistractors.ts` — invokes `vocab-exercise-creator`

**Migration note (W6 + round-2 W7 fixes):** existing `vocab-exercise-creator.md:23-26` reads from staging files (`learning-items.ts`, `pattern-brief.json`, `review-report.json`). This migration switches the input contract to DB-mediated, **using the same canonical read shape as the vocab projector** (`lesson_sections.content[type='vocabulary'].items[]`, not the legacy `learning_items` table). The adapter normalizes embedded items into a `LearningItemForAgent` shape that all capability-stage agents consume. Specific prompt changes:

| What changes | From | To |
|---|---|---|
| Item input source | `scripts/data/staging/lesson-N/learning-items.ts` | DB rows from `lesson_sections.content[type='vocabulary'/'expressions'/'numbers'/'dialogue']` for the current lesson, normalized via adapter to `LearningItemForAgent[]` |
| Vocab pool | `scripts/data/staging/lesson-N/pattern-brief.json` | DB rows from `lesson_sections.content` across lessons 1..N, filtered by `learning_items.pos` (joined for items not yet migrated) |
| Idempotency check | "items already in vocab-enrichments.ts" | DB query for existing `exercise_variants` rows scoped to the current lesson |
| Output target | Write `vocab-enrichments.ts` staging file | Return JSON to `agentClient` which `adapter.applyAuthoringOutput` upserts to `exercise_variants` directly |

The agent definition update lands as part of PR 3 (vocab distractors).

**Inputs (read from DB via adapter):**
- All learning items in the current lesson (with their meanings + POS via `learning_items.pos` column)
- Vocabulary pool from earlier lessons (for distractor candidate sourcing)
- Existing `exercise_variants` rows for the items (skip items already enriched)

**Process:**
- For each item, invoke the agent with:
  - The item (Indonesian + Dutch translation)
  - The vocab pool (filtered to same POS class)
  - Instructions per `.claude/agents/vocab-exercise-creator.md`
- Agent returns three distractor arrays: `recognition_distractors_nl`, `cued_recall_distractors_id`, `cloze_distractors_id`
- Validate distractors against the agent's distractor quality rules (3 items per array, no morphological variants of correct answer, etc. — encoded in the agent prompt)

**Outputs (via adapter):**
- 3 `exercise_variants` rows per item: one for `recognition_mcq`, one for `cued_recall`, one for `cloze_mcq` (vocab variant)
- `payload_json` contains the curated distractor array + reference to the underlying item

**Idempotency:** skip items that already have all 3 variants for the current `exercise_variants.payload_json.distractor_set_version`.

**Test acceptance criteria:**
- Per-item: produces exactly 3 `exercise_variants` rows
- Each variant's payload has 3 distractors
- Idempotent re-run produces zero deltas
- Throws on agent returning malformed JSON

### 5.2 `authoring/grammarVariants.ts` — invokes `grammar-exercise-creator`

**Migration note (W6 + round-2 W7 fixes):** existing `grammar-exercise-creator.md` reads from staging files (`pattern-brief.json`, `learning-items.ts`). This migration switches to DB-mediated input + replaces the `candidates.ts` → `publish-grammar-candidates.ts` two-step write path with a direct adapter write. The vocab pool input uses the same canonical shape as vocab projector (`lesson_sections.content` items), not legacy `learning_items`.

| What changes | From | To |
|---|---|---|
| Pattern input | `scripts/data/staging/lesson-N/pattern-brief.json` | DB rows from `grammar_patterns` for the lesson |
| Vocab pool | `scripts/data/staging/lesson-N/learning-items.ts` + earlier lessons | DB rows from `lesson_sections.content` across lessons 1..N, normalized to `LearningItemForAgent[]`, filtered by `pos` |
| Output target | Write `candidates.ts`; later `publish-grammar-candidates.ts` writes to `exercise_variants` | Return JSON to `agentClient` → `adapter.applyAuthoringOutput` writes `exercise_variants` directly |
| publish-grammar-candidates.ts + publish-approved-content.ts exercise_variants writes | Existing two-step writer + commingled writes (lines 693, 734 of publish-approved-content.ts; lines 264, 279, 328 of publish-grammar-candidates.ts) | **Both retire in PR 2** — replaced by direct adapter writes |

The agent definition update + both Stage A exercise_variants writers' retirement land in PR 2 (vocab + grammar projectors atomic cutover).

**Inputs:**
- All `grammar_patterns` rows for the current lesson
- Vocabulary pool from earlier lessons + current lesson (carrier words for exercise prompts)
- Existing `exercise_variants` rows for these patterns (skip already enriched)

**Process:**
- For each pattern, invoke the agent with:
  - The pattern's name + rules + examples (verbatim from coursebook, in DB)
  - The vocab pool
  - Instructions per `.claude/agents/grammar-exercise-creator.md`
- Agent returns 1+ exercise variants per type (contrast_pair, sentence_transformation, constrained_translation, cloze_mcq)
- Validate: each variant has `payload_json` with the type-specific shape (e.g., contrast_pair has `pos` + `neg` examples)

**Outputs:**
- N `exercise_variants` rows per pattern (variable; depends on how many variants the agent generates per type)
- Each row links to the pattern via `grammar_pattern_id`

**Idempotency:** skip patterns that already have variants for each of the 4 exercise types.

### 5.3 `authoring/clozeContexts.ts` — invokes `cloze-creator`

**Migration note (W6 + round-2 W7 fixes):** existing `cloze-creator.md:18-29` reads from 5 staging files (`learning-items.ts`, `sections-catalog.json`, `pattern-brief.json`, prior-lesson `learning-items.ts` files, `review-report.json`). This migration switches to DB-mediated input using the canonical `lesson_sections.content` shape (consistent with the vocab + grammar agents above).

| What changes | From | To |
|---|---|---|
| Item input | `scripts/data/staging/lesson-N/learning-items.ts` | DB rows from `lesson_sections.content[type∈{vocabulary,expressions,numbers,dialogue}].items[]` for the lesson, normalized to `LearningItemForAgent[]`, filtered to eligible item types |
| Section context | `scripts/data/staging/lesson-N/sections-catalog.json` | DB rows from `lesson_sections.content[type='dialogue']` (for dialogue cloze speaker context) |
| Vocab pool for distractors | `scripts/data/staging/lesson-N/pattern-brief.json` | DB rows from `lesson_sections.content` items across lessons 1..N (same canonical shape) |
| Prior-lesson cross-reference | `Glob` over staging dirs + `learning-items.ts` reads | Single DB query across all lessons up to current |
| Output target | Write `cloze-contexts.ts` staging file | Return JSON to `agentClient` → `adapter.applyAuthoringOutput` writes `capability_artifacts` rows |

The agent definition update lands in PR 3 (cloze contexts).

**Inputs:**
- Eligible learning items (the agent's `cloze-creator.md` defines eligibility — typically content words: nouns, verbs, adjectives)
- Existing `capability_artifacts` of kind `cloze_context` for these items (skip already enriched)

**Process:**
- For each item, invoke the agent
- Agent returns: a carrier sentence + the answer + a Dutch translation of the sentence
- Validate: cloze sentence contains exactly one blank placeholder; answer matches the placeholder

**Outputs:**
- One `capability_artifacts` row per item with `artifact_kind='cloze_context'`, `artifact_json={sentence, answer, translation}`
- One `capability_artifacts` row per item with `artifact_kind='cloze_answer'`, `artifact_json={value: answer}`

**Idempotency:** skip items with existing cloze_context artifacts.

### 5.4 `authoring/morphologyPairs.ts` — invokes `morphology-pair-generator` (NEW agent)

**Trigger:** invoked only when the projector layer's `runMorphologyProjection` reports the lesson has a morphology rule pattern. The runner skips this authoring step otherwise.

**Inputs:**
- The morphology rule (verbatim Dutch explanation + allomorph rules, captured by lesson stage from coursebook)
- Vocabulary pool: all items from lessons 1..N where `pos ∈ {verb, noun}`
- Carry-forward: pairs already explicit in coursebook (captured by lesson stage's grammar parser)

**Process:**
- Invoke the agent with the rule + vocab pool
- Agent returns affixed pair candidates: `{root, derived, allomorphRule}` per applicable item
- Validate: derived form matches rule's morphology (e.g., for meN- with vowel: root + me- prefix; with /b/: root with mem-)

**Outputs:**
- One `capability_artifacts` row per pair with `artifact_kind='root_derived_pair'`
- One additional row per pair with `artifact_kind='allomorph_rule'` (if rule has allomorphs)
- Subsequent projector run for morphology produces capability rows from these artifacts

**Idempotency:** skip pairs already in `capability_artifacts`.

### 5.5 `authoring/posTagger.ts` — invokes `pos-tagger` (NEW agent)

**Output target (the C1 resolution):** writes to `learning_items.pos` column directly. NOT to `capability_artifacts`. POS is per-item, not per-capability — one update per item, not one row per capability per item.

**Inputs:**
- Learning items in the current lesson (Indonesian + Dutch) where `learning_items.pos IS NULL` and `item_type IN ('word', 'phrase')`
- Pull existing pos values for items already tagged (skip — idempotency)

**Process:**
- Invoke the agent with each item (Indonesian + Dutch translation pair)
- Agent returns the POS tag from the 12-value taxonomy: `verb, noun, adjective, adverb, pronoun, numeral, classifier, preposition, conjunction, particle, question_word, greeting`
- Validate: tag is in the taxonomy (matches `scripts/lib/validate-pos.ts:VALID_POS`)

**Outputs:**
- One `UPDATE indonesian.learning_items SET pos = $tag WHERE id = $itemId` per tagged item
- The CHECK constraint at `migration.sql:1016` validates the tag at the DB level (defence in depth)

**Idempotency:** skip items where `learning_items.pos IS NOT NULL`.

**Cross-cutting:** this agent's output is consumed by all MCQ-class capabilities' distractor cascade quality (`src/lib/distractors/cascade.ts:71-78`). It runs first in the authoring fan-out so other agents (vocab-exercise-creator, morphology-pair-generator) can read POS during their own runs.

**Phase 3 transition:** when `learning_items` retires in Phase 3, pos lives in `lesson_sections.content.items[i].pos` (per lesson-stage spec §4 GT6 warning tier). pos-tagger's write target moves to `lesson_sections.content` JSON updates. That's a Phase 3 concern, not Phase 2.

### 5.6 `authoring/enTranslator.ts` — invokes `en-translator` (NEW agent)

**Inputs:**
- Learning items in the current lesson with Dutch meaning but no English meaning
- Optional: dialogue lines + their Dutch translation

**Process:**
- Invoke the agent with each Dutch text
- Agent returns the English translation
- Validate: non-empty string

**Outputs:**
- One `capability_artifacts` row per item with `artifact_kind='meaning:en'`, `artifact_json={value: english}`

**Idempotency:** skip items with existing meaning:en artifacts.

**Cross-cutting:** this enriches all capabilities for English-speaking learners. Lessons published before en-translator runs are NL-only at runtime; capability stage's promotion can still pass with NL-only content.

### 5.7 New agent definitions (.claude/agents/)

Three new agent definition files, sized at parity with existing agents (existing range: vocab-exercise-creator 115 LOC, cloze-creator 172 LOC, grammar-exercise-creator 242 LOC, linguist-structurer 286 LOC, linguist-creator 431 LOC):

- `.claude/agents/pos-tagger.md` — ~80-120 LOC. Input contract, taxonomy reference (12 values), per-POS examples, edge cases (compound nouns, classifiers, particles), output JSON shape, severity table for ambiguous cases.
- `.claude/agents/en-translator.md` — ~100-140 LOC. Input contract (Dutch → English), translation guidelines (preserve register, idiomatic where natural), examples, output shape, edge cases (multi-word entries, false friends).
- `.claude/agents/morphology-pair-generator.md` — ~150-220 LOC. Most substantive new agent. Input contract (rule explanation + vocab pool), per-rule examples (meN-, di-, ber-, peN-), allomorph rules (m- before vowels, mem- before b/p/f, etc.), validation rules (derived form must match the prefix's allomorph for the root's first letter), edge cases (irregular forms, monosyllabic roots), output JSON shape.

Each agent definition includes:
- Trigger phrases
- Strict output rules (JSON shape)
- Severity table
- Hard constraints
- Example inputs/outputs (≥3 worked examples per agent)

Agent definitions land in PR alongside the corresponding `authoring/*.ts` integrations.

---

## 6. Validators

### 6.1 `validators/health.ts` — `runHealthCheck`

Folds `scripts/check-capability-health.ts:181-271` (the pure validator) and the DB-loader (lines 524-640) into the module's adapter. The staging-mode branch (lines 296-436) **retires** because input now comes from DB only.

**Output:** `CapabilityRuntimeHealthReport` with critical/warning findings.

**Strict mode:** exits 1 if any critical findings (mirrors current behavior).

### 6.2 `validators/readiness.ts` — `runReleaseReadiness`

Folds `scripts/check-capability-release-readiness.ts:67-118` (pure summarizer) and lines 120-203 (loader → adapter).

**Output:** `CapabilityReleaseReadinessReport` with blockers + warnings + counts.

**Behavior:** exits 1 on any blocker.

### 6.3 `validators/promotion.ts` — `runPromotion`

Folds `scripts/promote-capabilities.ts:93-167` (planner) + `:215-233` (artifact index builder) + `:316-330` (applier → adapter). Loader (`:235-314`) → adapter.

**Output:** `CapabilityPromotionPlan` with promotions, blocked, warnings.

**Apply mode:** writes `readiness_status='ready', publication_status='published'` to passing capabilities.

---

## 7. `adapter.ts` — the only Supabase-touching file

### 7.1 Surface

```ts
// Loaders — one per projector + per validator + helpers
loadVocabRows(sourceRef): Promise<VocabDbRows>
loadGrammarRows(sourceRef): Promise<GrammarDbRows>
loadMorphologyRows(sourceRef): Promise<MorphologyDbRows>
detectMorphologyRule(lessonNumber): Promise<MorphologyRule | null>
loadVocabPoolForMorphology(lessonNumber, pos): Promise<VocabItem[]>
loadExistingCapabilities(sourceRef): Promise<ExistingCapabilityIndex>
loadHealthSnapshot(input): Promise<CapabilityHealthSnapshot>
loadReadinessInput(input): Promise<CapabilityReleaseReadinessInput>
loadPromotionPlan(input): Promise<{ rows, artifacts }>
loadAgentInputs(agentName, lessonNumber): Promise<AgentInputs>  // shared by authoring layer
findItemsWithClozeArtifact(itemIds): Promise<Set<string>>  // round-4 C1 — used by vocab projector's contextual_cloze emission §4.4.2
resolveLessonId(sourceRef): Promise<string>  // round-4 C2 — used by every projector to resolve the lesson_id once before attaching to capabilities

// Writers
applyVocabPlan(plan): Promise<{ capabilitiesUpserted, artifactsUpserted, relationshipsUpserted }>
applyGrammarPlan(plan): Promise<...>
applyMorphologyPlan(plan): Promise<...>
applyPromotionPlan(plan): Promise<void>
backfillPageBlockCapabilityRefs(sourceRef): Promise<{ rowsUpdated: number }>
applyAuthoringOutput(agentName, output): Promise<{ artifactsWritten, variantsWritten }>
recordWarning(message: string): void  // round-4 C1 — accumulates warnings on the run report; surfaced in the projector's `warnings` field

// Adapter assertion (round-4 C2)
function assertLessonIdSet<C extends ProjectedCapability>(capability: C): asserts capability is C & { lessonId: string }
// Throws `lesson_id_missing_for_capability(canonicalKey)` if lessonId is null/undefined.
// Called by every applyXxxPlan writer for every capability before upsert.

// Shared helpers (private)
function createServiceClient(): SupabaseClient
function chunkedIn<T>(table, column, values): Promise<T[]>  // wraps chunkedQuery
```

### 7.2 Folds from existing code

- Consolidates 4 duplicated `createServiceClient()` definitions (`check-capability-release-readiness.ts:120`, `promote-capabilities.ts:169`, `check-capability-health.ts:486`, `auto-fill-…ts:?`)
- Folds I/O bodies of `loadDbCapabilityHealthSnapshot:524-640`, `loadReadinessInput:133-203`, `loadPromotionPlan:235-314`, `applyPromotionPlan:316-330`, `applyArtifactUpdatesInChunks` (auto-fill's bulk update)
- Folds capability-write code from `publishCapabilityPipelineOutput:240-310` (lines 240-272 → `applyVocabPlan` or `applyGrammarPlan` depending on source kind; 275-291 → `capability_content_units` writes inside each `apply*Plan`; 293-309 → `capability_artifacts` writes)
- Folds exercise_variants writes from `publish-grammar-candidates.ts:264-280` into `applyAuthoringOutput` for grammar-exercise-creator
- `backfillPageBlockCapabilityRefs` is **new** — replaces the inline `capability_key_refs: block.capability_key_refs ?? []` write at `publish-approved-content.ts:233`. Lesson-stage's adapter starts writing empty `capability_key_refs[]`; this back-fill populates it.

### 7.2.1 `backfillPageBlockCapabilityRefs` algorithm (W8 fix)

Given `sourceRef = 'lesson-${n}'`, the algorithm:

```
1. Read all lesson_page_blocks where source_ref = sourceRef
   → one row per block, with content_unit_slugs[] populated
2. For each block, resolve its content_unit_slugs to content_unit_ids:
   SELECT id, unit_slug FROM content_units WHERE unit_slug = ANY($1)
   → map slug → id
3. For each block, find capabilities linked to those content_units:
   SELECT capability_id, content_unit_id FROM capability_content_units
   WHERE content_unit_id = ANY($content_unit_ids_for_block)
4. Look up canonical_keys for those capabilities:
   SELECT id, canonical_key FROM learning_capabilities WHERE id = ANY($capability_ids)
5. Build the new capability_key_refs[] for each block:
   block.capability_key_refs = [...new Set(canonical_keys_from_step_4)]
6. UPDATE lesson_page_blocks SET capability_key_refs = $new_refs WHERE block_key = $key
   for each block with refs that differ from current.
```

Idempotency: step 6 only updates blocks whose new refs differ from current. Re-running on unchanged data is a no-op.

Edge cases:
- Block with no content_unit_slugs → empty capability_key_refs[]
- Block with content_unit_slugs that don't resolve (e.g., orphaned slug) → emit WARNING; skip block
- Block where its referenced capabilities have `readiness_status != 'ready'` → still include in capability_key_refs[] (the runtime activation gate handles eligibility, not this back-fill)

### 7.3 Chunking

All IN-list queries chunk at 50 (matches today's chunk sizes at `check-capability-health.ts:541, 568, 588, 601` and `check-capability-release-readiness.ts:168`).

---

## 7.5 `agentClient.ts`

Shared wrapper around the Anthropic API for capability-stage agent invocations.

**Surface:**

```ts
export interface AgentInvocation {
  agentName: string
  promptTemplate: string  // loaded from .claude/agents/<name>.md
  input: unknown          // agent-specific
  schema: JsonSchema       // expected output shape
}

export async function invokeAgent(invocation: AgentInvocation): Promise<unknown>
```

**Responsibilities:**
- Loads agent prompt template from `.claude/agents/<name>.md`
- Substitutes input into the template
- Calls Anthropic API with `claude-opus-4-7` (or per-agent model from agent definition's frontmatter)
- Validates response against schema
- Retries on rate-limit (exponential backoff, max 3 retries)
- Throws on schema violation or repeated rate-limit

**Test:** `__tests__/agentClient.test.ts` mocks the Anthropic SDK; asserts retry behavior, schema validation, error paths.

---

## 8. `runner.ts` — the orchestrator

### 8.1 Sequence

```ts
export async function runCapabilityStage(input: CapabilityStageInput): Promise<CapabilityStageReport> {
  const sourceRef = `lesson-${input.lessonNumber}`

  // Fan-out 1 — projectors
  const projectorReports = await Promise.all([
    !input.skipProjectors?.vocab      ? runVocabProjection({ ... }) : skipReport('vocab'),
    !input.skipProjectors?.grammar    ? runGrammarProjection({ ... }) : skipReport('grammar'),
    !input.skipProjectors?.morphology ? runMorphologyProjection({ ... }) : skipReport('morphology'),
  ])

  // Fan-out 2 — authoring agents
  // pos-tagger runs first (others depend on POS being available)
  const posTaggerReport = !input.skipAuthoring?.posTagger
    ? await runPosTagger({ ... })
    : skipAuthoringReport('pos-tagger')

  // Then the other 5 in parallel
  const otherAuthoringReports = await Promise.all([
    !input.skipAuthoring?.vocabDistractors  ? runVocabDistractors({ ... })  : skipAuthoringReport('vocab-exercise-creator'),
    !input.skipAuthoring?.grammarVariants   ? runGrammarVariants({ ... })   : skipAuthoringReport('grammar-exercise-creator'),
    !input.skipAuthoring?.clozeContexts     ? runClozeContexts({ ... })     : skipAuthoringReport('cloze-creator'),
    !input.skipAuthoring?.morphologyPairs   ? runMorphologyPairs({ ... })   : skipAuthoringReport('morphology-pair-generator'),
    !input.skipAuthoring?.enTranslator      ? runEnTranslator({ ... })      : skipAuthoringReport('en-translator'),
  ])

  const authoringReports = [posTaggerReport, ...otherAuthoringReports]

  // After authoring, RE-RUN morphology projector if morphology pairs were freshly authored
  // (capability rows depend on the artifact rows the agent just wrote)
  if (!input.skipProjectors?.morphology && authoringReports.find(r => r.agent === 'morphology-pair-generator' && r.artifactsWritten > 0)) {
    const reprojection = await runMorphologyProjection({ ... })
    // Look up by name, not positional index (W1 round-2 fix — robust to projector reordering)
    const idx = projectorReports.findIndex(r => r.projector === 'morphology')
    if (idx >= 0) projectorReports[idx] = reprojection
  }

  // JOIN — backfill page-block FK
  const pageBlockBackfill = await adapter.backfillPageBlockCapabilityRefs(sourceRef)

  // Sequential validators
  const health    = await runHealthCheck({ lessonNumber: input.lessonNumber, sourceRef, strict: true })
  const promotion = await runPromotion({ lessonNumber: input.lessonNumber, sourceRef, apply: !input.dryRun })
  const readiness = await runReleaseReadiness({ lessonNumber: input.lessonNumber, sourceRef })

  return {
    lessonNumber: input.lessonNumber, sourceRef,
    projectors: projectorReports,
    authoring: authoringReports,
    pageBlockBackfill,
    health, promotion, readiness,
    passed: health.criticalCount === 0 && readiness.releaseReady,
    totalDurationMs: …
  }
}
```

### 8.2 Notes

- `--gate` mode skips all projection + authoring; runs only the 3 validators in sequence and returns. Replaces today's `run-capability-release-gate.ts` shell chain.
- `--dry-run` mode: no DB writes (adapter writes are no-ops), no agent invocations (agentClient calls are no-ops emitting fake outputs). Useful for rehearsing the run + cost estimation.
- Sequencing: projectors → pos-tagger → other agents → morphology-reproject (conditional) → backfill → validators. Total expected duration: O(2-3 minutes per lesson) bounded by agent invocation latency.

### 8.3 Folds from existing code

- Replaces `run-capability-release-gate.ts:39-54` (shell-command chain) with in-process orchestration.
- The shell chain stays available behind a `bun scripts/run-capability-stage.ts --lesson N --gate` wrapper for backward-compat with anything that currently invokes `npm run capability:release-gate`.

---

## 9. Caller migration

### 9.1 New CLI: `scripts/run-capability-stage.ts`

Thin wrapper (~40 LOC) calling `runCapabilityStage`. Argv:
- `--lesson N` (required)
- `--apply` / `--dry-run` (mutually exclusive)
- `--gate` (validators only)
- `--skip-authoring=vocab,grammar,...` (csv of skipAuthoring flags)
- `--skip-projectors=vocab,...`

### 9.2 Existing CLIs — migration

| File | Action |
|---|---|
| `scripts/materialize-capabilities.ts` | KEEP as thin wrapper; calls `runVocabProjection` + `runGrammarProjection` + `runMorphologyProjection` (covers the materialize concept). Argv unchanged. |
| `scripts/promote-capabilities.ts` | KEEP as thin wrapper; calls `runPromotion`. Argv unchanged. |
| `scripts/check-capability-health.ts` | KEEP as thin wrapper; calls `runHealthCheck`. Argv unchanged. The `--staging` mode retires (DB-only now); throw on `--staging` argv with deprecation message. |
| `scripts/check-capability-release-readiness.ts` | KEEP as thin wrapper; calls `runReleaseReadiness`. Argv unchanged. |
| `scripts/run-capability-release-gate.ts` | RETIRE; replaced by `run-capability-stage.ts --gate`. |
| `scripts/approve-staged-capability-artifacts.ts` | RETIRE; staging-file path retires entirely (capability artifacts now derived from DB). |
| `scripts/auto-fill-capability-artifacts-from-legacy.ts` | KEEP as-is for legacy 1-3 backfill until Phase 3. The new module reads its DB-published output the same way. |

### 9.3 `package.json` migration

```diff
- "capability:release-gate": "tsx scripts/run-capability-release-gate.ts",
+ "capability:stage": "tsx scripts/run-capability-stage.ts",
+ "capability:gate": "tsx scripts/run-capability-stage.ts --gate",
```

### 9.4 `publish-approved-content.ts` — capability writes retire

The `publishCapabilityPipelineOutput` function (`publish-approved-content.ts:158-321`) splits in two:

- **Stays in lesson stage:** content_units + lesson_page_blocks (without capability_key_refs[]) writes (lines 197-238). These are Stage A reading content per lesson-stage spec §1.5.
- **Moves to capability stage's adapter:** capabilities + relationships + artifacts writes (lines 240-310). Plus exercise_variants writes for `candidates` and `vocab-enrichments` (which currently happen in publish-approved-content.ts via the candidates/vocab-enrichments staging files — but those agents have been migrated to capability-stage authoring, so the DB write moves with them).

This retires `publishCapabilityPipelineOutput` from `publish-approved-content.ts`. Lesson stage's `publish-approved-content.ts` becomes lesson-content-only.

### 9.5 Files importing from existing capability scripts

| Caller | After migration |
|---|---|
| `scripts/__tests__/*.test.ts` (14 capability-related test files) | Migrate per §10 below |
| `scripts/check-supabase-deep.ts` | If it calls capability validators, update to use `runHealthCheck` from the module |
| Any docs referencing the old script paths | Update to reference the module + new CLI |

---

## 10. Test migration

### 10.1 Existing test files

| File | Action |
|---|---|
| `scripts/__tests__/materialize-capabilities.test.ts` | MIGRATE → `scripts/lib/pipeline/capability-stage/__tests__/projectors/vocab.test.ts` (with grammar+morphology variants split to their own files) |
| `scripts/__tests__/promote-capabilities.test.ts` | MIGRATE → `__tests__/validators/promotion.test.ts` |
| `scripts/__tests__/check-capability-health.test.ts` | MIGRATE → `__tests__/validators/health.test.ts`; staging-mode tests retire |
| `scripts/__tests__/check-capability-release-readiness.test.ts` | MIGRATE → `__tests__/validators/readiness.test.ts` |
| `scripts/__tests__/run-capability-release-gate.test.ts` | MIGRATE → `__tests__/runner.test.ts`; replaces shell-chain assertions with in-process orchestration assertions |
| `scripts/__tests__/approve-staged-capability-artifacts.test.ts` | RETIRE — script retires |
| `scripts/__tests__/auto-fill-capability-artifacts-{adapter,cli,planning,staging}.test.ts` (4 files) | KEEP unchanged (script unchanged for now) |
| `scripts/__tests__/capability-staging.test.ts` | KEEP — tests `scripts/lib/content-pipeline-output.ts` which is still consumed |
| `scripts/__tests__/capability-review-rpc-migration.test.ts` | KEEP — unrelated to module |
| `scripts/__tests__/publish-approved-content-capability-output.test.ts` | UPDATE — assertions about capability writes move to module's tests; lesson-content writes assertions stay |
| `scripts/__tests__/publish-approved-content-entrypoint.test.ts` | UPDATE — drop capability-write assertions |

### 10.2 New test files

| File | Tests |
|---|---|
| `__tests__/projectors/vocab.test.ts` | DB-row → snapshot mapping; `planVocabWrites` idempotency; capability count per item; `lesson_id` correctness |
| `__tests__/projectors/grammar.test.ts` | pattern_recognition + pattern_contrast emission; gating on contrast_pair variant |
| `__tests__/projectors/morphology.test.ts` | Morphology rule detection (lesson 1: no, lesson 9: yes); pair projection; `lesson_id` is rule-introducing lesson |
| `__tests__/authoring/{posTagger,enTranslator,vocabDistractors,grammarVariants,clozeContexts,morphologyPairs}.test.ts` | Per-agent: input shape, mocked agent response, output shape, idempotency, agent-error handling |
| `__tests__/validators/{health,readiness,promotion}.test.ts` | Folded from existing tests |
| `__tests__/adapter.test.ts` | `vi.mock('@supabase/supabase-js')` — every loader + writer; `chunkedIn` batching; `backfillPageBlockCapabilityRefs` |
| `__tests__/agentClient.test.ts` | Anthropic SDK mock; retry on rate-limit; schema validation; template loading |
| `__tests__/runner.test.ts` | Mocked projectors/agents/validators; orchestration sequence; conditional morphology re-projection; `--dry-run` and `--gate` paths |
| `src/__tests__/capabilityCatalog.test.ts` | UPDATE — add tests for new `pattern_contrast` rule + `contextual_cloze` from items + no `contextual_cloze` from dialogue_lines |

### 10.3 Test count prediction (W7 fix)

Per the OpenBrain binary-diagnostic rule, exact counts must be recorded — not estimates. The spec author records the pre-PR count before opening each PR, then computes the predicted post-PR count using:

**Predicted DELTA per PR (added tests):**

| PR | Test files added | Approx tests per file | Total added |
|---|---|---|---|
| PR 1 | adapter.test.ts (16), agentClient.test.ts (8), validators/health (folded, ~12), validators/readiness (folded, ~10), validators/promotion (folded, ~14) | mixed | +60 |
| PR 2 | projectors/vocab.test.ts (18), projectors/grammar.test.ts (12), authoring/grammarVariants.test.ts (10), capabilityCatalog.test.ts updates (+7 per §4.5) | | +47 |
| PR 3 | authoring/vocabDistractors.test.ts (10), authoring/clozeContexts.test.ts (10) | | +20 |
| PR 4 | authoring/posTagger.test.ts (8), authoring/enTranslator.test.ts (8) | | +16 |
| PR 5 | projectors/morphology.test.ts (15), authoring/morphologyPairs.test.ts (12) | | +27 |

**Predicted DELETED per PR (retired tests):**

| PR | Tests retired | Count |
|---|---|---|
| PR 1 | (none yet) | 0 |
| PR 2 | scripts/__tests__/run-capability-release-gate.test.ts (folded into runner.test.ts), scripts/__tests__/check-capability-health.test.ts staging-mode tests | -8 |
| PR 3 | scripts/__tests__/approve-staged-capability-artifacts.test.ts (entire file retires; ~10 tests), scripts/__tests__/materialize-capabilities.test.ts core (folded into projectors/vocab.test.ts) | -25 |
| PR 4-6 | (none) | 0 |
| PR 6 | (small cleanup of orphaned wrapper tests) | -5 |

**Net prediction: post-PR-6 test count = pre-PR-1 count + 170 - 38 = pre + 132.**

**Per-PR cumulative running totals** (for PR review checklists):
- After PR 1: pre + 60
- After PR 2: pre + 60 + 47 - 8 = pre + 99 (PR 2's 47 added; PR 2 retires 8 tests via run-capability-release-gate folding)
- After PR 3: pre + 99 + 20 - 25 = pre + 94 (PR 3 retires 25 tests via approve-staged-capability-artifacts + materialize-capabilities folding)
- After PR 4: pre + 94 + 16 = pre + 110
- After PR 5: pre + 110 + 27 = pre + 137
- After PR 6: pre + 137 - 5 = pre + 132 ✓

Each PR's description will include: `Pre-PR count: X; Predicted post-PR count: Y; Actual post-PR count: Z`. If `Y ≠ Z`, fix before merge.

---

## 11. Risks + open questions

### 11.1 Risks

1. **Phase 1 prerequisite chain is hard.** This spec ships only after Phase 1 (lesson-stage spec) lands AND all 9 lessons are re-published. Total prerequisite is non-trivial: ~9 lesson re-publishes × deterministic+manual review per lesson. If any lesson's re-publish fails GT5/GT6, capability stage cannot ship until that lesson's staging is fixed. Mitigation: pre-flight check before this PR opens — `bun runLessonStage --lesson N --dry-run` for each lesson 1..9; fix any failures first.

2. **Agent invocation latency at full run.** `runCapabilityStage --lesson N` invokes 6 agents serially or in parallel. Each agent invocation is ~10-30 seconds depending on the agent's input size. Total wall-clock per lesson: ~1-3 minutes. Mitigation: parallel fan-out where safe (5 agents in parallel after pos-tagger); per-agent rate-limit with backoff in agentClient.

3. **Agent output non-determinism.** LLM outputs are non-deterministic; re-running the same lesson can produce different distractors / different cloze sentences. Mitigation: idempotency keys (skip items with existing artifacts), and `artifact_fingerprint` based on input rather than output (so same input produces same fingerprint, allowing dedup).

4. **DB seam coupling to Phase 1.** If Phase 1's `runLessonStage` is flaky, capability stage inherits the flakiness. Capability stage assumes Stage A's output is well-formed (canonical block_kind, embedded items per GT6). If Stage A produces malformed data, capability stage's adapter throws on validation. Mitigation: lesson-stage's GT5+GT6 are strict gates; capability stage's adapter assertions add a second layer.

5. **API key requirements expand.** Capability stage needs `ANTHROPIC_API_KEY` for 6 agents. Mitigation: `.env.local` documentation; agentClient reads from env at startup and fails-fast.

6. **`pattern_contrast` and `contextual_cloze` projection changes affect existing tests.** Adding the projection rules + rerouting source kinds might break tests that asserted on capability counts per lesson. Mitigation: update test fixtures + assertions per §10.

7. **Capability stage runtime cost.** Each lesson re-run costs ~$0.50-$2 in Anthropic API calls (6 agents × per-item invocations). For 9 lessons, that's $5-$20 one-time. Subsequent re-runs (idempotent) cost ~$0 because most items skip. Mitigation: dry-run mode for cost estimation; idempotency.

8. **Phase 1 rollout coupling — the §1.3 prerequisite.** This spec is strict to the canonical embedded-items shape. Before any PR opens, lessons 1..9 must have completed re-publish under `runLessonStage`. If any lesson's re-publish fails Phase 1's GT5/GT6 gates, capability-stage cannot ship until that lesson's staging is fixed. **Pre-flight check before PR 1 opens:** `for N in 1..9; do bun runLessonStage --lesson N --dry-run; done` clean. (G4 in §12.) This is a strong coupling — if Phase 1 stalls, Phase 2 stalls.

9. **Lesson-stage spec §1.5 documentation gap (NOT an architectural ambiguity).** Lesson-stage spec §1.5 currently lists 5 Stage A outputs; the actual set is 7 (adds `content_units` + `grammar_patterns`). Both tables are reader-visible content and Stage A's responsibility per the §1 architectural rule. Mitigation: G5 pre-merge gate requires lesson-stage spec amendment before PR 1 opens. The architecture is unambiguous; the spec text just needed to enumerate the additional tables.

10. **Pos-tagger cross-lesson dependency (W4 risk).** Morphology projector for lesson 9 reads `learning_items.pos` for vocabulary across lessons 1-8. If pos-tagger hasn't run for those lessons, morphology projector either silently under-generates pairs OR aborts with a CRITICAL warning (per §4.3 step 1). Mitigation: G2 pre-merge gate enforces zero NULL pos before PR 6 merges.

11. **`dialogue_line` source-kind retirement (W1 risk).** §4.4.2 reroutes `contextual_cloze` from `dialogue_line` to item-source. Existing `learning_capabilities.source_kind = 'dialogue_line'` rows would become orphans (no projector emits them; canonical key contract changes). Mitigation: G1 pre-merge gate verifies zero rows in production. Earlier verification (in this branch's brainstorming) found zero `dialogue_line` capabilities in any lesson's staging `capabilities.ts` — supports the assumption that production also has zero, but G1 verifies.

### 11.2 Open questions

| # | Question | Default lean |
|---|---|---|
| Q1 | Should validators be shared between this module and a future podcast-capability-stage (Option Q from earlier discussion) or duplicated (Option P)? | Defer; start with P, decide when podcast spec opens |
| Q2 | Does `morphology-pair-generator`'s output format match lesson-stage's coursebook-extracted pairs exactly? | Validate during PR with a fixture comparison |
| Q3 | Should `pos-tagger` infer POS from English meaning if Dutch is ambiguous, or always from Indonesian + Dutch? | From Indonesian + Dutch (the source pair) |
| Q4 | If en-translator fails for an item, do we proceed with NL-only or block? | Proceed (NL-only is the fallback; not a critical issue) |
| Q5 | DB unreachable from this session — confirm row counts before merge or proceed? | Confirm at merge time when on-network |
| Q6 | Does `runCapabilityStage` write `exercise_variants` directly, or does it call the existing `publish-approved-content.ts` exercise_variants subset? | Direct — moves the write path to module's adapter |

### 11.3 Acknowledgements (doc-claim corrections)

This spec corrects assumptions made in earlier drafts. v1 → v2 corrections (round-1 architect review):

1. **`'pos'` is not a `capability_artifacts.artifact_kind`** — the v1 spec wrongly listed it as an artifact-authored output of pos-tagger. v2 resolves: pos-tagger writes to existing `learning_items.pos` column. No new artifact kind, no schema change.
2. **Both `publish-approved-content.ts` AND `publish-grammar-candidates.ts` write `exercise_variants`.** v1 said publish-approved-content.ts writes them; v2 wrongly retracted that based on a silent grep failure (file has NEL line terminators that default grep treats as binary). Round-2 architect verified the file references; v4 disambiguates: **writes are at lines 693 (grammar variant insert) and 734 (vocab variant insert)**; lines 754, 757, 762, 951 are SELECT/COUNT operations (verification reads, not writes). Both Stage A scripts (publish-approved-content.ts at 693, 734 + publish-grammar-candidates.ts at 264, 279, 328) retire in PR 2.
3. **`learning_capabilities.lesson_id` is not written by current code** — v1 implicitly relied on the legacy SQL backfill at `2026-05-07-retire-source-progress.forward.sql:86-99`. That backfill derives lesson_id from page-block adjacency, which would mis-assign morphology capabilities. v2 §1.5.A.1 enumerates explicit `lesson_id` writes per source kind.
4. **`splitAcceptedL1` does not split on commas** — v1 example "meneer, vader, u" was wrong. v2 §4.1 acceptance criterion uses slash-separated input matching the actual regex `/\s+\/\s+|\s*;\s*/`.
5. **`content_units` seam is undocumented in lesson-stage spec** — v1 assumed Stage A ownership without flagging the gap. v2 §1.5.G.1 documents the dependency explicitly + adds G5 pre-merge gate.

Earlier brainstorming corrections (pre-architect-review):

6. **Vocab projector was framed as reading from `learning_items` table.** Correct read path under lesson-stage spec §1.5 is `lesson_sections.content[type∈{vocabulary,...}].items[]`. Adapter loaders are written accordingly.
7. **Vocab projector was framed as enriching earlier-lesson form_recall accepted_answers with morphological variants.** Retracted — that would break the pedagogical-prerequisite-driven capability ownership rule. Earlier lessons' accepted_answers stay scoped to what the lesson taught.
8. **Spec originally listed 4 projectors (vocab, grammar, morphology, podcast).** Podcast retired to a separate `podcast-stage` placeholder module per the user's explicit boundary.
9. **Capability stage was framed as "deterministic only".** Refined: deterministic projection + 6 agent-driven authoring layers. The agents are the heavy lifting; the projection certifies what's ready.

---

## 12. Verification gates

### Pre-merge (the spec author runs these)

- `bun run lint` clean
- `bun run test --run` matches predicted post-PR count (per §10.3)
- `bun run build` clean
- `make migrate-idempotent-check` clean (no SQL changes in this spec — should be a no-op)
- `make check-supabase-deep` clean
- `make pre-deploy` clean (full gauntlet)
- Architect-review-loop on this spec → APPROVE
- Architect-review-loop on the executed diff → APPROVE

#### Capability-stage-specific pre-merge gates

- **G1 (W1 — `dialogue_line` orphan check):** before merge of PR 2 (which retires the `dialogue_line` source kind from active projection per §4.4.2-3), run:
  ```sql
  SELECT count(*) FROM indonesian.learning_capabilities WHERE source_kind = 'dialogue_line';
  SELECT count(*) FROM indonesian.learner_capability_state lcs
    JOIN indonesian.learning_capabilities lc ON lc.id = lcs.capability_id
    WHERE lc.source_kind = 'dialogue_line';
  ```
  Both must return 0 OR a documented exception is required (operator runbook deletes the orphan rows before merging).

- **G2 (W4 — pos-tagger pre-flight for morphology projector):** PR 5's pre-merge requires that pos artifacts exist for `learning_items` across all lessons that introduce vocab the morphology projector might pair. Verified by:
  ```sql
  SELECT count(*) FROM indonesian.learning_items
    WHERE pos IS NULL AND item_type IN ('word', 'phrase') AND is_active = true;
  ```
  Must return 0 before PR 5 merges. Operator runbook: run `bun run capability-stage --skip-projectors=morphology --skip-authoring=morphologyPairs --apply` for every lesson before PR 6 merges.

- **G3 (N2 — DB row count confirmation):** before each PR opens, the spec author confirms via DB query that the documented assumptions hold. Specific assertions:
  - `SELECT count(*) FROM indonesian.learning_capabilities WHERE source_kind='affixed_form_pair' AND lesson_id IN (lessons-1-through-8.id)` must return 0 (per §14 — only lesson 9 introduces morphology in the current 9-lesson set)
  - `SELECT count(*) FROM indonesian.learning_capabilities WHERE source_kind='dialogue_line'` must return 0 (covered by G1)
  - `SELECT count(*) FROM indonesian.learning_items WHERE pos IS NULL AND item_type IN ('word','phrase') AND is_active=true` must return 0 (covered by G2; gates PR 5)
  - `SELECT count(*) FROM indonesian.lesson_sections WHERE content->>'type'='vocabulary' AND jsonb_typeof(content->'items') != 'array'` must return 0 (lesson-stage spec §1.5.B compliance — embedded items shape)
  
  Where any assertion fails, the operator runbook describes the remediation. Spec opens only after all assertions return 0.

- **G4 (Phase 1 prerequisite):** before PR 1 opens, every lesson 1..9 has had `bun runLessonStage --lesson N --apply` run successfully against the canonical embedded-items shape. Per §1.3, this spec is strict to that shape; PR 1 cannot land without Phase 1 rollout completed.

- **G5 (lesson-stage spec §1.5 amendment):** before PR 1 opens, lesson-stage spec amendment to add `content_units` AND `grammar_patterns` as explicit §1.5 outputs has been authored + reviewed. This is a documentation-only amendment (both tables are already Stage A's responsibility in code). Required to make the seam between this spec and lesson-stage spec match the architectural rule in §1.

### Pre-PR-open

For every lesson 1..9: `bun runLessonStage --lesson N --dry-run` clean. If any fails, fix lesson stage first; this spec depends on Phase 1 rollout being feasible.

### Post-merge

- Manual smoke test: log in as test user, open `/lessons`, activate one lesson, start a session, verify capability cards render with real exercise content (not the empty self-rate placeholder).
- For lesson 9: verify morphology capabilities appear after activation.

---

## 13. Migration order (within the fold's PR sequence)

**This spec is too large for a single PR.** Sequenced into 6 PRs, each green and atomic. PR 1 is module-skeleton-only (no writer cutover). PR 2 is the cutover PR — both vocab and grammar capability writes migrate atomically to avoid the regression class flagged in round-2 review.

### PR 1 — Module skeleton + adapter + validators (READ side only)

**Scope: setup, no writer cutover. The new module exists alongside existing scripts but does not replace any writer.**

Files added:
- `scripts/lib/pipeline/capability-stage/{index.ts, model.ts, runner.ts (stub), adapter.ts (loaders only; writers stubbed), agentClient.ts}`
- `scripts/lib/pipeline/capability-stage/projectors/{index.ts, vocab.ts (stub), grammar.ts (stub), morphology.ts (stub)}`
- `scripts/lib/pipeline/capability-stage/authoring/{index.ts, *.ts (all stubs)}`
- `scripts/lib/pipeline/capability-stage/validators/{index.ts, health.ts, readiness.ts, promotion.ts}` (folded from existing scripts — read-only validators, no DB writes)
- `scripts/lib/pipeline/capability-stage/__tests__/{adapter.test.ts, agentClient.test.ts, validators/*}`

Files modified:
- `scripts/check-capability-health.ts`, `scripts/check-capability-release-readiness.ts`, `scripts/promote-capabilities.ts` → thin wrappers calling the new validator entries (validators are non-writing in their dry-run mode and `promote-capabilities.ts --apply` was already DB-writing today, no behavioural change)

Files NOT touched (deferred to later PRs):
- `scripts/publish-approved-content.ts` (capability writes still happen here)
- `scripts/publish-grammar-candidates.ts` (exercise_variants writes still happen here)
- `scripts/materialize-capabilities.ts` (kept as-is)
- `src/lib/capabilities/capabilityCatalog.ts` (no projection rule changes yet)

Coverage: nothing new at runtime. Module's adapter has all DB loaders implemented + tested. Validators run end-to-end against the DB. The runner is callable but its projector + authoring fan-outs are stubs that emit zero rows.

**Verification:** `bun run capability-stage --gate --lesson N` works (validators only). `bun run capability-stage --lesson N --dry-run` runs through stubs without errors. No regression to existing capability flows because no writer changed.

### PR 2 — Vocab + grammar projectors atomic cutover (the main migration)

**This is the main cutover PR. Both vocab AND grammar capability migrate atomically.** The architect's round-2 review flagged that any split between the two creates a regression window where one source kind has no writer. Fix: ship them together.

Adds:
- `projectors/vocab.ts` full implementation (per §4.1)
- `projectors/grammar.ts` full implementation (per §4.2; emits `pattern_recognition` + `pattern_contrast`)
- `authoring/grammarVariants.ts` invoking `grammar-exercise-creator` (with prompt updates per §5.2)
- `__tests__/projectors/vocab.test.ts`, `__tests__/projectors/grammar.test.ts`
- `__tests__/authoring/grammarVariants.test.ts`

Modifies (atomic — same PR commit graph):
- `src/lib/capabilities/capabilityCatalog.ts` —
  - **Adds `export` to `createCapability` (line 34) and `CapabilityDraft` (line 16)** so the vocab projector can import + reuse them per §4.4.2 (round-3 C1 fix). Without these exports, the projector code at §4.4.2 doesn't compile.
  - Adds `pattern_contrast` rule per §4.4.1.
  - Deletes the dead `dialogueLines` loop at lines 149-162 per §4.4.2 (contextual_cloze rule moves to vocab projector, NOT inside `projectCapabilities`).
- `scripts/publish-approved-content.ts` — `publishCapabilityPipelineOutput` (lines 158-321) retires entirely. Both vocab capability writes (lines 240-272, all source kinds) AND exercise_variants writes (lines 693, 734) move to capability-stage adapter via `runCapabilityStage`'s projector + authoring fan-outs.
- `scripts/publish-grammar-candidates.ts` — **retires entirely**. Its sentence-level item creation (`learning_items` + `item_contexts` + `item_context_grammar_patterns` writes) moves either into capability-stage's grammar projector adapter step OR (if those rows are no longer needed by any consumer post-Phase-1) is dropped entirely. The spec author verifies which during PR 2 implementation by greping for downstream consumers.
- `scripts/run-capability-release-gate.ts` — retires. `package.json` script renames to `capability:gate`.
- `scripts/approve-staged-capability-artifacts.ts` — retires (staging-file path retires entirely with DB-derived artifacts).
- `scripts/materialize-capabilities.ts` — thin wrapper calling `runVocabProjection` + `runGrammarProjection` (covers materialize concept; argv unchanged).
- Updated `content-seeder` agent's "Publish Order" section to note that capability rows are now written by `bun scripts/run-capability-stage.ts --lesson N --apply` after publish-approved-content.ts.
- Documentation updates: `docs/architecture/content-pipeline.md:12, 89, 146` references to publish-grammar-candidates.ts removed; `CLAUDE.md` content-management section updated to drop the retired scripts.

Coverage: ALL capabilities — `text_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`, `audio_recognition`, `dictation`, `pattern_recognition`, `pattern_contrast`, `contextual_cloze` (via vocab projector's post-projection emission) — emit via the new module. Capability-artifact writes for auto-derivable kinds flow through the new adapter. Exercise_variants writes for grammar variants flow from grammar-exercise-creator agent invocation. Vocab MCQ distractors NOT yet curated (vocab-exercise-creator runs in PR 3); runtime falls back to random distractors until PR 3 ships.

**Round-3 W5 note on contextual_cloze emission:** the vocab projector's `emitContextualClozeForItemsWithArtifacts` (§4.4.2) reads existing `cloze_context` artifacts from DB. In PR 2's state, those artifacts come from the legacy `seed-cloze-contexts.ts` script (run pre-Phase-2), NOT from the new module's `cloze-creator` integration which lands in PR 3. This is intended — legacy seeded artifacts are valid inputs to the contextual_cloze emission rule. PR 3 adds the new authoring path; PR 2 uses whatever artifacts already exist.

Atomic-merge requirement: the publishCapabilityPipelineOutput retirement + publish-grammar-candidates.ts thinning + new module's writers MUST all be in the same merge. No mid-PR state where capability rows or exercise_variants are unwritten.

**Round-4 W3 disposition for `publish-grammar-candidates.ts` (decided in v5):** verified by `rg "item_context_grammar_patterns"` over `src/` — the table is consumed at runtime by `src/services/learningItemService.ts:97-128` (grammar pattern → confusion-group resolution for exercise rendering) and `src/pages/ExerciseCoverage.tsx:47` (admin coverage view). PR 2 thins publish-grammar-candidates.ts to remove ONLY the exercise_variants insert (lines 264-280, 326-339); the script's other writes (sentence-level `learning_items` + `item_contexts` + `item_context_grammar_patterns` link upserts) stay alive until Phase 3 retires the per-item tables. The script is renamed `seed-grammar-context-links.ts` post-PR-2 to reflect its narrowed responsibility, OR retained at the existing path with a header comment.

### Review checklist for PR 2 reviewers (round-4 W4)

PR 2 is the largest PR in this sequence. Reviewers verify:

- [ ] `bun run lint` clean
- [ ] `bun run test --run` matches predicted post-PR-2 count: pre + 99 (per §10.3 PR 1 + PR 2 deltas)
- [ ] `bun run build` clean
- [ ] `make migrate-idempotent-check` clean (no SQL changes; should be no-op)
- [ ] `bun run capability-stage --lesson 1 --apply` succeeds against a test DB; verify post-conditions:
  - All 4 base item-source capabilities per item (text_recognition, meaning_recall, l1_to_id_choice, form_recall) emit
  - 2 audio capabilities emit per item with `hasAudio=true`
  - `pattern_recognition` + `pattern_contrast` capabilities emit per pattern
  - `lesson_id` is non-null on every capability row written by the new module (G2/G3 assertion)
  - Existing `exercise_variants` rows are upserted; no duplicate variants
  - `learning_capabilities.lesson_id` matches expected per source kind (verify a few morphology-relevant items)
- [ ] `make check-supabase-deep` clean
- [ ] `make pre-deploy` clean
- [ ] No `lesson_id IS NULL` rows in `learning_capabilities` for the test lesson after PR 2 runs
- [ ] G1 zero-rows assertion: `SELECT count(*) FROM learning_capabilities WHERE source_kind='dialogue_line'` returns 0
- [ ] Architect-review of the executed diff against this spec section

### PR 3 — Vocab distractors + cloze contexts

Adds:
- `authoring/vocabDistractors.ts` invoking `vocab-exercise-creator` (with prompt updates per §5.1)
- `authoring/clozeContexts.ts` invoking `cloze-creator` (with prompt updates per §5.3)
- `__tests__/authoring/vocabDistractors.test.ts`, `__tests__/authoring/clozeContexts.test.ts`

Coverage: l1_to_id_choice MCQ quality + contextual_cloze capability reach `readiness=ready` (via newly written exercise_variants and cloze_context artifacts).

### PR 4 — POS tagger + EN translator (NEW agents)

Adds:
- `.claude/agents/pos-tagger.md` (NEW agent definition, ~80-120 LOC per §5.7)
- `.claude/agents/en-translator.md` (NEW agent definition, ~100-140 LOC per §5.7)
- `authoring/posTagger.ts` + `authoring/enTranslator.ts`
- `__tests__/authoring/posTagger.test.ts`, `__tests__/authoring/enTranslator.test.ts`

Coverage: pos-tagger writes to `learning_items.pos`; en-translator writes `meaning:en` artifacts. All MCQ-class capabilities now have POS-aware distractor cascade quality at runtime.

### PR 5 — Morphology projector + morphology-pair-generator (NEW agent)

Adds:
- `.claude/agents/morphology-pair-generator.md` (NEW, ~150-220 LOC per §5.7)
- `authoring/morphologyPairs.ts`
- `projectors/morphology.ts` full implementation
- Runner conditional re-projection logic
- `__tests__/projectors/morphology.test.ts`, `__tests__/authoring/morphologyPairs.test.ts`

**Pre-flight: PR 5 cannot land until pos-tagger has been run for lessons 1..N for any N where N introduces a morphology rule.** Operator runbook step: `for N in 1..9; do bun run capability-stage --lesson N --skip-projectors=morphology --skip-authoring=morphologyPairs --apply; done` (i.e., run capability stage for all earlier lessons first to ensure pos artifacts exist; this is what W4's pre-flight check enforces).

Coverage: root_derived_recognition + root_derived_recall capabilities for lessons with morphology rules. Lesson 9 (the only such lesson today) gets 4+ morphology capabilities. Capability `lesson_id` set explicitly to lesson-9's id.

### PR 6 — CLI cleanup + public-API narrowing (W2 commitment)

Retires:
- `scripts/materialize-capabilities.ts`, `scripts/promote-capabilities.ts`, `scripts/check-capability-health.ts`, `scripts/check-capability-release-readiness.ts` thin wrappers (replaced by `run-capability-stage.ts` with appropriate flags)
- `scripts/auto-fill-capability-artifacts-from-legacy.ts` (only if Phase 3 has shipped; else KEEP)

Cleans up:
- `index.ts` re-exports narrow to `runCapabilityStage` + 2 types (per W2 commitment, §3.3)
- Re-promotion backfill (one-shot UPDATE if needed)
- Documentation updates (CLAUDE.md content management section, capability:release-gate references, any remaining stale doc references to retired scripts)
- Resolves N3 (PR-6 cleanup is the final wrapper retirement, completing the migration)
- Optional: retire the legacy `learning_capabilities.lesson_id` migration backfill at `scripts/migrations/2026-05-07-retire-source-progress.forward.sql:86-99` if all capabilities now have explicit lesson_id from projectors. If kept, add defensive `AND c.source_kind != 'affixed_form_pair'` clause (extends the existing `WHERE c.lesson_id IS NULL` predicate at line 99) per W4 round-2 fix to prevent silent mis-assignment of morphology capabilities on subsequent `make migrate` runs.

---

## 14. Architectural rule honored: pedagogical-prerequisite-driven capability ownership

Verified by the actual data:

| Lesson | affixed_form_pair capabilities | morphology rule introduced |
|---|---|---|
| 1–8 | 0 | No |
| 9 | 4 | Yes (meN-) |

Capability ownership rule: a capability is owned by the lesson that introduces the prerequisite concept, not the lesson where the underlying vocabulary first appeared. Concretely:
- `beli` is taught in lesson 1
- `meN-` rule is taught in lesson 9
- The capability "given root *beli*, recall the active form *membeli*" is owned by **lesson 9**, not lesson 1
- Activating lesson 5 surfaces `beli`'s lesson-1 capabilities (text_recognition, meaning_recall, l1_to_id_choice, form_recall)
- Activating lesson 5 does NOT surface morphology capabilities for `beli` (gated behind lesson 9 activation)

The runtime supports this naturally via `learning_capabilities.lesson_id` + the `lesson_activation` filter. This spec's morphology projector enforces the rule by tagging all morphology capabilities with the rule-introducing lesson's id.

The same principle applies across all capability-stage authoring agents:
- `vocab-exercise-creator` distractors only from already-introduced vocabulary
- `grammar-exercise-creator` carrier vocabulary from earlier or current lesson
- `cloze-creator` cloze sentences for items from current or earlier lessons

This makes the practice progression match the pedagogical progression by construction.

---

## 15. References

- `docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md` — lesson-stage spec (Phase 1)
- `docs/plans/2026-05-02-capability-content-service-spec.md` — runtime-side capability content resolver (separate)
- `docs/plans/2026-05-02-capability-content-service-and-deep-module-gaps.md` — discovery doc
- `docs/target-architecture.md` — architectural rules + module conventions
- `src/lib/capabilities/capabilityCatalog.ts` — projection logic (modified by §4.4)
- `src/lib/capabilities/capabilityContracts.ts` — validators
- `src/lib/capabilities/capabilityTypes.ts` — type glossary
- `scripts/lib/content-pipeline-output.ts` — `validateCapabilityStaging`, `hasConcreteArtifactPayload`
- `.claude/agents/{vocab-exercise-creator,grammar-exercise-creator,cloze-creator,linguist-structurer,linguist-creator,linguist-reviewer,content-seeder,content-ingestor,audio-producer}.md` — existing agents
- `.claude/agents/{pos-tagger,en-translator,morphology-pair-generator}.md` — NEW agents (this spec authors them)
