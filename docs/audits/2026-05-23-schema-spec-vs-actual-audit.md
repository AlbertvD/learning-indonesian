---
date: 2026-05-23
doc_type: schema-audit
audited_against: docs/plans/2026-05-21-data-model-target.md
audited_actual: scripts/migration.sql (migration source-of-truth per CLAUDE.md)
relates_to: PRs 0, 1, 1.5, 1.6, 2, 3, 4
---

# Schema audit — 2026-05-23 — spec-vs-actual diff, PR 0 additive set

**Sources read:**
- `docs/plans/2026-05-21-data-model-target.md` (1150 lines) — spec source of truth
- `docs/plans/2026-05-22-data-model-migration.md` (lines 1–543) — implementation plan; PR roadmap
- `docs/plans/2026-05-21-data-model-migration.md` (grep for affixed_form_pairs/pattern_source_ref) — superseded plan; verified which columns were dropped vs retained in the new plan
- `scripts/migration.sql` (lines 2119–2653) — actual DDL built
- `docs/audits/2026-05-22-target-data-architect-review.md` (150 lines) — prior audit; check m1/m2 deferred findings
- `src/lib/capabilities/capabilityTypes.ts:130–139` — TS type for affixed_form_pairs staging shape
- `scripts/data/staging/lesson-9/morphology-patterns.ts` — staging data for affixed_form_pairs
- `scripts/check-capability-health.ts:367–378` — health check reader

**Methodology:** per-table spec-vs-actual column diff. Severity per agent spec. Live DB not queried (auto-mode classifier denied psql connection; `scripts/migration.sql` is authoritative per CLAUDE.md "Migration source-of-truth rule").

---

## Executive summary

The PR 0 DDL is overwhelmingly faithful to the target spec. 12 of 16 tables/column-sets match the spec exactly or with acceptable additive enhancements (`created_at`/`updated_at` added where spec omitted them). Two divergences are actionable:

**The most important finding (MAJOR):** `affixed_form_pairs.pattern_source_ref` — present in the superseded migration plan, in the staging data type (`morphology-patterns.ts`), and in the `CurrentAffixedFormPair` TS interface — is absent from both the new migration plan §6 and from `scripts/migration.sql`. The staging data carries this field; the pipeline projector (unwritten as of PR 3 "not started") will silently discard it when it writes to the DB. If `pattern_source_ref` is needed by the PR 4 grammar-routing reader to link a morphology pair to its grammar pattern, PR 3's writer must add the column — or PR 4 must use a different lookup path. The PR 3 developer needs an explicit decision before writing the validator and reader.

**The second actionable finding (MINOR):** `lesson_dialogue_lines.text` — the column literally named `text` — was flagged as MINOR by the prior audit (m1, `2026-05-22-target-data-architect-review.md:117-119`) and deferred. The actual schema built this column name. PR 2 shipped with it; PR 3 reads from this table. The deferred rename (`line_text`) cannot happen without expand-contract — flagged here so PR 4+ authors know not to add new read-paths to the column named `text` before the rename lands.

**Cross-cutting:** the `source_candidate_id uuid` on all 4 grammar exercise tables carries no FK. The referenced table (`generated_exercise_candidates`) still exists but is scheduled for retirement. This is intentional per Decision K and the spec DDL, but leaves a dangling nullable column with no enforcement — acceptable for now given the retirement plan.

**Count by severity:**

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| MAJOR | 1 |
| MINOR | 3 |
| INFO | 4 |

---

## Findings — per table

---

### `dialogue_clozes`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision A lines 86–92; DDL not shown inline (inferred from column map at line 88–89: `sentence_with_blank`, `answer_text`, `translation_text`)
**Actual:** `scripts/migration.sql:2387–2396`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `capability_id` | uuid not null unique (FK learning_capabilities) | uuid not null unique FK learning_capabilities on delete cascade | — | — | accept |
| `dialogue_line_id` | uuid not null FK lesson_dialogue_lines | uuid not null FK lesson_dialogue_lines on delete cascade | — | — | accept |
| `sentence_with_blank` | text not null | text not null | — | — | accept |
| `answer_text` | text not null | text not null | — | — | accept |
| `translation_text` | text not null | text not null | — | — | accept |
| `created_at` | not mentioned | timestamptz not null default now() | additive | INFO | accept |
| `updated_at` | not mentioned | timestamptz not null default now() | additive | INFO | accept |

