---
status: approved
approved_at: 2026-05-22
doc_type: data-model-migration-plan
migration_shape: additive+republish+final-cleanup
last_verified_against_code: 2026-05-22
supersedes: 2026-05-21-data-model-migration.md
depends_on:
  - 2026-05-21-data-model-target.md
  - 2026-05-21-data-model-investigation.md
---

# Data-model migration plan — current → target

**Role:** This plan sequences the migration described in `docs/plans/2026-05-21-data-model-target.md`. It follows an additive + re-publish + final-cleanup shape. The pipeline (`bun scripts/publish-approved-content.ts <N>`) is the authoritative writer; the DB is a projection of canonical staging files, not a source of truth. SQL-level backfills are not used for content tables.

**What this doc is not:** A schema reference. All DDL for new typed tables lives in `docs/plans/2026-05-21-data-model-target.md`. This plan governs sequencing, the writer/reader/validator triangle per PR, gating, and rollback.

---

## §1. Fundamental model: the DB is a projection

Content tables (`learning_items`, `learning_capabilities`, `capability_artifacts`, `lesson_sections`, etc.) are fully regenerable by running `bun scripts/publish-approved-content.ts <N>` across all 9 lessons. The canonical source is `scripts/data/staging/lesson-N/` + `scripts/data/lessons.ts`.

**Migration strategy for Category A (regenerable content):**
1. Add new typed tables and columns to `scripts/migration.sql` (additive DDL only — no drops yet).
2. Update the pipeline writer (projector), validator, and reader for the target source_kind.
3. Re-publish all lessons — the pipeline populates the new shape from canonical staging files.
4. Final cleanup PR drops everything no longer read, once all readers have switched.

**Migration strategy for Category B (user state — precious):**
- `profiles`, `user_roles`, `learner_capability_state`, `learner_lesson_activation`, `capability_review_events`, `learning_sessions`, `error_logs` — preserve. No drops, no renames, no migrations of learner rows.

### §1.1 Capability ID stability across re-publish

**Finding (verified against `scripts/lib/pipeline/capability-stage/adapter.ts:116-146`):** `upsertCapabilities` upserts on `onConflict: 'canonical_key'` and returns the existing `id`. UUIDs in `learning_capabilities` are stable across re-publishes. A re-publish updates the row in place; the PK never changes.

**Consequence:** `learner_capability_state` and `capability_review_events` rows referencing `learning_capabilities.id` survive the migration unchanged. No canonical_key bridge step is needed.

### §1.2 The 7 pipeline gates

Every per-source-kind PR must pass all 7 gates before merging:

| Gate | What it proves |
|---|---|
| **G1 — Ingestion** | Staging files for the target source_kind exist and have the required shape. |
| **G2 — Authoring** | Staging file shape is valid under the new typed-column contracts. |
| **G3 — Lesson-stage publish** | Stage A runs clean; lesson + sections + audio_clips write correctly. |
| **G4 — Capability-stage publish** | Stage B runs clean; the typed satellite for the target source_kind has rows; `check-supabase-deep` no-orphan check passes. |
| **G5 — Activation** | `set_lesson_activation` RPC activates the lesson; `learner_lesson_activation` row exists. |
| **G6 — Session build** | `buildSession` returns capabilities of the target source_kind; planner's `validateCapability` returns `ready`. |
| **G7 — Learning** | Render → answer → `capability_review_events` row lands with `source_kind = '<target>'`. This is the definition-of-done anchor. |

**G7 is deterministic, not 48h-wait (decision Q4):** immediately after deploy + re-publish, the `?force_capability=<canonical_key>` bypass (built in PR 0, §3.8) drives one card through the full chain and queries `capability_review_events`. At 2-user scale, a 48h wait produces false negatives ("broken" vs "nobody logged in" are indistinguishable). The bypass-driven check is structurally equivalent and eliminates the noise.

### §1.3 Capability ordering — tracer bullet first

1. **`item` (PR 1)** — simplest source_kind; 3,900 caps already rendering. Proves the pattern.
2. **`dialogue_line` (PR 2)** — multi-line context, audio refs, L1 translation. 7 caps.
3. **`affixed_form_pair` (PR 3)** — morphology; 2 caps per linguistic pair. 4 caps.
4. **`pattern` (PR 4)** — most complex: 4 new typed exercise tables, routing widening in `renderContracts.ts`, first-ever live grammar exercises. 94 caps.

### §1.4 Per-PR template

Every source_kind PR (PRs 1–4) fills in these items:

```
1. DDL (additive only — no drops)
   - New typed table(s): CREATE TABLE IF NOT EXISTS with all columns, PKs, FKs, UNIQUEs.
   - RLS: ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
   - Policies: DROP POLICY IF EXISTS; CREATE POLICY (per CLAUDE.md — no bulk-drop).
   - Grants: GRANT SELECT TO authenticated; REVOKE INSERT,UPDATE,DELETE FROM authenticated;
             GRANT ALL TO service_role.
   - COMMENT ON: every table + non-obvious column.
   - FK indexes: CREATE INDEX IF NOT EXISTS on every FK column.
   - All DDL idempotent (IF NOT EXISTS guards, per-policy DROP IF EXISTS; CREATE).

2. Pipeline writer (projector)
   - File: scripts/lib/pipeline/capability-stage/projectors/<source_kind>.ts
   - Writes the new typed satellite rows.
   - OLD capability_artifacts writes are removed in the same PR (no dual-write needed —
     the re-publish IS the migration; there is no live reader on the old path during deploy).

3. Pre-write validator
   - File: scripts/lib/pipeline/capability-stage/validators/<source_kind>.ts
   - Enforces column names, types, required-vs-optional match with the typed table.
   - Fails CRITICAL (aborts publish) on missing required fields.

4. Reader rewrite (fail-loud — §1.5)
   - File: src/lib/exercise-content/byKind/<source_kind>.ts (or byType/<exercise_type>.ts)
   - Reads from the new typed table; throws CapabilityDataMissingError on empty result.
   - Old fetchArtifacts call sites removed in the same PR.

5. Re-publish
   - bun scripts/publish-approved-content.ts <N> for all affected lessons.
   - This populates the new typed tables. No SQL UPDATE backfill.

6. E2E test (§1.6 pattern)
   - e2e/<source_kind>.spec.ts using the ?force_capability bypass.
   - Written before schema/pipeline changes; confirmed to fail on old schema (TDD guard).

7. Health check additions
   - scripts/check-supabase-deep.ts: add the no-orphan query for this source_kind (§1.7).

8. Rollback
   - Revert the writer and reader code; re-publish on old code path.
   - Old capability_artifacts rows are gone — but the old projector can regenerate them
     on re-publish if the revert restores the artifact-write code path.
   - No schema rollback needed for additive DDL (new tables are inert if nothing reads them).
```

### §1.5 Fail-loud policy

From PR 1 forward, the pipeline and runtime **fail loudly** rather than silently skipping:

- **Reader rule:** every typed-table read that returns empty when `learning_capabilities` says the cap is ready → throw `CapabilityDataMissingError`. Do not return `null`; do not fall back silently.
- **Writer rule:** every projector that tries to write a typed table row without a required column → DB `NOT NULL` catches it at write time. The pre-write validator catches it before reaching the DB.
- **Validator rule:** every pre-write validator that finds a missing required field → CRITICAL finding that aborts the publish.

This is the direct cure for the dialogue-cloze silent-skip incident.

### §1.6 E2E test pattern (bypass-driven)

Every PR's E2E test uses the `?force_capability=<canonical_key>` bypass rather than a real session deck:

```ts
// e2e/<source_kind>.spec.ts
import { test, expect } from '@playwright/test'
import { bypassSupabaseCors, login } from './_helpers'

const TARGET_CAP_KEY = '<canonical_key>'
const TARGET_SOURCE_KIND = '<source_kind>'

test('<source_kind>: bypass → answer → G7 row lands', async ({ page }) => {
  await bypassSupabaseCors(page)
  await login(page, { admin: true })
  const start = new Date().toISOString()
  await page.goto(`/session?force_capability=${encodeURIComponent(TARGET_CAP_KEY)}`)
  await page.locator('[data-exercise-type]').waitFor()
  await submitAnswer(page, '<correct-or-wrong>')
  const { data } = await sb.schema('indonesian')
    .from('capability_review_events')
    .select('capability_id, learning_capabilities!inner(source_kind)')
    .gte('created_at', start)
  expect(data.some(r => r.learning_capabilities.source_kind === TARGET_SOURCE_KIND)).toBe(true)
})
```

The `_helpers.ts` module is extracted in PR 0 from `e2e/session.spec.ts:9-44`. Kong allows only `.duin.home` origins; the CORS-bypass shim is required for Playwright on `localhost:5175`.

### §1.7 No-orphan invariant

After each typed table lands, `scripts/check-supabase-deep.ts` gains:

```ts
// Every capability of source_kind X has exactly one row in <typed_table>.
SELECT c.canonical_key
FROM indonesian.learning_capabilities c
LEFT JOIN indonesian.<typed_table> t ON t.capability_id = c.id
WHERE c.source_kind = '<source_kind>'
  AND t.id IS NULL
LIMIT 5
-- Expect: zero rows.
```

For grammar exercise tables (FK is `grammar_pattern_id` not `capability_id`): join via `learning_capabilities.source_ref → grammar_patterns.slug → <typed_table>.grammar_pattern_id`.

---

## §2. PR roadmap

| PR | Title | Depends on | Status |
|---|---|---|---|
| **PR 0** | Additive foundation: infra + typed table DDL + leaderboard retire + `?force_capability` bypass | — | in progress (6 commits done) |
| **PR 1** | Item source_kind: writer + reader + re-publish | PR 0 | not started |
| **PR 2** | Dialogue line source_kind: writer + reader + re-publish | PR 0 | not started |
| **PR 3** | Affixed form pair source_kind: writer + reader + re-publish | PR 0 | not started |
| **PR 4** | Pattern source_kind: writer + reader + routing widening + re-publish | PR 0 | not started |
| **PR 5** | Lesson blocks (Stage A): typed satellites + re-publish | PR 0 | not started |
| **PR 6** | Lesson sections (Stage A): typed satellites + re-publish | PR 5 | not started |
| **PR 7** | Final cleanup: drop everything no longer read | PRs 1–6 | not started |

