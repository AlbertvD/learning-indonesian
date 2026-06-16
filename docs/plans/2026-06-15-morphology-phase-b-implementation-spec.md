# Morphology Module — Phase (b) Implementation Spec

> **For Claude:** REQUIRED SUB-SKILL once APPROVED: use superpowers:executing-plans (or
> subagent-driven-development) to implement task-by-task. **This is a data-model plan — it must pass
> `architect` + `data-architect` review and be marked `approved` BEFORE any code (plan-review-gate).**
> Parent/program doc: `docs/plans/2026-06-15-morphology-module-and-capability-model-design.md`.

---
status: approved   # round 4 (2026-06-16): reopened from the 2026-06-15 approval to adopt three downstream
                   # findings (grill + staff-engineer + seam audit): (1) item B root-vocab prerequisite
                   # (hard-block); (2) `affix ∈ catalog` writer gate (catalog → lib/capabilities, architect
                   # CRITICAL); (3) the cut — drop choose_affix_ex/choose_allomorph_ex, render via widened
                   # `choose_form_ex` (4 contract edits + catalog-derived distractors). Re-reviewed clean:
                   # architect APPROVE + data-architect APPROVE (the rework round was clean — catalog
                   # placement, choose_form_ex enumeration, 6-arg root-vocab key recipe all verified vs code).
reviewed_by: [architect, data-architect]
supersedes: []
related:
  - docs/plans/2026-06-15-morphology-module-and-capability-model-design.md   # program doc + §9 obligations
  - docs/current-system/capability-and-exercise-model.md
  - docs/adr/0006-introducing-lesson.md
  - docs/adr/0007-receptive-before-productive-staging.md
  - docs/adr/0011-capability-content-db-authoritative-after-seeding.md
---

**Goal:** Add the generative morphology *application tier* — extended `affixed_form_pairs` payload +
one new capability type + **2 new exercise types** (the two MCQ drills reuse the existing `choose_form_ex`) —
on top of the already-live rule tier, so the follow-up book's affix chapters land as real generative
drills, not generic grammar exercises.

**Architecture:** One content table (`affixed_form_pairs`) gains discriminator + payload columns; the
new caps reuse `source_kind='word_form_pair_src'`. Two FSRS prerequisites gate each application cap (both
cross-source-kind, both hard-block): the affix's existing **grammar-pattern** capability (via a new
`grammar_pattern_id` FK) AND the derived form's **root vocabulary** capability (the root must be known
before its affixed form is drilled — item B). No new spine, no new source_kind, no new distractor table.

**Tech stack:** Supabase/Postgres (additive migration in `scripts/migration.sql`), capability-stage
projectors (`scripts/lib/pipeline/capability-stage/`), exercise-content readers (`src/lib/exercise-content/`),
render contracts (`src/lib/capabilities/`), React exercise components (`src/components/exercises/`),
Vitest.

---

## 0a. Revision 2026-06-16 — three adopted changes (this spec now bakes them in)

A grill + a per-doc staff-engineer pass + a cross-plan seam audit produced three changes, **now adopted
in the body below** (this is no longer a margin note — the spec describes the revised target):

1. **The cut (staff-engineer OVERBUILT).** `choose_affix_ex` + `choose_allomorph_ex` were the existing
   `choose_form_ex` MCQ screen ("prompt + tappable options", `CuedRecallExercise.tsx:43-64`). **Adopted:**
   widen `choose_form_ex`'s `supportedSourceKinds` to `word_form_pair_src` (mirroring how `type_form_ex` was
   widened, `renderContracts.ts:74-88`) and render `recognise_word_form_link_cap` +
   `recognise_allomorph_from_root_cap` through it. **2 new exercise types, not 4** — only the
   genuinely-distinct `decompose_word_ex` (segment) + `build_confix_ex` (assemble) remain. The new *cap*
   stays; only its bespoke exercise type is cut. (§8 model doc + program §6 to be struck in lockstep.)
2. **Distractor sourcing (staff-engineer UNDERBUILT).** **Adopted:** the `choose_form_ex` packager derives
   affix/allomorph distractors **deterministically from the catalog constant** (other affixes for the
   link cap; other allomorph classes of the same affix for the allomorph cap) — no new distractor table,
   no authored set (deterministic-selection-over-LLM default). Detailed in §3.
