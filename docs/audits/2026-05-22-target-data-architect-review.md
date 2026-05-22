# Schema audit — 2026-05-22 — data-model-target plan

**Sources read:**
- `docs/plans/2026-05-21-data-model-target.md` (1150 lines)
- `docs/plans/2026-05-21-data-model-migration.md` (1013 lines)
- `docs/adr/0008-retire-generic-capability-artifacts-abstraction.md`
- `docs/adr/0009-typed-table-per-content-concept-storage.md`
- `docs/adr/0010-wire-grammar-exercises-via-pattern-capabilities.md`
- `.claude/data-architect/pipeline-map.md`
- `src/lib/capabilities/renderContracts.ts` (530 lines, verified live)
- `src/lib/exercise-content/byKind/dialogueLine.ts` (125 lines, verified live)
- `scripts/lib/pipeline/capability-stage/adapter.ts` (top 50 lines, verified live)

**Methodology:** 10-category audit per agent spec. Severity = CRITICAL / MAJOR / MINOR / INFO.
Status of plan being audited: `draft` (frontmatter line 2). Forward-looking; edit is appropriate.

**Passes executed:** 1 full pass + targeted verification of live code. 2 direct edits applied to target plan.

---

## Executive summary

The target plan is structurally sound and well-motivated. Its most important design decisions (typed satellites, per-discriminator CHECK constraints already present in the ALTER TABLE blocks at lines 374-387 and 462-480, writer/reader/validator triangle at paragraph 3.9) are correct. Two example queries were wrong (stale column references to retired tables/columns) and were fixed directly.

Four findings require action before architect review:

**CRITICAL (1):** The migration plan's `affixed_form_pairs` DDL (migration.md §7, line 491) is inconsistent with the target plan DDL (target.md line 127). The migration plan has no `capability_id` column (1-row-per-linguistic-pair design); the target plan has `capability_id not null unique` (1-row-per-capability). The migration plan backfill SQL would fail against the target schema.

**MAJOR (3):** (a) The plan retires `ExerciseVariant` but never names the TypeScript `ContractInputShapes` replacement for the 4 grammar exercise types, leaving `renderContracts.ts:321-323` referencing a deleted type. (b) 4 child section tables lack `lesson_id` despite the user's stated §1.3.2 preference. (c) Migration plan section headers (§§6-10) claim all dialogue/affixed/pattern work is in "new PR 2" but the authoritative PR overview assigns them to PRs 3, 4, 5 — a confusion risk for implementers.

**Verdict: Not ready for architect review.** Fix C1 + M1 + M3 first.

---

## Findings

### CRITICAL (1)

**C1 — `affixed_form_pairs` schema mismatch between target plan and migration plan (shape drift by design)**

The target plan DDL (`docs/plans/2026-05-21-data-model-target.md` line 127-138) specifies:

```
capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade
source_ref text not null
unique(source_ref, capability_id)
```

The plan text at line 126 says: "the typed row is per-capability since each cap is independently schedulable." This means 2 rows per linguistic pair (recognition cap + recall cap).

The migration plan DDL (`docs/plans/2026-05-21-data-model-migration.md` §7, line 491-501) specifies:

```
source_ref text not null unique    -- NO capability_id column
```

No `capability_id` anywhere. The migration plan §7.3 reader code (line 534) says "SELECT on affixed_form_pairs WHERE source_ref IN (...)" — consistent with 1-row-per-pair design, NOT per-capability.

Impact: the migration plan backfill SQL at line 514-529 uses `distinct on (c.source_ref)` which collapses 2 capabilities per source_ref into 1 row. With the target schema requiring `capability_id not null`, the INSERT would fail (no value for the required column). The reader at §7.3 fetches by source_ref and would return 1 row regardless of direction — losing the recognition/recall distinction.

Fix needed: pick one design. Per-capability (target plan) is consistent with `dialogue_clozes.capability_id not null unique`. Update the migration plan §7 DDL to add `capability_id not null`, update the backfill to insert 2 rows per pair, and update §7.3 to fetch by `capability_id` rather than `source_ref`. If per-pair is chosen instead, update the target plan DDL and update the reader to decode direction from `learning_capabilities.canonical_key` after a source_ref lookup.

Rule: pipeline-map.md §7 (writer/reader shape must agree); CLAUDE.md "Content-pipeline discipline" (writer and reader must agree on column names and types).

---

### MAJOR (3)

**M1 — Grammar exercise `ContractInputShapes` not specified in target plan**