**Parallelism:** PRs 1–4 can start simultaneously after PR 0. PRs 5–6 are orthogonal to PRs 1–4. PR 7 waits for all.

---

## §3. PR 0 — Additive foundation

**Shape:** All work in PR 0 is additive or code-only. No drops; no data-loss risk. Safe to merge independently.

**6 commits already done on `pr-0-data-model-migration` branch (stand as-is):**
- `0570f59` — Extract `e2e/_helpers.ts`
- `8ab22f3` — `?force_capability` dev bypass
- `78620ba` — Add `learning_capabilities.prerequisite_keys`
- `2e4af28` — Add `learning_capabilities.required_artifacts`
- `f81bd53` — Switch projection to typed columns
- `9cda942` — Add `lesson_speakers` + redirect writers

**Remaining work in PR 0:**

### §3.1 Add all new typed satellite tables (additive DDL)

Add `CREATE TABLE IF NOT EXISTS` blocks to `scripts/migration.sql` for every typed satellite introduced by PRs 1–4. Tables are empty until the per-PR re-publish populates them.

Tables to add (full DDL from `docs/plans/2026-05-21-data-model-target.md`):

**Item source_kind satellites:**
- `capability_audio_refs` — binds capabilities to audio clips (replaces audio_clip artifact rows)
- `recognition_mcq_distractors` — curated NL wrong-options per cap
- `cued_recall_distractors` — curated Indonesian wrong-options per cap
- `cloze_mcq_item_distractors` — curated filler-word strings per cap

**Dialogue line satellites:**
- `lesson_dialogue_lines` — typed per-line rows; FK to `lesson_sections`; `lesson_id` not null
- `dialogue_clozes` — one row per dialogue_line cap; `sentence_with_blank` + `answer_text`

**Affixed form pair satellite:**
- `affixed_form_pairs` — one row per capability (2 per linguistic pair); `root_text`, `derived_text`, `allomorph_rule`

**Pattern satellites:**
- `grammar_pattern_examples` — typed example sentences per grammar pattern
- `contrast_pair_exercises`
- `sentence_transformation_exercises`
- `constrained_translation_exercises`
- `cloze_mcq_exercises`

Every table gets: PK, FKs, FK indexes, RLS enabled, per-policy `DROP POLICY IF EXISTS; CREATE POLICY`, `GRANT SELECT TO authenticated`, `REVOKE INSERT,UPDATE,DELETE FROM authenticated`, `GRANT ALL TO service_role`, `COMMENT ON`.

### §3.2 Add `meaning_recall` + `cloze_mcq` to `exercise_type_availability`

```sql
insert into indonesian.exercise_type_availability
  (exercise_type, session_enabled, rollout_phase, created_at)
values
  ('meaning_recall', true, 'full', now()),
  ('cloze_mcq',      true, 'full', now())
on conflict (exercise_type) do nothing;
```

### §3.3 Retire the leaderboard (decision Q1)

```sql
drop view if exists indonesian.leaderboard;
```

Code-path removals in same PR:
- Delete `src/services/leaderboardService.ts`
- Delete `src/pages/Leaderboard.tsx`
- Delete `src/__tests__/leaderboardService.test.ts`
- Remove `/leaderboard` route from `src/App.tsx`
- Remove sidebar entry from `src/components/Sidebar.tsx:39`
- Delete `LeaderboardEntry` + `LeaderboardMetric` from `src/types/learning.ts:272-283`
- Remove leaderboard i18n keys from `src/lib/i18n.ts` (verify set via `git grep -n "leaderboard" src/lib/i18n.ts`)

No-missed-consumer gate: `git grep -niE 'leaderboard|LeaderboardEntry|LeaderboardMetric' src/` returns zero non-comment hits.

`scripts/migration.sql` co-edit: remove `create view indonesian.leaderboard ...` block + any GRANT on the view.

`learner_lesson_activation` is NOT dropped — still the canonical "lessons opted into" store.

### §3.4 Verify capability ID stability (done — §1.1)

`adapter.ts:116-146` confirms UUIDs stable on re-publish. No bridge step needed.

### §3.5 PR 0 gate

- `make migrate-idempotent-check` (applies `scripts/migration.sql` twice; second run must be clean)
- `make pre-deploy`
- Smoke: dashboard loads; no leaderboard nav; admin navigates to `/session?force_capability=<known-key>`; one card renders; answer it; `capability_review_events` gains the row.

**Writer/Reader/Validator triangle for PR 0:** No new content tables introduced with live readers. `lesson_speakers` (from commit `9cda942`) has: writer = `lesson-stage/audio.ts`; reader = `lesson-stage/audio.ts`; validator = DB PK `(lesson_id, speaker)`. All typed satellite tables added in §3.1 have no live readers yet — they become readers in PRs 1–4.

---

## §4. PR 1 — Item source_kind

**Target typed tables:** `learning_items.translation_nl/en/usage_note` (new columns), `capability_audio_refs`, `recognition_mcq_distractors`, `cued_recall_distractors`, `cloze_mcq_item_distractors`.

**Decision R:** `item_meanings` (1,248 rows) collapses into `learning_items.translation_nl` + `translation_en` + `usage_note`. Only NL + EN used in practice; no multi-sense per language.

### §4.1 DDL (additive)