3. **Item B — root-vocab prerequisite (grill, decided hard-block) + `affix ∈ catalog` (seam audit).**
   **Adopted:** each application cap gets a SECOND prerequisite — the derived form's root vocabulary cap
   (§7); and the writer asserts `affix ∈ catalog` (§6). Both baked into the writer + gate below.

---

## 0. NAMING — this spec uses the §8 TARGET names (`_src`/`_mode`/`_cap`/`_ex`)

This spec is authored in the **§8 target naming convention** (the single source of truth is
`docs/current-system/capability-and-exercise-model.md` §8; `_cap` = `operation_object_from_stimulus`,
`_ex` = `verb_what`). The morphology build mints its new caps/exercises directly in the target names so
the morphology vertical is never built-then-renamed.

| Concept | Name (target §8) | Former current name |
|---|---|---|
| source kind | `word_form_pair_src` | `affixed_form_pair` |
| new capability type | `recognise_allomorph_from_root_cap` (new — minted by this build, added to §8) | ~~`allomorph_recognition`~~ |
| existing app caps | `recognise_word_form_link_cap`, `produce_derived_form_cap` (per §8) | `root_derived_recognition`, `root_derived_recall` |
| new exercise types | `decompose_word_ex`, `build_confix_ex` (2 new — added to §8) | ~~`decompose_word`, `build_confix`~~ |
| the two MCQ caps reuse | `choose_form_ex` (existing — widened to `word_form_pair_src`; `choose_affix_ex`/`choose_allomorph_ex` CUT) | — |
| plain produce reuses | `type_form_ex` (existing — no new exercise) | `typed_recall` |
| modes (level refs) | `recognise_mode`, `produce_mode` | `recognition`, `form_recall` |

> **SEQUENCING GATE (load-bearing).** These target names only exist *in code* AFTER the §8 rename
> (`docs/plans/2026-06-15-capability-naming-rename-plan.md`, Phases A/B/C) ships. The rename MUST ship
> before this morphology build starts; otherwise the names this spec adds (`recognise_allomorph_from_root_cap`,
> the four `_ex` names, the `word_form_pair_src` source kind) collide with the unrenamed enums. The code
> `file:line` cites below intentionally point at the **post-rename** codebase.

The program doc §6 used target names for illustration (its `recognise_allomorph_cap` shorthand is the
rule-correct `recognise_allomorph_from_root_cap` here).

> **Naming reconciliation (2026-06-16, at implementation start — naming-only, no design change, stays
> `approved`).** This spec was authored before the §8 rename Phases B/C shipped (now on `main`,
> `fdc2b36`) and used two pre-rename ExerciseType names. Corrected throughout to match shipped code:
> `cued_recall` → **`choose_form_ex`** (the MCQ "prompt + tappable options" exercise the two MCQ caps
> reuse) and `typed_recall` → **`type_form_ex`**. Phase B renamed the enum *values* only, **not** the
> file/symbol names — so `byType/cuedRecall.ts`, `buildCuedRecall`, `CuedRecallExercise.tsx`, and the
> `input.curatedCuedRecallDistractors` field keep their names; only the `ExerciseType` string and the
> `RENDER_CONTRACTS`/`ContractInputShapes` keys are `choose_form_ex`. The §3 item-cap distractor cite was
> also corrected (the `cued_recall_distractors` table was dropped in cap-v2 Slice 1; live path is
> `curatedCuedRecallDistractors` + `pickDistractorCascade`).

## 1. Schema migration (additive; `scripts/migration.sql`)

**Two tables carry affix data** — keep them in sync:
- `lesson_section_affixed_pairs` (`migration.sql:~3322`) — Lesson-Stage **source** (`TypedAffixedPair`, read by `fetchAffixedPairsFromDb`, `loadFromDb.ts:822`). **NOTE — `affix text` ALREADY EXISTS here (NOT NULL, `migration.sql:3341`)**, and **`pattern_source_ref text` already exists (`:3340`)** — see the FK upgrade below.
- `affixed_form_pairs` (`migration.sql:2954`) — Capability-Stage **projection**, 1 row per cap, read by `byKind/affixedFormPair.ts`. **This is what exercises read.**

