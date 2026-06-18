---
doc_type: process
surface: scripts/lib/pipeline/, scripts/publish-approved-content.ts, scripts/data/staging/
last_verified_against_code: 2026-05-14
status: stable
---

# Content pipeline

Authoring + publishing workflow for lessons 4+. Lessons 1–3 follow a separate legacy path (see §8 below).

For the *philosophy* of what the pipeline enforces (quality rules, contract semantics), see `docs/current-system/content-pipeline-and-quality-gates.md`. This doc covers the *operational* reality: what you do, what runs under the hood, and how to debug.

---

## 1. Two-stage architecture

Publishing a lesson runs two stages in sequence, gated by a pre-flight lint:

```
bun scripts/publish-approved-content.ts <N>
        │
        ▼
   lint-staging (CRITICAL only — refuses to continue on critical findings)
        │
        ▼
   Stage A = runLessonStage  ──► writes: lessons, lesson_sections, lesson_page_blocks, audio_clips
        │
        ▼  (Stage A returns lesson.id — Stage B requires it)
   Stage B = runCapabilityStage  ──► writes: content_units, learning_capabilities,
                                              capability_content_units, capability_artifacts,
                                              grammar_patterns, learning_items + meanings,
                                              item_anchor_contexts, exercise_variants,
                                              cloze_contexts
```

The split lives in `scripts/lib/pipeline/`:

| Module | Entry | Owns (DB write surface) |
|---|---|---|
| `lesson-stage/` | `runLessonStage` (`runner.ts:87`) | Lesson + sections + page-blocks + audio_clips |
| `capability-stage/` | `runCapabilityStage` (`runner.ts:115`) | Everything capability-related + learning_items |
| `podcast-stage/` | separate path | Podcast publishing (not covered here) |

Each stage is a deep module: `runner.ts` is the entry, `adapter.ts` is the DB-write seam, `model.ts` defines the input/output types, `validators/` contains pre-write gates, `enrich*.ts` files contain in-process backfill helpers.

CLI entry: `scripts/publish-approved-content.ts` (~85 LOC). The CLI is intentionally thin — just sequences Stage A → Stage B and translates failures to `process.exit(1)`.

---

## 2. The authoring loop (what you do to add a lesson)

For new lessons (4 and above). Each step writes outputs into `content/` or `scripts/data/staging/lesson-<N>/`.

| Step | Command | Owns | Output |
|---|---|---|---|
| 1. Photograph | manual | physical pages | `content/raw/lesson-<N>/*.jpg|*.heic` |
| 2. Convert + OCR | `bun scripts/convert-heic-to-jpg.ts <N>` + `bun scripts/ocr-pages.ts <N>` | OCR text | `content/extracted/lesson-<N>/page-N.txt` |
| 3. LLM section catalog | `bun scripts/catalog-lesson-sections.ts <N> [--level A1] [--force]` (requires ANTHROPIC_API_KEY) | Section boundaries, vocab/expressions/numbers/dialogue/text tagged with POS | `scripts/data/staging/lesson-<N>/sections-catalog.json` |
| 4. Generate staging files | `bun scripts/generate-staging-files.ts <N>` (deterministic) | All staging file scaffolds | `lesson.ts`, `learning-items.ts`, empty `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts` if absent |
| 5. Linguist Structurer agent | (agent) | Grammar/exercise sections in `lesson.ts`; grammar patterns; pattern brief | updated `lesson.ts`, `grammar-patterns.ts`, `pattern-brief.json` |
| 6. Exercise + Cloze Creator agents (parallel) | three agents | Candidates, vocab enrichments, cloze contexts | `candidates.ts`, `vocab-enrichments.ts`, `cloze-contexts.ts` |
| 7. Linguist Reviewer agent | (agent) | Validation report | `review-report.json` |
| 8. Publish | `bun scripts/publish-approved-content.ts <N> [--dry-run]` | DB write via Stage A + Stage B | rows in Supabase |

> **Legacy lessons (1–3) shortcut:** If the content already lives in Supabase, skip steps 1–4 and run `bun scripts/reverse-engineer-staging.ts <N>` to pull from the DB. Then proceed from step 5.

