# Capability/Exercise Naming Rename (§8 adoption) — Plan

> **For Claude:** REQUIRED SUB-SKILL once APPROVED: superpowers:executing-plans. **Data-model plan —
> needs `architect` + `data-architect` sign-off before `approved` (plan-review-gate).** Adopts the
> target naming in `docs/current-system/capability-and-exercise-model.md` §8, deferred 2026-06-07,
> now triggered. Sequenced BEFORE the morphology build so new morphology caps are born in the new names.

---
status: shipped
implementation: §8 rename Phases A–C (commits 50d8b75, 3ae3a14, 54429d8 — Phase D typed-table renames deferred, non-identity-bearing)
merged_at: 2026-06-16
reviewed_by: [architect, data-architect]   # round 3, 2026-06-15: data-architect APPROVE; architect
                                           # APPROVE-WITH-CHANGES — the round-3 minor corrections
                                           # (seed-clause fact, podcast_phrase retire, speaking/
                                           # spoken_production left untouched, Phase-B INSERT idempotency)
                                           # all applied. Both said no further full round needed.
supersedes: []
related:
  - docs/current-system/capability-and-exercise-model.md          # §8 target naming (the mapping source of truth)
  - docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md  # sequenced AFTER this; flips §0 to new names
  - docs/adr/0007-receptive-before-productive-staging.md           # level-purity §7.6 residual folded in here
---

**Goal:** Rename the three identity enums (`source_kind`, `capability_type`, `exercise_type`) + `SkillType`
to the readable §8 convention (`_src`/`_mode`/`_cap`/`_ex`), rewriting `canonical_key`, with a clean
build-stage truncate-and-regen — so the model stops conflating three axes across layers and the
imminent morphology build is authored in the right names.

**Architecture:** The capability stage re-emits caps under new type/source names → `canonical_key`
changes for every cap → truncate learner state + re-publish all lessons (ADR 0011 `--regenerate`;
build-stage disposable data). No `capability_aliases` needed (no live history to preserve).

**Tech stack:** TS enums/unions (`src/lib/capabilities/`), capability-stage projectors
(`scripts/lib/pipeline/capability-stage/`), exercise registry (`src/components/exercises/`), Supabase
(re-publish, no DDL CHECK on `capability_type`), Vitest.

## 0. Re-grounded justification (the round-1 "stale premise" fix)

Do NOT cite the old "2 cross-level offenders" — both were already fixed (`l1_to_id_choice` returns
`recognition`; item-`cloze_mcq` removed). The real reasons to do it NOW:
1. **Active forcing function:** the morphology build + reprocessing affix lessons + 14 new chapters
   churns `canonical_key` and re-runs the capability stage across the whole corpus anyway. Renaming
   now means the morphology vertical is authored in the target names once, not built-then-renamed.
2. **Standing confusion is live:** `meaning_recall` is a SkillType *and* a CapabilityType *and* an
   ExerciseType; this session repeatedly tripped on current-vs-target names. The debt is real today.
3. **Build-stage cheapness:** disposable FSRS data → truncate-and-regen; the model doc says exactly this.

## 1. Scope — phased; each phase its own PR (independent rollback, architect round-1)

| Phase | Renames | Rewrites canonical_key? | Risk |
|---|---|---|---|
| **A** | `source_kind` + `capability_type` (+ `direction`/`modality` stay as columns) | **YES** | highest — FSRS identity |
| **B** | `ExerciseType` (`recognition_mcq`→`choose_meaning_ex`, …) | no (exercise ≠ scheduled unit) | medium — frontend + registry |
| **C** | `SkillType`/mode (`recognition`→`recognise_mode`, …) | no | low |
| **D** (optional, may defer) | typed-content-table names (`recognition_mcq_distractors`→`distractors`, …) | no | mechanical but DB table renames + readers |

