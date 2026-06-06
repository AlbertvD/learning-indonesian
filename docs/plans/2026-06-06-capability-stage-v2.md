---
status: approved
implementation: null
reviewed_by: [architect, data-architect]   # both signed off 2026-06-06 round 3 (architect: APPROVE; data-architect: APPROVE)
supersedes:
  - epic #98 open tail (Slice 5b remainder #147, item-cloze #148, the naming migration) — folded in, see §9
---

# Capability Stage v2 — clean source→target redesign of the capability & exercise model

**This is the overarching (umbrella) spec.** Each `source_kind` is built as an independent vertical slice (§9) carrying its own sub-spec through design → review → build → test → deploy. This document fixes the target every slice lands on.

## 1. Why

A grilling session (2026-06-06) established that the capability/exercise model's debt is **structural, not cosmetic**: capability types conflate `(source × direction × modality × level)` on inconsistent naming axes, format leaks into capability identity, and the level/format mismatches (a produce capability rendered as an MCQ; `pattern_recognition` rendering production drills) are the live bug class. Per `feedback_target_state_over_minimal_diff`, we take the durable target.

Two facts make a from-scratch rebuild cheap and safe **here**:
- **Single learner, FSRS history disposable** (test data only). So we truncate `learner_capability_state` / `capability_review_events` / `learner_lesson_activation` and rebuild — no identity migration, no `canonical_key` remap.
- **Lesson content is re-derivable** (ADR 0011 pipeline-is-writer): the *source* regenerates from staging via re-publish; only disposable learner state is lost.

The conceptual model, naming convention, and the level-belongs-to-capability literature resolution are in `docs/current-system/capability-and-exercise-model.md`.

## 2. Grounding in the target architecture (required pre-flight)

