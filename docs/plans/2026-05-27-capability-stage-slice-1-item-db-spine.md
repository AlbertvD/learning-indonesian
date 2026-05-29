---
status: approved
implementation: null
epic: "#98"
issue: "#99"
supersedes: []
grounded_against_code: 2026-05-28
grounded_against_db: 2026-05-27
architect_review: "APPROVED 2026-05-28 (2 rounds; all 7 first-round findings resolved + verified against code; 1 implementer WARNING folded into the Idempotency contract)"
decisions_resolved:
  OQ-1: "(A) in-stage generation — port vocab-exercise-creator's prompt into the Capability Stage; distractors stay capability-side; NO new table"
  OQ-2: "item-sourced MCQ builders only"
  OQ-3: "--regenerate at the item unit"
  scope: "Slice 1 (#99) establishes the Capability Gate framework + item-kind layer and retires the item-relevant lint-staging checks (ADR 0013's deferred half)"
---

# Capability Stage Redesign — Slice 1: `item` source_kind end-to-end + the Capability Gate

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This is a **redesign, not a fold** (ADR 0011/0012/0013; memory `project_capability_stage_redesign_not_fold`). The prior attempt (#99 → PR #103) was **closed** for reading a lesson-content contract that did not yet exist and stubbing the hard parts. The enforcement tests in Task 1 are the hard gate that makes "DB-only" provable, not aspirational.

**Goal:** Build the Capability Stage's DB→DB spine for the `item` source kind — read item content from the typed lesson-content tables (not staging), **generate** curated distractors in-stage (porting the `vocab-exercise-creator` agent's prompt) into the three empty distractor tables, wire the runtime to consume them, retire the item-kind `capability_artifacts` reader onto canonical joins, backfill the 116 missing `translation_nl` — and stand up the **Capability Gate** (the DB-state-aware sibling of the Lesson Gate, ADR 0013) covering the item kind, retiring the item-relevant `lint-staging` checks.

**Architecture:** The Capability Stage becomes a deep module whose entire external interface is the database — an **import seam** (`loadFromDb`) reading typed lesson-content + current capability state, and an **idempotent export seam** writing typed capability tables only. Generation (LLM, non-deterministic) and projection (pure) are internal; only the two DB seams are external. The **Capability Gate** (`runCapabilityGate({ mode })`) is the stage's definition-of-done — one entry point, three layers (DB constraints → pre-write validators → post-write verification), DB-state-aware. For Slice 1 the spine + gate are delivered for the `item` kind only; `pattern` / `dialogue_line` / `affixed_form_pair` keep their current disk-coupled path and their `lint-staging` checks until Slices 2–3.

**Tech Stack:** TypeScript + Bun; Supabase JS (`@supabase/supabase-js`, service-role) in `scripts/lib/pipeline/capability-stage/`; `@anthropic-ai/sdk` for in-stage generation (mirroring `capability-stage/enrichPos.ts`); Vitest for unit + enforcement + integration tests; runtime readers in `src/lib/exercise-content/` (React/Vite, LOCKED module).

---

## Resolved decisions (these were the draft's open questions; now settled with the operator)

### OQ-1 = (A): generate curated distractors **in-stage**, porting the agent's prompt

Curated distractors are **LLM-authored** content (verified: `scripts/data/staging/lesson-10/vocab-enrichments.ts` shows context-aware hand-crafted distractors — dialogue distractors drawn from the *same* conversation; the deterministic `pickDistractorCascade` is only the low-quality runtime fallback the curated tables exist to replace). They are **exercise material, not lesson material** — the learner never reads a distractor while reading the lesson; it only appears as a decoy inside a quiz. By ADR 0012's dividing line ("what the learner reads = lesson; what feeds exercises/scheduling = capability") distractors are **capability-side, full stop**.

Therefore the Capability Stage **generates** them, mirroring how it already generates POS in-stage (`enrichPos.ts`: `new Anthropic()` call, gated by `ANTHROPIC_API_KEY`, pure `buildPrompt`/`parseResponse` split). We **port the `vocab-exercise-creator` agent's prompt + distractor-quality rules** (`.claude/agents/vocab-exercise-creator.md`) into a new in-stage module `generateItemDistractors.ts` that reads the item set + cumulative known-word pool **from the DB** and writes the three existing distractor tables keyed by `capability_id`.