```sql
-- Extend learning_items with translation columns.
alter table indonesian.learning_items
  add column if not exists translation_nl text,
  add column if not exists translation_en text,
  add column if not exists usage_note     text;
```

The `capability_audio_refs` and 3 distractor tables were added in PR 0 §3.1. No additional DDL here.

### §4.2 Pipeline writer

`scripts/lib/pipeline/capability-stage/projectors/vocab.ts`:
- Write `learning_items.translation_nl` + `translation_en` from staging items.
- Write `capability_audio_refs` rows (replaces artifact kind `audio_clip`).
- Write `recognition_mcq_distractors`, `cued_recall_distractors`, `cloze_mcq_item_distractors` from `vocab-enrichments.ts`.
- Remove `item_meanings` writes (table is retired at end of this PR — see cleanup below).
- Remove `capability_artifacts` writes for item-sourced kinds (`base_text`, `meaning:l1`, `accepted_answers:*`, `audio_clip`).

### §4.3 Pre-write validator

`scripts/lib/pipeline/capability-stage/validators/itemTranslations.ts`:
- Assert `translation_nl is not null` for every learning_items row. CRITICAL if not.
- Assert `distractors` arrays are non-empty for each distractor table row. CRITICAL if not.

### §4.4 Reader rewrite (fail-loud)

`src/lib/exercise-content/byKind/item.ts`:
- Read `learning_items.translation_<userLanguage>` directly (not `item_meanings`).
- Read `capability_audio_refs JOIN audio_clips` for audio resolution (not `artifactsByKind.get('audio_clip')`).
- Read `recognition_mcq_distractors` / `cued_recall_distractors` / `cloze_mcq_item_distractors` per exercise type.
- Throw `CapabilityDataMissingError` if `translation_nl` is null for a ready item cap.
- Remove all `fetchArtifacts` call sites for item-sourced artifact kinds.

Also update `src/lib/session-builder/adapter.ts` — the planner-side artifact reader for `validateCapability` — to read from `learning_items + translations + audio_refs` instead of `capability_artifacts` for item-sourced caps.

Coverage service co-edit: `src/services/coverageService.ts:76` reads `item_meanings` — switch to `learning_items.translation_nl is not null`.

### §4.5 Re-publish

```bash
for N in 1 2 3 4 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts $N
done
```

This populates `learning_items.translation_nl/en`, `capability_audio_refs`, and distractor tables from staging. No SQL backfill.

### §4.6 Cleanup (same PR, after re-publish confirmed)

```sql
-- Drop item_meanings (Decision R — translations now on learning_items).
-- Confirm re-publish populated translation_nl for all items first.
drop table if exists indonesian.item_meanings cascade;
```

`scripts/migration.sql` co-edit: remove `CREATE TABLE indonesian.item_meanings ...` block + indexes + RLS + grants.

### §4.7 Gates

- G4: `SELECT count(*) FROM learning_items WHERE translation_nl IS NULL` = 0
- G4: `SELECT count(*) FROM capability_audio_refs` > 0
- G7: `?force_capability=item:masak.text_recognition` → answer → `capability_review_events` row with `source_kind='item'`
- No-orphan: every `learning_capabilities WHERE source_kind='item'` has `learning_items` + audio ref rows

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `learning_items.translation_nl/en` | `projectors/vocab.ts` | `byKind/item.ts` | `validators/itemTranslations.ts` + DB (nullable until re-publish; NOT NULL added post-verify) |
| `capability_audio_refs` | `projectors/vocab.ts` | `byKind/item.ts` audio path | DB PK FK NOT NULL |
| `recognition_mcq_distractors` | `projectors/vocab.ts` | `byKind/item.ts` distractor path | DB `text[] not null` + validator |
| `cued_recall_distractors` | same | same | same |
| `cloze_mcq_item_distractors` | same | same | same |

**Rollback:** revert writer + reader code; re-publish restores the old shape. New tables are inert (additive). `item_meanings` drop is the irreversible step — archive before dropping.

---

## §5. PR 2 — Dialogue line source_kind

**Target typed tables:** `lesson_dialogue_lines`, `dialogue_clozes` (both added in PR 0 §3.1 — empty).

### §5.1 Pipeline writer

Stage A `lesson-stage/runner.ts`: write `lesson_dialogue_lines` rows (one per line in dialogue sections).

Stage B `projectors/dialogueArtifacts.ts`:
- Write `dialogue_clozes` typed rows (`sentence_with_blank`, `answer_text`).
- Remove `capability_artifacts` writes for dialogue kinds (`cloze_context`, `cloze_answer`, `translation:l1`).

### §5.2 Pre-write validators

`scripts/lib/pipeline/capability-stage/validators/dialogueCloze.ts`: `sentence_with_blank` contains exactly one blank marker; `answer_text` non-empty. CRITICAL if not.

`scripts/lib/pipeline/lesson-stage/validators/dialogueLines.ts`: every line in every dialogue section has `line_text` and `translation` non-empty. CRITICAL if not.

### §5.3 Reader rewrite (fail-loud)

`src/lib/exercise-content/byKind/dialogueLine.ts`:

```sql
SELECT dc.sentence_with_blank, dc.answer_text,
       dl.line_text, dl.speaker, dl.translation
FROM   indonesian.dialogue_clozes dc
JOIN   indonesian.lesson_dialogue_lines dl ON dl.id = dc.dialogue_line_id
WHERE  dc.capability_id = ANY($cap_ids)
```

Throw `CapabilityDataMissingError` if result is empty for a ready cap. Remove 3-artifact `fetchArtifacts` path.

Update `propagateDialogueTranslations.ts` to read from `lesson_dialogue_lines` instead of `lesson_sections.content.lines[]`.

### §5.4 Re-publish (L9 only — dialogue_line caps exist only there)

```bash
bun scripts/publish-approved-content.ts 9
```

### §5.5 Gates

- G4: `SELECT count(*) FROM dialogue_clozes` = 7
- G7: `?force_capability=<dialogue_line:L9/sec-X/line-Y.contextual_cloze>` → `capability_review_events` row with `source_kind='dialogue_line'`
- No-orphan: every `learning_capabilities WHERE source_kind='dialogue_line'` has a `dialogue_clozes` row

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `lesson_dialogue_lines` | `lesson-stage/runner.ts` | `byKind/dialogueLine.ts` JOIN | `validators/dialogueLines.ts` + DB NOT NULL + UNIQUE(section_id, line_index) |
| `dialogue_clozes` | `projectors/dialogueArtifacts.ts` | `byKind/dialogueLine.ts` | `validators/dialogueCloze.ts` + DB NOT NULL + UNIQUE on `capability_id` |

**Rollback:** revert writer + reader; re-publish. New typed rows become stale but cause no harm.

---

## §6. PR 3 — Affixed form pair source_kind

**Target typed table:** `affixed_form_pairs` (added in PR 0 §3.1 — empty).

### §6.1 Pipeline writer

`projectors/morphology.ts`:
- Write one `affixed_form_pairs` row per capability (2 per linguistic pair — one for recognition cap UUID, one for production cap UUID).
- Remove `capability_artifacts` writes for morphology kinds (`root_derived_pair`, `allomorph_rule`).

### §6.2 Pre-write validator

`scripts/lib/pipeline/capability-stage/validators/morphology.ts`: `root_text`, `derived_text`, `allomorph_rule` non-empty per row. CRITICAL if not.

### §6.3 Reader rewrite (fail-loud)

`src/lib/exercise-content/byKind/affixedFormPair.ts`:

```sql
SELECT afp.root_text, afp.derived_text, afp.allomorph_rule, lc.capability_type, lc.direction
FROM   indonesian.affixed_form_pairs afp
JOIN   indonesian.learning_capabilities lc ON lc.id = afp.capability_id
WHERE  afp.capability_id = ANY($cap_ids)
```

Throw `CapabilityDataMissingError` on empty result for a ready cap. The reader resolves direction from `lc.capability_type` (recognition vs production).

### §6.4 Re-publish (L9 only)

```bash
bun scripts/publish-approved-content.ts 9
```

### §6.5 Gates

- G4: `SELECT count(*) FROM affixed_form_pairs` = 4 (2 pairs × 2 caps)
- G7: `?force_capability=<affixed_form_pair cap key>` → `capability_review_events` with `source_kind='affixed_form_pair'`. First-ever live rendering of affixed_form_pair caps.
- No-orphan: every `learning_capabilities WHERE source_kind='affixed_form_pair'` has an `affixed_form_pairs` row

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `affixed_form_pairs` | `projectors/morphology.ts` | `byKind/affixedFormPair.ts` | `validators/morphology.ts` + DB NOT NULL + UNIQUE(source_ref, capability_id) |

**Rollback:** revert writer + reader; re-publish.

---

## §7. PR 4 — Pattern source_kind

**Target typed tables:** `grammar_pattern_examples`, `contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises` (all added in PR 0 §3.1 — empty).

### §7.1 Pipeline writer

`projectors/grammar.ts`:
- Write `grammar_pattern_examples` typed rows.
- Remove `capability_artifacts` writes for pattern kinds (`pattern_explanation:l1`, `pattern_example`).

`scripts/publish-grammar-candidates.ts`:
- Write to the 4 typed exercise tables instead of `exercise_variants`.
- Remove `exercise_variants` write path.

### §7.2 Pre-write validator

`scripts/lib/pipeline/capability-stage/validators/grammarExercises.ts`:
- `prompt_text`, `correct_option_id`, `explanation_text` non-empty for `contrast_pair`. CRITICAL if not.
- `source_sentence`, `acceptable_answers` non-empty for `sentence_transformation`. CRITICAL if not.
- Similar per-type checks for `constrained_translation` + `cloze_mcq`.

### §7.3 Reader rewrite + routing widening (fail-loud)

**New `src/lib/exercise-content/byKind/pattern.ts`** — reads from the typed exercise table keyed on `capability_type`:
- `pattern_contrast` → `contrast_pair_exercises WHERE grammar_pattern_id = $pattern_id`
- `pattern_recognition` → `sentence_transformation_exercises` / `constrained_translation_exercises` / `cloze_mcq_exercises` (by `is_active` + lesson matching)
- Throw `CapabilityDataMissingError` on empty result.

**`src/lib/exercise-content/adapter.ts`** — add `pattern` bucket; wire into `Promise.all`.