New columns go on **both** (source carries authored data; projector copies to projection). DDL (idempotent, `ADD COLUMN IF NOT EXISTS`). `affix` is skipped on the source table (already present); add it on the projection table:

```sql
-- on BOTH tables (skip affix on lesson_section_affixed_pairs — already NOT NULL there):
ADD COLUMN IF NOT EXISTS affix_type text;        -- discriminator
ADD COLUMN IF NOT EXISTS affix text;             -- (affixed_form_pairs only) 'meN-','-kan','ke-…-an','reduplication'
ADD COLUMN IF NOT EXISTS affix_gloss text;
ADD COLUMN IF NOT EXISTS allomorph_class text;   -- meN-/peN- only; null otherwise
ADD COLUMN IF NOT EXISTS circumfix_left text;    -- confix only
ADD COLUMN IF NOT EXISTS circumfix_right text;   -- confix only
ADD COLUMN IF NOT EXISTS productive boolean;

-- grammar_pattern_id: UPGRADE the existing pattern_source_ref (text slug) → resolved FK on the
-- SOURCE table, populated at Lesson Stage write time (data-architect M1 — the projector has no
-- slug→id map at its call site, runner.ts:540). pattern_source_ref is REPLACED, not coexisting
-- (omission test — a slug + FK pair would create a sync obligation):
ALTER TABLE indonesian.lesson_section_affixed_pairs
  ADD COLUMN IF NOT EXISTS grammar_pattern_id uuid REFERENCES indonesian.grammar_patterns(id) ON DELETE RESTRICT;
ALTER TABLE indonesian.lesson_section_affixed_pairs DROP COLUMN IF EXISTS pattern_source_ref;
-- mirror onto the projection table (copied by projectAffixedFormPairs):
ALTER TABLE indonesian.affixed_form_pairs
  ADD COLUMN IF NOT EXISTS grammar_pattern_id uuid REFERENCES indonesian.grammar_patterns(id) ON DELETE RESTRICT;
```

**NO SQL backfill (review trim — CLAUDE.md "Changing a data shape (build-stage)").** The live table holds
2 pairs (L9). The Lesson-Stage writer now resolves+populates `grammar_pattern_id`; `pattern_source_ref`
is simply dropped and **L9 is re-published** to repopulate from staging — build-the-target-and-re-publish,
not an additive-then-subtractive backfill dance. This keeps `migration.sql` purely additive DDL (no data
UPDATE), so `make migrate-idempotent-check` stays trivially green.

Then, after backfill/regen, tighten with guarded constraints **on BOTH tables** (CHECK on the source
table too, so a Lesson-Stage bug fails at write, one stage earlier — data-architect m2):

```sql
-- affix_type discriminator (data-architect M1) — guarded DO-block, both tables
ADD CONSTRAINT <tbl>_affix_type_chk CHECK (affix_type IN ('prefix','suffix','confix','reduplication'));
-- confix boundary present iff confix
ADD CONSTRAINT <tbl>_confix_chk
  CHECK (affix_type <> 'confix' OR (circumfix_left IS NOT NULL AND circumfix_right IS NOT NULL));
-- mandatory after backfill
ALTER COLUMN grammar_pattern_id SET NOT NULL;  ALTER COLUMN affix_type SET NOT NULL;  ALTER COLUMN productive SET NOT NULL;
```

- **`register` is CUT** (review). Do not add.
- All constraint adds use the guarded `DO $$ … EXCEPTION WHEN duplicate_object` idiom for CHECK, and the `information_schema.table_constraints IF NOT EXISTS` idiom for any UNIQUE (the `duplicate_table` gotcha — see program doc §2 / the content_flags lesson).
- Run `make migrate-idempotent-check` before merge.
- RLS/grants: additive columns inherit the existing `affixed_form_pairs` policies (verified `migration.sql:2972-2978`) — no policy change; verify after migrate.

## 2. New capability type `recognise_allomorph_from_root_cap` — the SIX-corner triangle (atomic, one PR)

All six MUST land in the same commit or the app won't boot (module-load assertions):

