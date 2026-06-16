---
doc: capability-and-exercise-model
kind: model-reference
last_verified_against_code: 2026-06-06
live_counts_as_of: 2026-06-06
related:
  - docs/current-system/modules/capabilities.md      # CODE module for capabilities (files/ports)
  - docs/current-system/modules/exercises.md         # CODE module for exercise builders/resolver
  - docs/current-system/modules/exercise-content.md  # CODE module for per-kind content fetch/packaging
  - src/lib/capabilities/capabilityTypes.ts          # the type unions
  - src/lib/capabilities/renderContracts.ts          # cap_type ↔ exercise_type mapping (sole source of truth)
  - CONTEXT.md                                        # glossary: Learning Capability, Capability Type, Content Source kinds
---

# Capability & exercise model — the clear overview

> **Status note (2026-06-07): §8 is a DESIRED TARGET, not current state.** The improved 4-layer naming convention (`_src`/`_mode`/`_cap`/`_ex`) is **not implemented** — code + live DB still use the old overloaded `CapabilityType` names (`text_recognition`, `l1_to_id_choice`, `contextual_cloze`, `pattern_contrast`, …). The rename rewrites `canonical_key` (FSRS identity) + 6 consumer surfaces and must first answer the §7 structural questions, so it is a migration, not a doc edit. **Decision (2026-06-07): postpone until the need is high enough** — the confusion is real but causes no user-facing/quality regression, and build-stage state-truncation keeps the rename cheap to execute whenever we choose. Revisit when the naming actively blocks work or a forcing function (e.g. another key-touching change) appears. See `memory/project_capability_model_and_naming.md` and `memory/project_capability_quality_salvage_not_rebuild.md`.

This is the **conceptual** map of the learning model: content sources, the capabilities (skills) derived from them, the exercise types those capabilities render as, and the artifacts an exercise consumes. It is the map you read before designing anything in this area.

It is **not** a code-structure spec — those are [`modules/capabilities.md`](./modules/capabilities.md), [`modules/exercises.md`](./modules/exercises.md), [`modules/exercise-content.md`](./modules/exercise-content.md). This doc answers *"what is the model and how do its pieces connect?"*.

> **Why this doc exists (2026-06-06):** the capability and exercise *names* conflate three independent axes and reuse the same words across abstraction layers (`meaning_recall` is a mode **and** a capability **and** an exercise). That makes the model hard to hold in your head and hard to design against. This overview makes the latent structure visible and records the naming debt as explicit open questions (§7). **Read §7 before proposing any change.**

---

## 1. The chain: source → capability → exercise → artifact

```
Content source        Capability (skill)         Exercise (task)            Artifact (raw material)
─────────────         ──────────────────         ───────────────            ───────────────────────
learning_item    ──►  burung × text_recognition  ──►  recognition_mcq   ──►  distractor set
dialogue_line    ──►  line × contextual_cloze     ──►  cloze             ──►  dialogue_clozes row
grammar_pattern  ──►  pattern × pattern_contrast  ──►  contrast_pair     ──►  contrast_pair_exercises row
```

- A **content source** is *what is being learned* (six kinds — §5).
- A **capability** is *one skill over that source* — `(source × capability_type)`. **This is the unit FSRS schedules** (ADR 0003). Capabilities are projected deterministically from the typed source tables.
- An **exercise** is *a concrete task that proves the capability* — chosen at session time. One capability can render as several exercise types; the grade flows back to the **capability**, not the exercise.
- An **artifact** is the *raw material an exercise needs to render* (distractors, cloze rows, authored grammar-exercise rows). The three in-stage LLM generators author the artifacts (§4, §6), not the capabilities.

The contract binding capability ↔ exercise ↔ required-artifact is `RENDER_CONTRACTS` (`renderContracts.ts:55`) — the **sole source of truth** (§6).

---

## 2. A capability is three orthogonal axes