**Consequences of choosing (A) over the draft's (B):**
- **No new table.** The draft's (B) added `lesson_section_item_distractors` — a contract smell (exercise scaffolding parked on the lesson side). (A) writes straight into the existing `recognition_mcq_distractors` / `cued_recall_distractors` / `cloze_mcq_item_distractors`. **Slice 1 has zero schema changes.**
- **Quality control moves with generation.** Today distractor quality is gated by `lint-staging.ts` §12 (`checkVocabEnrichments`) + the `linguist-reviewer` agent on the staging file. When generation moves in-stage, those checks become **Capability Gate validators** (Task 7) run post-write against the generated rows, and post-publish corrections live in the DB via the flag→agent review loop (ADR 0011). We do **not** silently drop them.
- **The `vocab-exercise-creator` subagent is retired** as a pipeline step once the in-stage module ships (its `.md` becomes the spec for the ported prompt). It is a Claude Code subagent — the autonomous `bun` publish pipeline cannot spawn it — which is exactly why its logic must move into an in-stage SDK module.

### OQ-2 = item-sourced MCQ builders only

Wire only the **item-sourced** MCQ builders (`recognition_mcq`, `cued_recall`, item `cloze_mcq`) to prefer the curated tables and fall back to `pickDistractorCascade`. Pattern/dialogue MCQ distractors stay on the pool until their slices. Keeps the runtime change inside the item vertical.

### OQ-3 = `--regenerate` at the item unit

`--regenerate <item>` (by `normalized_text`) deletes that item's distractor rows then re-generates. Default runs never regenerate. Pattern/dialogue regenerate defer to their slices.

### Scope = the Capability Gate lands in Slice 1 (ADR 0013's deferred half)

ADR 0013 built the **Lesson Gate** and explicitly assigned the symmetric **Capability Gate** to epic #98 (§Decision, §6, §Consequences: "the decomposition lands with the capability redesign, not before"). Slice 1 **establishes the Capability Gate framework + its item-kind layer** and retires the **item-relevant** `lint-staging` checks — mirroring how the Lesson Gate framework was established once (PR #114) and validators folded in across its 3 slices. You cannot ship in-stage distractor generation *without* its gate, or quality silently drops; the gate is part of the item vertical. Pattern/dialogue checks migrate in #100/#101; `lint-staging` (and `buildLintStagingCommand`) are deleted when the last check moves.

### Idempotency contract (ADR 0011) — the WHOLE item write-set is additive, not just distractors

ADR 0011 line 17 names `upsertLearningItem` / `upsertCapabilities` / `upsertItemAnchorContext` (blind upserts at `adapter.ts`, `runner.ts:564-573`) as the **overwrite behaviour the additive-only contract must replace** — not only the distractor writer. A re-publish must not clobber DB-resident corrections (ADR 0011 line 27) on `learning_items`, `item_contexts`, or capabilities. Therefore **the entire item write-set is skip-if-exists on its natural key**, gated at the seam (Tasks 3/4/6):

| Write | Natural key | Re-publish behaviour |
|---|---|---|
| `learning_items` | `normalized_text` | skip-if-exists (already-seeded item untouched) |
| `learning_capabilities` | `canonical_key` | skip-if-exists (FSRS state + corrections preserved; mirrors the existing `retireOrphanedCapabilities` soft-retire, `runner.ts:404`) |
| `item_contexts` / anchor | `(learning_item_id, context_type, source_text)` | skip-if-exists |
| three distractor tables | `capability_id` | skip-if-exists (generation gate skips the LLM call entirely for seeded items) |

`--regenerate <item>` is the **only** path that deletes + rewrites a seeded item's rows (the explicit destructive opt-out). A first publish of a *partially*-seeded lesson generates only the missing items' content — never re-touching the seeded ones.

**Column-level mechanic (architect WARNING — the one seam where both regimes share a row).** `translation_{nl,en}` ride on the *same* `learning_items` row written by the single `upsertLearningItem` call (`runner.ts:170-171`), so "row skip-if-exists" and "translation UPDATE" touch one physical row. Resolve at the SQL level, not conceptually: the item write is an upsert with a **column-restricted** `ON CONFLICT (normalized_text) DO UPDATE SET translation_nl = EXCLUDED.translation_nl, translation_en = EXCLUDED.translation_en` — i.e. on a seeded row, **only the lesson-derived translation columns are refreshed; every capability-authored column (FSRS-adjacent, POS-if-corrected, etc.) is left untouched**. A brand-new row inserts in full. This is the literal mechanic Task 6 (`upsertLearningItem`) and Task 9 (backfill) must share — do NOT implement two divergent write paths.

### Out of scope for distractor **generation**: dialogue-chunk distractors