#### Constraint-level diff

| Constraint | Spec'd | Actual | Divergence | Severity |
|---|---|---|---|---|
| PK on id | yes | yes | — | — |
| UNIQUE on capability_id | yes (1:1 with cap) | yes (via unique FK) | — | — |
| FK on dialogue_line_id | yes | yes, on delete cascade | — | — |
| FK index on capability_id | migration plan §PR2 | `dialogue_clozes_cap_idx` migration.sql:2398 | — | — |
| FK index on dialogue_line_id | migration plan §PR2 | `dialogue_clozes_line_idx` migration.sql:2400 | — | — |

#### Decision

Clean match. No action needed. Relevant PR: PR 2 (shipped, migration.md:245).

---

### `lesson_dialogue_lines`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision D lines 324–337
**Actual:** `scripts/migration.sql:2351–2364`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `section_id` | uuid not null FK lesson_sections on delete cascade | uuid not null FK lesson_sections on delete cascade | — | — | accept |
| `lesson_id` | uuid not null FK lessons on delete cascade | uuid not null FK lessons on delete cascade | — | — | accept |
| `line_index` | integer not null | integer not null | — | — | accept |
| `source_line_ref` | text not null | text not null | — | — | accept |
| `text` | `text text not null` (column named `text`) | `text text not null` | — | — | see MINOR m1 below |
| `speaker` | text nullable | text nullable | — | — | accept |
| `translation` | text not null | text not null | — | — | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Constraint-level diff

| Constraint | Spec'd | Actual | Divergence | Severity |
|---|---|---|---|---|
| UNIQUE(section_id, line_index) | yes | yes, migration.sql:2362 | — | — |
| UNIQUE(source_line_ref) | yes | yes, migration.sql:2363 | — | — |
| FK indexes on section_id, lesson_id | migration plan | both present, migration.sql:2366–2369 | — | — |

#### MINOR finding m1 — column named `text` deferred rename not yet actioned

Prior audit `docs/audits/2026-05-22-target-data-architect-review.md:117–119` flagged the column name `text` as MINOR and explicitly deferred the rename to `line_text` via expand-contract. The column shipped as `text text not null` in `scripts/migration.sql:2357`. PR 2 is shipped; the column is in production.

**Impact:** Any new read-path added to `lesson_dialogue_lines.text` before the rename lands creates another consumer of the ambiguous name, increasing rename cost. PR 4 (`pattern` source kind) does not read this table directly, but PR 5 (lesson blocks) will. The rename should target a standalone cleanup PR before PR 5.

**Recommendation:** open a dedicated rename PR (expand: add `line_text` aliased via a view; cut consumers; drop `text`). Tag as MINOR — non-blocking for PR 3 or 4 but should land before PR 5.

#### Decision

Spec matches actual. The column-name ambiguity was a known deferred issue from the prior audit, not a new divergence. Relevant PR: PR 2 (shipped); rename targets pre-PR-5 cleanup.

---

### `affixed_form_pairs`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision A lines 91–92 (inline) + §3.9 migration plan §6 DDL
**Actual:** `scripts/migration.sql:2420–2431`

#### Column-level diff

