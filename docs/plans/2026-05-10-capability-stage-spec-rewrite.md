---
status: approved
supersedes: []
---

# Capability Stage — fold map

**Document version:** 2026-05-10
**Status:** Mechanical fold plan. No new design. Awaits pre-fold checklist sign-off (§11) before any line moves.
**Depends on:** `runLessonStage` (Stage A, merged) + `/tmp/phase2-inputs/capability-stage-legacy.ts` as the behavioural source of truth.

---

## 1. Goal

Fold `scripts/lib/pipeline/capability-stage-legacy.ts` (1004 lines, currently invoked as `publishLegacyStageB` from `scripts/publish-approved-content.ts`) into a deep module `scripts/lib/pipeline/capability-stage/` that mirrors the locked shape of `scripts/lib/pipeline/lesson-stage/` plus an `authoring/` subfolder that owns every agent invocation. The write surface is unchanged. The behaviour is unchanged. The publish CLI swaps `publishLegacyStageB` for `runCapabilityStage`. The legacy file is deleted in the same PR.

**Input boundary (load-bearing).** Capability-stage's only external input is `{ lessonNumber, lessonId, dryRun }`. Lesson content (`lessons`, `lesson_sections`, `lesson_page_blocks`, `audio_clips`) is read from DB via `lessonId`. Everything that the legacy file used to read from the seven staging files (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`, `content-units.ts`, `capabilities.ts`, `exercise-assets.ts`) is now produced inside this module by `authoring/` agents and projected into DB by `projectors/`. There are no staging-file reads. There are no staging-file writes.

