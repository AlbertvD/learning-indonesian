# Morphology Module — Phase (b) Implementation Spec

> **For Claude:** REQUIRED SUB-SKILL once APPROVED: use superpowers:executing-plans (or
> subagent-driven-development) to implement task-by-task. **This is a data-model plan — it must pass
> `architect` + `data-architect` review and be marked `approved` BEFORE any code (plan-review-gate).**
> Parent/program doc: `docs/plans/2026-06-15-morphology-module-and-capability-model-design.md`.

---
status: approved
reviewed_by: [architect, data-architect]   # round 3, 2026-06-15: data-architect APPROVE; architect
                                           # APPROVE-WITH-CHANGES — the one prescribed change (drop the
                                           # backfill+drop dance → build-and-re-publish, §1/§9 task 2)
                                           # applied. Both round-2 CRITICALs + all warnings resolved.
supersedes: []
related:
  - docs/plans/2026-06-15-morphology-module-and-capability-model-design.md   # program doc + §9 obligations
  - docs/current-system/capability-and-exercise-model.md
  - docs/adr/0006-introducing-lesson.md
  - docs/adr/0007-receptive-before-productive-staging.md
  - docs/adr/0011-capability-content-db-authoritative-after-seeding.md
---

**Goal:** Add the generative morphology *application tier* — extended `affixed_form_pairs` payload +
one new capability type + ~4 new exercise types — on top of the already-live rule tier, so the
follow-up book's affix chapters land as real generative drills, not generic grammar exercises.

**Architecture:** One content table (`affixed_form_pairs`) gains discriminator + payload columns; the
new caps reuse `source_kind='word_form_pair_src'`; the affix's existing grammar-pattern capability becomes the
FSRS prerequisite via a new `grammar_pattern_id` FK. No new spine, no new source_kind.

**Tech stack:** Supabase/Postgres (additive migration in `scripts/migration.sql`), capability-stage
projectors (`scripts/lib/pipeline/capability-stage/`), exercise-content readers (`src/lib/exercise-content/`),
render contracts (`src/lib/capabilities/`), React exercise components (`src/components/exercises/`),
Vitest.

---

## 0a. Staff-engineer review (2026-06-16) — two findings to FOLD INTO the phase-b re-review

A simplicity/reuse pass (the lens `architect` + `data-architect` structurally miss) found two items on
this approved spec. Both fold into the **phase-b re-review** the capstone already schedules (with item B +
`affix ∈ catalog`). Do not build verbatim without resolving them:

1. **[OVERBUILT] Cut `choose_affix_ex` + `choose_allomorph_ex` as new exercise types — reuse `cued_recall`.**
   Both are an MCQ "prompt + tappable options" screen identical to the existing `cued_recall`
   (`CuedRecallExercise.tsx:43-64`), which already serves `root_derived_*` caps (`renderContracts.ts:70`).
   Widen `cued_recall`'s `supportedSourceKinds` to include `word_form_pair_src` (mirroring how `typed_recall`
   was widened, `renderContracts.ts:74-88`) and render `recognise_word_form_link_cap` /
   `recognise_allomorph_from_root_cap` through it. Net: **2 new exercise types, not 4** — keep only the
   genuinely-distinct interactions `decompose_word_ex` (segment a word) + `build_confix_ex` (assemble two
   boundaries). The new *cap* `recognise_allomorph_from_root_cap` still earns its keep; only its bespoke
   exercise type is cut. (Ripples into model-doc §8's `_ex` table + program-doc §6, which list
   `choose_affix_ex`/`choose_allomorph_ex` — update those when the re-review adopts the cut. The capstone
   is unaffected: its practice is a scoped-session launch and names no exercise types.)
2. **[UNDERBUILT] Specify affix-distractor sourcing.** The MCQ drills need a distractor set (wrong
   affix/allomorph options). The affixed-distractor table isn't built (only `cued_recall_distractors` for
   items, `migration.sql:2869`) and §3 hand-waves "a distractor affix set." Name the source — author an
   affix-distractor set, or derive deterministically from the catalog's allomorph classes — or the MCQ
   drills can't render.

The substrate columns + the one new cap are right-sized; keep them.

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
| new exercise types | `decompose_word_ex`, `choose_affix_ex`, `choose_allomorph_ex`, `build_confix_ex` (new — added to §8) | ~~`decompose_word`, `choose_affix`, `choose_allomorph`, `build_confix`~~ |
| plain produce reuses | `type_form_ex` (existing — no new exercise) | `typed_recall` |
| modes (level refs) | `recognise_mode`, `produce_mode` | `recognition`, `form_recall` |

> **SEQUENCING GATE (load-bearing).** These target names only exist *in code* AFTER the §8 rename
> (`docs/plans/2026-06-15-capability-naming-rename-plan.md`, Phases A/B/C) ships. The rename MUST ship
> before this morphology build starts; otherwise the names this spec adds (`recognise_allomorph_from_root_cap`,
> the four `_ex` names, the `word_form_pair_src` source kind) collide with the unrenamed enums. The code
> `file:line` cites below intentionally point at the **post-rename** codebase.