| Column | Old migration plan spec (`2026-05-21-data-model-migration.md:491–502`) | New migration plan spec (`2026-05-22-data-model-migration.md:§6`) | Actual (`scripts/migration.sql:2420–2431`) | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|---|
| `id` | uuid PK | not stated (empty DDL section) | uuid PK | — | — | accept |
| `capability_id` | NOT PRESENT (old plan was 1-row-per-pair) | present (new plan §6.3 reader reads by `capability_id`) | uuid not null unique FK learning_capabilities on delete cascade | old plan gone; new plan matches actual | — | accept |
| `source_ref` | text not null unique | not stated | text not null | unique dropped | MINOR | see m2 below |
| `lesson_id` | uuid not null FK lessons on delete restrict | not stated | uuid not null FK lessons on delete restrict | — | — | accept |
| `root_text` | text not null | root_text not null (validator §6.2) | text not null | — | — | accept |
| `derived_text` | text not null | derived_text not null (validator §6.2) | text not null | — | — | accept |
| `allomorph_rule` | text nullable (conditional) | allomorph_rule not null (validator §6.2) | text **not null** | stricter than old spec; matches new spec | INFO | see I1 below |
| `pattern_source_ref` | text nullable FK grammar_patterns(slug) | **absent from new plan** | **column does not exist** | MAJOR — staging data has field, DB does not | MAJOR | see MAJOR finding M1 |
| `created_at` | not mentioned | not stated | timestamptz not null default now() | additive | — | accept |
| `updated_at` | not mentioned | not stated | timestamptz not null default now() | additive | — | accept |

#### Constraint-level diff

| Constraint | Old spec | New actual | Divergence | Severity |
|---|---|---|---|---|
| UNIQUE(source_ref) | yes (old plan — 1-row-per-pair) | no standalone UNIQUE on source_ref | UNIQUE dropped (acceptable — new design is 1-row-per-cap, and UNIQUE(source_ref, capability_id) is present) | INFO |
| UNIQUE(source_ref, capability_id) | not present (old plan had no capability_id) | present, migration.sql:2430 | new constraint — matches new design | — |
| FK on capability_id | not present | yes, on delete cascade | new — matches new design | — |
| FK index on capability_id | not present | `affixed_form_pairs_cap_idx` migration.sql:2433 | — | — |
| FK index on lesson_id | yes | `affixed_form_pairs_lesson_idx` migration.sql:2435 | — | — |

#### MAJOR finding M1 — `pattern_source_ref` absent from DB; present in staging and TS type

**Evidence chain:**

1. Staging data: `scripts/data/staging/lesson-9/morphology-patterns.ts:5,13` — `patternSourceRef: 'lesson-9/pattern-men-active'` present on both affixed form pairs authored for L9.
2. TS staging type: `src/lib/capabilities/capabilityTypes.ts:138` — `patternSourceRef?: string` is an optional field in `CurrentAffixedFormPair`.
3. Old migration plan: `docs/plans/2026-05-21-data-model-migration.md:498` — DDL included `pattern_source_ref text references indonesian.grammar_patterns(slug)` as nullable.
4. New migration plan: `docs/plans/2026-05-22-data-model-migration.md:§6.2–6.3` — validator checks only `root_text`, `derived_text`, `allomorph_rule`. No `pattern_source_ref` in reader SQL. Column silently absent.
5. Actual schema: `scripts/migration.sql:2420–2431` — no `pattern_source_ref` column.

**What breaks:** when PR 3's projector (`projectors/morphology.ts`) reads `patternSourceRef` from staging data and tries to write it to `affixed_form_pairs`, either (a) the projector silently drops the field (no DB column to write to) or (b) the projector writes it to `learning_capabilities.source_ref` / some other field via a workaround — neither option is correct. The `patternSourceRef` is the link between an affixed pair and its explaining grammar pattern. Without it in the DB, the PR 4 reader cannot join `affixed_form_pairs → grammar_patterns` to show the grammar explanation alongside a morphology exercise.

**The Decision F rationale** (`required_artifacts` as a typed column, migration.sql:2152–2184) kept `required_artifacts` precisely because affixed_form_pair caps have conditional artifact requirements. The same source-to-grammar link that `pattern_source_ref` provides was part of the old plan's design intent.

**Recommendation:** before PR 3 starts, explicitly decide: (a) add `pattern_source_ref text references indonesian.grammar_patterns(slug)` as a nullable column to `affixed_form_pairs` in a follow-up DDL block in `scripts/migration.sql`, then have the PR 3 projector write it and the PR 4 reader use it; OR (b) confirm `patternSourceRef` is unused by any runtime reader (the runtime today reads from `capability_artifacts`, not from `affixed_form_pairs`) and explicitly document the field as staging-only metadata not persisted to the DB. If (b), the TS type `CurrentAffixedFormPair.patternSourceRef` should be annotated `@stagingOnly` or removed from the DB-facing interface.