Evidence: `src/lib/capabilities/renderContracts.ts:321-323` (verified live):

```typescript
contrast_pair:             BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
sentence_transformation:   BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
constrained_translation:   BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
```

The `ExerciseVariant` type maps to the retired `exercise_variants` table. Decision B (target plan line 106-190) retires `exercise_variants` and replaces it with 4 typed tables. The plan names the byType packager rewrites in §3.9 (line 1136-1139) but never specifies what `BuilderInputFor<'contrast_pair'>` should look like in the target state — which fields from `contrast_pair_exercises` the packager receives, and what happens to the `learningItem: LearningItem` requirement (grammar exercises are pattern-sourced, not item-sourced).

Impact: PR 5 cannot be type-safe without specifying the replacement interface. Removing `ExerciseVariant` from `ContractInputShapes` while the byType packagers still destructure `input.variant.payload_json.X` causes TypeScript build failures. The `RawProjectorInput.variant: ExerciseVariant | null` field at renderContracts.ts:276 also becomes vestigial.

Fix needed: add to Decision G's code-change list. Specify the new `ContractInputShapes` entry shape for each of the 4 grammar exercise types. For example, `contrast_pair` becomes `BuilderBase & { patternExercise: ContrastPairExercisesRow }` where `ContrastPairExercisesRow` is a new TypeScript interface mirroring the typed table columns. Also specify what happens to `learningItem` in the pattern-sourced path (it should be null). Also update `RawProjectorInput` to add a typed `patternExercise` slot. These type changes must land in the same PR as the schema change per CLAUDE.md "Content-pipeline discipline."

Rule: pipeline-map.md §5c (the contract file spans writer/reader; schema + contract land in same PR or drift is admitted by construction).

**M2 — 4 of 6 child section tables missing `lesson_id`**

Evidence: `docs/plans/2026-05-21-data-model-target.md` lines 510-571. `lesson_section_item_rows`, `lesson_section_grammar_categories`, `lesson_section_pronunciation_letters`, and `lesson_section_exercise_groups` have no `lesson_id` column. In contrast, `lesson_dialogue_lines` at line 490 correctly has `lesson_id not null` (denormalised for query uniformity per user preference).

The plan's own §1.3.2 states "lesson_id directly on every content table so per-lesson joins are uniform." §1.5 states "Lesson_id on more tables is purely additive." Without `lesson_id` on these 4 tables, a per-lesson query of e.g. all grammar categories requires a 2-hop join (lesson_sections → lesson_section_grammar_categories) rather than the uniform 1-hop join the preference implies.

Fix needed: add `lesson_id uuid not null references indonesian.lessons(id) on delete cascade` to all 4 child tables and corresponding FK indexes. Or explicitly document why the preference is scoped to tables with direct lesson-level meaning and these 4 tables are exceptions. As written, the omission is inconsistent with the plan's own stated principle.

Rule: target plan §1.3.2 (user preference); §1.5 (preference wins when additive).

**M3 — Migration plan section headers (§§6-10) contradict the PR overview table**

Evidence: migration plan PR overview table (lines 39-43) assigns: PR 3 = dialogue_line, PR 4 = affixed_form_pair, PR 5 = pattern, PR 7 = drop capability_artifacts. But the section headers say:

- §6 line 377: "Old PR 5 (now part of new PR 2) — Typed dialogue satellites"
- §7 line 484: "Old PR 6 (now part of new PR 2) — Typed affixed_form_pairs table"
- §8 line 549: "Old PR 7 (now part of new PR 2) — grammar_pattern_examples"
- §9 line 620: "Old PR 8 (now new PR 3) — split exercise_variants"
- §10 line 681: "Old PR 9 (now part of new PR 2) — Retire capability_artifacts"

The section headers reflect a prior reslicing (old layer-sliced 11-PR plan → new source-kind 9-PR plan). The §1.2 mapping table (lines 103-112) correctly documents the correspondence but the section headers were not updated. A developer reading §6 will think dialogue satellites ship in PR 2 (alongside item), implementing them together and defeating the source-kind isolation gate.

Fix needed: relabel section headers to match the PR overview: §6 → "Old detail (now PR 3 — dialogue_line)"; §7 → "Old detail (now PR 4 — affixed_form_pair)"; §8 + §9 → "Old detail (now PR 5 — pattern)"; §10 → "Old detail (now PR 7 — drop capability_artifacts)". This is editorial but directly risks implementation drift.

Rule: plan consistency; incorrect PR assignment is not detectable by tests and propagates into implementation.

---

### MINOR (3)