1. **Union + array** — `src/lib/capabilities/capabilityTypes.ts:32` (`CapabilityType`) + `:46` (`CAPABILITY_TYPES`): add `'recognise_allomorph_from_root_cap'`. (`as const satisfies` flags incompleteness.)
2. **Skill level** — `capabilityTypes.ts:233` `deriveSkillTypeFromCapabilityType`: add `case 'recognise_allomorph_from_root_cap': return 'recognise_mode'` (it's recognise-level — the level-purity resolution).
3. **Render contract** — `src/lib/capabilities/renderContracts.ts:56` `RENDER_CONTRACTS`: **widen the existing `choose_form_ex` entry** to add `recognise_allomorph_from_root_cap` to its `capabilityTypes` and `word_form_pair_src` to its `supportedSourceKinds` (+ `requiredArtifacts: { word_form_pair_src: [] }` — distractors are catalog-derived, not a stored artifact). No bespoke `choose_allomorph_ex`. (Module-load assertion `:167` refuses boot if a supportedSourceKind lacks a requiredArtifacts key; `assertCapabilityTypesRenderable` refuses boot if `recognise_allomorph_from_root_cap` is in no contract — `choose_form_ex` satisfies it.)
4. **Mastery dimension** — `src/lib/analytics/mastery/masteryModel.ts:~139` `dimensionForCapability`: add the `recognise_allomorph_from_root_cap` case (exhaustive `never` guard at `:167` is a compile error otherwise). Group with grammar/morphology dimension.
5. **Writer** — capability emitter (`projectors/affixedCapabilities.ts`): emit a 3rd cap per meN-/peN- pair (`recognise_allomorph_from_root_cap`, **`direction='root_to_derived'`** — REUSE the existing enum value, no new direction; the distinct `capability_type` already makes the canonical key unique vs `recognise_word_form_link_cap`, so no key collision — data-architect key-axis decision; `modality='text'`, `learnerLanguage='none'`), gated on `allomorph_class IS NOT NULL`. Prereq = the pair's `recognise_word_form_link_cap` key.
6. **Reader** — `byKind/affixedFormPair.ts` SELECT widened + `AffixedFormPairInput` (`renderContracts.ts:303`) gains `allomorphClass` + `affix`; the **widened `choose_form_ex` packager** (`byType/cuedRecall.ts`) reads it for `word_form_pair_src` caps and builds catalog-derived distractors (§3).

## 3. New exercise types (2 new) + the `choose_form_ex` widening

**Two genuinely-new exercise types** — add each to `ExerciseType` union (`src/types/learning.ts`) + `RENDER_CONTRACTS` (`renderContracts.ts:56`) + `ContractInputShapes` (`renderContracts.ts:~414`, compile-enforced) + `projectBuilderInput` switch (`renderContracts.ts:~599`) + the registry (`src/components/exercises/registry.ts`) + `implementations/`:

| Exercise type | Level (`_mode`) → cap | supportedSourceKinds | reads |
|---|---|---|---|
| `decompose_word_ex` | `recognise_mode` → `recognise_word_form_link_cap` | `['word_form_pair_src']` | root/derived/affix/circumfix |
| `build_confix_ex` | `produce_mode` → `produce_derived_form_cap` | `['word_form_pair_src']` | root + circumfix_left/right |

**The two MCQ caps reuse the existing `choose_form_ex`** (staff-engineer — identical prompt+options screen, `CuedRecallExercise.tsx:43-64`): widen `choose_form_ex`'s `supportedSourceKinds` to include `word_form_pair_src` (mirroring how `type_form_ex` was widened, `renderContracts.ts:74-88`), serving:
- `recognise_word_form_link_cap` → "root + meaning → pick the affix" (the cut `choose_affix_ex`);
- `recognise_allomorph_from_root_cap` → "root → pick the correct allomorph form" (the cut `choose_allomorph_ex`).

**The `choose_form_ex` widening needs the SAME 4 edits `type_form_ex`+`word_form_pair_src` required — it is NOT just array-growth (architect re-review 2026-06-16):**
1. **`ContractInputShapes.choose_form_ex`** (`renderContracts.ts:419`) — make `learningItem`/`primaryMeaning` nullable + add the word-form-pair input slot, mirroring `type_form_ex:420`.
2. **Split the `choose_form_ex` projector branch** out of the shared item-group (`renderContracts.ts:627-630`, which returns non-null `learningItem!/primaryMeaning!`) into its own branch passing the word-form-pair input + nullable meaning, mirroring `type_form_ex:616-625`.
3. **`needsPrimaryMeaning`** (`renderContracts.ts:521-524`) — add the `&& raw.affixedFormPair`-style carve-out `type_form_ex` has at `:525-526`.
4. **`buildCuedRecall`** (`byType/cuedRecall.ts`, currently wholly item-rooted — `:13/:51/:62/:73`; the byKind header `affixedFormPair.ts:20-23` declares choose_form_ex item-only by construction) — add a `word_form_pair_src` branch from scratch.

**Bucketing guard (architect):** a `word_form_pair_src` block must NEVER carry a `learningItem` — mirror the `affixedFormPair` guard at `renderContracts.ts:496-503`.

**Distractors are catalog-derived + deterministic — no new table, no authored set** (staff-engineer; the deterministic-selection-over-LLM/authored default): the new `buildCuedRecall` `word_form_pair_src` branch builds wrong options from the **shared affix catalog** (`lib/capabilities/affixCatalog.ts` — see §6 for the placement decision) — for the link cap, K other affixes (prefer same `affix_type`); for the allomorph cap, the other allomorph classes of the same affix. Item caps keep their existing distractor path UNCHANGED — `buildCuedRecall` reads curated rows from `input.curatedCuedRecallDistractors` with a `pickDistractorCascade` pool fallback (`cuedRecall.ts:15-61`; NOTE — the old per-type `cued_recall_distractors` table was dropped in cap-v2 Slice 1, curated distractors now come via the unified `distractors` table + item fetcher, #161/#163/#164). The new branch adds catalog-derived options on the `word_form_pair_src` side only; the packager branches on `source_kind`. The `choose_form_ex` *component* is unchanged — a prompt + options, regardless of where the options came from.

Plain produce reuses the EXISTING `type_form_ex` (already serves `produce_derived_form_cap` on `word_form_pair_src`, `renderContracts.ts:74-88`) — no new type. **Root Race CUT.** Each new component (`decompose_word_ex`, `build_confix_ex`) composes `exercises/primitives/` and renders the `adminOverlay` slot.

**Atomic-boot constraint (architect WARNING):** each new `ExerciseType` (`decompose_word_ex`, `build_confix_ex`) must land WITH its `ContractInputShapes` entry (`renderContracts.ts:~414`, `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` at `:431`) AND its `projectBuilderInput` switch branch (the `never` exhaustiveness at `:635`) in the SAME commit — both are compile-time gates. The `choose_form_ex` widening adds no new `ExerciseType` (so no exhaustiveness branch), but it DOES require the four contract/projector/packager edits enumerated above — those are the real cost, not array-growth.

**Level↔phase note (architect WARNING):** `decompose_word_ex` + the widened `choose_form_ex` route through
`recognise_word_form_link_cap`, which `deriveSkillTypeFromCapabilityType` returns as `recognise_mode`
(`capabilityTypes.ts:243`) but ADR 0007:40 classifies at Phase 4 (productive). This is INTENTIONAL and
inert — `word_form_pair_src` is exempt from the staging phase gate (ADR 0007:44). Do NOT "fix" the phase
table; this is resolved by the §7 ADR addendum.

## 4. Writer chain — crosses the Lesson→Capability stage boundary (CORRECTED per round-2 review)

The capability stage reads ONLY the DB (`runner.ts:9`, ADR 0011/0012); `morphology-patterns.ts` is a
**Lesson-Stage** input, not a capability-stage one. So the new authored columns thread through FOUR hops:

1. **Lesson-Stage writer** (`morphology-patterns.ts` → `lesson_section_affixed_pairs`): the linguist
   agents author the new fields (`affixType`, `affixGloss`, `allomorphClass?`, `circumfixLeft/Right?`,
   `productive`, and the affix's `grammarPatternSlug`); the lesson-stage writer (lesson-stage
   `adapter.ts`/`runner.ts`) **resolves `grammarPatternSlug` → `grammar_pattern_id`** (the grammar_patterns
   rows are written by Lesson Stage *before* morphology) and writes them to `lesson_section_affixed_pairs`.
   This is where resolution lives — NOT the projector (data-architect M1: the cap-stage projector has no
   slug→id map at `runner.ts:540`). Store the FK explicitly (CLAUDE.md: store-it > derive-and-drop).
2. **DB-read shape** (`TypedAffixedPair`, `loadFromDb.ts:822` — already carries `affix:828`) + the
   `fetchAffixedPairsFromDb` SELECT (`:870`): widen both to carry the new columns incl. `grammar_pattern_id`.
3. **Cap-stage map build** (`runner.ts:540` `affixedPairsBySourceRef`): construct `AffixedPairSource`
   (`morphology.ts:52`) — extend it with the new fields — from the widened `TypedAffixedPair`.
4. **Projection** (`projectAffixedFormPairs`, `morphology.ts:83`): **copy** the new fields blindly into
   `AffixedFormPairRowInput` (extend it in `adapter.ts`) — no resolution here. Extend the empty-field
   guard (`:117`) to CS12-fail when `grammar_pattern_id`/`affix_type` is null, or `allomorph_class` is
   null for `affix IN ('meN-','peN-')`, or a confix lacks `circumfix_left/right`.

5. **`productive=false` ⇒ skip the produce cap** (`projectors/affixedCapabilities.ts`): emit only
   `recognise_word_form_link_cap` (+ the recognise-mode exercises), NOT `produce_derived_form_cap`, for
   lexicalised pairs (data-architect i1).
6. **`MORPHOLOGY_PATTERN_SLUGS`** (`morphology.ts:20`): add the follow-up book's affix slugs (`-kan`,
   `-i`, `pe-an`, `per-an`, `ter-`, etc.) so those lessons stamp `lesson_id` (ADR 0006).

## 5. Reader chain

- `byKind/affixedFormPair.ts:~54` SELECT: add the new columns.
- `AffixedFormPairInput` (`renderContracts.ts:303`): add `affix`, `affixType`, `affixGloss`, `allomorphClass?`, `circumfixLeft?`, `circumfixRight?`.
- `byType` packagers: extend `typedRecall.ts` (`build_confix_ex` path), add a packager for `decompose_word_ex`, and **widen `cuedRecall.ts`** to build catalog-derived distractors for `word_form_pair_src` caps (§3) — no `choose_affix_ex`/`choose_allomorph_ex` packagers (cut).

## 6. Three-layer invariant gate (all three layers — program doc §9)

- **Layer 1** — shared validator helper + unit tests: "every affixed pair resolves to a `grammar_pattern_id`; meN-/peN- pairs have a valid `allomorph_class`; confix pairs have both circumfix columns."
- **Layer 2** — pre-write in `runCapabilityStage`: **extend `validateAffixedFormPairs`
  (`validators/affixedFormPairs.ts`)** to check the new required fields (data-architect m1): `affix_type`
  non-null + in the enum; `grammar_pattern_id` non-null; `productive` non-null; `allomorph_class` non-null
  when `affix IN ('meN-','peN-')`; `circumfix_left/right` non-null when `affix_type='confix'`; **`affix ∈
  the shared affix catalog** (`lib/capabilities/affixCatalog.ts` — the controlled-vocabulary tie the
  capstone item A requires). **PLACEMENT (architect CRITICAL, 2026-06-16): the catalog constant lives in
  `lib/capabilities/`, NOT `lib/morphology`** — this Layer-2 validator (pipeline) + the Layer-3 HC (script)
  + the runtime `cuedRecall.ts` packager + the `lib/morphology` trainer all read it, and the pipeline may
  import ONLY from `lib/capabilities` (target-architecture.md:1159, the sole pipeline↔runtime shared seam);
  a pipeline→`lib/morphology` import is forbidden. Capstone item A is corrected to match. **And `root_text`
  resolves to a live `learning_items` row**
  (via `itemSlug` — else item B's root-vocab prerequisite is unsatisfiable and the drill is orphan-suppressed,
  §7). **Also widen the source_ref regex** (`^lesson-\d+\/morphology\/.+$`) for the non-`lesson-N` authoring
  units the §8 harvest introduces (e.g. `staging/lesson-999`) — load-bearing, not optional (architect WARNING).
- **Layer 3** — `scripts/check-supabase-deep.ts` HC (after HC17): live-DB assertion of the same invariant,
  **including `affix ∈ catalog`** (every live `affix` value is a catalog member — else the trainer's
  catalog grouping silently splits one affix across spelling variants).

## 7. Prerequisites — TWO cross-source-kind gates (ADR addendum; program doc §9 / architect CRITICAL)

Each application cap has **two hard-block prerequisites, both cross-source-kind** (the `prerequisiteKeys`
chain was previously only WITHIN a pair; ADR 0007:44 EXEMPTS `word_form_pair_src` from the staging gate):
- **(i) the affix RULE** — the affix's `grammar_pattern` cap (`grammar_pattern_src`). "Don't drill the
  forms before the rule is met."
- **(ii) the derived form's ROOT vocabulary (item B, hard-block, decided 2026-06-16)** — the root's
  `vocabulary_src` recognition cap. "Don't drill *menulis* before *tulis* is known." **Load-bearing:** it
  is the SOLE enforcement of morphology learning-order, because the receptive-before-productive Phase gate
  is carved out for `word_form_pair_src` (ADR 0007:44; `pedagogy.ts:337-339,361`).

- **The planner half ALREADY works for both** (verified, both reviewers): `satisfiedKeys` is a flat
  source-kind-agnostic `canonical_key` set (`pedagogy.ts:518-520`) and the prereq test (`:320`) is
  mechanical — it resolves any cross-source-kind key with no change. So only TWO things need building:
  1. **Projector emit:** `projectAffixedCapabilities` (`affixedCapabilities.ts:77/98`) currently sets
     `prerequisiteKeys: []`/`[recognitionKey]` — add BOTH keys to every application cap's
     `prerequisiteKeys`:
     - the affix's grammar-pattern (`grammar_pattern_src`) cap canonical_key (from `grammar_pattern_id`);
     - the **root-vocab** cap canonical_key — built deterministically, no DB query, via `buildCanonicalKey`
       (`canonicalKey.ts:42`) with **all SIX args** (architect + data-architect — a mismatched key is
       silently unsatisfiable → permanently-orphaned drill): `sourceKind='vocabulary_src'`,
       `sourceRef=sourceRefForLearningItem(root_text)` (reuse the helper, `content-pipeline-output.ts:111`
       — it applies `itemSlug`, data-architect M1; NOT bare `.trim()`), `capabilityType='recognise_meaning_from_text_cap'`,
       `direction='id_to_l1'`, `modality='text'`, **`learnerLanguage='nl'`** (the live vocab recognition cap
       hardcodes `'nl'`, `vocab.ts:149/157/179`, NOT `'none'`). Mirror `vocab.ts:149-158` exactly; this
       couples to the all-NL corpus — state it.
  2. **ADR addendum/new ADR** documenting BOTH gating axes (rule→application AND root→application),
     superseding 0007:44's "morphology has no siblings, exempt" note. **Sequence this EARLY** (data-architect
     i1) — it gates the projector-emit task, not task 9.

**Guard against an unsatisfiable root prereq:** if a pair's root is not a `learning_item`, its root-vocab
key never enters `satisfiedKeys` → the drill is permanently orphan-suppressed (a content defect, not a
feature). The §8 harvest pulls roots FROM existing `learning_items`, so this should not occur; the §6
Layer-2 validator asserts it (every `root_text` resolves to a live `learning_items` row via `itemSlug`).

## 8. Pipeline emission / harvest

The linguist agents emit `morphology-patterns.ts` for the affix-introducing lessons (L9/10/12/13/14/15/16 + the 14 new chapters), reading existing `learning_items` to pull **known roots** as application examples (research "apply to known roots"; generation-time DB read, no reprocess of pure-vocab lessons). Each pair carries the full new payload (§4.1).

## 9. Task breakdown (TDD; expand at execution time, post-approval)

1. **ADR addendum** (cross-source-kind rule→application prerequisite, §7) — FIRST, it gates the
   projector-emit (data-architect i1).
2. **Migration:** additive columns on both tables + add `grammar_pattern_id` FK + DROP
   `pattern_source_ref` + guarded CHECKs on both tables. **No SQL backfill** — re-publish L9 (task 9
   ordering aside, the 2 L9 pairs repopulate `grammar_pattern_id` via the Lesson-Stage writer). `migration.sql`
   stays purely additive DDL → `make migrate-idempotent-check` trivially green.
3. **Lesson-Stage writer** (§4.1): author fields in `morphology-patterns.ts` shape + lesson-stage writer
   resolves `grammarPatternSlug`→`grammar_pattern_id` + writes `lesson_section_affixed_pairs` + unit tests.
4. **DB-read + cap-stage copy** (§4.2-4): widen `TypedAffixedPair`/`fetchAffixedPairsFromDb` SELECT +
   `AffixedPairSource` + `projectAffixedFormPairs` blind copy into `AffixedFormPairRowInput` + CS12 guard tests.
5. **`recognise_allomorph_from_root_cap` triangle + the `choose_form_ex` widening — ONE ATOMIC COMMIT**
   (data-architect C1): the 6 caps-side corners (§2) + **widen `choose_form_ex`** (`RENDER_CONTRACTS`
   `capabilityTypes` + `supportedSourceKinds` arrays for `word_form_pair_src`, serving both
   `recognise_word_form_link_cap` + `recognise_allomorph_from_root_cap`; the `cuedRecall.ts` packager's
   catalog-derived-distractor branch, §3) **+ the reader SELECT widen + `AffixedFormPairInput` threading**
   — all together, else it boots blank. **No new `ExerciseType`, but the `choose_form_ex` widening's FOUR
   contract/projector/packager edits (§3) are required** — under-building them yields a runtime
   `item_not_found` for every allomorph drill (architect). Boot test (module-load assertions) + render test
   (`choose_form_ex` renders an allomorph cap with non-undefined catalog-derived options).
6. Each of the **2 genuinely-new** exercise types (`decompose_word_ex`, `build_confix_ex`): union +
   RENDER_CONTRACTS + input shape + projectBuilderInput case + byType packager + component + test — each
   its own atomic commit.
7. `productive=false` skip-produce-cap branch (`affixedCapabilities.ts`) + projector-emit of **BOTH**
   cross-source-kind prereq keys (rule `grammar_pattern_src` + root-vocab `vocabulary_src` via `itemSlug`,
   §7) + test.
8. Three-layer gate: extend `validateAffixedFormPairs` (§6) + the HC + tests.
9. Author + publish ONE pilot affix lesson (e.g. L13 meN-) end-to-end; verify live caps + render in-app
   (query the live DB, not staging); THEN the rest + the 14 chapters.

## 10. Residual verification points for the implementing engineer (files not fully read at spec time)

Grounded in round-2 review (now load-bearing in §1/§4, no longer "residual"): `lesson_section_affixed_pairs`
DDL (`affix` NOT NULL `:3341`, `pattern_source_ref` `:3340`); `TypedAffixedPair` (`loadFromDb.ts:822`,
carries `affix:828`) + `fetchAffixedPairsFromDb` (`:870`); runner map build (`runner.ts:540`).
Still verify before editing: `validators/affixedFormPairs.ts` exact CS12 shape; `masteryModel.ts:
dimensionForCapability` (`:139-170`, exhaustive `never` guard `:167`); the exercise registry/implementations
roster pattern.

## Supabase Requirements

### Schema changes
- Additive columns on `lesson_section_affixed_pairs` + `affixed_form_pairs` (§1); guarded CHECKs; `grammar_pattern_id` FK → `grammar_patterns`.
- New `capability_type` value `recognise_allomorph_from_root_cap` (no DB CHECK on `learning_capabilities.capability_type` today — `migration.sql:1324` — so no constraint migration; the unique index on `(source_ref, capability_type)` enforces after regen).
- New `ExerciseType` values: **2** (`decompose_word_ex`, `build_confix_ex`; frontend union only, not a DB
  enum). The two MCQ caps reuse `choose_form_ex` (widened to `word_form_pair_src`) — no new type.
- RLS/grants: additive — covered by existing table policies; verify after migrate.

### homelab-configs changes
- [ ] N/A — no schema exposure / CORS / GoTrue / bucket changes.

### Health check additions
- HC (Layer 3, §6): every `affixed_form_pairs` row has `grammar_pattern_id` + `affix_type`; meN-/peN- rows have `allomorph_class`; confix rows have both circumfix columns; **`affix ∈ catalog`; `root_text` resolves to a live `learning_items` row** (item B).
- Gate before merge: `make migrate-idempotent-check` + `make pre-deploy`.