**Note:** `grammar_patterns.slug` has UNIQUE (`scripts/migration.sql:548`, confirmed in `docs/audits/2026-05-22-migration-architect-review.md:372`), so the FK is valid if the column is added.

**Applies to:** PR 3 (affixed_form_pair source_kind, "not started" per migration plan §2 table).

#### MINOR finding m2 — `source_ref` loses standalone UNIQUE constraint in new design

The old plan had `source_ref text not null unique` (1-row-per-pair design). The new actual schema has `source_ref text not null` with a compound UNIQUE `(source_ref, capability_id)`. This is correct for the new 1-row-per-cap design (2 rows per linguistic pair, each with the same `source_ref` but different `capability_id`). Not a problem; just a design shift from per-pair to per-cap uniqueness.

The new migration plan §6.5 gate says `SELECT count(*) FROM affixed_form_pairs` = 4 (2 pairs × 2 caps), confirming the 2-row-per-pair expectation is known and correct.

**Recommendation:** accept. No action needed. The UNIQUE(source_ref, capability_id) constraint is correct for the design.

#### INFO finding I1 — `allomorph_rule` is NOT NULL in actual schema; old spec treated it as conditional

The old plan comment at `2026-05-21-data-model-migration.md:498` treated `allomorph_rule` as optional based on `required_artifacts` conditionality. The `required_artifacts` column (migration.sql:2162–2184) was added precisely because affixed_form_pair caps have conditional artifact requirements. Yet the actual `affixed_form_pairs.allomorph_rule` is `text not null`.

Both affixed form pairs in the staging data (`morphology-patterns.ts:8,16`) have non-null `allomorphRule` values. The DB constraint is correct for the current data. If a future pair has no allomorph rule, the pipeline would fail at write time.

**Recommendation:** verify that the authoring guide for `morphology-patterns.ts` documents `allomorphRule` as required. If a pair can legitimately have no allomorph rule (e.g. a simple prefix with no allomorphs), relax the DB constraint to nullable and update the validator to treat it as optional. If all pairs always have rules, remove the `required_artifacts` special-case for `affixed_form_pair` in the migration plan comment at migration.sql:2153–2158 (the comment says "conditional requirements" but the NOT NULL constraint says otherwise). Author judgment needed.

**Applies to:** PR 3. Resolve before writing the validator.

---

### `grammar_pattern_examples`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision A line 86
**Actual:** `scripts/migration.sql:2454–2461`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `pattern_id` | uuid not null FK grammar_patterns on delete cascade | uuid not null FK grammar_patterns on delete cascade | — | — | accept |
| `example_text` | text not null | text not null | — | — | accept |
| `display_order` | integer not null | integer not null | — | — | accept |
| `created_at` | not mentioned | timestamptz not null default now() | additive | — | accept |
| `updated_at` | not mentioned | timestamptz not null default now() | additive | — | accept |

#### Constraint-level diff

| Constraint | Spec'd | Actual | Divergence | Severity |
|---|---|---|---|---|
| UNIQUE(pattern_id, display_order) | yes (implied by "multiple examples per pattern") | yes, migration.sql:2461 | — | — |
| FK index on pattern_id | migration plan | `grammar_pattern_examples_pattern_idx` migration.sql:2464 | — | — |

#### Decision

Clean match. No action needed. Relevant PR: PR 4 (not started).

---