Phase D is the only genuinely deferrable slice (the model doc lists it; it's not identity-bearing). Do
A→B→C now; decide D at the time. **Fold the ONE genuine level-purity residual into Phase A** (§7.6 of
the model doc): `pattern_recognition` is rendered by `sentence_transformation`/`constrained_translation`
(production-format on a recognition cap) — split or restrict so level is never shifted, since we're
re-emitting pattern caps anyway.

## 2. The naming map — owned by the reference docs, NOT by this plan

**The convention is reference material, not plan material.** The single source of truth is
`docs/current-system/capability-and-exercise-model.md` §8 (the full mapping tables) + the `CONTEXT.md`
glossary + the `capabilities.md`/`exercises.md` module specs. This plan owns only the *migration*; it
**points at** those docs and does not duplicate-as-authority. Adopting the convention is itself a
documentation change (see §6 doc-update tasks): on each phase, §8 flips from "TARGET — not yet
implemented" to the live description (current names demoted to a "former names" footnote), the glossary
adopts the new terms, and the module specs are updated **in the same commit as the code** (CLAUDE.md:
spec drift = code regression).

Reproduced below **for reviewer convenience only** (authority remains §8). Highlights:
- **_src (all 6):** `item`→`vocabulary_src` · `pattern`→`grammar_pattern_src` · `dialogue_line`→`dialogue_line_src` · `affixed_form_pair`→`word_form_pair_src` · `podcast_segment`→`podcast_segment_src` · **`podcast_phrase` → RETIRED** (round-3 decision): it's in the `source_kind` CHECK (`migration.sql:1322`) but is latent/unused (0 live caps, model-doc §5 removal-candidate) → the Phase-A CHECK-rewrite simply OMITS it (drops the value); note in the §8 "former names" footnote. (If a podcast-phrase feature ever lands it earns a fresh `_src` name then.)
- **_cap (12):** `text_recognition`→`recognise_meaning_from_text_cap` · `meaning_recall`→`recall_meaning_from_text_cap` · `l1_to_id_choice`→`recognise_form_from_meaning_cap` · `form_recall`→`produce_form_from_meaning_cap` · `contextual_cloze`→`produce_form_from_context_cap` · `audio_recognition`→`recognise_meaning_from_audio_cap` · `dictation`→`produce_form_from_audio_cap` · `podcast_gist`→`recognise_gist_from_audio_cap` · `pattern_recognition`→`recognise_grammar_pattern_cap` · `pattern_contrast`→`contrast_grammar_pattern_cap` · `root_derived_recognition`→`recognise_word_form_link_cap` · `root_derived_recall`→`produce_derived_form_cap`.
- **_mode (3 live renamed; 1 left):** `recognition`→`recognise_mode` · `meaning_recall`→`recall_mode` · `form_recall`→`produce_mode`. **`spoken_production` (the 4th `SkillType`, `learning.ts:77`) is LEFT UNTOUCHED** (round-3 decision): it forms a self-consistent **dead cluster** with the disabled `speaking` ExerciseType + `byType/speaking.ts:18`. Renaming/retiring it triggers a large blast radius (registry, renderContracts, feedbackMapping, featureFlags, i18n, +5 test files) for zero readability gain on a dead surface. This rename touches LIVE names only; deleting the speaking cluster is a **separate dead-code cleanup, out of scope**.
- **_ex (12):** `recognition_mcq`→`choose_meaning_ex` · `cued_recall`→`choose_form_ex` · `typed_recall`→`type_form_ex` · `meaning_recall`→`type_meaning_ex` · `listening_mcq`→`choose_meaning_from_audio_ex` · `dictation`→`type_form_from_audio_ex` · `cloze`→`type_missing_word_ex` · `cloze_mcq`→`choose_missing_word_ex` · `contrast_pair`→`choose_correct_form_ex` · `sentence_transformation`→`transform_sentence_ex` · `constrained_translation`→`translate_sentence_ex` · `speaking`→**LEFT AS-IS** (dead/disabled surface — NOT renamed or deleted, keeps it self-consistent with `spoken_production` + `buildSpeaking`; dead-code removal is a separate cleanup, out of scope — round-3).

## 3. Consumer inventory (verified by grep, 2026-06-15) — what Phase A/B/C touch

**Hand-edited code (the 20 `lesson-*/capabilities.ts`+`exercise-assets.ts` are REGENERATED — NOT edited):**

- **Identity core (Phase A):** `capabilityTypes.ts` (`CapabilityType` union + `CAPABILITY_TYPES` + `CapabilitySourceKind` + `CAPABILITY_SOURCE_KINDS` + `deriveSkillTypeFromCapabilityType` switch) · `canonicalKey.ts` (`buildCanonicalKey` — key = `cap:v1:<sourceKind>:<sourceRef>:<capabilityType>:<direction>:<modality>:<learnerLanguage>`) · `capabilityCatalog.ts` · `renderContracts.ts` (`capabilityTypes` + `supportedSourceKinds` arrays).
- **Projectors (Phase A):** `projectors/{vocab,grammar,dialogueCloze,dialogueArtifacts,affixedCapabilities,morphology}.ts` + `runner.ts` + `adapter.ts` + `model.ts` + `vocabulary/{gate,planDistractors,publish,selectDistractors}.ts` + `satellitePresence.ts` (all emit/branch on type/source string literals).
- **Readers (Phase A/B):** `byKind/{item,affixedFormPair}.ts` · `byType/listeningMcq.ts`.
- **Consumers of type strings (Phase A):** `masteryModel.ts` (`dimensionForCapability` 12-case switch + `never` guard) · `session-builder/pedagogy.ts` (`startsWith('root_derived_')` + exact matches) · `session-builder/labels.ts` · `buildFeedbackInput.ts` · `resolutionReasons.ts` · `check-supabase-deep.ts`.
- **Exercise side (Phase B):** `ExerciseType` union (`src/types/learning.ts`) + `RENDER_CONTRACTS` keys + the registry (`components/exercises/registry.ts`) + `implementations/` (12 components) + `byType/*`.
- **Mode (Phase C):** `SkillType` union (`src/types/learning.ts`) + `deriveSkillTypeFromCapabilityType` return values + the feedback flow.

**DB:** `learning_capabilities.capability_type` + `.source_kind` + `.canonical_key` (every row);
`learner_capability_state.canonical_key_snapshot` (`migration.sql:1367` — there is NO `canonical_key`
column on that table, cite corrected); `capability_review_events`; **`capability_resolution_failure_events.capability_key`**
(`migration.sql:1413`, free-text log — add to truncate set, review F3). `capability_type` is bare text
(`:1324`) → no CHECK migration; **BUT `source_kind` IS CHECK-constrained (`:1322`)** → Phase A DOES need
a guarded drop+recreate of that CHECK (review CRITICAL F1 — the plan's earlier "no DDL" was wrong). The
unique index on `(source_ref, capability_type)` (`:1346`) does not name `source_kind` values → re-enforces
post-regen cleanly.

**Two consumer classes the first draft MISSED (review CRITICAL/MAJOR) — must be in the sweep:**
- **Substring matches on type strings** (NOT exact-literal): `vocabulary/publish.ts:99`,
  `runner.ts:457,482` use `capabilityType.includes('recognition')` → `recognise_*_cap` does NOT contain
  `recognition`, silently mis-routing the `introduced_by` reason. `pedagogy.ts:158` `.includes('pattern')`
  survives by luck (pattern stays). Convert these to exact-match on the new names. This is the exact grep
  the program doc (data-architect M2) ordered.
- **`exercise_type_availability`** (`migration.sql:614`, `exercise_type` **PRIMARY KEY**) — seeded at
  **THREE sites** (round-2 fix): `:673-685` (the bulk seed) PLUS the two audio types in separate blocks,
  `listening_mcq` (`:1157`) and `dictation` (`:1187`). The bulk seed (`:673-685`) uses
  `ON CONFLICT … DO UPDATE SET`; the two audio sites use `DO NOTHING` (round-3 fact-fix). Either way the
  PK *value* itself changes on rename, which no `ON CONFLICT` clause can update → Phase B must **DELETE
  the old PK rows + INSERT the new names** at all three sites (the INSERT itself carries
  `ON CONFLICT (exercise_type) DO UPDATE SET …` so the migration stays idempotent on a 2nd run). The runtime reads this table to gate exercises, so
  a stale/orphaned row disables the renamed exercise. + `check-supabase-deep.ts:247-248` hardcodes
  `['listening_mcq','dictation']`.
- **`capability_resolution_failure_events.exercise_type`** (`migration.sql:1415`, free-text log) also
  carries old exercise-type strings — no action: auto-cleared by the truncate (data-architect R1).
- **`MasteryDimension`** (`masteryModel.ts:21-32`) is an INDEPENDENT parallel union (NOT `CapabilityType`,
  not type-linked) + the `MEANING_CAPS`/`FORM_CAPS` hardcoded sets (`check-supabase-deep.ts:1313-1314`).
  Phase A must DECIDE: keep `MasteryDimension` as a display taxonomy (decoupled, update only the
  `dimensionForCapability` switch cases) or rename it too (+ its UI consumers). See §8.
- **`capabilityPhase`** 12-case switch (`pedagogy.ts:207-223`, ADR 0007 mechanism) — name it explicitly.

## 4. Migration mechanics — build-stage truncate-and-regen (no aliases)

1. Rewrite the code (the type/source/exercise literals + the maps + the substring `.includes()` →
   exact-match conversions, §3) to the new names — compile-clean (the `as const satisfies` + exhaustive
   switches catch the type-linked omissions; the substring + parallel-union ones do NOT auto-catch).
2. **Phase A DDL (CORRECTED — review F1):** guarded drop+recreate of the `source_kind` CHECK
   (`migration.sql:1322`) with the renamed values (`item`→`vocabulary_src`, …). `capability_type` needs
   none (bare text). **Phase B DDL:** re-seed `exercise_type_availability` (`:673-685`) with new
   `exercise_type` PK values. **Phase C/D:** C is code-only (SkillType is read-derived, not stored —
   the live `learner_skill_state`/`review_events` skill CHECKs are retired/dead surface); D = guarded
   `ALTER TABLE … RENAME` (must use a `pg_class`/`information_schema` existence guard — no native IF EXISTS).
3. `capability_aliases` stays EMPTY (build-stage, no live history). Truncate `learner_capability_state`
   + `capability_review_events` + `capability_resolution_failure_events` + `learning_capabilities`.
4. Re-publish all lessons (`bun scripts/publish-approved-content.ts <N>` per lesson) — the capability
   stage re-emits every cap with the new `canonical_key`. **`projection_version` stays `capability-v3`**
   (only key SEGMENTS change, not the projection logic — do NOT bump it; ADR-level escalation otherwise).
5. **`make migrate-idempotent-check` IS in scope for Phase A** (the CHECK drop+recreate) **and Phase B/D**
   (their DDL) — run it before each of those PRs; `make pre-deploy` before merge.

## 5. Sequencing dependency (the whole reason this is drafted now)

**This plan lands BEFORE the morphology build.** The morphology phase-(b) spec is **already authored in
the target names** — its §0 was reframed from "use current names" to "uses the §8 target names"
(`recognise_allomorph_from_root_cap`, `decompose_word_ex`/`choose_affix_ex`/`choose_allomorph_ex`/
`build_confix_ex`, `word_form_pair_src`, `recognise_word_form_link_cap`/`produce_derived_form_cap`,
`recognise_mode`/`produce_mode`). So the old "flip §0 later" follow-up is **DONE**.

The only remaining dependency is now a **pure SEQUENCING GATE**: the rename (Phases A/B/C) must **ship in
code** before the morphology build starts — because the morphology spec's names only *exist* in code
after this rename. Building morphology first would mint `recognise_allomorph_from_root_cap` / the four
`_ex` names / `word_form_pair_src` against unrenamed enums and collide. No further doc edit to the
morphology spec is needed; it is correct as-authored once this rename has shipped.

## 6. Task breakdown (phased; expand at execution)

**Phase A (canonical_key rewrite):**
1. Level-purity §7.6 residual: split/restrict the `pattern_recognition` produce-format render first
   (it's the one genuine cross-level offender) + tests.
2. Rename `CapabilitySourceKind` + `CapabilityType` unions/arrays + `canonicalKey` + `deriveSkillType`
   + `renderContracts` arrays — compile-clean, one commit (exhaustiveness gates enforce completeness).
3. Sweep the projectors + runner + readers + `masteryModel` + `pedagogy` (incl. the `startsWith`) +
   `labels` + `buildFeedbackInput` + `check-supabase-deep` to the new literals + unit tests.
4. Truncate learner state + re-publish all lessons + verify live DB (new canonical_keys; cap counts
   unchanged) + the app boots (module-load assertions).

**Phase B (ExerciseType):** rename the union + `RENDER_CONTRACTS` keys + registry + `implementations/`
+ `byType/*` + component tests; **+ DELETE-old-PK + INSERT-new in `exercise_type_availability` at all 3
seed sites (`:673-685`, `:1157`, `:1187`)** + update `check-supabase-deep.ts:247-248`; `make
migrate-idempotent-check`; app boots; e2e a session.

**Phase C (SkillType/mode):** rename the **3 live** modes + `deriveSkillType` returns + feedback flow +
tests. **`spoken_production` + the `speaking` ExerciseType are LEFT UNTOUCHED** (dead cluster, out of
scope — round-3). Code-only (SkillType is read-derived, not stored).

**Phase D (optional):** table renames + reader updates — decide at the time.

**Doc updates (every phase, SAME COMMIT as the code — CLAUDE.md spec-drift rule):** the convention is
reference material (§2), so each phase's rename commit also: (a) promotes the relevant rows of
`capability-and-exercise-model.md` §8 from "TARGET" to live (old names → a "former names" footnote);
(b) updates the `CONTEXT.md` glossary terms; (c) updates the `capabilities.md` / `exercises.md` module
specs to the new vocabulary + re-stamps `last_verified_against_code`. A rename PR that changes code but
leaves §8 saying "not yet implemented" is incomplete.

## 7. Open questions for review

> **✅ ALL THREE RESOLVED in §8 (review round 1); retained for context, NOT open (staff-engineer 2026-06-16
> flagged that leaving them phrased as "open" on an approved plan invites drift).** Phase D = **OUT** (its
> own future slice; not identity-bearing — if a table rename is ever wanted it gets its own plan).
> `canonical_key` prefix stays **`cap:v1`** (truncate makes versioning moot). Direction/modality enums
> **left as-is** (stored columns, not the confusing-overload set). The questions below are the original
> framing only.

1. **Phase D in or out?** (Recommend: out of this plan; its own slice if/when wanted.)
2. **`canonical_key` version bump?** Keep `cap:v1` prefix (only the type/source segments change) or bump
   to `cap:v2` to make the regen unmistakable? (Lean: keep v1 — truncate makes versioning moot.)
3. **Direction/modality enum values** (`id_to_l1`, etc.) — the §8 word-glossary replaces `l1`/`id` with
   `meaning`/`form` conceptually, but the direction enum isn't in the §8 tables. Rename direction values
   too (consistency) or leave as-is (they're columns, not in the confusing-overload set)? (Lean: leave.)

## Supabase Requirements

### Schema changes (CORRECTED per review F1/F2)
- **Phase A: DDL required** — guarded drop+recreate of the `source_kind` CHECK (`migration.sql:1322`)
  with renamed values. (`capability_type` is bare text `:1324` — no CHECK migration.) Plus code + re-publish.
- **Phase B: DDL required** — re-seed `exercise_type_availability` PK rows (`:673-685`).
- Phase C: code-only (SkillType read-derived, not stored).
- Phase D (deferred): guarded `ALTER TABLE … RENAME` (existence-guarded — no native IF EXISTS).
- `capability_aliases` (`migration.sql:1349`) stays empty (no live history); truncate
  `learner_capability_state` (+`canonical_key_snapshot`) / `capability_review_events` /
  `capability_resolution_failure_events` / `learning_capabilities`.

### homelab-configs changes
- [ ] N/A — no schema exposure / CORS / GoTrue / bucket changes.

### Health check additions
- `check-supabase-deep.ts`: assert no old `capability_type`/`source_kind`/`exercise_type` literal
  survives post-regen (Layer-3 catch); and **move the hardcoded `MEANING_CAPS`/`FORM_CAPS`
  (`:1313-1314`) + `['listening_mcq','dictation']` (`:247-248`) to the new names** (else those HCs go
  vacuous on the renamed DB).
- `make migrate-idempotent-check` before Phase A/B/D; `make pre-deploy` before merge.

---

## 8. Review round 1 — verdicts & resolutions (2026-06-15)

**`architect`: NEEDS-REWORK · `data-architect`: NEEDS-REWORK** — both "structurally sound, completeness
gaps." Applied: (CRITICAL F1) `source_kind` CHECK DDL; (CRITICAL F2) `exercise_type_availability`
re-seed + substring `.includes('recognition')` consumers (publish.ts:99, runner.ts:457,482); (MAJOR)
`MasteryDimension` decision + `MEANING_CAPS`/`FORM_CAPS`; (MINOR) `capability_resolution_failure_events`
in truncate, cite fix, `capabilityPhase` switch named, projection_version-stays.

**§7 open questions — RESOLVED (both reviewers concur):** Phase D **OUT** (own slice; not identity-bearing).
`canonical_key` prefix **stays `cap:v1`** — do NOT add a "v2" bump (truncate makes it moot; fails the
omission test). Direction/modality enums **left as-is** (stored columns, not the confusing axis) — note
the intentional asymmetry: §2's "l1/id → meaning/form" glossary applies to cap names but `direction`
keeps `id_to_l1`. **MasteryDimension:** keep a decoupled display taxonomy (update only the
`dimensionForCapability` switch cases) unless a reviewer wants the fuller rename — decide at Phase A.

## 9. Spec-naming assurance (answers "be sure the specs use the new names")

After Phase A–C land, the new names are LIVE and the old ones are deprecated. To GUARANTEE specs (and
code) carry them, not just by convention:
1. **Single source of truth** — `capability-and-exercise-model.md` §8 (promoted target→live) + the
   `CONTEXT.md` glossary. Every new spec grounds against these (CLAUDE.md plan-grounding rule).
2. **Live-system guard** — the §Health-check assertion fails **`make pre-deploy`** (the local gate; NOT
   GitHub Actions — GHA can't reach the homelab, CLAUDE.md) if any *old* literal survives in the DB.
3. **Type system (primary code guard)** — the `as const satisfies` unions + exhaustive switches make
   stale *typed* usages a **compile error**; this already covers most of `src/`+`scripts/`. The grep gate
   below is only for what the type system can't see.
4. **Grep gate (NEW task) — scoped to avoid false positives** (round-2 fix): a naive ban on bare words is
   unworkable (`item`, `pattern`, `cloze`, `recognition` are common English/identifiers). So match only
   **quoted enum-position literals** — `'<oldname>'` in string position (`=== '…'`, `: '…'`, `includes('…')`,
   array/Set members, SQL seed literals) — for the *full* old names (`text_recognition`, `recognition_mcq`,
   `affixed_form_pair`, …), scoped to the identity files + `scripts/migration.sql` seeds + `docs/plans/`.
   Allowlist: the §8 "former names" footnote, this plan, and migration-test fixtures that intentionally
   reference old names. A new spec/PR using an old quoted literal fails the gate. This catches exactly the
   substring/seed/hardcoded-set class the type system misses.
5. **Sequencing gate** — the morphology phase-(b) spec's §0 is **already in target names** (§5; the
   former "flip §0 later" follow-up is done). The live gate is now ordering only: Phases A/B/C must
   **ship in code** before the morphology build starts, since the morphology spec's target names
   (`recognise_allomorph_from_root_cap`, the four `_ex` names, `word_form_pair_src`) only exist in code
   after this rename.

## 10. Review round 2 — resolutions (2026-06-15)

**`data-architect`: APPROVE-WITH-CHANGES** (all round-1 resolved; one doc note folded in). **`architect`:
NEEDS-REWORK** — 2 new CRITICALs + 3 warnings, all applied: (C) `exercise_type_availability` re-seed
mislocated/wrong-mechanism → now DELETE-old-PK+INSERT-new at all 3 seed sites (`:673-685`/`:1157`/`:1187`);
(C) Phase C omitted `SkillType.spoken_production` → retire-with-`speaking`; (W) §9 grep gate scoped to
quoted enum-position literals; (W) §9.2 "fails CI" → `make pre-deploy` (GHA can't reach homelab); (W) §2
`podcast_phrase` named.

## 11. Review round 3 — APPROVED (2026-06-15)

**`data-architect`: APPROVE · `architect`: APPROVE-WITH-CHANGES** (both: no further full round needed).
Final minor corrections applied: (1) seed-clause fact — the bulk `:673-685` seed uses `DO UPDATE SET`,
the two audio sites `DO NOTHING`; DELETE-old-PK+INSERT-new is correct regardless (a PK value can't be
changed by any `ON CONFLICT`); (2) `podcast_phrase` → **RETIRED** from the CHECK (latent/unused); (3)
`spoken_production` + the `speaking` ExerciseType → **LEFT UNTOUCHED** (dead cluster; renaming/deleting it
is a large-blast-radius dead-code cleanup, out of scope — rename touches LIVE names only); (4) Phase-B
INSERT carries `ON CONFLICT … DO UPDATE` for idempotency. **status: approved.** Next: implement Phase A
(`make migrate-idempotent-check` gate before the Phase A PR).