The program doc §6 used target names for illustration (its `recognise_allomorph_cap` shorthand is the
rule-correct `recognise_allomorph_from_root_cap` here).

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
3. **Render contract** — `src/lib/capabilities/renderContracts.ts:56` `RENDER_CONTRACTS`: the new `choose_allomorph_ex` exercise entry lists `capabilityTypes: ['recognise_allomorph_from_root_cap']`, `supportedSourceKinds: ['word_form_pair_src']`, `requiredArtifacts: { word_form_pair_src: [] }`. (Module-load assertion `:167` refuses boot if a supportedSourceKind lacks a requiredArtifacts key; `assertCapabilityTypesRenderable` refuses boot if `recognise_allomorph_from_root_cap` is in no contract.)
4. **Mastery dimension** — `src/lib/analytics/mastery/masteryModel.ts:~139` `dimensionForCapability`: add the `recognise_allomorph_from_root_cap` case (exhaustive `never` guard at `:164` is a compile error otherwise). Group with grammar/morphology dimension.
5. **Writer** — capability emitter (`projectors/affixedCapabilities.ts`): emit a 3rd cap per meN-/peN- pair (`recognise_allomorph_from_root_cap`, **`direction='root_to_derived'`** — REUSE the existing enum value, no new direction; the distinct `capability_type` already makes the canonical key unique vs `recognise_word_form_link_cap`, so no key collision — data-architect key-axis decision; `modality='text'`, `learnerLanguage='none'`), gated on `allomorph_class IS NOT NULL`. Prereq = the pair's `recognise_word_form_link_cap` key.
6. **Reader** — `byKind/affixedFormPair.ts` SELECT widened + `AffixedFormPairInput` (`renderContracts.ts:303`) gains `allomorphClass` + `affix`; `byType` packager for `choose_allomorph_ex` reads it.

## 3. New exercise types (target `_ex` naming)

> **⚠️ PROVISIONAL pending the §0a re-review decision (seam audit 2026-06-16).** Two of the rows below —
> **`choose_affix_ex`** and **`choose_allomorph_ex`** — are flagged in §0a for CUTTING (they are the
> existing `cued_recall` MCQ screen; widen `cued_recall` to `word_form_pair_src` instead). **Do NOT build
> them until the phase-b re-review adopts or rejects the §0a cut.** If adopted, only `decompose_word_ex` +
> `build_confix_ex` remain genuinely new, and the §2.3/§5/§9 references + §8-model-doc + program-doc §6
> must be struck in lockstep. §2 corner 3/6's `choose_allomorph_ex` references are likewise provisional.

Add to `ExerciseType` union (`src/types/learning.ts`) + `RENDER_CONTRACTS` (`renderContracts.ts:56`) + `ContractInputShapes` (`renderContracts.ts:~414`, compile-enforced) + `projectBuilderInput` switch (`renderContracts.ts:~599`) + the registry (`src/components/exercises/registry.ts`) + `implementations/`:

| Exercise type | Level (`_mode`) → cap | supportedSourceKinds | reads |
|---|---|---|---|
| `decompose_word_ex` | `recognise_mode` → `recognise_word_form_link_cap` | `['word_form_pair_src']` | root/derived/affix/circumfix |
| `choose_affix_ex` | `recognise_mode` → `recognise_word_form_link_cap` | `['word_form_pair_src']` | affix + a distractor affix set |
| `choose_allomorph_ex` | `recognise_mode` → `recognise_allomorph_from_root_cap` | `['word_form_pair_src']` | `allomorph_class` |
| `build_confix_ex` | `produce_mode` → `produce_derived_form_cap` | `['word_form_pair_src']` | root + circumfix_left/right |

Plain produce reuses the EXISTING `type_form_ex` (already serves `produce_derived_form_cap` on `word_form_pair_src`, `renderContracts.ts:74-88`) — no new type needed for plain produce. **Root Race CUT.** Each new component composes `exercises/primitives/` and renders the `adminOverlay` slot (the flag fix from earlier this session).

**Atomic-boot constraint (exercise side too, architect WARNING):** each new `ExerciseType` must land
WITH its `ContractInputShapes` entry (`renderContracts.ts:~414`, `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK`
at `:431`) AND its `projectBuilderInput` switch branch (the `never` exhaustiveness at `:635`) in the
SAME commit — both are compile-time gates that fail the build otherwise.

**Level↔phase note (architect WARNING):** `decompose_word_ex`/`choose_affix_ex` route through
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
- `byType` packagers: extend `typedRecall.ts` (`build_confix_ex` path) + add packagers for `decompose_word_ex`/`choose_affix_ex`/`choose_allomorph_ex`.

## 6. Three-layer invariant gate (all three layers — program doc §9)