`lesson_section_item_rows.item_type` is constrained to `{word, phrase}` (`migration.sql:2577`). The current agent ALSO authors dialogue-chunk distractor sets (full-sentence decoys from the same conversation — `lesson-10/vocab-enrichments.ts:5-225`, 13 sets), but those are keyed off dialogue lines, not item rows. **Slice 1 generates word/phrase distractors only.** Dialogue-chunk distractor generation is deferred to the dialogue slice (#101); until then dialogue MCQs render the `pickDistractorCascade` fallback (consistent with OQ-2's wiring scope). An implementer must NOT try to reproduce the dialogue sets from the word/phrase-only `lesson_section_item_rows` input.

---

## Grounding (read before touching anything)

### Live-DB state (2026-05-27, via openbrain SQL)

| Fact | Value | Implication |
|---|---|---|
| `lesson_section_item_rows` | **465 rows, 7 of 9 lessons, 0 missing `l2_translation`** | The typed item contract `loadFromDb` reads is populated + bilingual. 2 lessons lack rows (Lesson-Stage re-publish gap, not a Slice-1 blocker). |
| `recognition_mcq_distractors` / `cued_recall_distractors` / `cloze_mcq_item_distractors` | **0 / 0 / 0** | Written by nothing **and read by nothing** today. Slice 1 builds the in-stage generator + writer **and** wires the runtime reader. |
| `learning_items` (`source_type='lesson'`) | **758 total, 116 missing `translation_nl`** | The backfill (US #22) is real and scoped: 116 rows. |
| `capability_artifacts` / `exercise_variants` | **9,312 / 716** | Legacy tables still fully populated; Slice 1 retires only the **item-kind** readers/writes, not the tables (drop is a later slice). |

> Re-verify the three counts at execution start (DB drifts). The `lesson_section_item_rows` count and the 2-lesson gap especially.

### Code state — the seams Slice 1 moves

- **The runner is still the legacy disk-coupled shape** (`capability-stage/runner.ts`). It reads `staging.learningItems` / `staging.candidates` / `staging.clozeContexts` (loaded by `loader.ts`), enriches in memory, **writes staging back to disk** (`writeLearningItemsWithEnrichedPos` :220; `fs.writeFileSync` of `content-units.ts`/`capabilities.ts`/`exercise-assets.ts` :268-279; `markCandidatesPublished` :641; `markLearningItemsPublishedOrDeferred` :699). This dual-read/dual-write is what Slice 1 kills **for the item kind**.
- **In-stage LLM seam already exists** — `enrichPos.ts` (called at `runner.ts:167`): `new Anthropic({apiKey})`, `MODEL` const, pure `buildPrompt`/`parseResponse`, thin `classifyBatch`, **`ANTHROPIC_API_KEY` absent → no-op Map** (the test/dry-run seam). `generateItemDistractors.ts` mirrors this exactly. Note: `enrichMissingPos` is not currently injectable via `CapabilityStageHooks` (hooks = `loadLesson`, `createSupabaseClient` only) — Task 5 adds a `generateItemDistractors` hook for deterministic test mocking (the epic's "per-agent hook seam").
- **Typed item contract** — `lesson_section_item_rows` (`scripts/migration.sql:2571-2601`): `source_item_ref`, `item_type ∈ {word,phrase}`, `indonesian_text`, `l1_translation` (NL, NOT NULL), `l2_translation` (EN). `unique(lesson_id, source_item_ref)`. Per-occurrence lesson-side identity; item caps still dedup by `normalized_text`.
- **Distractor tables** — all three (`scripts/migration.sql:2172-2224`) are `capability_id uuid primary key … distractors text[]`, `ON DELETE CASCADE`, 1:1 per cap. Natural key **is** `capability_id` → per-row skip-if-exists is trivial (unlike the four keyless exercise tables).
- **Export seam** — `adapter.ts` already has the typed-satellite pattern (`replaceDialogueClozes` :310, `replaceAffixedFormPairs` :396) and the legacy writes. Note `runner.ts:454` **already skips `item:`-keyed `capability_artifacts`** (Decision R/Q, PR 1) — so the item write-retirement is partly done; Slice 1 finishes it and adds the distractor writer + item-kind skip-if-exists gate.
- **Item-kind runtime reader** — `exercise-content/adapter.ts:318-330` `fetchArtifacts` → `capability_artifacts` (`quality_status='approved'`), consumed by `fetchForItemBlocks` via `byKind/item.ts`. Translations already moved to inline `learning_items.translation_{nl,en}` in PR 1 (`byKind/item.ts` header). **Task 8 enumerates exactly what item still pulls from artifacts** before cutting the reader.
- **Distractor reader today: none.** `byKind/item.ts` (Decision G2 Group B): builders "use `poolMeaningsByItem` fallback — same behaviour as today" (`lib/distractors/pickDistractorCascade` over a meanings pool). No runtime reader of the three curated tables exists.

### Capability Gate grounding — the pieces to compose

- **Existing pre-write validators** (`runner.ts:84-101, 285-294`): `validateCandidatePayload`, `validateGrammarExercises`, `validatePerItemMeaning`, `validateGrammarPattern`, `validatePosTags`, `validateLessonIdPresence`, `validateItemTranslations` (CS4b), `validateItemSourceRefResolvability` (#59), `validateDialogueClozes`, `validateAffixedFormPairs`. These are scattered inline calls — the gate consolidates them behind one entry point (as `runLessonGate` did for `GT*`).
- **Existing post-write verifiers** (`runner.ts:103-105, 664-691`): `runCountParity` (CS7), `runContentNonEmpty` (CS8), `runSeedIntegrity` (CS9) — the post-write layer seed, exactly as `GT9`/`sectionShape` seeded the Lesson Gate.
- **What's still in `lint-staging` to relocate** (the lesson half folded out in ADR-0013 slice 3). The item checks are **NOT contiguous** — removal is surgical, interleaved with pattern/dialogue checks that stay:
  | Check | Call site | Kind | Slice |
  |---|---|---|---|
  | `checkVocabCoverage` | `lint-staging.ts:1106` | **item** | **Slice 1** |
  | `checkLearningItemsPos` | `lint-staging.ts:1109` | **item** | **Slice 1** |
  | `checkVocabEnrichments` (§12) | `lint-staging.ts:1110` | **item** | **Slice 1** |
  | `findDuplicateItems` (3b) | `lint-staging.ts:1083-1090` (cross-lesson, **outside** the per-lesson loop) | **item** | **Slice 1** |
  | `checkGrammarPatterns` (1100), `checkPatternBrief` (1107), `checkCandidatesStructural` (1101), `checkCapabilityPipelineOutput` (1108) | per-lesson loop | pattern | Slice 2 |
  | `checkClozeContextsFile` (1102), `checkClozeCoverage` (1103), `checkDialogueClozes` (1104) | per-lesson loop | dialogue/cloze | Slice 3 |
  > Verify these line numbers at execution start — `lint-staging.ts` drifts.
- **Live wiring to replace**: `runner.ts:777` `buildLintStagingCommand` shells out to `lint-staging.ts --lesson N --severity critical`; `publish-approved-content.ts:45` gates on its CRITICALs (`--skip-lint` bypass). Slice 1 makes the **item** checks run in-stage via `runCapabilityGate`; the shell-out stays for the not-yet-migrated checks until the last slice.
- **The Capability Gate's one legitimate asymmetry vs the Lesson Gate:** the Lesson Gate is forbidden from consulting any cross-lesson pool (that is what makes it fresh-lesson-safe; ADR 0013 §4). The Capability Gate **is allowed to** — "is this word known across prior lessons?" is answerable against the DB.
- **The becak dissolution is an ORDERING requirement, not automatic** (architect finding). Stage A writes `lesson_section_item_rows`, **not** `learning_items`; `learning_items` is written by the **Capability Stage itself** (Task 4 projector → `runner.ts:564`). The legacy in-pool check builds its pool from `learning_items WHERE is_active=true` (`lint-staging.ts:232`) — so if the item-layer validators query the pool *before* this run's `learning_items` land, the current lesson's own new words are absent and the becak `dialogue-cloze-blank-not-in-pool` failure RE-APPEARS on the capability side. **Required:** the Task 7 item-layer in-pool validators run **post-write, after the Task 4 projector's `learning_items` writes**, and the pool query MUST include this lesson's just-written rows (not a pre-write snapshot). Only then does the failure "dissolve by construction." This is engineered in Task 7's placement (post-write, after writes), not assumed.

### Architecture grounding (CLAUDE.md mandate — `docs/target-architecture.md`)

- `lib/exercise-content/` is **LOCKED** (`target-architecture.md:176, 441-507`); its listed job includes "Artifact lookup via `capability_artifacts`" (`:464`) and "K-of-N distractor selection (delegates to `lib/distractors/`)" (`:461`). **Slice 1's runtime change lands at this locked seam** — repoint `fetchForItemBlocks`/item MCQ builders onto canonical joins + the curated tables; do **not** add a parallel reader file.
- `lib/distractors/` is **LOCKED** (`:178, 582-635`): pure, picks from a pool "the runtime fetches" (`:638`). The three curated tables **are** that DB pool for item MCQ types. Wiring = reader prefers the curated row, falls back to `pickDistractorCascade` when absent.
- **No target-architecture constraint exists for `scripts/lib/pipeline/capability-stage/`** (build-time script stage, outside the `src/lib/` fold roster). Its internal redesign is unconstrained by the fold; the only anchors are ADR 0011/0012/0013 and the two LOCKED runtime modules above.

---

## Supabase Requirements

### Schema changes
- **None.** OQ-1=(A) generates distractors into the **existing** `recognition_mcq_distractors` / `cued_recall_distractors` / `cloze_mcq_item_distractors` tables (`migration.sql:2172-2224`). `translation_nl` column already exists. No new tables, no new columns → `make migrate-idempotent-check` is not exercised by Slice 1 (run it anyway as a no-op sanity check).
- RLS / grants: the three distractor tables already have policies/grants from their migration (verify with `make check-supabase-deep`); Slice 1 adds no new tables so no new policies.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema; `indonesian` already exposed).
- [ ] Kong CORS — **N/A** (no new origins/headers).
- [ ] GoTrue — **N/A**.
- [ ] Storage buckets — **N/A**.

### Health check additions
- The item post-write checks (`checkVocabEnrichments`/`checkVocabCoverage` intents) become **Capability Gate** post-write verifiers, not standalone `check-supabase-deep` checks (they are per-publish, DB-state-aware, in-stage). Optionally add a deep-check assertion that the three distractor tables are **non-empty** once a lesson is published (catches a silently-skipped generator) — decide during Task 7.

---

## Pre-execution checks (run first, in the worktree)

1. `bun install` (fresh worktree — missing `tsx`/node_modules masquerades as test failures; memory `feedback_worktree_bun_install`).
2. `bun run test` — capture the green baseline before any change.
3. Re-verify the three DB counts above and confirm the 2 lessons lacking `lesson_section_item_rows`:
   `select l.order_index from indonesian.lessons l left join (select distinct lesson_id from indonesian.lesson_section_item_rows) r on r.lesson_id=l.id where r.lesson_id is null order by 1;`
   Slice 1 tests against the 7 populated lessons; the gap is a Lesson-Stage re-publish concern.

---

## Task 1: Enforcement tests first (the anti-fold gate)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/__tests__/enforcement/noDiskReads.test.ts`
- Create: `scripts/lib/pipeline/capability-stage/__tests__/enforcement/noLegacyItemReader.test.ts`

**Step 1 — failing no-disk test.** Scan every `.ts` under `capability-stage/` for `readStagingFile`, `readFileSync`, `writeFileSync`, `fs.existsSync`. Assert the **item path** (`loadFromDb` + the new item modules: `generateItemDistractors.ts`, the item projector, the item gate validators) contains none. Encode the *allowed residue* (the still-disk-coupled pattern/dialogue path: `loader.ts`'s non-item staging reads, `stagingWriteback.ts`, the `fs.writeFileSync` snapshot block) as an explicit allowlist so the test **tightens slice-by-slice** — each later slice deletes entries.

**Step 2 — run; expect FAIL** (item path doesn't exist yet). `bun run test scripts/lib/pipeline/capability-stage/__tests__/enforcement/noDiskReads.test.ts`

**Step 3 — failing no-legacy-item-reader test.** Do NOT scan for the substring `capability_artifacts` — it already appears benignly in `byKind/item.ts:6,23,226` (comments + a forward-compat type re-export) and `item.ts:208-214` already sets `artifactsByKind: new Map()` and never calls `fetchArtifacts` (architect finding: the reader is *mostly already retired*). Instead assert the **behaviour**: the item resolution path makes **no call to `fetchArtifacts`** (spy/mock the adapter's `fetchArtifacts` and assert zero invocations for an item-only session). Until Task 8 wires the curated reader, mark `it.skip` with a TODO referencing Task 8.

**Step 4 — commit.** `test(capability-stage): enforcement gates for item DB-only spine + reader retirement (#99)`

> These tests fail now and go green as Tasks 3-8 land. They are acceptance criteria, not decoration.

## Task 2: Capability Gate skeleton (`runCapabilityGate`)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/gate.ts`
- Test: `scripts/lib/pipeline/capability-stage/__tests__/gate.test.ts`

Mirror `lesson-stage/gate.ts`'s signature exactly: **`mode` flexes SEVERITY, not which layer runs** (architect finding — the Lesson Gate's `'pre-flight' | 'publish'` flexes severity; do not conflate it with a layer-selection axis). Use `mode: 'pre-flight' | 'publish'` for severity, and sequence the three layers (pre-write validators → writes happen in the runner → post-write verifiers) as caller-invisible internal structure, NOT a caller-facing mode. **This task only stands up the shell + consolidates the existing inline pre-write validators** (`validateCandidatePayload`, `validatePerItemMeaning`, `validateItemTranslations`, `validatePosTags`, `validateItemSourceRefResolvability`, `validateLessonIdPresence`) and the existing post-write verifiers (`runCountParity`/`runContentNonEmpty`/`runSeedIntegrity`) behind it — no behaviour change. The item-kind *new* validators are added in Task 7. Document the DB-state-aware asymmetry in the file header (ADR 0013 §4, inverted). Rewire `runner.ts` to call `runCapabilityGate` instead of the scattered calls. TDD: gate over a fixture returns the same findings the inline calls produced. Commit.

## Task 3: `loadFromDb` — typed item import seam

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/loader.ts`, `adapter.ts` (add typed-item read)
- Test: `scripts/lib/pipeline/capability-stage/__tests__/loader.itemFromDb.test.ts`

Add `fetchItemRowsFromDb(supabase, lessonId)` to `adapter.ts` returning `lesson_section_item_rows` joined to `lesson_sections.section_kind`, plus current capability state for the idempotency delta (`learning_items` by `normalized_text`, `learning_capabilities` by `canonical_key` for item kind). Extend `LoadedLesson` with a typed `items` field sourced from the DB; **stop populating the item-relevant staging reads** (`learning-items.ts`) on the item path. TDD: seed `lesson_sections` + `lesson_section_item_rows` fixtures (or mock the client) → assert typed item content with NL+EN and correct `source_item_ref`/`item_type`. Commit.

## Task 4: Pure item projectors (DB rows → capability rows + canonical keys)

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` (prior art: `projectors/__tests__/vocab.test.ts`)
- Test: extend `__tests__/projectors/vocab.test.ts`

Project typed item rows → `learning_items` upserts (by `normalized_text`) + `item` capabilities (canonical keys) + `item_contexts` (anchor) deterministically. **Pure** (fixture in → rows out, no I/O). Apply the harvest rule already enforced upstream (PR 6: no whole-line/composed-number items). Commit.

## Task 5: In-stage curated-distractor **generator** (port the agent prompt)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/generateItemDistractors.ts` (model: `enrichPos.ts`)
- Modify: `runner.ts` (`CapabilityStageHooks` gains `generateItemDistractors?` for test injection)
- Test: `__tests__/generateItemDistractors.test.ts`

Port `.claude/agents/vocab-exercise-creator.md`'s prompt + the four distractor-quality rule blocks into a `buildPrompt` (pure) producing the three distractor arrays (`recognition_distractors_nl`, `cued_recall_distractors_id`, `cloze_distractors_id`, exactly 3 each) per item, reading the item set + **cumulative known-word pool from the DB** (prior-lesson `learning_items` with `item_type` for word-class filtering — the pool the agent got from `pattern-brief.json`). Pure `parseResponse`; thin `new Anthropic()` call; **`ANTHROPIC_API_KEY` absent → no-op** (dry-run/test seam, exactly as `enrichPos`). TDD the **pure** parts (prompt shape, parser, word-class/pool filtering) without the network. Commit.

> Generation is gated per item in Task 6 (skip-if-exists) so a re-publish never re-calls Claude or churns a learner's distractors.

## Task 6: Idempotent distractor export adapter (skip-if-exists + `--regenerate`)

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/adapter.ts` (`upsertItemDistractors`)
- Modify: `scripts/lib/pipeline/capability-stage/loadFromDb.ts` — **(Task-5 review forward-dependency)** the distractor generator's `pool` needs prior-lesson items with `item_type` + `indonesian_text` + `l1_translation`, but `loadFromDb` does NOT expose that today (`existingItemsByNormalizedText` carries only `{id, normalized_text}`; `fetchItemRowsFromDb` is current-lesson-scoped). Add a cross-lesson **full-field** prior-lesson pool fetch (the cumulative seen-pool) for the generator to consume.
- Modify: `runner.ts` (call generator for items lacking distractor rows; write via adapter) + make the item-path `upsertLearningItem`/`upsertCapabilities`/`upsertItemAnchorContext` skip-if-exists per the **Idempotency contract** subsection above
- Modify: `model.ts` (add `regenerate?: { kind: 'item'; normalizedText: string }` to `CapabilityStageInput`, currently `lessonNumber`/`lessonId`/`dryRun` only)
- Modify: `scripts/publish-approved-content.ts` (parse `--regenerate <normalized_text>` argv → thread into `CapabilityStageInput`)
- Test: `__tests__/adapter.itemDistractors.test.ts`

`upsertItemDistractors(supabase, rows)` writes the three tables keyed by `capability_id`, **skip-if-exists** on `capability_id` (natural key makes this safe). The generation gate (Task 5 call site) skips items whose caps already have distractor rows → no LLM call, no write. `--regenerate` deletes that one item's distractor rows then re-generates + writes; it is the ONLY destructive path. TDD: seed twice → one row set; `--regenerate` → that item replaced, others untouched; assert a re-publish does NOT overwrite a hand-corrected `learning_items` row (idempotency contract). Commit.

> **Cutover notes — carried from the Task 4 review (the runner switch from `projectVocab`'s staging path → `projectItemsFromTypedRows` happens HERE).** The Task-4 review traced data-equivalence field-by-field against the real cutover target (`src/lib/capabilities/capabilityCatalog.ts:38-118`): canonical_key, source_ref, learner_language, directions, prerequisite_keys, and the emitted cap COUNT are **byte-identical** for word/phrase items → the cutover does not orphan/duplicate caps and FSRS state (keyed on canonical_key) is preserved. Three deltas the writer must handle deliberately:
> 1. **`required_artifacts` flips non-empty → `[]`** on the first post-cutover re-publish of existing item caps. This is **intended and runtime-inert** (item readiness reads `RENDER_CONTRACTS.requiredArtifacts.item = []` per Decision R, not the persisted column) — but it WILL show in a post-deploy DB diff on that column. Do not mistake it for a regression.
> 2. **`pos` must be preserved, not nulled.** `projectItemsFromTypedRows` emits `pos: null` (typed rows carry no POS; enrichment is lesson-stage's job per ADR 0012). The item-path `upsertLearningItem` skip-if-exists / column-merge must NOT null an existing item's persisted `pos`. Verify in the skip-if-exists write logic + add a test.
> 3. **`learner_language` is hardcoded `'nl'`** in the typed projector (safe: `l1_translation` is non-null for word/phrase rows, so the legacy `'none'` fallback is unreachable). No action, noted for completeness.

## Task 7: Capability Gate **item-kind layer** (relocate the lint-staging item checks)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/validators/itemDistractors.ts`, `validators/itemCoverage.ts`, `validators/itemPos.ts`, `validators/itemDuplicates.ts` (re-express the *intent* of `checkVocabEnrichments` §12 / `checkVocabCoverage` / `checkLearningItemsPos` / `findDuplicateItems`)
- Modify: `model.ts` (add the new validators' gate codes to the closed `ValidationFinding.gate` union / `CAPABILITY_GATES`, currently `CS1–CS13` — pick the next free `CS*` numbers)
- Modify: `gate.ts` (compose them into the **post-write** layer; DB-state-aware), `lint-staging.ts` (surgically remove the four item checks — see grounding table for exact non-contiguous call sites — + any `loadLesson`/`loadDb`/`findDuplicateItems` plumbing now unused)
- Test: `__tests__/validators/item*.test.ts`

Re-express each check against **DB lesson content + the stage's just-generated output** (NOT the staging file). **Ordering (architect finding): these run post-write, AFTER the Task 4 projector wrote this lesson's `learning_items`, and the in-pool query MUST include this lesson's just-written rows** — otherwise the becak failure re-appears (see grounding). Checks:
- **Distractors** (`checkVocabEnrichments` §12): each array length=3; never equal to the answer; **no duplicate within an array** (`linguist-reviewer.md:281`); same word-class via `learning_items.pos`; all distractors in the cumulative known-word pool — **pool source is `learning_items.translation_{nl,en}`, NOT `item_meanings`** (PR 1 stopped writing `item_meanings` for items — architect finding); **no morphological variant of the answer** for `cued_recall` (`linguist-reviewer.md:283`, e.g. no `membeli`/`dibeli` when answer is `beli`).
- **Coverage** (`checkVocabCoverage`): every word/phrase item has distractors generated.
- **POS** (`checkLearningItemsPos`): present + in `VALID_POS`.
- **Duplicates** (`findDuplicateItems`): no cross-lesson duplicate items (uses the DB pool — the legitimate Capability-Gate asymmetry).

Wire into `runCapabilityGate` post-write. TDD each validator with a passing + failing fixture (incl. a morphological-variant and an intra-array-duplicate failing case). Commit.

## Task 8: Wire the curated-distractor runtime reader (LOCKED `exercise-content`)

> Architect finding: the item-kind `capability_artifacts` reader is **mostly already retired** — `byKind/item.ts:208-214` sets `artifactsByKind: new Map()` and never calls `fetchArtifacts`; translations moved to inline columns in PR 1. So this task's net-new work is the **curated-distractor reader**, not artifact removal.

**Files:**
- Modify: `src/lib/exercise-content/byKind/item.ts` (fetch the three curated tables by `capability_id` for item caps), `byType/{recognitionMcq,cuedRecall,clozeMcq}.ts` (item-sourced MCQ: prefer the curated row, fall back to `pickDistractorCascade` — OQ-2 scope), `adapter.ts:318-330` (confirm `fetchArtifacts` is not invoked on the item path)
- Test: `src/lib/exercise-content/__tests__/resolver.test.ts` (+ item-specific)

**First** confirm (don't assume) the item path reads nothing item-shaped from `capability_artifacts`. Add the curated-distractor fetch keyed on `capability_id`; the byType item MCQ builders prefer it and fall back to the pool when absent (so the change is **deploy-order-independent** — pre-generation it renders fallback, post-generation curated). Flip Task 1's no-legacy-item-reader test (`fetchArtifacts` not called on the item path) from skipped to active; it must go green. Add a renderer test: an item recognition exercise renders **curated** (not random) distractors when a curated row exists, fallback when absent. TDD per change. Commit.

## Task 9: `translation_nl` backfill (116 items)

**Files:**
- Modify: `runner.ts` or a one-shot `scripts/` backfill
- Test: assertion that post-run `learning_items where source_type='lesson' and translation_nl is null = 0`

Per the source-of-truth split (memory `feedback_pipeline_is_writer_not_db`): the `translation_{nl,en}` columns on `learning_items` are **lesson-derived** (pipeline-is-writer regime), distinct from the capability-authored fields the Idempotency contract protects. So the backfill **UPDATEs `translation_nl` from the typed item rows' `l1_translation` on existing rows** — this does NOT conflict with the item-row seed skip-if-exists (Task 6), because skip-if-exists guards *capability* fields/corrections (FSRS, distractors) while the lesson-derived translation columns are refreshed from the canonical lesson source. State this reconciliation explicitly so an implementer doesn't read "skip-if-exists" and conclude translations can't be refreshed. Prefer the re-publish path over raw SQL; confirm the 116 are reachable via the 7 populated + 2 gap lessons; any item with no surviving lesson source is a separate finding. Commit.

## Task 10: Integration + idempotency + liveness proof (US #13)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/__tests__/integration/itemSpine.test.ts`

Seed lesson-content fixtures → run the item path → assert expected `learning_items` + `item` capabilities + curated distractor rows; run again → **nothing changed** (idempotency); `--regenerate <item>` → that item replaced, others untouched. **Hard assertion (architect):** after a publish the three distractor tables are **non-empty** for the published lesson — the single cheapest catch for a silently-skipped generator (e.g. `ANTHROPIC_API_KEY` absent in the live publish env, which the no-op seam makes silent). Then the **liveness proof** (operator step, not CI): publish a populated lesson on the homelab, confirm a real item capability renders with **curated** (not random) distractors and a `capability_review_events` row lands. Data presence ≠ feature works (memory `feedback_answer_log_check`).

---

## Gates (all must pass before the PR merges)

- [ ] Task-1 no-disk test green for the item path; no-legacy-item-reader test green.
- [ ] `loadFromDb` returns typed item content from the DB; no item-path staging read.
- [ ] Distractors **generated in-stage**; three tables non-empty after a publish; item MCQ renders curated (not random) distractors.
- [ ] `runCapabilityGate` is the stage's single gate entry; item checks run in-stage (removed from `lint-staging`).
- [ ] `learning_items.translation_nl` null-count = 0 for `source_type='lesson'`.
- [ ] Idempotency (ADR 0011): re-run writes nothing new across the **whole item write-set** (`learning_items` by `normalized_text`, capabilities by `canonical_key`, contexts, distractors by `capability_id`); a hand-corrected `learning_items` row survives a re-publish; `--regenerate <item>` replaces only that item.
- [ ] `bun run test` + `bun run lint` green; `make migrate-idempotent-check` green (no-op); `make pre-deploy` before the operator's live publish.
- [ ] Liveness: a real item capability renders curated distractors + a `capability_review_events` row lands.

## Deploy ordering

No schema change (verified). The Task 8 runtime reader prefers curated rows with a `pickDistractorCascade` fallback, so the new frontend code is **safe in either order** relative to the first in-stage generation publish: before generation it renders the fallback, after it renders curated. Ship the pipeline change and the frontend change independently; no coordinated cutover.

## Out of scope (later slices)

**Dialogue-chunk distractor generation** (deferred to #101 — `lesson_section_item_rows` is word/phrase only; see the resolved-decisions out-of-scope note). `pattern` spine + gate checks (#100); `dialogue_line` + `affixed_form_pair` spine + gate checks (#101); deletion of `lint-staging` + `buildLintStagingCommand` (when the last check moves); teardown/drop of `capability_artifacts`/`exercise_variants` (human-gated). The 2 lessons missing typed item rows are a Lesson-Stage re-publish concern (the L5/7/8 cloze-gap / Lesson Gate interaction), tracked separately.