**`src/lib/capabilities/renderContracts.ts` — routing widening (Decision G):**
- `contrast_pair`: `capabilityTypes: []` → `['pattern_contrast']`; `supportedSourceKinds` → `['pattern']`
- `sentence_transformation`: same pattern
- `constrained_translation`: same pattern
- `cloze_mcq`: add `'pattern_recognition'` to `capabilityTypes`; add `'pattern'` to `supportedSourceKinds`

**`ContractInputShapes` replacement (Decision M1):**

```ts
// OLD (retired exercise_variants):
contrast_pair: BuilderBase & { variant: ExerciseVariant }

// NEW (typed exercise table rows):
contrast_pair:              BuilderBase & { exercise: ContrastPairExercisesRow }
sentence_transformation:    BuilderBase & { exercise: SentenceTransformationExercisesRow }
constrained_translation:    BuilderBase & { exercise: ConstrainedTranslationExercisesRow }
cloze_mcq:                  BuilderBase & { exercise: ClozeMcqExercisesRow }
```

`byType/{contrastPair,sentenceTransformation,constrainedTranslation,clozeMcq}.ts`: switch from `input.variant.payload_json.X` to `input.exercise.X` (typed column access).

**Admin path rewrite (decision Q5 — same PR):**
- `src/services/exerciseReviewService.ts` — switch from `exercise_variants` to per-type reads from the 4 typed tables.
- `src/pages/ContentReview.tsx` + `src/components/admin/VariantPreview.tsx` + `ExerciseSummaryCard.tsx` — `switch (row.exercise_type)` dispatch on typed rows; remove JSON probing.
- `src/services/coverageService.ts:78` — switch from `exercise_variants` to per-typed-table counts.
- `src/types/learning.ts` — delete `ExerciseVariant` type.

No-missed-consumer gate: `git grep -n "variant\.payload_json\|ExerciseVariant\b" src/` returns zero hits.

### §7.4 Re-publish (all lessons)

```bash
for N in 1 2 3 4 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts $N
done
```

### §7.5 Gates

- G4: `SELECT count(*) FROM grammar_pattern_examples` ≥ 47; `count(*) FROM contrast_pair_exercises` ≥ 141
- G7: 4 sub-checks — one per grammar exercise type, each confirming `capability_review_events` row with `source_kind='pattern'`. First-ever live rendering of pattern caps.
- No-orphan: every `learning_capabilities WHERE source_kind='pattern'` has at least one row in one of the 4 exercise tables

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `grammar_pattern_examples` | `projectors/grammar.ts` | `byKind/pattern.ts` | `validators/grammarExercises.ts` + DB NOT NULL + UNIQUE |
| `contrast_pair_exercises` | `publish-grammar-candidates.ts` | `byType/contrastPair.ts` | DB CHECK on `options` + validator |
| `sentence_transformation_exercises` | same | `byType/sentenceTransformation.ts` | DB NOT NULL + validator |
| `constrained_translation_exercises` | same | `byType/constrainedTranslation.ts` | DB NOT NULL + validator |
| `cloze_mcq_exercises` | same | `byType/clozeMcq.ts` | DB CHECK on `options` + validator |

**Rollback:** revert `renderContracts.ts` routing (grammar exercises go inert — `capabilityTypes: []`). Revert `byType/*.ts` to `input.variant.payload_json.X`. Revert admin service. Re-publish restores `exercise_variants` rows if the old write path is restored. The routing revert is the highest-risk step; inert grammar exercises are the safe failure mode.

---

## §8. PR 5 — Lesson blocks (Stage A, orthogonal)

**Can start after PR 0.** Does not touch `capability_artifacts` or any capability source_kind.

**Target tables:** `lesson_blocks` (parent, replacing `lesson_page_blocks`), `lesson_block_reading_section` (typed satellite for reading_kind sub-discriminator).

### §8.1 Pipeline writer

`scripts/lib/pipeline/lesson-stage/runner.ts`:
- Write `lesson_blocks` + `lesson_block_reading_section` rows.
- Remove `lesson_page_blocks` writes.

`scripts/lib/pipeline/lesson-stage/validators/blockShape.ts`:
- Assert per-`block_kind` that required nullable columns are populated; forbidden columns are null.
- Mirrors the DB CHECK constraint conditions.

### §8.2 Reader rewrite (fail-loud)

`src/components/lessons/LessonBlockRenderer.tsx`:
- Replace fuzzy extraction (`textFromPayload`, `itemsFromPayload`) with typed dispatch per `block_kind`.
- Throw if `block_kind` is unknown.

`src/lib/lessons/lessonExperience.ts` (`buildLessonExperience`): consume typed rows.

### §8.3 Re-publish (all lessons)

```bash
for N in 1 2 3 4 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts $N
done
```

### §8.4 Gates

- G4: `lesson_blocks` has rows for all 9 lessons; no-orphan for `reading_section` kind
- Visual smoke: all 9 lessons render every block kind
- `check-supabase-deep`: every `lesson_blocks WHERE block_kind='reading_section'` has a `lesson_block_reading_section` row

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `lesson_blocks` | `lesson-stage/runner.ts` | `LessonBlockRenderer.tsx` | DB CHECK on `block_kind` + per-discriminator CHECK + `validators/blockShape.ts` |
| `lesson_block_reading_section` | same | typed reader per block_kind | DB CHECK on `reading_kind` |