### `contrast_pair_exercises`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision B lines 127–140
**Actual:** `scripts/migration.sql:2483–2496`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `grammar_pattern_id` | uuid not null FK grammar_patterns on delete cascade | uuid not null FK grammar_patterns on delete cascade | — | — | accept |
| `lesson_id` | uuid not null FK lessons on delete restrict | uuid not null FK lessons on delete restrict | — | — | accept |
| `prompt_text` | text not null | text not null | — | — | accept |
| `target_meaning` | text not null | text not null | — | — | accept |
| `options` | jsonb not null (shape: [{id,text},...]) | jsonb not null | — | — | accept |
| `correct_option_id` | text not null | text not null | — | — | accept |
| `explanation_text` | text not null | text not null | — | — | accept |
| `is_active` | boolean not null default true | boolean not null default true | — | — | accept |
| `source_candidate_id` | uuid (no FK, naked) | uuid (no FK) | — see INFO I2 — | INFO | see I2 |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 4 (not started).

---

### `sentence_transformation_exercises`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision B lines 143–155
**Actual:** `scripts/migration.sql:2518–2531`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `grammar_pattern_id` | uuid not null FK grammar_patterns on delete cascade | uuid not null FK grammar_patterns on delete cascade | — | — | accept |
| `lesson_id` | uuid not null FK lessons on delete restrict | uuid not null FK lessons on delete restrict | — | — | accept |
| `source_sentence` | text not null | text not null | — | — | accept |
| `transformation_instruction` | text not null | text not null | — | — | accept |
| `hint_text` | text nullable | text nullable | — | — | accept |
| `acceptable_answers` | text[] not null | text[] not null | — | — | accept |
| `explanation_text` | text not null | text not null | — | — | accept |
| `is_active` | boolean not null default true | boolean not null default true | — | — | accept |
| `source_candidate_id` | uuid (no FK) | uuid (no FK) | — | INFO | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 4 (not started).

---

### `constrained_translation_exercises`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision B lines 157–170
**Actual:** `scripts/migration.sql:2552–2565`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `grammar_pattern_id` | uuid not null FK grammar_patterns on delete cascade | uuid not null FK grammar_patterns on delete cascade | — | — | accept |
| `lesson_id` | uuid not null FK lessons on delete restrict | uuid not null FK lessons on delete restrict | — | — | accept |
| `source_language_sentence` | text not null | text not null | — | — | accept |
| `required_target_pattern` | text not null | text not null | — | — | accept |
| `disallowed_shortcut_forms` | text[] not null default '{}' | text[] not null default '{}' | — | — | accept |
| `acceptable_answers` | text[] not null | text[] not null | — | — | accept |
| `explanation_text` | text not null | text not null | — | — | accept |
| `is_active` | boolean not null default true | boolean not null default true | — | — | accept |
| `source_candidate_id` | uuid (no FK) | uuid (no FK) | — | INFO | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 4 (not started).

---

### `cloze_mcq_exercises`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision B lines 172–185
**Actual:** `scripts/migration.sql:2587–2600`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `id` | uuid PK | uuid PK | — | — | accept |
| `grammar_pattern_id` | uuid not null FK grammar_patterns on delete cascade | uuid not null FK grammar_patterns on delete cascade | — | — | accept |
| `lesson_id` | uuid not null FK lessons on delete restrict | uuid not null FK lessons on delete restrict | — | — | accept |
| `sentence` | text not null | text not null | — | — | accept |
| `translation` | text not null | text not null | — | — | accept |
| `options` | jsonb not null (shape: string[]) | jsonb not null | — | — | accept |
| `correct_option_id` | text not null | text not null | — | — | accept |
| `explanation_text` | text not null | text not null | — | — | accept |
| `is_active` | boolean not null default true | boolean not null default true | — | — | accept |
| `source_candidate_id` | uuid (no FK) | uuid (no FK) | — | INFO | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 4 (not started). Note: spec comment (target.md line 188) says `options` is `string[]`; migration.sql comment (line 2585–2586) says same. The `contrast_pair_exercises.options` uses `[{id,text},...]` shape — the two tables use different jsonb shapes for the same column name `options`. Both are documented correctly in their respective table comments; no action needed but PR 4's validator must enforce the shape difference explicitly.

---

### `recognition_mcq_distractors`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision G2 lines 555–562
**Actual:** `scripts/migration.sql:2284–2300`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `capability_id` | uuid PK FK learning_capabilities on delete cascade | uuid PK FK learning_capabilities on delete cascade | — | — | accept |
| `distractors` | text[] not null | text[] not null | — | — | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 1 (shipped).