**Publishing policy:** Everything publishes immediately. There is no manual approval gate. All content (`pending_review` and `approved`) is published as-is. The pipeline always emits `quality_status: 'approved'` for generated artifacts. Review and correction happens live in the app via the admin account.

---

## 3. Stage A — `lesson-stage`

**Owns:** `lessons`, `lesson_sections`, `lesson_page_blocks`, `audio_clips`.

**Inputs:** Staging files (`lesson.ts`, `lesson-page-blocks.ts` if present).

**Sequence** (per `runner.ts:77-86`):

1. Load staging from disk.
2. **Enrich** (pre-validation, in-process):
   - `grammar_topics` — deterministic path always runs (forced during dry-run); LLM path adds richer chips when not dry-run. Mutates `staging.lesson.sections` in place. `enrichGrammarTopics.ts`.
   - `dialogue_translations` — fills empty `content.lines[].translation` via LLM. Skipped in dry-run. `enrichDialogueTranslations.ts`.
   - Writes enriched staging back to disk (skipped in dry-run, via `stagingWriteback.ts`).
3. **Validate** (GT1–GT7, `validators/`):
   - GT1 `grammarTopics` — runs after enrichment so it sees populated values.
   - GT2 `blockKind` — runs after classifier.
   - GT3 `payloadAudio` — every section/page-block referencing audio has the expected payload shape.
   - GT4 `lessonVoices` — voices are configured consistently with the dialogue sections.
   - GT5 `sectionType` — section types are within the allowed enum.
   - GT6 `perItem` — per-item shape (base_text, translations) is well-formed.
   - GT7 `lessonAudio` — top-level lesson audio config is sane.
4. **Short-circuit** if any validator returns CRITICAL findings.
5. **Dry-run returns early** — no DB writes, no audio synthesis.
6. **Classify** page-block kinds (legacy 5-value → canonical 7-value, `classifier.ts`).
7. **Adapter writes**: `upsertLesson`, `upsertLessonSections`, `upsertLessonPageBlocks` (`adapter.ts`).
8. **Audio synthesis** — per-text TTS via `audio.ts`. Reads `lesson.dialogue_voices` + section content, calls Google Cloud TTS, uploads to Supabase Storage, writes `audio_clips` rows.
9. **Return** `LessonStageOutput` (typed report — see `model.ts`).

**Stage A failure → fix path:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `block_kind invalid` finding | Authoring used a legacy enum value | Re-author the offending block in `lesson.ts` or rely on the classifier's legacy fallback |
| `grammar_topics empty` after enrichment | LLM failure during enrichment | Re-run; check ANTHROPIC_API_KEY |
| `dialogue translation missing` in non-dry-run | Enricher failed | Re-run; if persistent, hand-author the missing `translation` field |
| `payload audio shape` finding | `audioUrl` / `audio_url` mistyped in staging | Fix the staging field name |

---

## 4. Stage B — `capability-stage`

**Owns:** Everything capability + learning-item: `content_units`, `learning_capabilities`, `capability_content_units`, `grammar_patterns` + the 4 typed grammar-exercise tables, `learning_items` + anchor_contexts, the typed `dialogue_clozes` / `affixed_form_pairs` tables, and item distractor tables (`recognition_mcq_distractors` / `cued_recall_distractors`).

