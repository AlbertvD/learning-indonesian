---
status: approved
implementation: null
epic: "#98"
issue: "#100"
architect_review: "APPROVED 2026-05-31 (2 rounds; all 4 round-1 CRITICALs verified resolved against code; 3 implementation-time NOTES folded in). Forward-looking design — safe to implement; OQ2-1..4 resolved at implementation time."
supersedes: []
depends_on: "#99 (PR #121, shipped 2026-05-31) — the DB→DB spine + Capability Gate"
grounded_against_code: 2026-05-31
grounded_against_db: 2026-05-31
decisions_proposed:
  OQ2-1: "(A) in-stage generation — port grammar-exercise-creator into the stage (mirrors Slice-1 OQ-1=A); grammar exercises + examples generated in-stage from the DB grammar sections"
  OQ2-2: "pattern-level generation gate is the SOLE idempotency mechanism (the 4 exercise tables have only a surrogate id PK — no per-row skip possible)"
  OQ2-3: "decommission exercise_variants correctly — the 'shared id' premise was FALSE (typed tables mint own uuids; exerciseReviewService already reads typed). Real work: repoint coverageService.ts:78 (handling its vocab context_id path) + resolve the exercise_review_comments FK, THEN stop the write"
  OQ2-4: "grammar_pattern_examples has NO reader in src/ — decide (wire a reader / generator-input-only / cut it) before building; examples source is lesson_section_grammar_categories.examples, NOT _grammar_topics"
---

# Capability Stage Redesign — Slice 2: `pattern` source_kind end-to-end