---

### `cued_recall_distractors`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision G2 lines 563–570
**Actual:** `scripts/migration.sql:2302–2318`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `capability_id` | uuid PK FK learning_capabilities on delete cascade | uuid PK FK learning_capabilities on delete cascade | — | — | accept |
| `distractors` | text[] not null | text[] not null | — | — | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 1 (shipped).

---

### `cloze_mcq_item_distractors`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision G2 lines 571–578
**Actual:** `scripts/migration.sql:2320–2336`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `capability_id` | uuid PK FK learning_capabilities on delete cascade | uuid PK FK learning_capabilities on delete cascade | — | — | accept |
| `distractors` | text[] not null | text[] not null | — | — | accept |
| `created_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |
| `updated_at` | timestamptz not null default now() | timestamptz not null default now() | — | — | accept |

#### Decision

Clean match. Relevant PR: PR 1 (shipped).

---

### `capability_audio_refs`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision Q lines 776–784
**Actual:** `scripts/migration.sql:2257–2277`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `capability_id` | uuid not null FK learning_capabilities on delete cascade | uuid not null FK learning_capabilities on delete cascade | — | — | accept |
| `audio_clip_id` | uuid not null FK audio_clips on delete restrict | uuid not null FK audio_clips on delete restrict | — | — | accept |
| `voice_id` | text not null | text not null | — | — | accept |
| `created_at` | not mentioned | timestamptz not null default now() | additive | — | accept |
| PK | (capability_id, audio_clip_id) | primary key (capability_id, audio_clip_id) | — | — | accept |

#### Constraint-level diff

| Constraint | Spec'd | Actual | Divergence | Severity |
|---|---|---|---|---|
| FK index on audio_clip_id | yes, spec line 782–784 | `capability_audio_refs_clip_idx` migration.sql:2265 | — | — |

#### Decision

Clean match. Relevant PR: PR 1 (shipped).

---

### `lesson_speakers`

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision J lines 696–700
**Actual:** `scripts/migration.sql:2191–2211`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `lesson_id` | uuid not null FK lessons on delete cascade | uuid not null FK lessons on delete cascade | — | — | accept |
| `speaker` | text not null | text not null | — | — | accept |
| `voice_id` | text not null | text not null | — | — | accept |
| PK | (lesson_id, speaker) | primary key (lesson_id, speaker) | — | — | accept |
| `created_at` | not mentioned | timestamptz not null default now() | additive | — | accept |
| `updated_at` | not mentioned | timestamptz not null default now() | additive | — | accept |

#### MINOR finding m3 — FK index on lesson_id redundant given PK

The spec says `primary key (lesson_id, speaker)`. The PK index covers `(lesson_id, speaker)` left-to-right, which serves `WHERE lesson_id = $x` queries. A separate index `lesson_speakers_lesson_idx ON lesson_speakers(lesson_id)` was added (migration.sql:2200–2201). This is redundant with the PK index for lookup-by-lesson queries. The extra index costs one write per row inserted; no correctness impact.

**Recommendation:** optional: drop `lesson_speakers_lesson_idx` since the PK index covers `WHERE lesson_id = $x`. But it's harmless and removal requires a migration step. Leave for final cleanup PR.

#### Decision

Clean match aside from the redundant index. Relevant PR: PR 0 (shipped, commit `9cda942`).

---

### `learning_items.translation_nl` / `.translation_en` / `.usage_note` (PR 1)

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision R lines 608–613
**Actual:** `scripts/migration.sql:2241–2248`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `translation_nl` | text nullable | text nullable | — | — | accept |
| `translation_en` | text nullable | text nullable | — | — | accept |
| `usage_note` | text nullable | text nullable | — | — | accept |

#### Decision

Clean match. Columns are additive and nullable, consistent with the "item_meanings stays until final cleanup PR" sequencing. Relevant PR: PR 1 (shipped).

---

### `learning_capabilities.prerequisite_keys` / `.required_artifacts` (PR 0)

**Spec source:** `docs/plans/2026-05-21-data-model-target.md` §Decision F lines 502–508
**Actual:** `scripts/migration.sql:2123–2184`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `prerequisite_keys` | text[] not null default '{}' | text[] not null default '{}' | — | — | accept |
| `required_artifacts` | **not in Decision F** — Decision F says "drop `requiredArtifacts`" (target.md line 514) | text[] not null default '{}' | Intentional deviation: migration.sql:2152–2184 explicitly documents the reversal — `required_artifacts` kept because affixed_form_pair caps have conditional requirements | INFO | see I3 below |

#### INFO finding I3 — `required_artifacts` promoted to column despite Decision F saying drop it

Decision F (target.md lines 490–518) explicitly says `requiredArtifacts` is derivable from `renderContracts.RENDER_CONTRACTS[exercise_type].requiredArtifacts[source_kind]` and should be dropped. The actual migration (migration.sql:2152–2184) adds it as a column with the rationale that `affixed_form_pair` caps have conditional requirements (±allomorph_rule) that cannot be derived from `capability_type` alone.

This is a design revision, not an accidental divergence — the comment documents the rationale clearly. However, the target plan's Decision F still says "Drop — derivable" for `requiredArtifacts`. The plan needs a Decision F revision note to reflect that `required_artifacts` was retained with the narrower rationale.

**Recommendation:** update `docs/plans/2026-05-21-data-model-target.md §Decision F` to document the retention (add a "Revised 2026-05-22: retained as a typed column because..." note). Alternatively, mark the target plan superseded by the migration plan for this decision. Low priority — the migration.sql comment is authoritative; the plan doc is forward-looking. INFO, no blocking action.

---

### `learning_capabilities.retired_at` (PR 1.5)

**Spec source:** `docs/plans/2026-05-22-data-model-migration.md` §PR 1.5 (migration plan; target plan does not explicitly spec this column — it was a design addition during implementation)
**Actual:** `scripts/migration.sql:2641–2652`

#### Column-level diff

| Column | Spec'd | Actual | Divergence | Severity | Recommendation |
|---|---|---|---|---|---|
| `retired_at` | timestamptz nullable (PR 1.5 comment, migration.sql:2621–2640) | timestamptz nullable | — | — | accept |

#### Constraint-level diff

| Constraint | Spec'd | Actual | Divergence | Severity |
|---|---|---|---|---|
| Partial index on (lesson_id, source_kind) where retired_at is null | migration plan comment | `learning_capabilities_active_idx` migration.sql:2647–2649 | — | — |

#### Decision

`retired_at` was not in the target plan DDL (it was added during PR 1.5 implementation). The migration plan at migration.sql:2621–2640 documents the rationale inline. No spec-vs-actual gap. Relevant PR: PR 1.5 (shipped per migration plan §2 table).

---

## Cross-cutting findings

### MINOR m4 — `source_candidate_id uuid` (no FK) on all 4 grammar exercise tables

All four grammar exercise tables (`contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises`) have `source_candidate_id uuid` with no FK constraint. The column is intended to reference `generated_exercise_candidates(id)` (the old `exercise_variants.source_candidate_id` had this FK at migration.sql:609). The target plan Decision K retires `generated_exercise_candidates` (target.md:717), and the 4 new tables intentionally drop the FK.

The result is a nullable uuid column with no enforcement — any value passes. If the column is populated during PR 4, it becomes a soft reference to a table that will eventually be dropped (the retirement happens in a final cleanup PR). After that drop, the column becomes a dead uuid store.

**Recommendation:** decide before PR 4 whether `source_candidate_id` on the new tables is needed at all. If the grammar exercise authoring path (`publish-grammar-candidates.ts`) writes it, it must be documented as "audit trail only; no FK enforcement." If it's not written, drop the column in the PR 4 DDL addendum. As built, it matches the spec, which shows the column as naked uuid — accept as INFO.

### INFO I2 — `options` jsonb shape differs between `contrast_pair_exercises` and `cloze_mcq_exercises`

Both tables have `options jsonb not null` but with different shapes: `contrast_pair_exercises.options` is `[{id: string, text: string}, ...]` (migration.sql:2489 comment) while `cloze_mcq_exercises.options` is `string[]` (migration.sql:2585–2586 comment). Both match the spec exactly (target.md:134 vs 180–181). This is intentional — the two exercise types have different option structures.

**Risk:** PR 4's validator must enforce both shapes explicitly via Zod. A shared "validate options jsonb" helper would silently accept the wrong shape. Each exercise type needs its own validator branch.

**Recommendation:** note in PR 4's validator spec: `contrastPairExercisesValidator.options` must be `z.array(z.object({id: z.string(), text: z.string()}))` while `clozeMcqExercisesValidator.options` must be `z.array(z.string())`. No schema change needed; validator implementation detail.

### INFO I3 — Deferred rename (`lesson_dialogue_lines.text → line_text`) carries risk as more PR authors read this table

See MINOR m1 above. The rename was deferred from the prior audit. As PR 3 reads `lesson_dialogue_lines` (for the dialogue context of morphology caps if any) and PR 5 reads it for the lesson block renderer, the deferred rename accumulates consumers. Each new consumer makes the expand-contract rename more expensive.

**Recommendation:** the `line_text` rename should happen in a standalone PR between the current state and PR 5, not as part of any source-kind PR. Target: name it "PR 2.5 — rename lesson_dialogue_lines.text → line_text."

### INFO I4 — `required_artifacts` on `learning_capabilities` is `not null default '{}'` but target plan Decision F says drop it

See INFO finding I3 in the `learning_capabilities.prerequisite_keys` section above. This is an intentional in-flight deviation with good rationale, but the target plan document has not been updated to reflect it. Cross-reference: the prior audit (`2026-05-22-target-data-architect-review.md`) did not flag this because Decision F was not yet revised when that audit ran.

---

## Recommendations grouped by PR

### PR 3 (affixed_form_pair) — before implementation begins

1. **MAJOR M1 (blocking):** Resolve `pattern_source_ref`. Either: (a) add `pattern_source_ref text references indonesian.grammar_patterns(slug)` as a nullable column to `affixed_form_pairs` in `scripts/migration.sql` before PR 3 starts, and have the projector write it; OR (b) document the field as staging-only metadata not persisted to the DB, remove it from `CurrentAffixedFormPair` (or annotate it), and confirm no future PR 4 reader path needs it. Decision must be made explicit before the validator is written.

2. **INFO I1 (non-blocking):** Resolve whether `allomorph_rule` is universally required (in which case `NOT NULL` is correct and the `required_artifacts` conditional-artifacts machinery is moot for this table) or genuinely optional for some pairs (in which case `NOT NULL` must be relaxed). Update the authoring guide for `morphology-patterns.ts` accordingly.

### PR 4 (pattern) — implementation notes

3. **INFO (shapes):** PR 4's validator for `cloze_mcq_exercises.options` must use a `string[]` Zod shape, not the `[{id,text}]` shape used for `contrast_pair_exercises.options`. Both are correct per spec; validator implementations must not share the options-validator helper across these two tables.

4. **INFO (source_candidate_id):** Decide whether the `publish-grammar-candidates.ts` writer populates `source_candidate_id` on the 4 grammar exercise tables. If yes: document as audit-trail-only (no FK). If no: drop the column via a DDL addendum in PR 4.

### Post-PR-4 / pre-PR-5 cleanup

5. **MINOR m1 (deferred rename):** Open a standalone PR to rename `lesson_dialogue_lines.text → line_text` via expand-contract before PR 5 adds new read-paths to this table.

6. **MINOR m3 (redundant index):** `lesson_speakers_lesson_idx` is redundant with the composite PK index. Low priority; include in final cleanup PR.

### Target plan update (editorial, no blocking impact)

7. **INFO I3/I4:** Update `docs/plans/2026-05-21-data-model-target.md §Decision F` to note that `required_artifacts` was retained (not dropped) due to `affixed_form_pair` conditional requirements, contrary to the Decision F "drop" verdict. Add "Revised 2026-05-22" note.