| Target-arch surface | Constraint | How this spec lands |
|---|---|---|
| **canonical-key lock** (`target-architecture.md:1490`) | "Any change orphans every learner's state. Refactor only its physical location, never its logic." | We change the key — **permitted only because learner state is truncated** (§1). Guarded by: a **version bump** `cap:v1:`→`cap:v2:` (§3 D1a); a **pre-write gate** refusing a v2 key while any pre-v2 learner-state row survives (§7, three-layer); and a stated **deploy order** (§9a). |
| **`lib/capabilities/` — SHARED, LOCKED** (`:832`) | Canonical-key contract shared runtime↔pipeline. | Key + contract change **in lockstep, one commit**. Pipeline writes; runtime **reads the `level`/axis columns + the GENERATED `capability_type`, not the key string** (they're decoupled — `adapter.ts:37,53,119` — which is why dropping `capability_type` from the v2 key is safe). The real lockstep is `derive_capability_type` ↔ the `CapabilityType` enum (§3d + health check). The only legitimate way to touch a LOCKED module. |
| **`lib/distractors/` — runtime cascade, LOCKED** (`:582`) | Runtime picks k-of-N from a pool via the 6-tier cascade. | **RETIRED** (not relocated — v2's POS+embedding selection is a different algorithm). Its runtime callers (`recognitionMcq.ts`, `cuedRecall.ts`, `clozeMcq.ts`, `listeningMcq.ts`) lose the curated-then-cascade fallback; completeness is instead **guaranteed** by a distractor-coverage gate (§7). Target-arch LOCKED entry is amended in Slice 1. |
| **`lib/exercise-content/` — LOCKED** (`:441`) | `resolveBlock` → `CapabilityRenderPlan`; `byType/` packagers. | Reader changes (new tables + level-matched set). **byType surgery is not 1:1:** (a) drop `speaking.ts` (12→11), (b) strip the item branch from `clozeMcq.ts` (grammar-only now), (c) thread the `level` field. Touched, not folded (already folded 2026-05-21). |
| **`lib/capabilities/renderContracts.ts:167-178`** | Module-load IIFE asserting contract completeness. | **This is the level-match seam** — each `RENDER_CONTRACTS` entry gains a `level`; a sibling IIFE asserts no exercise serves a cap at a different level. (NOT the byType packagers — they consume the contract.) |
| **Pipeline = Plate IV, `scripts/lib/pipeline/`** (`:1118`) | Capability stage lives here. | v2 redesigns `scripts/lib/pipeline/capability-stage/`. |
| **Migration source-of-truth** (`migration.sql:24-30`, `target-architecture.md:1502`) | Base capability `CREATE`s live in standalone **`scripts/migrations/2026-04-25-capability-core.sql`** (a single `begin;…commit;` block creating **7** tables) + `2026-05-02-capability-resolution-failures.sql`, **not** `migration.sql`. | Slice 1 **folds the 4 LIVE tables only** — `learning_capabilities`, `capability_aliases`, `capability_review_events`, `learner_capability_state` (+ `capability_resolution_failure_events` from the 05-02 file) — into `migration.sql`. **Do NOT fold the 3 RETIRED tables** in the same file: `capability_artifacts` (dropped Slice 4b #102), `learner_source_progress_state`/`_events` (retired #6). Since the source is one transaction, Slice 1 must grep-confirm no still-applied migration drops/references a folded table mid-`begin/commit` (bulk-drop hazard). |
| **`make migrate-idempotent-check`** (`:1491`) | Applies `migration.sql` twice; second run must be green. | Schema DDL is `CREATE/ALTER … IF NOT EXISTS`. **Truncate + re-publish are one-shot ops steps, NOT in `migration.sql`** (so the idempotency check is unaffected — §9a). |
| ADR 0007 / 0009 / 0011 / 0012 | Receptive-before-productive; typed-table-per-concept; DB-authoritative; stage responsibilities (+ 2026-06-06 audio amendment) | Honored; see §3, §5, §7. **All 6** `CapabilityType`-keyed surfaces (not just `pedagogy.ts`) are re-derived from the new `level`/axes in Slice 1 — enumerated in §3d. Renaming the enum alone compiles but silently ships the v1 mis-level (arch C-arch-2). |

## 3. The model (settled decisions)

1. **Explicit axis columns.** `learning_capabilities` gains **`level`** joining `source_kind`/`direction`/`modality`/`learner_language`.
   - **D1a — key format.** `canonical_key` = `cap:v2:<source_kind>:<source_ref>:<direction>:<modality>:<level>:<learner_language>` (current is `cap:v1:…` with no `level` segment — `canonicalKey.ts:31`). The **`v2` prefix makes any stray v1 key detectable**. Changed in lockstep in `lib/capabilities/canonicalKey.ts`.
   - **D1b — `capability_type` is a Postgres GENERATED column** driven by `indonesian.derive_capability_type(source_kind, direction, modality, level) → text` (writer + reader agree by construction; idempotent `CREATE OR REPLACE FUNCTION`). The `CapabilityType` enum rename in `capabilityTypes.ts` ships in the **same commit** as the generated column (else session-build silently no-matches — DA M3).
   - CHECK: `level in ('recognise','recall','produce')`; uniqueness on `(source_ref, direction, modality, level)`.
2. **Audio is its own skill** (`modality='audio'`), gated on the item having an audio clip.
3. **Grammar splits by level:** `recognise_grammar_pattern` + `produce_grammar_pattern`; `pattern_contrast` becomes a contrast *exercise format* of recognition.
4. **Level-match invariant** at `renderContracts.ts` (§2). Item cloze is **production-only** (drop item `cloze_mcq`; `cloze_mcq_item_distractors` dropped — 0 live rows, verified DA I2).
5. **All generated content keyed by `capability_id`.**
6. **One `distractors` table with a `distractor_kind` discriminator** (DA C1) — not two tables, not a kind-less blob.
7. **Deterministic-first generation:** cloze + distractors **selected** (not generated); semantic quality via **embeddings**; LLM (Opus) authors **grammar only** + validators + self-review.

**Level belongs to the capability, not the exercise** (literature resolution — model doc §7 box). `l1_to_id_choice` relabelled `meaning_recall`→**recognition**.

### 3a. Capability set
`level ∈ {recognise, recall, produce}`. (Set unchanged from the prior draft — see model doc §3a / spec history.) `recognise_meaning_from_text|audio`ᵃ, `recall_meaning_from_text`, `recognise_form_from_meaning`, `produce_form_from_meaning|audio`ᵃ`|context`; dialogue `produce_form_from_context`; grammar `recognise|produce_grammar_pattern`; morphology `recognise_word_form_link`/`produce_derived_form`; podcast `recognise_gist_from_audio` (deferred). ᵃaudio-gated.

### 3b. Tables
- **`learning_capabilities`** + `level` (CHECK) + GENERATED `capability_type` + `cap:v2:` `canonical_key`.
- **`distractors`** — `capability_id` PK references learning_capabilities, `distractor_kind text not null CHECK (distractor_kind in ('meaning','form'))`, `options text[] not null`. Replaces `recognition_mcq_distractors` (`kind='meaning'`) + `cued_recall_distractors` (`kind='form'`); reader filters by `distractor_kind`.
- **`cloze`** — `capability_id`, **`dialogue_line_id uuid references lesson_dialogue_lines(id)`** (NOT NULL for `dialogue_line`-sourced rows via CHECK; preserves the ADR-0011 seeded-state signal `loadFromDb.ts` reads — DA M1), `sentence_with_blank`, `answer`, `translation`. Supersedes `dialogue_clozes`; the loader's `seededDialogueLineIds` is repointed to this table.
- **4 grammar exercise typed tables** — add `capability_id` (the render key); **retain `grammar_pattern_id` + `lesson_id` as secondary columns** so `coverageService` keeps its single-table query (DA C2 expand path). Consumers enumerated in §3c.
- **`item_embeddings`** side table (`learning_item_id` PK, `embedding vector(N)`) — **not** a column on `learning_items` (avoids widening a high-read table — DA M2). `CREATE EXTENSION IF NOT EXISTS vector`.
- All new tables/non-obvious columns carry `COMMENT ON` (ADR 0009 — DA m2).

### 3c. Consumer enumeration for the grammar rekey (per `feedback_enumerate_consumers_before_removing_read`)
Three live readers of `grammar_pattern_id` on the grammar exercise tables, all rewritten **in the same PR** as the rekey (Slice 3):
1. `src/lib/exercise-content/byKind/pattern.ts:110` — `.in('grammar_pattern_id', …)` runtime renderer → switches to `capability_id`.
2. `src/services/coverageService.ts:96,109,110,163-165` — keeps reading `grammar_pattern_id`/`lesson_id` (retained as secondary columns).
3. `src/services/contentFlagService.ts:19,34,43,86` — flag→agent loop anchor; reconciled to the retained `grammar_pattern_id`.

### 3d. `CapabilityType`-keyed consumers (the enum rename breaks ALL of these — arch C-arch-2)
The rename compiles under TS exhaustiveness, so a builder can rename the enum and **still silently ship the v1 mis-level**. Slice 1 re-derives every level-bearing surface from the new `level`/axes (not the type string), same commit as the enum rename (`feedback_enumerate_consumers_before_removing_read`). The six surfaces (grep `CapabilityType`):
1. **`capabilities/capabilityTypes.ts:233` `deriveSkillTypeFromCapabilityType` — THE mis-level fix lands here.** It returns `meaning_recall` for `l1_to_id_choice` today (`:244`); the v2 replacement must return **recognition**. Renaming the enum alone leaves this mapping wrong — the exact bug the model doc §7 box promises to fix.
2. `session-builder/pedagogy.ts:149` `capabilityPhase` (ADR 0007 staging) — re-derive from `level`.
3. `session-builder/labels.ts:107` `capabilityDisplay` — re-map.
4. `session-builder/adapter.ts:120` — consumes #1 via `deriveSkillTypeFromCapabilityType(row.capability_type)`.
5. `mastery/masteryModel.ts:134` `dimensionForCapability` — re-map (types → dimensions).
6. `capabilities/renderContracts.ts:182` `exerciseTypesForCapability` — re-map to v2 types + the `level` field.

## 4. Exercise set + level-match
`_ex` packagers (`lib/exercise-content/byType/`): **recognise** — `choose_meaning`, `choose_form`, `choose_meaning_from_audio`, `contrast`, `cloze_mcq` (grammar only); **recall** — `type_meaning`; **produce** — `type_form`, `type_form_from_audio`, `type_missing_word`, `transform_sentence`, `translate_sentence`. `speaking` dropped. The level-match invariant lives in `renderContracts.ts` (§2). Discourse-listening + speaking deferred but model-ready.

## 5. Audio (ADR 0012 amendment — accepted as a refinement, not a new ADR; arch W5)
Lesson/dialogue audio → Lesson Stage; per-item word audio → Capability Stage by **reuse-then-gap-fill**. **Seam closed (was §10 Q3):** the gap-fill is a **capability-stage-invoked shared audio service** — lesson-stage pre-generation would invert the stage dependency (ADR 0012:43 sequenced-not-concurrent). Writes to the existing `indonesian-tts` bucket; the no-disk rule forbids staging-file I/O, not bucket writes. **Approving this §5 moves the ADR 0012 audio amendment from *proposed* → *accepted*** — done in the Slice 1 PR (arch W5).

## 6. Generation pipeline (deterministic-first)
Read Stage-A tables (DB-only) → project capabilities (axis columns + `level` + GENERATED label + `cap:v2:` key) → embed pool meanings (`pgvector` side table) → **select** distractors (same-POS ∧ in-pool ∧ ≠answer ∧ not-morph-variant ∧ embedding-cosine band ∧ orthographic boost; `distractor_kind` set from the cap's level/direction) + clozes (real sentence ∧ token-ceiling ∧ content-word blank ∧ pool word ∧ accept-original; only words in real sentences) → **author** grammar (Opus, shared principles → validators → self-critique/revise → drop-not-repair) → audio reuse-then-gap-fill → gate (§7) → rebuild (§9a). Cutover bug classes vanish by construction; each is a **failing test** in its slice (arch N2).

## 7. Gates (three-layer per `project_three_layer_invariant_gates`)
Each cross-module invariant gets shared helper + unit test, pre-write validator, live-DB health check — **same PR**:
- **canonical-key v2 guard** — pre-write validator refuses a v2-keyed write while any pre-v2 row survives, **prefix-detecting `cap:v1:` on `learner_capability_state.canonical_key_snapshot`** (NOT `count(*)>0` — else it self-defeats on the first routine re-publish after cutover, when the table legitimately holds v2 rows; arch NOTE). Health check asserts no `cap:v1:` keys remain (arch C1).
- **level-match** — shared `level(exerciseType)`/`level(cap)` helpers; `renderContracts.ts` module-load assertion; health check `content.cap.level ≡ exercise.level` (name the HC# in the slice sub-spec — DA I3).
- **distractor coverage** — every MCQ cap has a `distractors` row (replaces the retired runtime cascade fallback — arch W1).
- **capability_id FK integrity** across all content tables.

## 8. Skill coverage (honest)
Reading **strong**; word-level listening **real** (audio gap-fill); constrained writing **covered**; discourse listening + speaking **deferred, model-ready**. Speaking later needs speech-assessment infra.

## 9. Rollout — vertical slices by `source_kind`
`vocabulary_src` is **Slice 1** (shared substrate: distractors select from the pool, cloze blanks are pool words, embeddings draw on it) and brings the shared infra. Folds in the #98 tail.

| Slice | Source | Brings shared infra | E2E deliverable |
|---|---|---|---|
| 1 | `vocabulary_src` | capability schema + `level` + GENERATED label + `cap:v2:` key + base-table DDL fold; **`distractors` table; `cloze` table** (vocab item cloze is a Slice-1 deliverable — DA/arch W6); `pgvector` + `item_embeddings`; audio service; the three gates; `pedagogy.ts` phase re-derivation | vocab MCQ/typed/dictation/cloze + distractors |
| 2 | `dialogue_line_src` | (cloze table already exists; adds `dialogue_line_id` usage) | dialogue cloze |
| 3 | `grammar_pattern_src` | 4 grammar tables (capability_id + retained pattern/lesson cols) + the 3-consumer rewrite (§3c) | recognise/produce grammar (Opus) |
| 4 | `word_form_pair_src` | affixed table | morphology |
| defer | `podcast_segment_src`, discourse-listening, speaking | — | model-ready |

### 9a. Deploy order (the rekey is destructive — arch C1c)
Per slice, behind a maintenance window: **(1)** apply `migration.sql` (idempotent DDL) → **(2)** one-shot ops: truncate learner-state tables → **(3)** re-publish all lessons (regenerates capabilities with `cap:v2:` keys) → **(4)** deploy runtime that decodes v2. Old v1 keys are abandoned wholesale (not migrated). Truncate + republish are **outside** `migration.sql` so `make migrate-idempotent-check` (no publish between its two runs) is unaffected (arch W4).

### 9b. Slice 1 sub-spec MUST specify (deferred detail from round-2 review)
These were accepted as slice-level by both reviewers; tracked here so they are not lost:
- **distractors writer/reader/validator triangle** (DA NEW-M1): name the pipeline writer, the `byKind/item.ts` reader (filters on `distractor_kind`), and the validator — plus the `renderContracts.ts` change in the **same commit**.
- **cloze `dialogue_line_id` enforcement** (DA NEW-M2): denormalise `source_kind` onto `cloze` so the partial CHECK is DB-enforceable (`source_kind='dialogue_line' ⇒ dialogue_line_id NOT NULL`), or a named alternative with rationale.
- **distractor-missing runtime contract** (arch W): with `lib/distractors` retired there is **no fallback** — define the surface when a curated `distractors` row is absent/`<3` (a typed `reasonCode` resolution failure, never a blank/short card; the coverage gate makes it shouldn't-happen, but every user-reachable failure needs a defined surface per CLAUDE.md).
- **transaction-drop hazard** (arch W): grep-confirm no still-applied migration references a dropped table (`recognition_mcq_distractors`, `cued_recall_distractors`, `cloze_mcq_item_distractors`, `dialogue_clozes`) inside a `begin/commit`.
- **HC numbers** for the level-match + `cap:v1:`-absent health checks.
- **NEW-m1 (doc-only):** note that `capability_type` (GENERATED) and `canonical_key` both derive from the same 4 axes — no circular dependency (both are deterministic functions of the column values; the key is a string concat, the column a function call).

## Supabase Requirements

### Schema changes (`scripts/migration.sql`)
- **Fold the 4 LIVE capability tables** (`learning_capabilities`, `capability_aliases`, `capability_review_events`, `learner_capability_state`) from `scripts/migrations/2026-04-25-capability-core.sql` + `capability_resolution_failure_events` from `2026-05-02-capability-resolution-failures.sql` into `migration.sql`; **exclude** the 3 retired tables in the core file (arch C2). Then: add `level` (CHECK); GENERATED `capability_type` + `derive_capability_type` function (DA M3); `cap:v2:` key.
- **New `distractors`** (capability_id PK, `distractor_kind` CHECK, options text[]); **drop** `recognition_mcq_distractors`, `cued_recall_distractors`, `cloze_mcq_item_distractors` (0 rows).
- **New `cloze`** (capability_id, `dialogue_line_id` FK + CHECK, sentence_with_blank, answer, translation); supersede `dialogue_clozes`.
- Grammar tables: add `capability_id`; retain `grammar_pattern_id`+`lesson_id`.
- `CREATE EXTENSION IF NOT EXISTS vector` (already installed 0.8.0 in `extensions` schema — idempotent no-op); **new `item_embeddings`** side table with `embedding extensions.vector(N)` (schema-qualified type).
- `COMMENT ON` all new tables/columns.
- **Truncate (ops step, not in `migration.sql`):** `learner_capability_state` (483 rows), `capability_review_events` (947), `learner_lesson_activation` (38). **Consequence: the single learner re-activates all lessons after rebuild** (DA m1) — expected, not a bug.

### homelab-configs changes
- [x] **PostgREST:** N/A (`indonesian` exposed).
- [x] **Kong CORS:** N/A.
- [x] **GoTrue:** N/A.
- [x] **Postgres image — `pgvector`:** ✅ **CONFIRMED present** (queried 2026-06-06: `pg_available_extensions` → `vector` installed_version **0.8.0**, in the **`extensions`** schema; same shared instance openbrain uses). **No Dockerfile change needed** — gate cleared. **DDL note:** the type is `extensions.vector(N)` (schema-qualified — the extension is in `extensions`, not the `indonesian` search_path).
- [x] **Storage:** N/A — audio gap-fill writes the existing `indonesian-tts` bucket.

### Health check additions
- `check-supabase.ts` (anon): new tables reachable; `level` CHECK present.
- `check-supabase-deep.ts` (service): level-match holds for every content row; no null/invalid `level`; every audio cap has a clip; `capability_id` FK integrity; **no `cap:v1:` keys remain**; `derive_capability_type` output matches the `CapabilityType` enum. (Live-DB arms of §7.)

## 10. Resolved review questions (round 1)
- **Q1 lib/distractors** → RETIRE; delete runtime fallback; distractor-coverage gate (§7).
- **Q2 canonical-key** → cleared by data-architect (truncate removes orphan risk); `cap:v2:` format written (§3 D1a).
- **Q3 audio placement** → capability-stage shared audio service (§5).
- **Q4 embeddings** → `item_embeddings` side table; cosine band tuned in Slice 1 (§3b).
- **Q5 derived label** → GENERATED column + function (§3 D1b).
- **Q6 level grid** → vocab {recognise,recall,produce}; grammar/morphology {recognise,produce}; sparse-by-design.

## 11. Review history
- **Round 1 (2026-06-06):** architect **REVISE** (C1 key-guard, C2 migration source-of-truth, C3 pgvector homelab, W1–W6); data-architect **REVISE** (C1 distractor discriminator, C2 grammar-rekey consumers, M1 cloze FK, M2 pgvector, M3 generated label, m1/m2, I1 key cleared). All addressed → round 2.
- **Round 2 (2026-06-06):** both confirmed the round-1 fixes landed + the design is durable. architect **REVISE** — 2 CRITICAL: (a) fabricated fold-path `2026-04-25/05-02-*.sql` (real: `2026-04-25-capability-core.sql`, 7 tables incl. 3 retired) → fixed in §2/Supabase Reqs with the 4-live/3-retired enumeration; (b) incomplete `CapabilityType` consumer enumeration (only `pedagogy.ts` named; the mis-level lives in `deriveSkillTypeFromCapabilityType:244`) → fixed via §3d (all 6 surfaces). data-architect **REVISE** — 2 MAJOR scoped to the Slice 1 sub-spec (distractors triangle NEW-M1; cloze CHECK NEW-M2) → captured in §9b; NEW-m1/m2 (doc + vocab) addressed. Warnings/notes folded into §2/§5/§7/§9b. Re-dispatched both for round 3.
- **Round 3 (2026-06-06):** **architect APPROVE** (verified the fold path exists, 7-table count, live/retired split — retired tables already dropped in `migration.sql:1956,1803`, so excluding them is correct; all 6 §3d consumer cites exact; no missed 7th consumer; warnings folded). **data-architect APPROVE** (umbrella correctly defers NEW-M1/M2 to Slice 1 with action-verbed requirements; vocab aligned; no circular dependency; round-1 resolutions intact). **Dual sign-off → `status: approved`.**

---

**Next:** architect + data-architect round 2. On dual sign-off → `status: approved`, `reviewed_by: [architect, data-architect]` → cut the Slice 1 (`vocabulary_src`) sub-spec.