> **For Claude:** REQUIRED SUB-SKILL: superpowers:executing-plans. This extends the **shipped** Slice-1 spine (#99 / PR #121) to the `pattern` source kind. It is a **redesign, not a fold** (ADR 0011/0012/0013). **Read the Slice-1 plan first** (`docs/plans/2026-05-27-capability-stage-slice-1-item-db-spine.md`) — this plan reuses its seams (`loadFromDb`, the idempotent writers, `runCapabilityGate`, the in-stage generator pattern) and, crucially, its **hard-won live-trial lessons** (see "Lessons from Slice 1" below — they are requirements here, not history).

**Goal:** Deliver the `pattern` source kind on the DB→DB spine — interpret grammar patterns from the typed grammar sections in the DB, **generate** grammar examples + grammar exercises in-stage (port the `grammar-exercise-creator` agent), write `grammar_pattern_examples` (0 rows today) + the four typed grammar-exercise tables, retire the `exercise_variants` dual-write (after repointing its readers), subsume `publish-grammar-candidates.ts`, add the Capability Gate's **pattern-kind layer** (relocating the pattern checks off `lint-staging`), and idempotently seed — validated by a mandatory live trial.

**Architecture:** Same deep-module shape as Slice 1 — the database is the entire external interface. The import seam (`loadFromDb`) extends to read the typed grammar sections (`lesson_section_grammar_categories` / `_grammar_topics` from PR 6) + current pattern capability state; generation (LLM, in-stage) produces grammar examples + exercises; pure projectors fan out to `grammar_patterns` / `grammar_pattern_examples` / the 4 typed exercise tables; the idempotent export seam writes typed tables only. The **central new constraint**: the four exercise tables have **only a surrogate `id` PK and no natural key**, so per-row skip-if-exists is impossible — a **pattern-level generation gate** is the only thing preventing duplicate exercises on re-run.

**Tech Stack:** TypeScript + Bun; Supabase JS (service-role) in `scripts/lib/pipeline/capability-stage/`; `@anthropic-ai/sdk` for in-stage generation (mirroring `enrichPos.ts` / `generateItemDistractors.ts`); Vitest; runtime readers in `src/lib/exercise-content/` (LOCKED) + `src/services/coverageService.ts` + `exerciseReviewService.ts`.

---

## Lessons from Slice 1 (REQUIREMENTS, not history)

Slice 1 passed a green test suite but the **first live publish caught four bugs the mocks could not** (no mock enforces a DB CHECK, the real schema, real PostgREST semantics, or real LLM output). These are now standing requirements for Slice 2:

1. **A LIVE TRIAL IS MANDATORY before merge.** Publish at least one real lesson to the homelab and inspect the DB. The green suite is necessary, not sufficient. (Slice-1 mocks missed a CHECK violation that crashed Stage B on the first real publish.)
2. **Verify every write against the real DDL CHECK constraints** (`scripts/migration.sql`), not the mock. Each typed exercise table + `grammar_pattern_examples` has columns with CHECK/NOT-NULL/FK constraints — assert the generated values are constraint-valid (Slice 1's `item_contexts.context_type` bug).
3. **Verify supabase-js option shapes against the real API** (`@supabase/postgrest-js`). `.insert` options are `{count, defaultToNull}` only; `.upsert` options are `{onConflict, ignoreDuplicates, count, defaultToNull}` only — there is NO `update` option (Slice 1's fake-API idempotency bug). Column-restricted updates require check-then-write.
4. **Sanitize LLM output defensively.** The live LLM violates "never the answer / no dup / from pool". Grammar exercises generated by the LLM must be validated/sanitized before write (Slice 1's answer-equal-distractor bug).
5. **Decommission-before-recommission.** Do NOT stop a write (or delete a check) before its readers are repointed. Slice 1 deleted lint checks before the gate was fed (coverage gap) and would have lost audio caps via a too-broad filter. For Slice 2 this governs the `exercise_variants` dual-write retirement (§OQ2-3).
6. **Cross-lesson reuse is normal under global dedup → WARNING, not error.** Grammar patterns recur across lessons; a gate that errors on reuse blocks re-publish (Slice 1's CS17 fix). Apply the same severity discipline to any pattern-level cross-lesson check.

---

## Grounding (verify at execution; DB drifts)

### Live-DB state (2026-05-31)
- `grammar_pattern_examples`: **0 rows** — examples still live in `capability_artifacts.pattern_example` (~94 rows). Slice 2 makes the typed table the source.
- The four typed exercise tables exist (`migration.sql`): `contrast_pair_exercises` (:2371), `sentence_transformation_exercises` (:2406), `constrained_translation_exercises` (:2440), `cloze_mcq_exercises` (:2475). Each has only a surrogate `id` PK — **no natural key**.
- `exercise_variants`: still written (dual-write, PR 4) + still read by `coverageService` + `exerciseReviewService` (below).

### Code seams Slice 2 moves
- **Import seam.** `loadFromDb` (Slice 1) reads typed item rows. Extend it to read the typed grammar sections — `lesson_section_grammar_categories` + `lesson_section_grammar_topics` (PR 6) — plus current pattern capability state (`grammar_patterns` by `slug`, pattern `learning_capabilities` by `canonical_key`) for the generation delta. No staging reads on the pattern path.
- **Today's pattern path (to replace), `runner.ts`:** `projectGrammar` (`projectors/grammar.ts`) consumes `staging.grammarPatterns` + `staging.candidates` (disk); writes `grammar_patterns` (`upsertGrammarPatterns` ~:803), `exercise_variants` (`insertExerciseVariantGrammar` ~:833) AND the typed grammar rows (`insertGrammarExerciseTyped`, PR 4 dual-write ~:602). Examples currently land in the legacy `capability_artifacts` bag.
- **Authoring agent to port in-stage:** `.claude/agents/grammar-exercise-creator.md` authors grammar exercise candidates → `candidates.ts`. Under ADR 0012 + the Slice-1 OQ-1=A precedent, port its prompt into an in-stage generator (`generateGrammarExercises.ts`, mirroring `generateItemDistractors.ts`) reading the grammar sections from the DB.
- **Standalone writer to subsume:** `scripts/publish-grammar-candidates.ts` (343 lines) — fold its writes into the stage; retire it.
- **`exercise_variants` runtime readers (the decommission risk) — CORRECTED per architect review:** the exercise *renderers* already read the 4 typed tables (PR 4 — `byType/{contrastPair,sentenceTransformation,constrainedTranslation,clozeMcq,speaking}.ts`, `byKind/pattern.ts`), and **`exerciseReviewService.getVariantsForLesson` already reads the typed tables too** (`exerciseReviewService.ts:72-84`) — there is NOTHING to repoint there. The **`exercise_variants.id == typed-table.id` "shared id" claim is FALSE**: `insertGrammarExerciseTyped` (`adapter.ts:715-728`) passes no id, so each typed row mints its own `gen_random_uuid()` independent of the `exercise_variants` row (`runner.ts:839-863`). The shipped `exerciseReviewService.ts:113-114` comment asserting a shared uuid is aspirational and contradicted by the runner.
  - **The ONE real `exercise_variants` reader is `coverageService.ts:78`** (grammar coverage counting via `exercise_variants.lesson_id`/`grammar_pattern_id` AND vocab counting via `context_id`, `:151-178`). It must be repointed before the write stops.
  - **The real linkage hazard is the FK `exercise_review_comments.exercise_variant_id NOT NULL REFERENCES exercise_variants(id) ON DELETE CASCADE`** (`migration.sql:818`). The review UI already feeds it **typed-table ids** (which don't exist in `exercise_variants`) — so commenting on a grammar exercise is a **latent FK violation today** (likely never exercised). Stopping the `exercise_variants` write does not fix this; **resolving the FK** (repoint it at the typed tables, or replace it) is the actual decommission work. VERIFY with grep + a live-DB check (any `exercise_review_comments` rows? does the FK fire?) before relying on any of this.
- **`lint-staging` pattern checks to relocate** (the pattern half of ADR 0013 §6): `checkGrammarPatterns` (:257), `checkCandidatesStructural` (:292), `checkPatternBrief` (:795), `checkCapabilityPipelineOutput` (:827), all called in `main()` (:938-945). Re-express against DB + generated output (post-write), remove from `lint-staging`. (Dialogue/cloze checks stay until Slice 3.) Verify exact line numbers at execution.

### Architecture grounding (CLAUDE.md mandate)
- ADR 0010 (wire grammar via pattern capabilities) + ADR 0009 (typed-table-per-content-concept) govern the pattern model. `lib/exercise-content/` is LOCKED — repoint the existing byType/byKind seams, no parallel files. No target-architecture constraint on `capability-stage/` (build-time stage). `coverageService`/`exerciseReviewService` are `src/services/` — repoint in place.

---

## Resolved decisions (proposed — confirm with the operator + architect)

### OQ2-1 — Generate grammar exercises + examples IN-STAGE (mirrors Slice-1 OQ-1=A)
Grammar exercises are LLM-authored today (`grammar-exercise-creator` → `candidates.ts`); examples are authored/derived. Under ADR 0012 + the Slice-1 precedent, **port the grammar-exercise-creator prompt into an in-stage generator** (`generateGrammarExercises.ts`) reading the grammar sections from the DB, with the same injectable `generateFn` mock seam + `ANTHROPIC_API_KEY` no-op + **defensive sanitization** (Lesson #4). Examples come from **`lesson_section_grammar_categories.examples`** (jsonb, NOT `_grammar_topics` — see OQ2-4); whether they are persisted to `grammar_pattern_examples` at all depends on OQ2-4's reader decision.

### OQ2-2 — The pattern-level generation gate is the SOLE idempotency mechanism (CANONICAL SIGNAL specified per architect review)
The four exercise tables have no natural key, so the Slice-1 per-row skip-if-exists is impossible. The legacy dedup was the disk write-back `markCandidatesPublished` flipping `review_status='published'` in `candidates.ts` (`stagingWriteback.ts:55-61`) — the no-disk redesign DELETES that, so the pattern-level gate is the only remaining defense against the legacy INSERT-duplication bug.

**The canonical "seeded?" signal is a SINGLE source (no "and/or"):** a pattern is "seeded" iff **`grammar_pattern_examples` has ≥1 row for its `pattern_id`** — chosen as the one signal because examples are written first in the per-pattern write order and in a single batch (mirroring Slice 1 naming `recognition_mcq_distractors` as its canonical signal). The per-pattern write order MUST be **all-or-nothing in this order: examples → all 4 exercise types**, so a crash mid-write leaves the pattern detectably unseeded (no examples row) and a re-run safely regenerates the whole pattern. **If OQ2-4 removes `grammar_pattern_examples`** (see below), the canonical signal becomes "≥1 row across the 4 typed exercise tables for `grammar_pattern_id`" with the same all-or-nothing write order. Either way: ONE signal, defined write order, partial-failure → re-detect as unseeded → full regenerate. `--regenerate <pattern-slug>` deletes the pattern's rows across examples + all 4 typed tables (atomic) then rebuilds. **Test the partial-failure path explicitly** (write examples, simulate crash before exercises, re-run → pattern re-detected unseeded → exercises generated, no duplicate examples).

> **Atomicity caveat (architect NOTE — resolve at implementation):** "all-or-nothing write order" only holds if the per-pattern multi-table write is **transactionally atomic** (single txn / RPC). A bare sequence of supabase-js inserts is NOT atomic — and in the OQ2-4 *cut* case (signal = "≥1 row across the 4 typed tables"), a crash *between exercise-table 2 and 3* leaves the pattern detected as **seeded-but-partial** (≥1 row exists) and it would never be completed → `byKind/pattern.ts` `pattern_typed_row_missing` at runtime. Mitigations: write the per-pattern exercises in a single transaction/RPC, OR keep `grammar_pattern_examples` as the canonical signal and write it LAST (so "seeded" ⇒ all exercises already landed). The mandated partial-failure test MUST exercise a **mid-4-tables crash**, not only the examples→exercises boundary.

### OQ2-3 — Decommission `exercise_variants` correctly (REVISED per architect review — the "shared id" premise was false)
Corrected sequence (Lesson #5):
1. **Repoint `coverageService.ts:78`** — it's the only real `exercise_variants` reader. It counts BOTH grammar exercises (via `lesson_id`/`grammar_pattern_id`, `:151-156`) AND vocab exercises (via `context_id`, `:172-178`). Repoint the **grammar** count onto the 4 typed exercise tables; the **vocab** `context_id` path has no typed-table equivalent — enumerate exactly what coverageService still needs from `exercise_variants` after the grammar repoint and decide its fate (vocab exercises aren't persisted as typed rows, so vocab coverage may need a different source or stays out of scope). The `noExerciseVariantsReader` enforcement test cannot go green until this vocab-path question is resolved.
2. **Resolve the `exercise_review_comments.exercise_variant_id` FK** (`migration.sql:818`) — NOT "repoint exerciseReviewService" (it already reads the typed tables). The FK references `exercise_variants(id)` but the UI feeds typed-table ids → latent violation. Verify current state (grep + live DB: any comment rows? does the FK fire?), then repoint/replace the FK to the typed tables. **This is the one piece of genuinely NEW schema work hiding in an otherwise reader-repoint slice — it is load-bearing for the deploy ordering. Once the approach is decided (repoint FK at typed tables vs. a polymorphic ref vs. defer the comment-on-grammar feature to teardown #102), RE-DISPATCH a focused architect review of that schema change** before implementing it; don't fold it in silently.
3. **ONLY THEN stop `insertExerciseVariant*`** in the runner (keep the TABLE; drop is a later teardown slice).

---

### OQ2-4 — `grammar_pattern_examples`: who reads it? + the correct source table (RESOLVE FIRST per architect review)
Two problems with the draft's examples plan:
- **No reader.** Nothing in `src/` reads `grammar_pattern_examples` (grep: 0 matches); `byKind/pattern.ts` renders the 4 typed exercise tables and reads no examples table. The epic #100 says "write `grammar_pattern_examples` (0 rows today)", but writing a table nothing consumes is dead data (the `feedback_answer_log_check` / 810-dead-grammar-rows anti-pattern). **Decide with evidence BEFORE building:** (a) is examples meant to be a *runtime* surface (grammar exercises display worked examples)? then name + wire the reader (`byKind/pattern.ts`); (b) is it only the *generator's input* for building exercises? then it need not be persisted as a capability table at all — drop it from the write set; (c) if genuinely no consumer exists or is planned, CUT `grammar_pattern_examples` from the slice and update epic #100's acceptance criterion. Do not write it "because the epic says so" without a consumer.
- **Wrong source table.** `lesson_section_grammar_topics` carries NO examples — its columns are `(id, section_id, lesson_id, topic_label, …)` (`migration.sql:2650-2658`). Examples live on **`lesson_section_grammar_categories.examples`** jsonb `[{indonesian, dutch, english}]` (`migration.sql:2611-2624`). Fix every cite. **And verify (live DB) that `lesson_section_grammar_categories.examples` actually contains all ~94 examples' content** currently in `capability_artifacts.pattern_example` — PR 6 left L5/7/8 lint-blocked from re-publishing, so the typed grammar tables may be incompletely populated; an example-data gap there would silently drop content on the cutover (treat as a separate finding + a re-publish prerequisite, like Slice 1's translation_nl scoping).

## Supabase Requirements
### Schema changes
- **Likely none** — `grammar_pattern_examples` + the 4 typed exercise tables already exist. Verify their CHECK/NOT-NULL/FK constraints against `migration.sql` and assert generated values are valid (Lesson #2). If a missing column surfaces, it's additive to `migration.sql` + `make migrate-idempotent-check`.
### homelab-configs / Health checks
- N/A homelab-configs. Health: the pattern coverage checks become Capability-Gate post-write validators; optionally a deep-check that `grammar_pattern_examples` is non-empty after a grammar lesson publishes (catches a silently-skipped generator).

---

## Tasks (TDD; mirror Slice 1's task shape)

> Enforcement-tests-first, as in Slice 1. Each task: write the failing test, run it, implement, pass, commit. Reuse the Slice-1 seams; do not re-derive `normalized_text`/canonical-key logic.

**Task 1 — Enforcement tests (extend Slice 1's).** Extend `noDiskReads.test.ts` to enumerate the new pattern-path files (`generateGrammarExercises.ts`, the pattern projector additions, the pattern gate validators) as disk-free. Add a `noExerciseVariantsReader` enforcement test (`src/` has no runtime `from('exercise_variants')` read) — staged (skip) until OQ2-3 repointing lands, then active. Commit.

**Task 2 — `loadFromDb` grammar read.** Extend the import seam to read `lesson_section_grammar_categories` + `_grammar_topics` (PR 6) + current pattern capability state (delta). Paginated, disk-free. TDD with seeded fixtures. Commit.

**Task 3 — Pure pattern projectors.** `grammar_patterns` upserts (by `slug`) + `pattern` capabilities (canonical keys) + (pending OQ2-4) `grammar_pattern_examples` rows, deterministically from the typed grammar sections (`lesson_section_grammar_categories`). Pure. **Data-equivalence target (architect correction):** `projectGrammar` emits NO pattern capabilities — the pattern caps come from the staging `capabilities.ts` bundle regenerated by `buildCapabilityStagingFromContent` (`runner.ts:277-287`); THAT is the cutover target, not `capabilityCatalog.ts` (the runtime projector the stage never invokes — it's the shape reference only: `pattern_recognition` + `pattern_contrast`, `requiredArtifacts:[]`, `learnerLanguage:'none'`, sourceRef via `normalizeLessonSourceRef`, `capabilityCatalog.ts:119-156`). Verify byte-identical canonical_keys/source_refs against the bundle emitter (a wrong key orphans caps + breaks FSRS). Commit.

**Task 4 — In-stage grammar-exercise generator (port the agent).** `generateGrammarExercises.ts` mirrors `generateItemDistractors.ts`: pure prompt builder (port `grammar-exercise-creator.md`), pure parser, thin Claude call, injectable `generateFn`, `ANTHROPIC_API_KEY` no-op, **defensive sanitization** of LLM output to the typed-row shapes (Lesson #4). **Constraint-validity binding (Lesson #2):** assert the sanitized output satisfies the actual DDL constraints of each target table before it can be written. These 4 tables carry **NOT-NULL / FK / jsonb-shape** constraints (NOT CHECK constraints — don't hunt for non-existent CHECKs) — e.g. `contrast_pair_exercises.options` jsonb NOT NULL + `correct_option_id` text NOT NULL (`migration.sql:2377-2378`), and the analogous NOT-NULL/FK/jsonb-shape constraints on the other three (`:2406/2440/2475`). A test seeds an LLM result that would violate a constraint → asserts it's repaired or dropped, never written. Unit-test the pure parts. Commit.

**Task 5 — Idempotent grammar writers + the pattern-level generation gate (OQ2-2).** Writers for `grammar_pattern_examples` (skip-if-exists where a natural key exists, e.g. `(pattern_id, display_order)`) + the 4 typed exercise tables. The **pattern-level generation gate** is the sole dedup for the keyless exercise tables: skip a pattern whose exercises are already seeded; `--regenerate <pattern-slug>` deletes (by `grammar_pattern_id`) + rebuilds. Add `regenerate` support for the pattern kind to `CapabilityStageInput` + the CLI. TDD: seed twice → one row set; `--regenerate` → that pattern replaced, others untouched. Commit.

**Task 6 — Runner cutover (pattern path).** Wire `loadFromDb` grammar read → pattern projectors → generator (gated) → idempotent writers. **Constraint (Slice-1 Task 6c lesson): no double-write** — pattern caps written by exactly one path; filter pattern caps out of the legacy `staging.capabilities` bundle by the exact canonical_keys the new path emits (NOT by `sourceKind` alone — that dropped audio caps in Slice 1). Keep `exercise_variants` dual-write FOR NOW (removed in Task 8 after readers repoint). Legacy item/dialogue/morphology paths unchanged. TDD + the no-double-write assertion. Commit.

**Task 7 — Capability Gate pattern layer.** New validators re-expressing `checkGrammarPatterns` / `checkPatternBrief` / `checkCandidatesStructural` / `checkCapabilityPipelineOutput` against DB + generated output (post-write, DB-state-aware). New `CS*` gate codes in `model.ts`. **Wire them into the runner's post-write gate call** (Slice-1 Task-7 lesson: the validators are dead unless the runner feeds them — that gap let item checks run nowhere). Surgically remove the 4 pattern checks from `lint-staging` (keep dialogue/cloze). Any cross-lesson pattern-reuse finding is a WARNING (Lesson #6). Commit.

**Task 8 — Retire the `exercise_variants` write (OQ2-3 as REVISED).** (a) Repoint `coverageService.ts:78` grammar coverage onto the typed exercise tables, explicitly resolving the vocab `context_id` path (enumerate what coverageService still needs from `exercise_variants` after the grammar repoint; vocab exercises have no typed-table equivalent — decide source or scope-out). (b) Resolve the `exercise_review_comments.exercise_variant_id` FK (`migration.sql:818`) — verify current state first (grep + live DB), then repoint/replace the FK at the typed tables (likely an additive migration). Do NOT "repoint exerciseReviewService" — it already reads the typed tables. (c) ONLY after (a)+(b), stop `insertExerciseVariant*` in the runner. (d) Flip the Task-1 `noExerciseVariantsReader` test active → green (it can't go green until the coverageService vocab-path question is settled). (e) Retire pattern reads off `capability_artifacts.pattern_example`. Keep the `exercise_variants` TABLE (drop = teardown slice #102). TDD per step. Commit.

**Task 9 — Retire `publish-grammar-candidates.ts`.** Confirm its writes are fully subsumed by the stage; delete it + its callers/Makefile target. Commit.

**Task 10 — Integration + MANDATORY live trial (Lesson #1).** Canonical integration test (seed grammar fixtures → run → assert typed exercise + example rows → re-run idempotent → `--regenerate` replaces one pattern). **Then the live trial:** publish a real grammar-bearing lesson to the homelab — **use L6 (8 grammar categories per `migration.sql:2605`-era data; confirm at execution it has typed grammar rows + examples populated)**; verify the 4 typed exercise tables written (no `exercise_variants` rows for the new lesson), `grammar_pattern_examples` per OQ2-4's decision, `status=ok` + promotion, a grammar exercise renders from the typed tables, and a `capability_review_events` row lands. Sweep for CHECK-violation / answer-equal / cross-lesson-error classes (the 4 Slice-1 bug classes). Fix anything the trial surfaces.

---

## Gates (before merge)
- [ ] Enforcement: no-disk on the pattern path; no runtime `exercise_variants` reader.
- [ ] `grammar_pattern_examples` populated by the stage; `capability_artifacts.pattern_example` no longer the source.
- [ ] 4 typed exercise tables written by the stage; **no `exercise_variants` write**; `coverageService` + `exerciseReviewService` repointed first.
- [ ] `publish-grammar-candidates.ts` retired.
- [ ] Idempotency: re-run writes nothing new; `--regenerate <pattern>` replaces only that pattern (the keyless-table gate proven).
- [ ] Pattern Capability-Gate layer runs in the runner; pattern checks removed from `lint-staging`.
- [ ] `bun run test` + `bun run lint` + `bun run build` green; `make pre-deploy` (pre-existing failures only); `make migrate-idempotent-check` green IF the `exercise_review_comments` FK or any column proves to need a migration.
- [ ] **Live trial passed** — grammar exercise renders from typed tables + `capability_review_events` lands; no CHECK/answer-equal/cross-lesson-error regressions.

## Deploy ordering
Slice 2 is **code-first safe for rendering** (the typed-table renderers already shipped in PR 4), but the `exercise_variants` write-stop + `exercise_review_comments` FK change interact: ship/migrate the **FK repoint + coverageService change BEFORE** (or same deploy as) the pipeline write-stop, so no in-flight grammar lesson loses coverage/review linkage. If a migration is needed (FK), run `make migrate` before the container recreate. State the concrete order in the PR once OQ2-3/OQ2-4 are resolved.

## Out of scope (later slices)
`dialogue_line` + `affixed_form_pair` + cloze (#101); teardown/drop of `capability_artifacts` + `exercise_variants` (#102, human-gated); deletion of `lint-staging` + `buildLintStagingCommand` (when the last check moves, Slice 3). Grammar EN enrichment beyond what PR 6 already relocated to the Lesson Stage.