**m1 — `lesson_dialogue_lines.text` column name shadows the Postgres type `text`**

Evidence: target plan line 493: `text text not null`. The column name `text` is a non-reserved keyword in Postgres; valid but creates quoting ambiguity in dynamic SQL. The plan itself notes this at lines 504-506: "Column name `text` shadows the PG type name — non-reserved but ambiguous; recommended follow-up: rename to `line_text` if a future PR touches this surface." The plan correctly defers the rename. Flagged as MINOR quality issue; the plan's own note is sufficient.

**m2 — Migration plan §11 still references dropped/collapsed tables from the original Decision C proposal**

Evidence: migration plan §11 line 744: "Eight new tables (per target doc §Decision C): `lesson_blocks`, `lesson_block_hero`, `lesson_block_recap`, `lesson_block_practice_bridge`, `lesson_block_reading_section`, `lesson_block_vocab_strip`, `lesson_block_dialogue_card`." The Decision C audit in the target plan dropped `lesson_block_hero`, `lesson_block_recap`, `lesson_block_practice_bridge` and collapsed `lesson_block_vocab_strip`, `lesson_block_dialogue_card` into parent columns. A developer reading §11 of the migration plan will implement dropped tables.

Fix needed: update §11 line 744 to match the Decision C final shape: `lesson_blocks` (parent with collapsed nullable columns) + `lesson_block_reading_section` (the only satellite). Remove references to the 5 dropped/collapsed tables.

**m3 — When M2 is fixed, FK index block at target plan lines 579-583 will need lesson_id indexes for 4 tables**

Pre-noted for completeness. The block currently covers only `section_id` indexes for the 4 child tables. Adding `lesson_id` columns (M2 fix) requires corresponding `lesson_id` indexes. No action needed until M2 is resolved.

---

### INFO (4)

**I1 — Migration plan §2.2 leaderboard sketch SQL contradicts text recommendation**

Migration plan §2.2 (line 157-185) recommends option (b): "re-derive completion from capability-review evidence." But the sketch SQL at line 177 uses option (a): `count(*) from indonesian.learner_lesson_activation`. The three options are in lines 160-165; option (b) would count `DISTINCT lesson_id WHERE review_count > 0`. Author judgment needed: finalise the definition before PR 1 ships. The SQL sketch must match the chosen option.

**I2 — Edge function column rename: "few seconds of divergence" strategy**

Migration plan §3.3 (line 255-259) proposes deploying the edge function and the schema rename in one step, accepting a brief period where the edge function writes to a wrong column name. At 2 users + 10 reviews/day this is defensible. If user load increases before PR 1 ships, prefer the additive-rename approach (add new column, deploy new function, then drop old column). Author judgment on timing.

**I3 — `item_contexts` context_type audit deferred; required before PR 2**

Target plan §8 open question #4 (line 1368): `vocabulary_list` (515 rows) and `lesson_snippet` (60 rows) must be grepped for live runtime consumers before PR 2 drops or ignores them. If `byKind/item.ts` reads them, dropping silently breaks content rendering.

**I4 — `affixed_form_pairs.pattern_source_ref` FK to `grammar_patterns(slug)` requires a UNIQUE constraint on `slug`**

Target plan line 135: `pattern_source_ref text references indonesian.grammar_patterns(slug)`. A FK to a non-PK column is only valid if the target column has a UNIQUE constraint. Confirm `grammar_patterns.slug` has UNIQUE in `scripts/migration.sql` before shipping PR 4.

---

## Edits applied directly to `docs/plans/2026-05-21-data-model-target.md`

| Edit | What changed | Rule |
|---|---|---|
| **FIX 1 — §5.3 query** | Removed `dc.translation_text` from the example SELECT (this column does not exist in `dialogue_clozes` DDL; intentionally omitted per Decision A "INTENTIONALLY OMITTED" note). Replaced with `dl.translation` via the existing JOIN to `lesson_dialogue_lines`. The old query would have caused a runtime column-not-found error. | pipeline-map.md §7: column names must agree between writer, reader, and example queries |
| **FIX 2 — §5.2 query** | Removed the JOIN to `item_meanings` and replaced with `learning_items.translation_nl/translation_en` per the post-Decision-R schema. The old query joined a retired table. | Decision R (target plan line 594-623): `item_meanings` is retired; translations move to `learning_items` columns |
| **FIX 3 — §5.6 health-check query** | Removed the JOIN to `item_meanings` in the "Item capabilities — upstream must have a primary meaning" health check. Replaced with `WHERE li.translation_nl IS NULL` per the post-Decision-R schema. Same root cause as FIX 2; different query location. | Decision R: same rule |