**Rollback:** revert writer + reader; re-publish. `lesson_page_blocks` can be regenerated on re-publish if the old write path is restored.

---

## §9. PR 6 — Lesson sections (Stage A, depends on PR 5)

**Target:** Replace `lesson_sections.content jsonb` with typed columns on `lesson_sections` + 5 child tables. `lesson_dialogue_lines` already exists from PR 2.

**New columns on `lesson_sections`:** `section_kind`, `source_section_ref`, `intro`, `paragraphs text[]`, `word_order`, `note`, `setup`, `closing`, `table_title`, `reference_payload jsonb`. Per-discriminator CHECK enforcing field applicability.

**New child tables (additive DDL — all carry `lesson_id`):**
- `lesson_section_item_rows`
- `lesson_section_grammar_categories`
- `lesson_section_grammar_topics`
- `lesson_section_pronunciation_letters`
- `lesson_section_exercise_groups`

### §9.1 Pipeline writer

`lesson-stage/runner.ts`:
- Write typed columns on `lesson_sections` and rows in child tables.
- Keep writing `lesson_sections.content jsonb` until reader switch is confirmed (this is the one exception to the "no dual-write" rule — `lesson_sections.content` is not a DB table drop, just a column; existing reader can coexist briefly).

`lesson-stage/validators/sectionShape.ts`: assert per-`section_kind` field applicability. CRITICAL if not.

### §9.2 Reader rewrite (fail-loud)

`src/lib/lessons/adapter.ts:194,205`: consume typed columns + JOIN to child tables.

Per-lesson `Page.tsx` files (all 9 — `src/pages/lessons/lesson-N/Page.tsx`): rewrite from `section.content as <Shape>` to typed column access. These are second readers; they must be updated in the same PR.

`src/services/coverageService.ts`: switch from `lesson_sections.content` reads to typed-column reads.

No-missed-consumer gate: `git grep -n "section\.content as \|as LessonSection" src/pages/lessons/` returns zero hits.

### §9.3 Re-publish (all lessons)

```bash
for N in 1 2 3 4 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts $N
done
```

### §9.4 Gates

- G4: child tables populated for all 9 lessons
- Visual smoke: all 9 lessons render all section kinds
- `check-supabase-deep`: no orphan child rows

**Writer/Reader/Validator triangle:**

| Table | Writer | Reader | Validator |
|---|---|---|---|
| `lesson_sections` (new columns) | `lesson-stage/runner.ts` | `adapter.ts` + per-lesson `Page.tsx` × 9 | DB CHECK (per-discriminator) + `validators/sectionShape.ts` |
| `lesson_section_item_rows` | same | per-lesson `Page.tsx` × 9 + `coverageService.ts` | DB NOT NULL + UNIQUE(section_id, display_order) |
| `lesson_section_grammar_categories` | same | same | DB NOT NULL + UNIQUE + jsonb array CHECK |
| `lesson_section_grammar_topics` | same | same | DB NOT NULL + UNIQUE(section_id, topic_label) |
| `lesson_section_pronunciation_letters` | same | same | DB NOT NULL + UNIQUE(section_id, display_order) |
| `lesson_section_exercise_groups` | same | same | DB NOT NULL + UNIQUE(section_id, display_order) |

**Rollback:** revert writer + reader; re-publish with old writer. `lesson_sections.content` is restored on re-publish if the writer kept writing it.

---

## §10. PR 7 — Final cleanup

**Prerequisite:** PRs 1–6 all merged and re-publishes confirmed. Every reader has switched to typed tables. This is the one destructive PR.

**Pre-drop checklist (run before each drop, in order):**

```bash
# 1. Confirm zero readers for each thing being dropped.
grep -rn 'capability_artifacts'  src/ scripts/lib/   # must be zero non-comment hits
grep -rn 'item_meanings'         src/ scripts/lib/   # must be zero (dropped in PR 1)
grep -rn 'exercise_variants'     src/ scripts/lib/   # must be zero (dropped in PR 4)
grep -rn 'lesson_page_blocks'    src/ scripts/lib/   # must be zero (dropped in PR 5)
grep -rn 'section\.content'      src/               # must be zero

# 2. Confirm row counts (should all be 0 after re-publishes stopped writing them).
SELECT count(*) FROM indonesian.capability_artifacts;
SELECT count(*) FROM indonesian.exercise_variants;
SELECT count(*) FROM indonesian.lesson_page_blocks;
```

### §10.1 Drop content tables (now fully superseded)

```sql
drop table if exists indonesian.capability_artifacts cascade;
drop table if exists indonesian.exercise_variants    cascade;
drop table if exists indonesian.lesson_page_blocks   cascade;
```

`scripts/migration.sql` co-edits: remove `CREATE TABLE` blocks + indexes + RLS + grants for all three.

### §10.2 Drop lesson_sections.content column

```sql
alter table indonesian.lesson_sections drop column if exists content;
```

`scripts/migration.sql` co-edit: remove `content jsonb` from the `CREATE TABLE indonesian.lesson_sections` block.

### §10.3 Drop legacy-retained user-state tables (no live readers since 2026-05-01)