**Module contract (end-to-end).**
- **Lesson-stage end-state:** lesson information seeded to lesson tables — lesson is visible in the app.
- **Capability-stage input:** DB reads from lesson tables only.
- **Capability-stage output:** DB writes to capabilities tables only (the nine in §6's full write surface — `learning_capabilities`, `capability_content_units`, `capability_artifacts`, `content_units`, plus the substrate `learning_items`, `item_meanings`, `item_contexts`, `grammar_patterns`, `exercise_variants` that the runtime needs to render the capabilities).
- **Capability-stage end-state:** all capabilities seeded — capabilities are available in the app.

What does NOT change: the destination tables, the deferred-dialogue gate semantics, the post-seed integrity checks, the `candidateSlugs` fallback algorithm, the POS validation contract, the PGRST205 grammar-patterns-table fallback, the ilike prefix fallback in cloze-context resolution.

---

## 2. Source-of-truth inputs

The architect must read each input **in full** before writing any row of the §4 table.

- `/tmp/phase2-inputs/capability-stage-legacy.ts` — the fold source (1004 lines).
- `/tmp/phase2-inputs/lesson-stage-adapter.ts` — Stage A write surface (lessons / lesson_sections / lesson_page_blocks / audio_clips already exist post Stage A).
- `/tmp/phase2-inputs/lesson-stage-index.ts`, `lesson-stage-model.ts`, `lesson-stage-runner.ts` — parity shape to mirror.
- `/Users/albert/home/learning-indonesian/src/lib/capabilities/capabilityCatalog.ts` lines 134–147 (`pattern_recognition` with no contrast sibling), lines 149–162 (`contextual_cloze` block reading `dialogueLines` directly inside `projectCapabilities`), and lines 164–192 (the two podcast `for` loops reading `input.podcastSegments` and `input.podcastPhrases` — moved out per Decision 4).
- `/Users/albert/home/learning-indonesian/docs/target-architecture.md` §1 + §Module conventions (line ~89) — rules the new module shape must satisfy.

---

## 3. The new module shape

```
scripts/lib/pipeline/
├── capability-stage/
│   ├── index.ts                     # public barrel — exports runCapabilityStage + types
│   ├── model.ts                     # CapabilityStageInput / Output / ValidationFinding (CS gate prefix)
│   ├── runner.ts                    # mirrors lesson-stage/runner.ts: load → author → project → validate → adapter writes → return
│   ├── adapter.ts                   # ALL Supabase writes (replaces inline supabase calls in legacy)
│   ├── loader.ts                    # DB-reads only: lesson row + sections + page-blocks + audio voices, keyed by lessonId
│   ├── validators/
│   │   ├── candidatePayload.ts      # GRAMMAR_EXERCISE_TYPES + payload presence + answer_key extraction
│   │   ├── perItemMeaning.ts        # VALID_LANGUAGES + VALID_CONTEXT_TYPES regression guards
│   │   ├── pos.ts                   # delegates to existing scripts/validate-pos
│   │   ├── grammarTopics.ts         # MOVED from lesson-stage GT1 — non-empty content.grammar_topics on grammar / reference_table sections (linguist enrichment, no longer lesson content)
│   │   ├── grammarPattern.ts        # MOVED from lesson-stage GT7 — slug + name + complexity validation on linguistStructurer's grammar_patterns output
│   │   └── perItemEnrichment.ts     # SPLIT from lesson-stage GT6 — enrichment fields (pos, level, dialogue translation_nl) validated here as errors; display fields stay in lesson-stage GT6
│   ├── projectors/
│   │   ├── vocab.ts                 # learning_items + meanings + contexts + dialogue defer/publishable split + content_units (vocab) + capabilities + capability_content_units
│   │   ├── grammar.ts               # grammar_patterns + grammar exercise_variants + content_units (grammar) + capabilities + capability_content_units
│   │   ├── cloze.ts                 # cloze contexts + candidateSlugs fallback
│   │   ├── morphology.ts            # Decision 3: conditional emission, prerequisite-driven lesson_id, capability_artifacts
│   │   └── slugs.ts                 # candidateSlugs helper (extracted from legacy 148–158)
│   ├── verify/
│   │   ├── countParity.ts           # post-seed: for each write surface, DB row count for this lesson == projector-declared count; mismatch is a finding
│   │   ├── contentNonEmpty.ts       # post-seed: required fields populated on every written row (no NULL/empty in canonical_key, base_text, translation_text, payload_json, etc.)
│   │   └── seedIntegrity.ts         # post-seed cross-check (NL/EN coverage, context coverage, reviewability — extracted from legacy 805–923)
│   ├── authoring/
│   │   ├── index.ts                 # barrel
│   │   ├── linguistStructurer.ts    # LIFTED from existing script
│   │   ├── vocabExerciseCreator.ts  # LIFTED from existing script
│   │   ├── grammarExerciseCreator.ts# LIFTED from existing script
│   │   ├── clozeCreator.ts          # LIFTED from existing script
│   │   ├── posTagger.ts             # NEW — TODO stub
│   │   ├── enTranslator.ts          # NEW — TODO stub
│   │   └── morphologyPairGenerator.ts # NEW — TODO stub (Decision 3 input)
│   └── __tests__/                   # see §10
└── podcast-stage/
    ├── podcastProjectionRules.ts    # pure rules: podcast_segments → podcast_gist; podcast_phrases → meaning_recall (extracted from src/lib/capabilities/capabilityCatalog.ts:164–192)
    └── INVENTORY.md                 # placeholder listing remaining work to fold (loader, runner, adapter, agents, validators)
```

`validators/sections.ts` is intentionally absent. Stage A's `validateSectionType` (lesson-stage runner line 109) is the sole gatekeeper; capability-stage no longer reads `lesson.sections` from a staging file, so the legacy defensive guard has no input source and no purpose.

---

## 4. Legacy-to-new file map

Every line range in `capability-stage-legacy.ts` appears in this table. `(deleted)` rows preserve the rationale.

| Legacy lines | New file | Notes |
|---|---|---|
| 1–18 | `index.ts` (header) | Module-level docstring; rewrite header to drop "legacy" framing. |
| 20–33 | `adapter.ts` (top) | Imports + `NODE_TLS_REJECT_UNAUTHORIZED='0'` move to adapter (only file that talks to Supabase). |
| 35–50 `createSupabaseClient` | `adapter.ts` | Mirror Stage A's `createSupabaseClient` from `runner.ts:271–278`. Throw instead of `process.exit(1)` so runner can catch. |
| 52–65 `readStagingFile` | (deleted) | No staging-file reads. Dynamic-import helper unused. |
| 67–101 `loadStagingData` | `loader.ts` | Replaced. New shape: `loadFromDb(supabase, lessonId) → { lesson, sections, pageBlocks, audioVoices, level }`. No `learning-items.ts` / `grammar-patterns.ts` / `candidates.ts` / `cloze-contexts.ts` / `content-units.ts` / `capabilities.ts` / `lesson-page-blocks.ts` / `exercise-assets.ts` reads. |
| 103–110 `VALID_SECTION_TYPES` | (deleted) | Stage A owns section-type validation; capability-stage no longer reads sections from staging. |
| 107–128 `validateSections` (full body) | (deleted) | Same reason. Legacy call at line 372–373 disappears. |
| 130–158 `candidateSlugs` + comment block | `projectors/slugs.ts` | Extract verbatim. Comment block kept — it documents the only non-obvious algorithm in the file. |
| 160–162 banner | (deleted) | Comment-only. |
| 164–201 `publishCapabilityPipelineOutput` (validation + dry-run preamble) | `runner.ts` | Required-input check + `validateContentUnits` / `validateCapabilityStaging` / `validateExerciseAssets` / `validateLessonPageBlocks` move to runner's pre-write phase, run against projector outputs (not staging files). |
| 203–224 content_units upsert loop | `adapter.ts:upsertContentUnits` | Returns `Map<unit_slug, id>`. Inputs come from `projectors/vocab.ts` + `projectors/grammar.ts`, not staging. |
| 226–244 lesson_page_blocks upsert loop | (deleted) | Stage A's `upsertLessonPageBlocks` (`/tmp/phase2-inputs/lesson-stage-adapter.ts:123–150`) already owns this write. Confirmed duplicate per legacy header lines 16–18. |
| 246–279 learning_capabilities upsert | `adapter.ts:upsertCapabilities` | Returns `Map<canonical_key, id>`. Inputs from projectors. |
| 281–297 capability_content_units upsert | `adapter.ts:upsertCapabilityContentUnits` | Reads both maps from earlier calls. |
| 299–316 capability_artifacts upsert | `adapter.ts:upsertCapabilityArtifacts` | Inputs from `projectors/morphology.ts` (and other projectors when artifacts are needed). |
| 318–327 promotion-hint print | `runner.ts` (post-write) | Move to runner's return path; keep `inferLessonNumberForPromotion` adjacent. |
| 329–342 `inferLessonNumberForPromotion` | `runner.ts` (private helper) | Pure; no I/O. Now sourced from `lessonNumber` input directly — kept for parity with legacy log shape. |
| 344–369 `publishLegacyStageB` signature + load | `runner.ts:runCapabilityStage` | Renamed; `loadFromDb(supabase, lessonId)` replaces `loadStagingData(lessonNumber)`. See §7. |
| 371–383 try/catch + validateSections call + capability pipeline call | `runner.ts` | `validateSections` call disappears (Stage A owns it). Validation failure short-circuits before writes (mirrors Stage A pattern). |
| 386–420 grammar patterns upsert | `projectors/grammar.ts` + `adapter.ts:upsertGrammarPatterns` | `introduced_by_lesson_id` rule lives in projector; SQL lives in adapter. PGRST205 fallback kept verbatim. Pattern list is produced by `authoring/linguistStructurer.ts`. |
| 422–465 deferred-dialogue gate | `projectors/vocab.ts` | Pure: input = `{ approvedItems, clozeContexts }` produced upstream by `linguistStructurer` + `clozeCreator`; output = `{ publishable, deferred, deferredKeys }`. No I/O. |
| 467–482 POS validation invocation | `validators/pos.ts` | Wraps existing `scripts/validate-pos`. CRITICAL still aborts (runner exits non-zero). POS values come from `posTagger.ts` agent output. |
| 484–564 learning-items + meanings + contexts loop | `projectors/vocab.ts` (shape) + `adapter.ts:upsertLearningItem` / `replaceItemMeanings` / `upsertItemContext` | Per-item loop body moves to adapter; orchestration stays in projector. The pre-insert `VALID_LANGUAGES` and `VALID_CONTEXT_TYPES` checks at legacy 511–513, 530–538 move to `validators/perItemMeaning.ts`. NL meanings come from `linguistStructurer`; EN meanings come from `enTranslator.ts`. |
| 566–579 `GRAMMAR_EXERCISE_TYPES` + approvedCandidates filter | `validators/candidatePayload.ts` + `projectors/grammar.ts` | Candidates come from `grammarExerciseCreator.ts` + `vocabExerciseCreator.ts` agents. |
| 580–698 candidate publish loop | `projectors/grammar.ts` (routing) + `adapter.ts:insertExerciseVariant` (write) | Routing rule (grammar via `lesson_id+pattern`, vocab via `context_id` lookup) lives in projector. The `item_contexts` source-text lookup at legacy 665–671 is an adapter read. |
| 700–724 post-insert variant verification + staging write-back | `verify/seedIntegrity.ts` (count check) + (deleted: staging write-back) | Count check kept. The staging-file mutation at 718–722 is **(deleted) — no staging files in revised architecture**. Note: legacy re-runs duplicate variant rows (no upsert key); see §11 default. |
| 727–803 cloze contexts publish | `projectors/cloze.ts` + `adapter.ts:upsertClozeContext` + `adapter.ts:findLearningItemBySlug` | `candidateSlugs` consumed from `projectors/slugs.ts`. The prefix-match `ilike` fallback at legacy 760–773 stays in adapter (it's a query). Cloze contexts come from `clozeCreator.ts` agent. |
| 805–923 post-seed verification (steps 6.1–6.4) | `verify/seedIntegrity.ts` | Pure-ish (chunked reads + set ops). All reads via adapter helpers; the cross-check logic stays in `seedIntegrity.ts`. |
| 925–942 staging mark-published write-back | (deleted) | No staging files in revised architecture. |
| 947–963 deferral-only write-back branch | (deleted) | Same reason. Deferred-dialogue state, if persisted, lives in DB columns on `learning_items` (TODO per §11). |
| 965–966 final success log | `runner.ts` | |
| 968–976 POS coverage report | `runner.ts` (post-write hook) | Informational; uses existing `validatePOS`. |
| 978–981 catch / `process.exit(1)` | `runner.ts` | Convert to thrown `Error`; CLI shim does the exit. |
| 988–1003 `buildLintStagingCommand` | `runner.ts` (export) | Pure; one-liner re-export from `index.ts`. Keeps current CLI semantics. |

### Other moves outside the legacy file

| Source | New file | Notes |
|---|---|---|
| `src/lib/capabilities/capabilityCatalog.ts:164–192` (two `for` loops over `podcastSegments` and `podcastPhrases`) | `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts` | Extract verbatim. Pure function pattern preserved (input snapshot → ProjectedCapability[]). Default per §11: shared `CurrentContentSnapshot` type stays put; the new module reads only the podcast fields. |
| `scripts/lib/pipeline/lesson-stage/validators/grammarTopics.ts` (whole file) | `scripts/lib/pipeline/capability-stage/validators/grammarTopics.ts` | Move verbatim. `gate: 'GT1'` → CS-numbered. Lesson-stage's runner stops calling `validateGrammarTopics` (currently runs at runner.ts:100). Reason: `linguistStructurer` (now a capability-stage authoring agent) is what populates `content.grammar_topics`; validation belongs where production happens. |
| `scripts/lib/pipeline/lesson-stage/validators/grammarPattern.ts` (whole file) | `scripts/lib/pipeline/capability-stage/validators/grammarPattern.ts` | Move verbatim. `gate: 'GT7'` → CS-numbered. Lesson-stage's runner stops calling `validateGrammarPattern` (currently runs at runner.ts:120). Same reason as GT1: validates linguistStructurer's output. |
| `scripts/lib/pipeline/lesson-stage/validators/perItem.ts` (enrichment-field branches only — the `pos` / `level` / dialogue `translation_nl` warning paths the file's header comment flags as Phase-2 errors) | `scripts/lib/pipeline/capability-stage/validators/perItemEnrichment.ts` | Split. Display-field validation (`indonesian` + `dutch` / `english` on vocab; `text` + `speaker` on dialogue) stays in lesson-stage GT6 — that's lesson content. Enrichment-field validation moves and graduates from warning to error, since capability-stage's agents now produce those fields and a missing value is a real failure. |

---

## 5. Read-source deltas

Capability-stage's external input is `{ lessonNumber, lessonId, dryRun }` only. All other inputs come from DB or are produced internally:

```
Loaded from DB by loader.ts (keyed by lessonId):
  - lessons row             → for level + module_id + title
  - lesson_sections rows    → for projector grounding (e.g. dialogue lines feeding deferred-dialogue gate)
  - lesson_page_blocks rows → for source_ref linkage when emitting capability_content_units
  - audio_clips index       → for hasAudio flag on emitted vocab capabilities

Produced internally by authoring/ agents (no staging-file reads):
  - linguistStructurer       → vocabulary list (base_text, item_type, NL meaning, context_type, source_text), grammar patterns (slug, name, complexity), reference items
  - posTagger                → POS tags on vocabulary items (input to validators/pos.ts)
  - enTranslator             → EN translations on vocabulary items (input to upsertLearningItem meanings array)
  - clozeCreator             → cloze contexts (input to projectors/vocab.ts deferred-dialogue gate + projectors/cloze.ts)
  - grammarExerciseCreator   → exercise candidates with grammar_pattern_slug (input to projectors/grammar.ts)
  - vocabExerciseCreator     → exercise candidates without grammar_pattern_slug + curated distractors (input to projectors/grammar.ts vocab branch)
  - morphologyPairGenerator  → root/derived form pairs (Decision 3 input to projectors/morphology.ts; conditional)

Projected internally by projectors/:
  - projectors/vocab.ts      → content_units (vocab kind), learning_items, item_meanings, item_contexts, capabilities, capability_content_units
  - projectors/grammar.ts    → content_units (grammar kind), grammar_patterns, exercise_variants, capabilities, capability_content_units
  - projectors/cloze.ts      → item_contexts (cloze kind)
  - projectors/morphology.ts → conditional capabilities + capability_artifacts (root_derived_pair, allomorph_rule)
```

No staging-file reads remain. No staging-file writes remain.

---

## 6. Write-surface deltas

Only changed write targets listed. Default for everything else: no delta — same SQL as legacy line N. The **set** of tables written is identical to legacy; the difference is only that the input data is produced internally rather than read from staging files.

| Write target | Delta |
|---|---|
| `lesson_page_blocks` | **Removed.** Stage A's `upsertLessonPageBlocks` (`/tmp/phase2-inputs/lesson-stage-adapter.ts:123`) is the sole writer. Legacy duplicate at lines 226–244 deleted. |
| `lessons` | (already removed in Phase 1 per legacy header 16–18 — confirmed unchanged.) |
| `lesson_sections` | (already removed in Phase 1 — confirmed unchanged.) |

Full write surface (no deltas — every write performed by capability-stage):

| Target table | Key columns written | onConflict key | Produced by |
|---|---|---|---|
| `content_units` | content_unit_key, source_ref, source_section_ref, unit_kind, unit_slug, display_order, payload_json, source_fingerprint | content_unit_key | projectors/vocab.ts + projectors/grammar.ts (legacy 203–224) |
| `learning_capabilities` | canonical_key, source_kind, source_ref, capability_type, direction, modality, learner_language, projection_version, readiness_status, publication_status, source_fingerprint, artifact_fingerprint, metadata_json | canonical_key | projectors/vocab.ts + projectors/grammar.ts + projectors/morphology.ts (legacy 246–279) |
| `capability_content_units` | capability_id, content_unit_id, relationship_kind | (capability_id, content_unit_id, relationship_kind) | projectors/vocab.ts + projectors/grammar.ts + projectors/morphology.ts (legacy 281–297) |
| `capability_artifacts` | capability_id, artifact_kind, quality_status, artifact_ref, artifact_json, artifact_fingerprint | (capability_id, artifact_kind, artifact_fingerprint) | adapter.ts called from runner / morphology projector (legacy 299–316) |
| `grammar_patterns` | slug, name, short_explanation, complexity_score, confusion_group, introduced_by_lesson_id | slug | projectors/grammar.ts (legacy 386–420) |
| `learning_items` | base_text, item_type, normalized_text, language, level, source_type, pos | normalized_text | projectors/vocab.ts (legacy 491–504) |
| `item_meanings` | learning_item_id, translation_language, translation_text, is_primary | (delete-then-insert per learning_item_id; no upsert key) | projectors/vocab.ts (legacy 518–545) |
| `item_contexts` (anchor) | learning_item_id, context_type, source_text, translation_text, is_anchor_context, source_lesson_id | (learning_item_id, source_text) | projectors/vocab.ts (legacy 549–560) |
| `item_contexts` (cloze) | learning_item_id, context_type='cloze', source_text, translation_text, is_anchor_context=false, difficulty, topic_tag, source_lesson_id | (learning_item_id, source_text) | projectors/cloze.ts (legacy 783–799) |
| `exercise_variants` (grammar) | lesson_id, exercise_type, grammar_pattern_id, payload_json, answer_key_json, is_active | INSERT only (no upsert key — pre-existing legacy bug per §11) | projectors/grammar.ts (legacy 638–648) |
| `exercise_variants` (vocab) | context_id, exercise_type, grammar_pattern_id, payload_json, answer_key_json, is_active | INSERT only (no upsert key) | projectors/grammar.ts vocab branch (legacy 679–689) |

Removed write surfaces vs legacy: the three staging-file `fs.writeFileSync` calls at legacy 718–722, 938–941, 959–962. The revised module does not write to disk at all (other than logs).

---

## 7. Public API

Shape mirrors `runLessonStage` (`/tmp/phase2-inputs/lesson-stage-runner.ts:76–194`). Listed are deltas only.

### Input
```ts
interface CapabilityStageInput {
  lessonNumber: number
  lessonId: string         // from Stage A's LessonStageOutput.lesson.id
  dryRun?: boolean
}
```
Delta vs Stage A: gains `lessonId` (Stage A's output), drops `audioBudget`.

### Output
Mirrors `LessonStageOutput`. Counts replaced with: `{ contentUnits, capabilities, capabilityArtifacts, learningItems, exerciseVariants, clozeContexts, deferredDialogueChunks }`. `findings` use gate prefix `CS1…CSn` (capability stage) instead of `GT1…GT7`.

### Hooks
`{ loadFromDb?, createSupabaseClient?, agents?: { ... } }` — mirrors Stage A's hook seam plus a per-agent override map for tests (so agent calls can be replaced with fixtures without invoking LLMs).

---

## 8. The 5 decisions, folded-in

### Decision 1+2 — Seven authoring agents in `authoring/`

Each agent is a thin TS module the runner can invoke; no behavioural change to the agents themselves.

| File | Source | Agent name |
|---|---|---|
| `linguistStructurer.ts` | LIFTED from existing script | `linguist-structurer` |
| `vocabExerciseCreator.ts` | LIFTED from existing script | `vocab-exercise-creator` |
| `grammarExerciseCreator.ts` | LIFTED from existing script | `grammar-exercise-creator` |
| `clozeCreator.ts` | LIFTED from existing script | `cloze-creator` |
| `posTagger.ts` | NEW — TODO stub | `pos-tagger` |
| `enTranslator.ts` | NEW — TODO stub | `en-translator` |
| `morphologyPairGenerator.ts` | NEW — TODO stub | `morphology-pair-generator` (Decision 3 input) |

`linguist-reviewer` is **not** in this set — see §11 default for human-review placement.

Does NOT change: agent prompts, agent output schemas (TODOs locked by §11 defaults).

### Decision 3 — Pedagogical-prerequisite-driven `lesson_id`

Rule: morphology capabilities are `introduced_by_lesson_id = <lesson where the morphology rule (grammar pattern) is introduced>`. NOT the lesson the affixed form appears in. NOT the lesson where the underlying root word was first taught.

Concretely: lesson 9 introduces the meN- prefix grammar pattern. The `affixed_form_pair` capabilities for `beli → membeli` therefore have `introduced_by_lesson_id = lesson-9.id`, even though the root word `beli` is from lesson 1.

Where: enforced in `projectors/morphology.ts`. The projector reads Stage A's DB rows + the morphology rule slug set (locked by §11 default) + `morphologyPairGenerator.ts`'s output, and emits zero capabilities for lessons 1–8 (no morphology grammar pattern present in those lessons) and the conditional set from the lesson the rule is introduced onward.

Does NOT change: `learning_items` rows, `grammar_patterns` rows, the runtime capabilities catalog. Only `learning_capabilities.introduced_by_lesson_id` for morphology rows.

### Decision 4 — Podcast carve-out

**Where:** `scripts/lib/pipeline/podcast-stage/` is created with two files: `podcastProjectionRules.ts` (the two podcast blocks moved out of `capabilityCatalog.ts:164–192`) and `INVENTORY.md` (placeholder for the rest of the future deep module — loader, runner, adapter, agents, validators).

**DOES change:** `src/lib/capabilities/capabilityCatalog.ts` lines 164–192 are removed and re-emitted from `podcast-stage/podcastProjectionRules.ts`. Caller updates: `scripts/materialize-capabilities.ts`, `scripts/check-capability-health.ts`, `scripts/lib/content-pipeline-output.ts`, and `scripts/data/staging/podcast-warung-market/capabilities.ts` either invoke both projection functions (shared + podcast) or the orchestrator script merges results. Per §11 default: caller-side change is a one-line addition (call podcast rules alongside shared rules and concatenate the capability arrays).

**Does NOT change:** the rest of `capabilityCatalog.ts` (vocab, grammar, morphology blocks). The podcast deep module's full implementation (loader, runner, adapter, etc.) stays out of scope — only the projection rule extraction lands in this fold.

### Decision 5 — Two `capabilityCatalog.ts` bug fixes

- Lines 134–147: add `pattern_contrast` capability rule alongside `pattern_recognition` (same loop, second `createCapability` call). Purity preserved — both rules read `input.grammarPatterns` only.
- Lines 149–162: remove the `contextual_cloze` block from `projectCapabilities`; reimplement in `projectors/vocab.ts` driven by the in-module `clozeContexts` produced by `clozeCreator.ts`. Purity preserved — `projectCapabilities` no longer reads `dialogueLines` for this row family.

After Decision 5 + the Decision 4 podcast move, the shared `capabilityCatalog.ts` contains: vocab item rules (lines 47–132), grammar pattern rules (lines 134–147 with the new `pattern_contrast` rule added per Decision 5a), morphology rules (lines 194–224). The dialogue-line block (149–162, removed per Decision 5b) and the two podcast blocks (164–192, moved per Decision 4) are gone. Net effect on `capabilityCatalog.ts`: one rule loop added, three rule loops removed.

Does NOT change: `CAPABILITY_PROJECTION_VERSION` semantics (versions bumped when emission set changes — the spec assumes a bump; pre-fold checklist confirms).

---

## 9. Caller migration

In `scripts/publish-approved-content.ts`, replace:
```ts
await publishLegacyStageB({ lessonNumber, lessonId, dryRun })
```
with:
```ts
const stageA = await runLessonStage({ lessonNumber, dryRun })
if (stageA.status !== 'ok') return  // short-circuit before Stage B
await runCapabilityStage({ lessonNumber, lessonId: stageA.lesson.id, dryRun })
```

Caller short-circuits if Stage A returns `status !== 'ok'` before invoking Stage B — Stage A returns `lesson.id = ''` on validation failure (`lesson-stage-runner.ts:134`), and passing that empty string to capability-stage will fail downstream DB lookups.

Same PR deletes `scripts/lib/pipeline/capability-stage-legacy.ts` (default per §11). One-line CLI change beyond the short-circuit; no other caller exists (verified: legacy file is exported only via `publishLegacyStageB` + `buildLintStagingCommand`).

---

## 10. Test fold

Existing `scripts/__tests__/` files that move:

| Existing test | New location | Notes |
|---|---|---|
| any `publishLegacyStageB`-shaped test | `scripts/lib/pipeline/capability-stage/__tests__/runner.test.ts` | Rename suite; same cases. Replace staging-file fixture loading with agent-output fixtures via the `agents?` hook map. |
| `candidateSlugs` direct-call tests | `scripts/lib/pipeline/capability-stage/__tests__/projectors/slugs.test.ts` | Pure function — direct port. |
| deferred-dialogue gate cases | `scripts/lib/pipeline/capability-stage/__tests__/projectors/vocab.test.ts` | Pure-projector tests; no DB mocks needed. |

No new test cases listed. If the legacy file was untested for any branch (PGRST205 grammar-patterns-table fallback at legacy 409–412, ilike prefix fallback at legacy 760–773), the fold preserves the behaviour — new tests optional, not required to land the fold.

---

## 11. Pre-fold checklist

Each item is a binary decision with a default. User must confirm or override BEFORE the fold begins. No design exploration in answers — pick the default or supply the alternative.

1. **Default: morphology projector detects rule-presence by hardcoded slug set in `projectors/morphology.ts`.** Confirm or specify alternative source (DB column, separate JSON manifest).
2. **Default: legacy `exercise_variants` re-run duplicate-row bug (no upsert key on insert at legacy 638–648, 679–689) is preserved as-is — write parity.** Confirm or fix in this fold (would require schema change to add a unique key).
3. **Default: morphology-pair-generator output schema = single pair per call, free-text `allomorphRule`, no confidence score.** Confirm or specify schema additions.
4. **Default: vocab-exercise-creator output schema = curated-distractor list keyed by `learning_item_slug`, no quality grade.** Confirm or specify.
5. **Default: `CAPABILITY_PROJECTION_VERSION` is bumped when Decision 5's emission-set changes land.** Confirm or specify a no-bump migration path.
6. **Default: legacy file `scripts/lib/pipeline/capability-stage-legacy.ts` is deleted in the same PR as the fold lands.** Confirm or specify a deprecation window.
7. **Default: `process.exit(1)` calls in legacy (lines 126, 481, 848, 879, 920, 980) become thrown `Error`s; the CLI shim in `publish-approved-content.ts` does the single top-level exit.** Confirm or specify per-call behaviour.
8. **Default: `podcast-stage/INVENTORY.md` is the only narrative artifact alongside `podcastProjectionRules.ts`; no `index.ts`, no exports beyond the rule function the four callers need.** Confirm or specify scaffolding.
9. **Default: the 7 `authoring/` files are wired but the 3 NEW agents (`posTagger`, `enTranslator`, `morphologyPairGenerator`) ship as TODO stubs that throw `NotImplementedError` when invoked.** Confirm or specify a different stub behaviour.
10. **Default: each authoring agent's output is consumed in-memory by the projector that needs it; no intermediate caching layer or working-table persistence.** Re-running capability-stage on the same lesson re-invokes every LLM call from scratch. Confirm or specify a per-agent skip-if-already-written rule (e.g. fingerprint check against `learning_items.normalized_text` set, against `grammar_patterns.slug` set, against `exercise_variants` count).
11. **Default: `linguist-structurer`'s intermediate outputs (pattern brief, vocabulary pool) are NOT persisted to DB — only the structured outputs that map to existing tables (`learning_items`, `grammar_patterns`, `item_contexts` rows) are written.** Confirm or specify a working-table schema.
12. **Default: agents fire in dependency order — `linguistStructurer` first, then `posTagger` + `enTranslator` in parallel against its output, then `clozeCreator` + `grammarExerciseCreator` + `vocabExerciseCreator` in parallel, then `morphologyPairGenerator` if the conditional fires.** Confirm or specify alternative order.
13. **Default: capability-stage is non-resumable — a failed run re-invokes all agents from scratch on retry.** Confirm or specify a per-agent skip-if-already-written rule (interacts with #10).
14. **Default: the human review step (linguist-reviewer in the existing authoring flow, producing `review-report.json`) is NOT folded into capability-stage. Review happens live in the app via the admin account, per CLAUDE.md "Publishing policy: Everything publishes immediately."** Confirm — if review must happen, where in the flow does it land (pre-write gate? post-write annotation? separate stage?).
15. **Default: deferred-dialogue state is persisted via a `learning_items.review_status='deferred_dialogue'` column write inside `adapter.ts:upsertLearningItem` (replacing the legacy staging-file write-back at 925–942).** Confirm or specify alternative persistence.
16. **Default: shared `CurrentContentSnapshot` type stays in `src/lib/capabilities/capabilityTypes.ts`.** The podcast rule module reads only the `podcastSegments` and `podcastPhrases` fields. Confirm or specify a split into shared + podcast-extension types.
17. **Default: callers of `projectCapabilities` (`materialize-capabilities.ts:268`, `check-capability-health.ts:441`, `content-pipeline-output.ts:360`, `podcast-warung-market/capabilities.ts:5`) get a one-line additive update — they call the podcast rule function alongside `projectCapabilities` and concatenate the capability arrays.** Confirm or specify alternative wiring.
18. **Default: `scripts/data/staging/podcast-warung-market/` staging directory is left intact in this fold; its retirement is deferred to the podcast deep module's full fold.** Confirm or specify retirement now.
19. **Default: lesson-stage's `runner.ts` is edited as part of this fold to remove three validator calls (`validateGrammarTopics` line 100, `validateGrammarPattern` line 120, the enrichment branches inside `validatePerItem` line 119) and the corresponding files (`validators/grammarTopics.ts`, `validators/grammarPattern.ts`, the enrichment half of `validators/perItem.ts`) are deleted from lesson-stage.** This is a Stage A modification despite earlier "fold doesn't touch Stage A" framing — the boundary moved when grammar topics + grammar patterns + enrichment fields became capability-stage concerns. Confirm or specify alternative (e.g. keep validators in place as no-ops; leave display-half perItem in lesson-stage but move enrichment-half via a wrapper).
20. **Default: capability-stage uses `normalizeTtsText` (`scripts/lib/tts-normalize.ts` — `text.toLowerCase().trim().replace(/\s+/g, ' ')`) for the `audio_clips.normalized_text` lookup that drives `hasAudio` on emitted vocab capabilities, NOT the legacy `base_text.toLowerCase().trim()` (lower + trim only, no whitespace collapse) at `capability-stage-legacy.ts:497`.** Aligns the lookup key with what `audio.ts:71` actually wrote during Stage A. Without this alignment, items authored with stray double-space or tab whitespace silently miss the lookup and never get `audio_recognition` / `dictation` capabilities. Confirm or specify alternative normalization.
21. **Default: every projector returns a `declaredCount` manifest naming each write surface it touched and how many rows it intends to land for this lesson.** `verify/countParity.ts` runs after all writes complete and queries DB filtered by `lesson_id` (or equivalent source_ref pattern for tables without a lesson_id column) and asserts `db_count >= declaredCount`. Strict equality fails on re-runs that pick up rows from prior runs — `>=` is the safer default. Confirm or specify alternative tolerance (strict equality, exact diff with delete-and-recreate, etc.).
22. **Default: `verify/contentNonEmpty.ts` runs the following per-row presence checks on rows written for this lesson, after all projector writes complete:** `learning_capabilities` (`canonical_key`, `capability_type`, `source_ref` non-empty); `capability_artifacts` (`artifact_kind`, `artifact_ref` non-empty + `artifact_json` not `{}`); `learning_items` (`base_text`, `normalized_text`, `item_type` non-empty); `item_meanings` (`translation_text` non-empty); `item_contexts` (`source_text` non-empty); `exercise_variants` (`payload_json` and `answer_key_json` not `{}`); `grammar_patterns` (`slug`, `name` non-empty); `content_units` (`content_unit_key`, `unit_kind` non-empty + `payload_json` not `{}`); `capability_content_units` (junction — both FKs non-null). Any violation throws and the runner returns `status: 'partial'` with the offending row IDs in `findings`. Confirm or specify additional fields.
23. **Default: seed hooks (`countParity` + `contentNonEmpty` + `seedIntegrity`) fire AFTER all projector writes complete, BEFORE the runner returns `status: 'ok'`.** On any seed-hook failure, the runner returns `status: 'partial'` with the failing hook's findings; on multiple failures, all findings are aggregated. Confirm or specify alternative ordering (e.g. fire after each projector instead of at the end of the runner) — the trade-off is between localizing failure (per-projector) and surfacing the full picture (aggregate at end).