**Inputs — DB-only (Slice 5b #147, ADR 0011/0012):**
- Stage A's DB outputs (lessons + sections + audio_clips), loaded via `loader.ts`.
- The typed DB content tables Stage A / prior runs wrote: `lesson_section_item_rows` (`loadFromDb.ts`), typed grammar categories (`loadPatternFromDb`), `lesson_dialogue_lines` (`loadDialogueFromDb`), `lesson_section_affixed_pairs` (`fetchAffixedPairsFromDb`).
- **No staging files are read.** The loader performs zero disk I/O — enforced by the global no-disk gate (`__tests__/enforcement/noDiskReads.test.ts`).

**Sequence** (per `runner.ts`):

1. Load Stage A outputs from the DB (`loader.ts`), then pre-load the typed item rows + project them (`projectItemsFromTypedRows`) so the pre-write gate can validate real item data.
2. **Validate (pre-write gate, `gate.ts` → `validators/`):** item checks (`perItemMeaning` / `itemTranslations` / `itemSeparatorConvention` / `itemLength` / `pos`) run against the typed item projection. Grammar/candidate structural checks are covered DB-natively (the pattern path + CS18) and by `lint-staging`, so the gate is passed `[]` for those.
3. **Short-circuit** on CRITICAL findings.
4. **Dry-run returns early** — DB-only: loads from the DB, runs the pre-write gate, and returns before any write. Requires a real `lessonId` (Stage A must have run live first).
5. **Project + write (DB-native emitters), in dependency order:**
   - `content_units` (DB-native builder; grammar units aligned to the pattern path's slugs) → junction `capability_content_units`.
   - item caps via `upsertCapabilitiesSkipIfExists` (FSRS-safe), item `learning_items` + anchor contexts via idempotent upsert, item distractors via the in-stage generator.
   - DB-native POS backfill: `enrichPos` classifies null-pos word/phrase items, written via `updateLearningItemPos` (the sole POS writer; ADR 0012 tracked exception — POS stays in this stage).
   - pattern path (`writePatternPath`) — grammar_patterns + the 4 typed grammar-exercise tables.
   - dialogue-line clozes (in-stage generator → typed `dialogue_clozes`), affixed pairs (typed `affixed_form_pairs`).
   - `retireOrphanedCapabilities` soft-retires caps whose canonical_key dropped out of the emit set.
6. **Verify hooks (post-write gate, `verify/` + item/pattern validators):**
   - CS7 `countParity` — DB row counts ≥ declared counts.
   - CS8 `contentNonEmpty` / CS9 `seedIntegrity` — written rows are non-empty + referentially sound.
   - CS14–CS17 item-kind checks (POS / distractor coverage + quality / cross-lesson dup); CS18 pattern coverage; CS22 dialogue-cloze coverage.
7. **Promote capabilities** — `applyPromotionPlan` flips newly-published capabilities draft → ready/published (only when `status === 'ok'`).
8. **Return** `CapabilityStageOutput`.

> **Retired (Slice 5b #147):** the staging-derived projectors (`projectVocab` / `projectGrammar` / `projectCloze`), the staging regeneration + disk snapshots, `stagingWriteback`, the legacy `exercise_variants` writer, and the cloze `item_contexts` re-seed. `capability_artifacts` was dropped in Slice 4b. The authored cloze `item_contexts` rows are preserved in the DB (ADR 0011 seed-once) as #148's item-cloze substrate.

Per-hook failure produces `status: 'partial'` with aggregated findings — the run is not aborted, but the CLI exits non-zero so CI catches it.

**Stage B failure → fix path:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `Invalid POS value` finding | A learning item has POS outside the 12-value taxonomy | Re-run `catalog-lesson-sections.ts` to retag, or hand-edit `learning-items.ts` |
| `Missing meaning artifact` finding | `learning-items.ts` row has no `translation_nl` | Fix the staging row (or run reverse-engineer if it should come from DB) |
| `Broken candidate payload` finding | An exercise candidate's payload doesn't match the renderer's expected shape | Re-run `grammar-exercise-creator` agent for that pattern |
| `Unresolved cloze slug` finding | A cloze context references a learning item slug that doesn't exist | Re-run `cloze-creator` agent |
| CS7 count parity mismatch | Bug in projectors or upsert ordering | Inspect the typed output's `findings` array — it names which row count diverged |

---

## 5. Staging files — canonical vs derived

Inside `scripts/data/staging/lesson-<N>/`:

**Canonical (hand-authored or agent-authored; do not regenerate without intent):**

| File | Written by |
|---|---|
| `sections-catalog.json` | `catalog-lesson-sections.ts` (LLM) |
| `lesson.ts` | `generate-staging-files.ts` + `linguist-structurer` agent |
| `learning-items.ts` | `generate-staging-files.ts` + enrichment writeback during Stage B |
| `grammar-patterns.ts` | `linguist-structurer` agent |
| `morphology-roots.ts` | `linguist-structurer` agent (systematic-affix lessons only — the lean `(root, affix, illustratesCategory)` judgment) |
| `morphology-patterns.ts` | **Authoring-time regenerated** by `scripts/generate-morphology-patterns.ts` from `morphology-roots.ts` (deterministic engine + slug mint). Hand-edits are overwritten on the next run — edit `morphology-roots.ts` instead. Run after the structurer, before publish. |
| `pattern-brief.json` | `linguist-structurer` (intermediate brief) |
| `candidates.ts` | `grammar-exercise-creator` agent |
| `vocab-enrichments.ts` | `vocab-exercise-creator` agent |
| `cloze-contexts.ts` | `cloze-creator` agent |
| `review-report.json` | `linguist-reviewer` agent |
| `index.ts` | `generate-staging-files.ts` (barrel export) |

**Derived capability snapshots — RETIRED (Slice 5b #147).** The capability stage
used to regenerate `content-units.ts` / `capabilities.ts` / `exercise-assets.ts`
inside the runner and write them back to disk. The stage is now DB-only: it
projects `content_units` + capabilities directly into the DB from the typed
content tables and writes no snapshot files. (`lesson-page-blocks.ts` was already
retired with the `lesson_page_blocks` table in PR 5.) The canonical authoring
files above (`learning-items.ts`, `grammar-patterns.ts`, …) are still read by
**Stage A** and the linguist agents; only the Capability Stage stopped reading
disk.

---

## 6. Dry-run vs apply

`--dry-run` is **DB-only** as of Slice 5b (#147). The Capability Stage reads only
the database, so a meaningful Stage B dry-run needs DB state that only a live
Stage A produces. The CLI therefore:
- Runs **Stage A LIVE** (lesson content is the DB projection of staging —
  idempotent + FSRS-safe to re-write), producing the `lessonId`.
- Runs **Stage B in dry-run**: loads from the DB, runs the pre-write gate, and
  returns **before any capability/distractor/grammar write**.
- **Requires `SUPABASE_SERVICE_KEY`** (DB access). The old "staging-only dry-run
  without a service key" mode is gone (`loadLessonForDryRun` deleted). For an
  offline staging-shape check, run `scripts/lint-staging.ts` directly.

`--skip-lint` skips the pre-flight `lint-staging` gate.

---

## 7. Health checks

Run after publishing or any time you suspect drift:

```bash
make check-supabase            # tier 1: API, CORS, schema exposure, auth, storage
make check-supabase-deep       # tier 2: tables, RLS, grants, policies via schema_health() RPC
make migrate-idempotent-check  # applies migration.sql twice + check-supabase-deep
make pre-deploy                # full gauntlet: lint + test + build + tier 1 + tier 2
```

`make migrate-idempotent-check` is the documented gate before merging schema changes — it catches the bulk-drop class of bugs that wiped policies in 2026-05-02 / 2026-05-08.

---

## 8. Legacy lessons (1–3) — separate path

These predate the pipeline. Content lives in `scripts/data/lessons.ts` + `scripts/data/vocabulary.ts`.

```bash
make seed-lessons     SUPABASE_SERVICE_KEY=<key>
make seed-vocabulary  SUPABASE_SERVICE_KEY=<key>
```

**Do not use this path for lessons 4+.** The seed-* targets write only to `lessons`, `lesson_sections`, `vocabulary`, and `learning_items`. They do not produce capability rows; the bridge from these lessons into the capability runtime is the `requiredSourceProgress.kind: 'none'` projection at `src/lib/capabilities/capabilityCatalog.ts` (the "legacy_projection" reason).

For shared infrastructure not tied to a specific lesson:

```bash
make seed-podcasts    SUPABASE_SERVICE_KEY=<key>   # podcast audio + transcripts
make seed-all         SUPABASE_SERVICE_KEY=<key>   # legacy lessons + vocabulary
```

---

## 9. Where to look for what

| Question | File |
|---|---|
| What does Stage A actually own? | `scripts/lib/pipeline/lesson-stage/runner.ts:77-86` (the JSDoc) |
| What does Stage B actually own? | `scripts/lib/pipeline/capability-stage/runner.ts:1-33` |
| The CLI invocation | `scripts/publish-approved-content.ts` |
| Quality philosophy + contract semantics | `docs/current-system/content-pipeline-and-quality-gates.md` |
| Architectural rules | `docs/target-architecture.md` (§ Local pipeline) |
| ADRs that shape this | `docs/adr/0001-0005` (capability core, stages derived, FSRS-on-capabilities, atomic review commits, lesson reader passivity) |