Archive to `/Users/albert/home/learning-indonesian-archive/legacy-state-<date>.sql.gz` before dropping.

```sql
drop table if exists indonesian.learner_item_state   cascade;
drop table if exists indonesian.learner_skill_state  cascade;
drop table if exists indonesian.review_events        cascade;
drop table if exists indonesian.lesson_progress      cascade;
```

`scripts/migration.sql` co-edits: remove CREATE + indexes + RLS + grants for all four.

### §10.4 Drop empty / aspirational tables

```sql
drop table if exists indonesian.item_context_grammar_patterns   cascade;
drop table if exists indonesian.generated_exercise_candidates   cascade;
drop table if exists indonesian.textbook_pages                  cascade;
drop table if exists indonesian.textbook_sources                cascade;
```

### §10.5 RPC body co-edits

**`get_lessons_overview`** (`scripts/migration.sql` — the body reads `lesson_progress` and `lessons.duration_seconds`, both dropped):

```sql
drop function if exists indonesian.get_lessons_overview(uuid) cascade;
create function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
  id uuid, lesson_number int, title text, summary text,
  has_started_lesson boolean
) language sql stable security invoker as $$
  select
    l.id, l.lesson_number, l.title, l.summary,
    exists (
      select 1 from indonesian.learner_lesson_activation lla
       where lla.user_id = p_user_id and lla.lesson_id = l.id
    ) as has_started_lesson
  from indonesian.lessons l
  order by l.lesson_number;
$$;
```

`src/pages/Lessons.tsx`: remove `duration_seconds` assignment from RPC row mapping.

**`commit_capability_answer_report`** — if `fsrs_state_json` on `learner_capability_state` was not already dropped earlier, drop it here:

```sql
alter table indonesian.learner_capability_state
  drop column if exists fsrs_state_json;
```

Then drop + recreate the RPC body without the `fsrs_state_json` UPDATE.

**`capability_review_events` column renames** (idempotent DO block):

```sql
do $$ begin
  if exists (select 1 from information_schema.columns
    where table_schema='indonesian' and table_name='capability_review_events'
      and column_name='answer_report_json') then
    alter table indonesian.capability_review_events rename column answer_report_json to answer_report;
  end if;
  -- same pattern for state_before_json → state_before, state_after_json → state_after
end $$;
```

Drop `scheduler_snapshot_json` + `artifact_version_snapshot_json` from `capability_review_events`.

Recreate `commit_capability_answer_report` RPC body referencing the renamed columns.

### §10.6 Drop dead code

- `src/lib/capabilities/artifactRegistry.ts` — delete (no consumers)
- `src/lib/exercise-content/adapter.ts:291-303` (`fetchArtifacts`) — delete function (no callers)
- `src/lib/session-builder/adapter.ts:282-289` — remove planner-side artifact reader
- `src/types/learning.ts` — `ArtifactKind`, `ArtifactIndex`, `CapabilityArtifact` types → delete

### §10.7 Gate

- `make migrate-idempotent-check`
- `make pre-deploy`
- `make check-supabase-deep`
- G7 regression check: one force-bypass run per source_kind (item, dialogue_line, affixed_form_pair, pattern) — all 4 must land `capability_review_events` rows

**Rollback for PR 7:** This is the one PR with no cheap rollback. Dropped tables require pg_dump restoration. The risk is managed by:
1. Running the pre-drop grep checklist above (confirms zero live readers before dropping).
2. Taking `pg_dump --schema=indonesian` before this PR runs.
3. The G7 regression checks immediately after migration confirm all 4 source_kinds still work.

---

## §11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Grammar exercise routing widening (PR 4) — first-ever live pattern caps | HIGH | `exercise_type_availability.session_enabled = false` for grammar types; flip to `true` after G7 verified |
| Lesson reader rewrite (PR 5) — fuzzy → typed; any missed section shape throws | HIGH | Visual smoke all 9 lessons in dev before merge |
| `lesson_sections.content` drop (PR 6 → PR 7) — 9 per-lesson Page.tsx files as second readers | HIGH | No-missed-consumer grep gate; must be clean before §9.4 |
| PR 7 drops — no cheap rollback | HIGH | pg_dump before PR 7; pre-drop grep checklist; immediate G7 regression |
| Edge function deploy gap (PR 7 RPC rename) | LOW | At 2-user scale acceptable; force-bypass check closes the window |

---

## §12. What this plan does NOT cover

- **Podcast source_kinds** (`podcast_segment`, `podcast_phrase`) — zero DB rows; feature ships post-migration. Typed schema is a separate workstream.
- **`podcasts` table** — unchanged per decision Q2. Feature ships after this migration.
- **Speaking exercise table** — `capabilityTypes: []`; no caps route to it. Add `speaking_exercises` when speaking becomes live.
- **Audio storage hygiene** — 1,334 unreferenced `audio_clips` rows. Separate pass after PR 1.
- **Module spec updates** — every PR that touches a module surface must update `docs/current-system/modules/<name>.md` same-commit (CLAUDE.md rule). Per-PR code-path sections imply which specs need updating.
- **Subagent prompt updates** — grammar-exercise-creator prompt in PR 4; vocab-exercise-creator prompt in PR 1.

---

**End of migration plan.**