| Axis | Question | Where it lives in the data |
|---|---|---|
| **Source** | *What content?* | `learning_capabilities.source_kind` + `source_ref` |
| **Direction / modality** | *From what → to what, which medium?* | `.direction`, `.modality`, `.learner_language` **columns** (`capabilityTypes.ts:61-71`) |
| **Cognitive level** | *recognise → recall-meaning → produce-form* (ADR 0007) | derived from `capability_type` via `deriveSkillTypeFromCapabilityType` → `SkillType` (`:233`) |

**Key fact:** direction and modality are **already columns**. The `capability_type` string is meant to be just the discriminator, but several type names redundantly re-encode direction/modality and/or smuggle in exercise *format* — that overload is the core naming problem (§7).

---

## 3. The 12 capability types

`CapabilityType` is fixed in code (`capabilityTypes.ts:32-44`).

### 3a. Item capabilities — a (direction × level) matrix

The structure is a clean grid; the names are drawn from four different logics (last column).

| Capability type | Direction | Level (`SkillType`) | Renders as | Live caps¹ | Named after… |
|---|---|---|---|---|---|
| `text_recognition` | id → l1 | recognition | `recognition_mcq` | 630 | modality + mode |
| `meaning_recall` | id → l1 | meaning_recall | `meaning_recall` | 575 | mode |
| `audio_recognition` | audio → l1 | recognition | `listening_mcq` | 605 | modality + mode |
| `l1_to_id_choice` | l1 → id | meaning_recall² | `cued_recall` | 584 | **direction + format** |
| `form_recall` | l1 → id | form_recall | `cued_recall`, `typed_recall` | 578 | mode |
| `dictation` | audio → id | form_recall | `dictation` | 605 | **format** |
| `contextual_cloze` (item) | context → id | form_recall | `cloze`, `cloze_mcq` | **0**³ | **format** |