- **Layer 1** — shared validator helper + unit tests: "every affixed pair resolves to a `grammar_pattern_id`; meN-/peN- pairs have a valid `allomorph_class`; confix pairs have both circumfix columns."
- **Layer 2** — pre-write in `runCapabilityStage`: **extend `validateAffixedFormPairs`
  (`validators/affixedFormPairs.ts`)** to check the new required fields (data-architect m1): `affix_type`
  non-null + in the enum; `grammar_pattern_id` non-null; `productive` non-null; `allomorph_class` non-null
  when `affix IN ('meN-','peN-')`; `circumfix_left/right` non-null when `affix_type='confix'`; **`affix ∈
  the `lib/morphology` catalog constant** (the controlled-vocabulary tie the capstone item A requires — the
  writer-side obligation, missing here until now; seam audit 2026-06-16). **Also widen the source_ref
  regex** (`^lesson-\d+\/morphology\/.+$`) for the non-`lesson-N` authoring units the §8 harvest introduces
  (e.g. `staging/lesson-999`) — load-bearing, not optional (architect WARNING).
- **Layer 3** — `scripts/check-supabase-deep.ts` HC (after HC17): live-DB assertion of the same invariant,
  **including `affix ∈ catalog`** (every live `affix` value is a catalog member — else the trainer's
  catalog grouping silently splits one affix across spelling variants).

## 7. ADR addendum (program doc §9 / architect CRITICAL)

The rule→pair prerequisite is **cross-source-kind** (`grammar_pattern_src` rule cap → `word_form_pair_src` application cap). ADR 0007:44 currently EXEMPTS `word_form_pair_src` from the staging gate and the `prerequisiteKeys` chain is only WITHIN a pair.
- **The planner half ALREADY works** (verified, both reviewers): `satisfiedKeys` is a flat source-kind-agnostic `canonical_key` set (`src/lib/session-builder/pedagogy.ts:518-520`) and the prereq test (`:320`) is mechanical — it resolves a cross-source-kind key with no change. So only TWO things need building:
  1. **Projector emit:** `projectAffixedCapabilities` (`affixedCapabilities.ts:77/98`) currently sets `prerequisiteKeys: []`/`[recognitionKey]` — add the affix's grammar-pattern (`grammar_pattern_src`) cap canonical_key to the application caps' `prerequisiteKeys`.
  2. **ADR addendum/new ADR** documenting the rule→application gating axis (supersede 0007:44's "morphology has no siblings, exempt" note). **Sequence this as an EARLY task** (data-architect i1) — it gates the projector-emit task, not task 9.

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
5. **`recognise_allomorph_from_root_cap` triangle — ONE ATOMIC COMMIT** (data-architect C1): the 6 caps-side corners
   (§2) + the `choose_allomorph_ex` exercise's `ExerciseType`/`RENDER_CONTRACTS`/`ContractInputShapes`/
   `projectBuilderInput`/component **+ the reader SELECT widen + `AffixedFormPairInput` threading** — all
   together, else it boots blank. Boot test (module-load assertions pass) + render test (non-undefined `allomorphClass`).
6. Each REMAINING new exercise type (`decompose_word_ex`, `choose_affix_ex`, `build_confix_ex`): union + RENDER_CONTRACTS
   + input shape + projectBuilderInput case + byType packager + component + test — each its own atomic commit.
7. `productive=false` skip-produce-cap branch (`affixedCapabilities.ts`) + projector-emit of the
   cross-source-kind prereq key + test.
8. Three-layer gate: extend `validateAffixedFormPairs` (§6) + the HC + tests.
9. Author + publish ONE pilot affix lesson (e.g. L13 meN-) end-to-end; verify live caps + render in-app
   (query the live DB, not staging); THEN the rest + the 14 chapters.

## 10. Residual verification points for the implementing engineer (files not fully read at spec time)

Grounded in round-2 review (now load-bearing in §1/§4, no longer "residual"): `lesson_section_affixed_pairs`
DDL (`affix` NOT NULL `:3341`, `pattern_source_ref` `:3340`); `TypedAffixedPair` (`loadFromDb.ts:822`,
carries `affix:828`) + `fetchAffixedPairsFromDb` (`:870`); runner map build (`runner.ts:540`).
Still verify before editing: `validators/affixedFormPairs.ts` exact CS12 shape; `masteryModel.ts:
dimensionForCapability` (`:139-170`, exhaustive `never` guard `:164`); the exercise registry/implementations
roster pattern.

## Supabase Requirements

### Schema changes
- Additive columns on `lesson_section_affixed_pairs` + `affixed_form_pairs` (§1); guarded CHECKs; `grammar_pattern_id` FK → `grammar_patterns`.
- New `capability_type` value `recognise_allomorph_from_root_cap` (no DB CHECK on `learning_capabilities.capability_type` today — `migration.sql:1324` — so no constraint migration; the unique index on `(source_ref, capability_type)` enforces after regen).
- New `ExerciseType` values (frontend union only; not a DB enum).
- RLS/grants: additive — covered by existing table policies; verify after migrate.

### homelab-configs changes
- [ ] N/A — no schema exposure / CORS / GoTrue / bucket changes.

### Health check additions
- HC (Layer 3, §6): every `affixed_form_pairs` row has `grammar_pattern_id` + `affix_type`; meN-/peN- rows have `allomorph_class`; confix rows have both circumfix columns.
- Gate before merge: `make migrate-idempotent-check` + `make pre-deploy`.