All three fixes are in example queries (§5 "End-to-end query examples"), not in schema DDL. The DDL blocks are correct throughout.

---

## Writer / Reader / Validator triangle — condensed verification table

| Table | Writer | Reader (named in plan) | Validator | Notes |
|---|---|---|---|---|
| `dialogue_clozes` | `projectors/dialogueArtifacts.ts` (rewrite) | `byKind/dialogueLine.ts` (rewrite) | DB NOT NULL + UNIQUE + `validators/dialogueCloze.ts` | Current live reader still uses `fetchArtifacts` (confirmed at dialogueLine.ts:36) — expected pre-migration |
| `affixed_form_pairs` | `projectors/morphology.ts` (rewrite) | `byKind/affixedFormPair.ts` (rewrite) | DB NOT NULL + UNIQUE | Schema mismatch with migration plan — C1 must resolve |
| `grammar_pattern_examples` | `projectors/grammar.ts` (rewrite) | new `byKind/pattern.ts` | DB NOT NULL + UNIQUE + new validator | Clean |
| `contrast_pair_exercises` | `publish-grammar-candidates.ts` (rewrite) | `byType/contrastPair.ts` (rewrite) | DB CHECK on `options` + new validator | `ContractInputShapes` not updated — M1 |
| `sentence_transformation_exercises` | same | `byType/sentenceTransformation.ts` | DB NOT NULL + new validator | M1 same |
| `constrained_translation_exercises` | same | `byType/constrainedTranslation.ts` | DB NOT NULL + new validator | M1 same |
| `cloze_mcq_exercises` | same | `byType/clozeMcq.ts` | DB CHECK + new validator | M1 same |
| `recognition_mcq_distractors` | `projectors/vocab.ts` (new path) | `byKind/item.ts` (new read path) | DB NOT NULL `distractors text[]` + new validator | Clean |
| `cued_recall_distractors` | same | same | same | Clean |
| `cloze_mcq_item_distractors` | same | same | same | Clean |
| `lesson_blocks` | `lesson-stage/runner.ts` (rewrite) | `LessonBlockRenderer.tsx` (rewrite) | DB CHECK on `block_kind` + per-discriminator ALTER TABLE CHECK (lines 374-387) | Clean |
| `lesson_block_reading_section` | same | new typed reader per Decision C | DB CHECK on `reading_kind` | Clean |
| `lesson_dialogue_lines` | `lesson-stage/runner.ts` (new path) | `byKind/dialogueLine.ts` JOIN | DB NOT NULL + UNIQUE | Clean |
| `lesson_section_item_rows` | new lesson-stage writers | per-lesson `Page.tsx` | DB NOT NULL + UNIQUE | Missing `lesson_id` — M2 |
| `lesson_section_grammar_categories` | same | same + `extractLessonGrammarTopics` | DB NOT NULL + UNIQUE + jsonb array CHECK | Missing `lesson_id` — M2 |
| `lesson_section_grammar_topics` | same | same | DB NOT NULL + UNIQUE | Clean |
| `lesson_section_pronunciation_letters` | same | same | DB NOT NULL + UNIQUE | Missing `lesson_id` — M2 |
| `lesson_section_exercise_groups` | same | same | DB NOT NULL + UNIQUE | Missing `lesson_id` — M2 |
| `capability_audio_refs` | new audio path in `projectors/vocab.ts` | `byKind/item.ts` audio read | DB FK to `audio_clips(id)` + NOT NULL | Clean |
| `lesson_speakers` | new lesson-stage writer | `lesson-stage/audio.ts` (rewrite) | DB PK + NOT NULL | Clean |

17 of 20 tables clean or have a named fix. 1 CRITICAL (C1: schema mismatch), 4 MAJOR-M1 (type contract gap), 4 MAJOR-M2 (missing lesson_id).

---

## Final verdict

**Not ready for architect's cross-codebase review.**

Resolve in order:
1. **C1** — Settle the `affixed_form_pairs` per-capability vs. per-pair question and make the two plan documents agree on the DDL.
2. **M1** — Add to Decision G the `ContractInputShapes` replacement for the 4 grammar exercise types. Name the new TypeScript interfaces.
3. **M3** — Relabel migration plan §§6-10 section headers to match the PR overview table.
4. **M2** — Add `lesson_id` to the 4 child section tables (or explicitly document the scoping exception).

After those four, promote plan status to `approved` and escalate to architect.