¹ Live `learning_capabilities`, `retired_at IS NULL`, 2026-06-06. ² Classed `meaning_recall` but tests choosing the Indonesian *form* — see §7.5. ³ Item carrier-sentence cloze emits 0 capabilities (deferred #148); every live `contextual_cloze` is `dialogue_line`-sourced.

### 3b–e. Non-item capabilities

| Capability type | Source | Level | Renders as | Live caps |
|---|---|---|---|---|
| `contextual_cloze` | `dialogue_line` | form_recall | `cloze` (typed only⁴) | 79 |
| `pattern_recognition` | `pattern` | recognition | `cloze_mcq`, `sentence_transformation`, `constrained_translation` | 63 |
| `pattern_contrast` | `pattern` | recognition | `contrast_pair` | 63 |
| `root_derived_recognition` | `affixed_form_pair` | recognition | `cued_recall`, `typed_recall` | 2 |
| `root_derived_recall` | `affixed_form_pair` | form_recall | `cued_recall`, `typed_recall` | 2 |
| `podcast_gist` | `podcast_segment` | recognition | `listening_mcq` | **0** (not live) |

⁴ `cloze_mcq` excludes `dialogue_line` (`renderContracts.ts:124`).

---

## 4. The 12 exercise types

`ExerciseType` — the *task formats* a capability renders as. "Format" is the axis the capability names should **not** carry but sometimes do (§7).

| Exercise type | Format | Learner does | Serves capability type(s) | Content authored by |
|---|---|---|---|---|
| `recognition_mcq` | MCQ | see id → pick l1 meaning | `text_recognition` | `generateItemDistractors` |
| `cued_recall` | MCQ | see l1 → pick id word | `l1_to_id_choice`, `form_recall`, `root_derived_*` | `generateItemDistractors` |
| `typed_recall` | typed | see l1/root → type id | `form_recall`, `root_derived_*` | — (free, graded) |
| `meaning_recall` | typed | see id → state meaning | `meaning_recall` | — (free, graded) |
| `listening_mcq` | MCQ (audio in) | hear id → pick l1 | `audio_recognition`, `podcast_gist` | — (options at runtime)⁵ |
| `dictation` | typed (audio in) | hear id → type id | `dictation` | — (audio only) |
| `cloze` | typed (fill blank) | type the missing word | `contextual_cloze` | `generateDialogueClozes` (dialogue) / #148 (item) |
| `cloze_mcq` | MCQ (fill blank) | pick the missing word | `contextual_cloze` (item), `pattern_recognition` | `generateGrammarExercises` (pattern) / `generateItemDistractors` (item, deferred) |
| `contrast_pair` | MCQ (2-way) | choose between two forms | `pattern_contrast` | `generateGrammarExercises` |
| `sentence_transformation` | typed | transform a sentence | `pattern_recognition` | `generateGrammarExercises` |
| `constrained_translation` | typed | translate l1→id using the pattern | `pattern_recognition` | `generateGrammarExercises` |
| `speaking` | spoken | — | **none** (dead, `:153`) | — |

⁵ Audio-exercise options are not authored by the three in-stage generators traced 2026-06-06; verify the listening_mcq option source before relying on it.

**Format axis falls out cleanly:** MCQ/choose (`recognition_mcq`, `cued_recall`, `listening_mcq`, `cloze_mcq`, `contrast_pair`) vs typed/produce (`typed_recall`, `meaning_recall`, `dictation`, `cloze`, `sentence_transformation`, `constrained_translation`). This is the axis that should live **only** here, on exercises — not in capability names.

---

## 5. Content source → typed table

Definitions in **CONTEXT.md → Content Source kinds**.

| Source kind | Typed table | Example `source_ref` |
|---|---|---|
| `item` | `learning_items` | `learning_items/abang` |
| `dialogue_line` | `lesson_dialogue_lines` (→ `dialogue_clozes`) | `lesson-10/section-1/line-2` |
| `pattern` | `grammar_patterns` | `lesson-10/pattern-l10-achtervoegsel-an-...` |
| `affixed_form_pair` | `affixed_form_pairs` | `lesson-9/morphology/meN-baca-membaca` |
| `podcast_segment` | `podcasts` (segments) | — (0 live) |
| `podcast_phrase` | — | — (latent/unused; removal candidate) |

---

## 6. The binding (RENDER_CONTRACTS) — facts that matter

- **Fan-out:** one capability → several exercise types (`pattern_recognition` → 3; `contextual_cloze` → 2; `form_recall` → 2). The **resolver/composer** picks which one a learner sees in a session (not modelled here — see `modules/exercises.md`).
- **`speaking` is dead surface** — a registered exercise no capability maps to (`:153`).
- **Where exercise quality *is* capability soundness:** `pattern_*` (grammar exercises are the cap's only practice content) and `dialogue_line:contextual_cloze` (the cloze *is* the capability — no artifact ⇒ no cap). For item caps, distractors are removable decoration (the cap renders with runtime fallbacks).

---

## 7. Naming & structure debt — open design questions

The *structure* is sound; the *names* are not. Items 1–4 and 7 remain open naming choices; **items 5 and 6 are now SETTLED** (box below) — they were the deepest part of the capability↔exercise tension.

### ✅ Settled (2026-06-06): cognitive level belongs to the capability, not the exercise

**Decision.** A capability is keyed by `(source × direction × modality × level)`. An exercise may vary surface format **only within a level** and must **never** shift it. Level lives on the *scheduled unit*, not the render.

**Evidence:**
- Receptive vs productive knowledge are separate constructs with asymmetric, incomplete transfer — Laufer & Goldstein (2004, the four-knot sequence, cited in `stages.ts:14`); Webb & Nation (2017); Nation (2006).
- Memory is format-specific — transfer-appropriate processing (Morris, Bransford & Franks 1977); encoding specificity (Tulving & Thomson 1973). Practising recognition does not build production, so an MCQ cannot satisfy a production skill.
- The dominant SRS convention is **one scheduled unit per direction/format** — Anki, Fluent Forever, Skritter, Pleco (one card per direction); SuperMemo's minimum-information principle.
- Define the scheduled unit by transfer — the KLI framework (Koedinger, Corbett & Perfetti 2012): non-transferring skills are distinct knowledge components.
- **This project already concluded the same** and named the opposite (conflating level/direction/modality under one unit) as the concrete **Mismatch A/B/C** bug that caused the stuck-in-retrieving deadlock — `docs/research/2026-04-25-skill-rotation-and-pedagogical-sequencing.md` Part 4.3 + Part 6 Layer 2B.
- Counter-view (rejected for a quality-first single-learner app): Duolingo's single-strength-per-concept model lets the exercise format adapt to strength (Settles & Meeder 2016) — simpler, but does not model the receptive/productive gap at all.

**Consequences (capability-v3 is already this decomposition):**
- Each (direction × modality × level) stays its **own** capability — the three `produce_form_*` (form_recall / dictation / contextual_cloze) are **kept separate**, NOT collapsed into one capability with a stimulus column.
- The one genuine residual bug is the **cross-level render**: a *produce* capability rendered by a *recognition*-format exercise. Fix: pin each capability to exactly one level and forbid an exercise from rendering it at another (so cloze-as-typed and cloze-as-MCQ become two capabilities, or the MCQ render is disallowed for the produce capability). ADR 0007 already half-patches this by staging such types at the higher phase.
- **Concrete correction:** `l1_to_id_choice` is a legitimately distinct capability (NL→ID *recognition* ≠ NL→ID *production*), but it is **mis-labelled** `SkillType: meaning_recall` (`capabilityTypes.ts:243`). It is a **recognition**-level skill (recognising the Indonesian *form*) and `deriveSkillTypeFromCapabilityType` should return `recognition` for it.

1. **Same word, different layers.** `meaning_recall` is a `SkillType`, a `CapabilityType`, **and** an `ExerciseType`. "recall" and "recognition" likewise span all three layers. Every reader must ask "which layer?".
2. **Exercise format smuggled into capability names.** `l1_to_id_choice` ("choice"=MCQ), `dictation`, `contextual_cloze` name *how the skill is tested*, not the skill. Format belongs on the exercise (§4). → *Rename to the skill, move format out?*
3. **Capability names re-encode direction/modality that columns already hold.** `audio_recognition` says "audio" in the name **and** `modality` **and** `direction`. → *Should `capability_type` name only the level?*
4. **Inconsistent axis across groups.** Item types: grab-bag (modality/mode/direction/format). Pattern + affixed: tidy `source_mode`. → *One scheme for all 12?*
5. **`l1_to_id_choice` mis-levelled.** ✅ **RESOLVED** (box above): a legitimately distinct capability, but mis-labelled — it is **recognition**-level, not `meaning_recall`. Fix: `deriveSkillTypeFromCapabilityType` returns `recognition` for it.
6. **Level ↔ format mismatches.** ✅ **RESOLVED** (box above): level belongs to the capability, so capabilities stay split per (direction × modality × level); the fix is to forbid **cross-level renders**. Two live instances: `contextual_cloze` (produce) rendered as `cloze_mcq` (recognition), and `pattern_recognition` (recognition) rendered as `sentence_transformation`/`constrained_translation` (production). Both need the same treatment — split the capability or restrict the render so level is never shifted.
7. **Dead / latent entries.** `speaking` (no cap), `podcast_phrase` (no cap, 0 rows), `podcast_gist` (0 rows). → *Prune or build out?*

---

## 8. Naming convention (TARGET — not yet implemented)

The current names conflate three axes and reuse words across layers (§7). The target convention fixes this with one rule:

> **Every identifier ends in a layer suffix, and its descriptor is plain English — no jargon, no direction codes.** Read a name cold and you know both its layer and its meaning.

**Word glossary** (so descriptors stay short and stay correct whichever interface language the learner uses): **`meaning`** = the L1 gloss (Dutch/English) · **`form`** = the Indonesian word / written form. These replace the cryptic `l1`/`id` codes.

**Four layers, four suffixes:** `_src` (source) · `_mode` (cognitive level) · `_cap` (capability/skill) · `_ex` (exercise/task).

There is **no "artifact" layer.** "Artifact" was a generic umbrella the system deliberately retired (ADR 0008/0009 → typed-table-per-concept). The materials an exercise consumes are **named typed concepts**, each its own name (`distractors`, `cloze`, the typed grammar-exercise rows) — not one vague bucket. "Distractors" survives because it is precise; it names *one* such concept (the wrong MCQ options), never the whole category.

### Source — `_src`
| Live | Target |
|---|---|
| `item` | `vocabulary_src` |
| `dialogue_line` | `dialogue_line_src` |
| `pattern` | `grammar_pattern_src` |
| `affixed_form_pair` | `word_form_pair_src` |
| `podcast_segment` | `podcast_segment_src` |

### Mode — `_mode` (the easy→hard ladder)
| Live (`SkillType`) | Target |
|---|---|
| `recognition` | `recognise_mode` |
| `meaning_recall` | `recall_mode` |
| `form_recall` | `produce_mode` |

### Capability — `_cap` (`operation_object_from_stimulus`)
| Live | Target |
|---|---|
| `text_recognition` | `recognise_meaning_from_text_cap` |
| `audio_recognition` | `recognise_meaning_from_audio_cap` |
| `meaning_recall` | `recall_meaning_from_text_cap` |
| `l1_to_id_choice` | `recognise_form_from_meaning_cap` |
| `form_recall` | `produce_form_from_meaning_cap` |
| `dictation` | `produce_form_from_audio_cap` |
| `contextual_cloze` | `produce_form_from_context_cap` |
| `pattern_recognition` | `recognise_grammar_pattern_cap` |
| `pattern_contrast` | `contrast_grammar_pattern_cap` |
| `root_derived_recognition` | `recognise_word_form_link_cap` |
| `root_derived_recall` | `produce_derived_form_cap` |
| `podcast_gist` | `recognise_gist_from_audio_cap` |
| — (§7.6 split, SHIPPED 2026-06-16 — ADR 0017) | `produce_grammar_pattern_cap` |
| — (new — morphology build) | `recognise_allomorph_from_root_cap` |

> **Morphology application tier (added by the morphology build).** `recognise_allomorph_from_root_cap`
> is net-new — it has no prior "Live" name; the morphology phase-(b) spec mints it directly in this
> convention (`operation_object_from_stimulus`: recognise the correct allomorph of an affix from a root,
> e.g. *baca → membaca* vs. *tulis → menulis*). Source kind `word_form_pair_src`, mode `recognise_mode`.
> See `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md` §2.

### Exercise — `_ex` (`verb_what`)
| Live | Target |
|---|---|
| `recognition_mcq` | `choose_meaning_ex` |
| `cued_recall` | `choose_form_ex` |
| `typed_recall` | `type_form_ex` |
| `meaning_recall` (exercise) | `type_meaning_ex` |
| `listening_mcq` | `choose_meaning_from_audio_ex` |
| `dictation` (exercise) | `type_form_from_audio_ex` |
| `cloze` | `type_missing_word_ex` |
| `cloze_mcq` | `choose_missing_word_ex` |
| `contrast_pair` | `choose_correct_form_ex` |
| `sentence_transformation` | `transform_sentence_ex` |
| `constrained_translation` | `translate_sentence_ex` |
| `speaking` | *(dropped — dead surface)* |
| — (new — morphology build) | `decompose_word_ex` |
| — (new — morphology build) | `build_confix_ex` |

> **Morphology application drills (added by the morphology build).** **TWO** net-new exercises (no prior
> "Live" name), minted in the `_ex` convention (`verb_what`) over `word_form_pair_src`: `decompose_word_ex`
> (derived → root + affix, the genuinely-new "segment" interaction) and `build_confix_ex`
> (`produce_derived_form_cap`, "assemble two boundaries"). The two MCQ caps —
> `recognise_word_form_link_cap` ("pick the affix") and `recognise_allomorph_from_root_cap` ("pick the
> allomorph") — **reuse the existing `cued_recall`** (widened to `word_form_pair_src`; staff-engineer cut
> of the bespoke `choose_affix_ex`/`choose_allomorph_ex`, 2026-06-16), distractors catalog-derived. Plain
> derived-form production reuses the existing `type_form_ex`. See
> `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md` §0a + §3.

### Typed content concepts (named directly — **not** a layer)
The materials an exercise consumes, each its own typed concept (ADR 0009):

| Live table | Target | What it is |
|---|---|---|
| `recognition_mcq_distractors` | `distractors` (`distractor_kind='meaning'`) | wrong **meaning** options for `choose_meaning_ex` |
| `cued_recall_distractors`, `cloze_mcq_item_distractors` | `distractors` (`distractor_kind='form'`) | wrong **Indonesian-word** options |
| `dialogue_clozes` | `cloze` | the blanked line + answer |
| `contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises` | (their `_ex` names) | authored grammar tasks — the row *is* the exercise |

**Source facets are not content concepts:** `meaning`, `accepted_answers`, `base_text`, `audio_clip` belong to the **source** (they are the vocabulary content itself), not to a separate materials category.

### Status

**Phase A LIVE (2026-06-16).** The `_src` (source_kind) and `_cap` (capability_type) renames in the two tables above are **implemented in code** (`src/lib/capabilities/capabilityTypes.ts`, the capability-stage projectors, `scripts/migration.sql`'s `source_kind` CHECK) — the **"Live" column above now records the *former* names**. `canonical_key` is rewritten accordingly; the DB cutover is build-stage truncate-and-regen (ADR 0011). **Phase B LIVE (2026-06-16)** — the `_ex` (`ExerciseType`) renames in the `_ex` table below are also in code (`src/types/learning.ts`, the exercise registry + `byType` builders, the `exercise_type_availability` PK reseed in `migration.sql`); `speaking` is left as-is (dead surface). **Phase C LIVE (2026-06-16) — the rename is now COMPLETE across all four layers.** `_mode` (`SkillType`) adopted `recognition`→`recognise_mode`, `meaning_recall`→`recall_mode`, `form_recall`→`produce_mode` (`spoken_production` left — dead cluster). Phase C is code-only: `SkillType` is read-derived (`deriveSkillTypeFromCapabilityType`), never persisted at runtime — the legacy `learner_skill_state`/`review_events` `skill_type` CHECKs are on dead tables (only writer `learnerStateService` has no live caller), so they keep the former values intentionally. Note: **`podcast_phrase` → `podcast_phrase_src`** (renamed for consistency; retirement deferred — a live-but-latent source kind, treated like the `speaking`/`spoken_production` dead cluster). The §7.6 level-purity residual (`recognise_grammar_pattern_cap` rendered by production-format `transform_sentence_ex`/`translate_sentence_ex`) is **NOT** folded into this rename. **Resolved 2026-06-16 → SPLIT, and SHIPPED 2026-06-16 (ADR 0017).** A new **`produce_grammar_pattern_cap`** (produce level) takes the two production exercises; `recognise_grammar_pattern_cap` keeps only `choose_missing_word_ex` (cloze_mcq). This preserved the authored `sentence_transformation`+`constrained_translation` rows and makes each grammar pattern emit 3 caps (recognise / contrast → produce, the latter gated after contrast per ADR 0007). Live: 97 produce caps, junction 97, HC19/HC20/**HC30** all green. The split was its own slice after the rename (a new capability ⇒ `architect` + `data-architect` sign-off + catalog emission + render contract + prerequisite wiring), not part of the rename PRs.

The deeper §7 structural questions are now **settled** (§7 box): each (direction × modality × level) is its own capability — so `recognise_form_from_meaning_cap` is real, and the three `produce_form_*` stay separate. The other resolved cleanup — relabel `l1_to_id_choice` (`recognise_form_from_meaning_cap`) as `recognition`-level — shipped earlier (cap-v2 #161).

---

## 9. Pointers

- **Types:** `src/lib/capabilities/capabilityTypes.ts` · **Binding:** `src/lib/capabilities/renderContracts.ts`
- **Code module specs:** `modules/capabilities.md`, `modules/exercises.md`, `modules/exercise-content.md`
- **Glossary:** CONTEXT.md → Learning Capability, Capability Type, Content Source kinds
- **Pedagogy axis:** ADR 0007 (receptive-before-productive), 0009 (typed-table-per-concept), 0010 (grammar via pattern caps)
