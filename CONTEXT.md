# Learning Indonesian Domain Context

This context defines the domain language for the capability-based learning architecture. Use these terms consistently in code, docs, tests, and reviews.

## Content Source

A source of learning material, such as a textbook lesson, dialogue line, podcast segment, story, grammar pattern, or morphology pattern. A content source is provenance and sequencing context; it is not itself the thing scheduled by FSRS.

### Content Source kinds

The fixed set of `source_kind` discriminators a capability carries (the type union in `src/lib/capabilities/capabilityTypes.ts`; the `source_kind` column on `learning_capabilities`). Each names *what kind* of content source a capability reaches via `source_ref`, and resolves to one typed table (ADR 0009). A capability's learned content is frequently *not* a **Learning Item** — only the `item` kind is lexical.

- **`item`** — A single lexical unit: a word or short reusable phrase being learned. Source table: `learning_items`. (See **Learning Item**.)
- **`dialogue_line`** — One complete utterance from a lesson dialogue, used as the carrier for a contextual cloze. Source table: `lesson_dialogue_lines`.
- **`pattern`** — A metalinguistic grammar or number-formation rule drilled as a skill (e.g. the `meN-` prefix, the `belas`-numbers rule). Source table: `grammar_patterns`.
- **`affixed_form_pair`** — A root↔derived morphology pair (e.g. `baca` ↔ `membaca`). Source table: `affixed_form_pairs`.
- **`podcast_segment`** — A bounded audio span of a podcast, consumed by listening for gist. Source table: `podcasts` (segment rows). Not yet live (0 capabilities).
- **`podcast_phrase`** — A timecoded phrase *within* a podcast segment (finer-grained than a segment).

_Flagged ambiguity: `podcast_phrase` is latent — no capability type maps to it and it has 0 rows. It is a candidate for removal from the union unless a phrase-level podcast capability is planned. `podcast_segment` is likewise defined but not live (only `podcast_gist` would consume it)._

## Content Unit

A stable, publishable unit derived from a content source. Content units preserve source refs, section refs, ordering, and relationships to lesson page blocks and learning capabilities.

## Learning Item

A single atomic piece of **lexical** content to be learned — a **word or a short phrase** (e.g. `hati` = liver; `apa kabar?` = how are you?). The unit is a *reusable lexical chunk*: a fixed expression, collocation, or greeting qualifies; a **whole sentence or dialogue line does not** — it is too long to drill as a vocabulary card. A learnable phrase occurring inside a dialogue line is **extracted as a phrase item**; the line itself is a **`dialogue_line`** capability (contextual cloze), never an item.

**The item-harvest rule (the operational form of this definition).** Only `item_type` ∈ {`word`, `phrase`} is harvested as a learning item and given the item capability suite. The `sentence` and `dialogue_chunk` item-types are **over-harvest and produce no item capabilities** — they were the source of error-prone *verbatim full-sentence* recall/dictation drills (an 11-word example sentence typed from memory is undesirable difficulty, not desirable). **Kind is the primary gate**; a word-count guard (a `word`/`phrase` running ≥ 6 words) is a secondary flag for a likely mis-tag, never a rule on its own. Dropping a sentence/line from item-harvest **loses no learnable skill**: its lexical content is still scheduled as the separate phrase items extracted from it, its grammar as a `pattern` capability, and — for a dialogue line — the line itself as a `contextual_cloze` (type one blanked word, not the whole line). The sentence/line also **remains visible to the learner** in the lesson reader as the grammar example, dialogue, or book exercise it always was (Lesson-Stage content). A `sentence`/`dialogue_chunk` whose text is *not* present in the lesson's rendered content is flagged on drop (a reader gap or a spurious harvest), never silently discarded. An item must also be a **memorised primitive, not a rule-generated composed form**. **Numbers have two drilled layers.** (1) The numbers with their own lexical name — **0–20** (the rote-counting block) plus the **place-value landmarks** `seratus` (100), `seribu` (1 000), `sejuta` (1 000 000), … and the place words `ratus`/`ribu`/`juta`/`miliar`/`triliun` — are **vocabulary**: `item`-source capabilities with the standard vocab capability types. (2) The **number-formation rule** (compose 21, 137, 2 000 via `belas`/`puluh`/`ratus`) is a drilled **`pattern`** capability (the `belas-numbers` pattern), sourced from the numbers section like a grammar pattern. Composed numbers (`dua puluh satu`, `dua ratus`, `sepuluh ribu`) are therefore *not* harvested as individual items — you don't memorise 137 as a flashcard — but the skill of **forming** them is drilled via the pattern. Learning items are stored globally and deduplicated by `normalized_text` (one row per unique item across the whole course); a lesson links to an item through the capabilities the item produces, not through the item row itself (the table has no `lesson_id`). A learning item is *content*, not a skill — it is never itself scheduled.

**A learning item is only one *kind* of Content Source — the lexical kind.** It is not the universal store of "things to be learned": grammar patterns live in `grammar_patterns`, morphology pairs in `affixed_form_pairs`, dialogue lines in `lesson_dialogue_lines` — each its own typed table (ADR 0009). A capability reaches whichever source it belongs to through `source_kind` + `source_ref`, so the thing learned in a capability is frequently *not* a learning item. (The `learning_items` table is really the lexical-item store; the name overreaches.)

## Capability Type

One of the 12 *kinds* of skill facet through which a content source can be practised, fixed in code (`src/lib/capabilities/capabilityTypes.ts` — `CAPABILITY_TYPES`). A capability type is the *how* of knowing, not a thing in itself.

The **mode** column is the pedagogically meaningful axis (receptive → productive, ADR 0007) — the `SkillType` each type maps to via `deriveSkillTypeFromCapabilityType`: **recognise** (receptive; pick/know the answer), **recall meaning** (state what it means), **produce form** (write the Indonesian unaided). "L1" = the learner's language (Dutch or English); "id" = Indonesian. Definitions consolidated from `capabilityTypes.ts` + `docs/current-system/human-product-and-learning-guide.md` §7–8 + `docs/current-system/content-pipeline-and-quality-gates.md` §8–9.

| Capability type | Source kind | Mode | Human definition |
|---|---|---|---|
| `text_recognition` | item | recognise | See the written Indonesian word → know its meaning in the learner's language. (`makan` seen → "eten".) |
| `audio_recognition` | item | recognise | Hear the spoken Indonesian word → know its meaning. (hear `makan` → "eten".) |
| `meaning_recall` | item | recall meaning | Given the Indonesian word, recall its meaning *unaided* (state it, not choose from options). |
| `l1_to_id_choice` | item | recognise | Given the meaning in the learner's language, **choose** the correct Indonesian word from options — a receptive multiple-choice recognition. (cap-v2 #161: corrected from the legacy `meaning_recall` mis-level; `deriveSkillTypeFromCapabilityType` now returns `recognition`, the receptive-before-productive sequencing key per ADR 0007.) |
| `form_recall` | item | produce form | Given the meaning in the learner's language, **type** the Indonesian written form unaided. ("eten" → type `makan`.) |
| `dictation` | item | produce form | Hear the spoken Indonesian word → **type** its written form. (hear `makan` → type `makan`.) |
| `contextual_cloze` | item + dialogue_line | produce form | Fill the blanked word in a sentence or dialogue line — produce the correct form from context. |
| `pattern_recognition` | pattern | recognise | Recognise a grammar pattern in use and understand its function (e.g. the role of the `meN-` prefix). |
| `pattern_contrast` | pattern | recognise | Distinguish a grammar pattern from a contrasting one (e.g. `belum` vs `tidak`, `meN-` vs `di-`). |
| `root_derived_recognition` | affixed_form_pair | recognise | Recognise the link between a root and its affixed/derived form (e.g. `baca` → `membaca`), or the meaning of the derived form. |
| `root_derived_recall` | affixed_form_pair | produce form | Produce the derived (affixed) form from the root, or the root from the derived form. |
| `podcast_gist` | podcast_segment | recognise | Listen to a podcast segment and grasp its overall gist (exposure-oriented; feature not yet live — 0 rows). |

One vocabulary item typically produces ~6 capabilities (the `item`-source rows above that its content supports — e.g. an item with audio gets `audio_recognition` + `dictation`, one without does not). See **Learning Capability** for the (source × type) pairing this enumerates the *type* half of.

For the full model — the (source × capability × exercise) map, live counts, the known naming debt, and the **target readable naming convention** (four layers `_src`/`_mode`/`_cap`/`_ex` + typed content concepts, no "artifact" umbrella) — see [`docs/current-system/capability-and-exercise-model.md`](docs/current-system/capability-and-exercise-model.md). The convention there is a documented *target*; the live enum names in the table above are still authoritative until an architect + data-architect migration adopts it (it rewrites `canonical_key`).

## Learning Capability

A concrete memory trace: **one content source (e.g. a learning item) combined with one capability type** — e.g. item `hati` × type `form_recall` = "recall the written form of *hati*". This pair is the atomic unit FSRS schedules and that a review event is recorded against. One vocabulary item produces several capabilities — one per capability type that applies to it (~6 for a typical word). The capability, not the item, is what is practiced, reviewed, and scheduled.

## Capability Contract

The fail-closed readiness contract for a learning capability. It defines required typed artifacts, allowed exercise families, readiness status, publication status, and why a capability is ready, blocked, exposure-only, deprecated, or unknown.

## Typed Artifact

A named piece of approved content required by a capability or exercise, such as `meaning:l1`, `accepted_answers:id`, `base_text`, `audio_clip`, `cloze_context`, `pattern_example`, `transcript_segment`, or `root_derived_pair`.

**Alternative-answer convention.** An answer-bearing field (`learning_items.translation_nl` — the live item-meaning path since Decision R — and `item_answer_variants`) may list several *equally acceptable* forms. The **canonical stored separator is `/`** (`huis / woning`) — the form the staging generator's `normaliseDutchTranslation` emits. `;` is an authoring convenience the writer normalises to `/`; the grader also splits `;` defensively for legacy values. **A comma is NOT a separator** — it is part of a single answer (a comma can occur inside a legitimate translation), so comma-delimited alternatives are a mis-encoding. The **Capability Gate** enforces this on the live write surfaces (`translation_nl`, `item_answer_variants`) so a wrong separator never reaches the learner as one unmatchable blob; the grader's split helper lives in the **shared** `lib/capabilities/` module (imported by both runtime and pipeline — the one definition that prevents drift).

## Capability Readiness

The scheduling/rendering readiness state of a capability. Valid states are `ready`, `blocked`, `exposure_only`, `deprecated`, and `unknown`. Only ready and published capabilities can become active learner review targets.

## Learner Activation State

The learner-specific state describing whether a capability is dormant, active, suspended, or retired for that learner. FSRS schedules active learner capabilities only.

There are two distinct tables, and they must not be conflated. **`learning_capabilities`** is the shared *catalog* — every capability that exists, content-level (`readiness_status`, `publication_status`), no learner and no FSRS timing on it. **`learner_capability_state`** is the *per-learner schedule* — `activation_state` plus the FSRS fields (`stability`, `difficulty`, `next_due_at`). A catalog capability is only content until a learner **activates** it (first introduction mints an `active` `learner_capability_state` row, dormant → active); only then is it FSRS-eligible for that learner. A session draws (due active) ∪ (eligible new) from the per-learner state, scoped to the learner's activated lessons (`learner_lesson_activation`) — never the whole catalog.

## Lesson Page Block

A web-native lesson rendering block with stable identity, source refs, optional content unit refs, and optional capability refs. Lesson page blocks make book-derived lessons feel modern without directly activating FSRS review.

## Review Processor

The write owner for capability review commits. It validates answer reports, computes or validates outcomes, commits review events and FSRS state atomically/idempotently, and performs first-review activation of eligible dormant capabilities.

## Exercise Resolver

The module that maps a ready capability plus approved artifacts to an exercise render plan or an explicit typed failure. It prevents sessions from silently falling back to unrelated legacy exercises.

## Session Composer

The module that composes a learning session from due active capabilities, Pedagogy Planner recommendations, and Exercise Resolver results. It is composition-only and does not write activation, FSRS, or review state.

## Sibling Capabilities

Two or more **Learning Capabilities** that share the same `source_ref` — i.e. different **capability types** of the *same* content source. A typical vocabulary word has ~6 siblings (`text_recognition`, `audio_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`, `dictation`, all under one `learning_items/<slug>` ref); a `pattern` or `affixed_form_pair` has 2; a `dialogue_line` has 1 (it is its own only sibling). The sibling key is `source_ref` (non-null on every projected capability). Siblings share meaning, so practising two of them close together lets one **prime** the other (interference) — making recall artificially easy rather than a genuine retrieval.

## Sibling Burying

The session-builder rule that offers **at most one sibling per `source_ref` per learner per calendar day**, across all of that day's sessions, for both due reviews and new introductions. It is a pure read-side *suppression* — a buried sibling is **not** rescheduled (no FSRS/state write); it simply isn't offered today and stays overdue/dormant until a later day. Enforced by seeding a `usedRefs` set from the `source_ref`s already reviewed today (read from `capability_review_events`) and threading it through the builder's selection passes. The most-overdue sibling wins a due slot; the lowest-phase (most foundational, recognition-before-recall) sibling wins a new-introduction slot. Distinct from the composer's `interleaveBySourceRef`, which spaces *already-selected* blocks within a session — burying governs day-level *membership*, not in-session order. Rationale: spacing effect (Cepeda 2006) + sibling interference (Anki's across-day bury default). See `docs/plans/2026-06-09-sibling-burying-design.md`.

**Session-size is the hard contract; burying is subordinate to it.** Burying only chooses *which* caps fill the session, never *whether* it fills. For new introductions this means burying is applied **inside the planner, before budget allocation** (`planLearningPath`: `prioritize → bury → allocateBudget`), so a word buried out of the top-ranked slot is replaced by the next-ranked *other* word — the session reaches `preferredSessionSize` from non-buried candidates instead of collapsing. (The due + practice passes still bury in the builder and pass their accumulated `usedRefs` into the planner as `usedSourceRefs`, preserving the due→practice→new priority threading.) Fixed 2026-06-09 after burying-as-a-post-budget-trim emptied sessions to zero; see `docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md`.

## Lesson Experience Module

The module that renders lesson page blocks and bridges to practice. It is fully passive: it does not emit progress events and does not directly activate FSRS review. Source-progress emission was removed in retirement #6 (2026-05-07).

## Mastery Model

A read-only model that derives learner-facing mastery from capability state, review evidence, modality spread, recency, and confidence. It does not schedule content or overclaim production ability from recognition evidence. Lives at `src/lib/analytics/mastery/` (its target seam). Its first wired consumer is the lesson tile's **% mastered** (see Lesson learner status).

## Mastered (capability)

The **one strict, level-independent** definition of mastery for a single capability: `reviewCount ≥ 4` AND FSRS `stability ≥ 14 days` AND reviewed within the last 30 days AND no lapse / consecutive-failure (a lapse or consecutive failure makes it `at_risk` instead). It is the canonical definition (`masteryModel.ts` `labelForCapability`) mirrored into the `get_lessons_overview` SQL to compute per-lesson `% mastered`; the two are kept in lockstep by a parity test (**ADR 0015**). If a more forgiving "good enough" signal is ever wanted, it gets a **different word** (e.g. "proficient") — never a diluted `mastered`. The full cap-level ladder is `at_risk / not_assessed / introduced / learning / strengthening / mastered`; only the `mastered` rung is load-bearing outside the analytics surfaces.

## Introducible (capability of a lesson)

A lesson capability that is `ready` AND `published` AND not retired — the lesson's full **schedulable** content. It is the **denominator** for a lesson's `% mastered`. Caps that are staged-locked *right now* (receptive-before-productive) are still introducible — they unlock over time. A capability that is *permanently* unreachable (orphan-suppressed) is a **gate/content defect to fix at the source**, never subtracted from the denominator.

## Lesson learner status

How much of a lesson a learner has mastered, expressed as **`% mastered = mastered / introducible`** — a single percentage, **no lesson-level label**. It is one of the **two single-sourced facts** a lesson tile shows; the other is **Activation status** (presence of a `learner_lesson_activation` row). There is **no sequential locking** between lessons and **no recommended-lesson** on the catalog — activation is the learner-controlled gate, and the Today/Session flow is the call-to-action. (Retired 2026-06-09: the `overviewStatus` order-gate, the `in_practice/practiced/later` enum, and the recommender. See `docs/plans/2026-06-09-lesson-status-two-sources-design.md`.)

## Lesson Stage

The deep module that ingests raw source material (e.g. HEIC page photos) and processes it — OCR, cataloguing, lesson-content assembly — until it is publishable, then writes the **lesson content** to the database. Lesson content is the material a learner reads: dialogue, vocabulary list, grammar explanations, the book's own exercises, and audio. The Lesson Stage owns everything from raw input to lesson content in the database; it produces no capabilities.

_(Target architecture. Today this work is split across separate authoring scripts — `convert-heic-to-jpg.ts`, `ocr-pages.ts`, `catalog-lesson-sections.ts`, `generate-staging-files.ts` — plus the `lesson-stage` publish step.)_

## Capability Stage

The deep module that reads lesson content **from the database**, enriches it, and creates all the learning capabilities the lesson requires — including the generated practice content (exercises, distractors, cloze contexts) and the interpreted grammar/morphology patterns — then publishes the capabilities to the database. It is a **generator/seeder, not a continuous projector** (ADR 0011): it seeds each capability once, re-runs are idempotent and additive-only (skip-if-exists), and a routine re-publish never overwrites a seeded capability — corrections live in the DB (see Capability Review). `--regenerate <unit>` is the explicit, destructive opt-out.

_(Target architecture. Today this is split across the linguist authoring agents — structurer, exercise/cloze/vocab creators, reviewer — plus the `capability-stage` publish step.)_

## Capability Review

Editorial review and correction of published capabilities happens **post-publish**, via a flag-and-agent loop — not by direct human editing, and not as a pipeline-run gate:

1. A reviewer flags a capability in the app UI by leaving a comment (today: `exercise_review_comments`, keyed to `exercise_variant_id`, with a `status`).
2. Agents read the flagged comments and apply the correction by **updating the capability's rows in the database**.

Corrected content therefore lives in the database, not in any staging file. This is the reason capability content is **DB-authoritative after seeding** (ADR 0011): a routine re-publish must not clobber these DB-resident corrections, so it is idempotent/additive-only and never overwrites a seeded capability. _(Today the flag channel covers exercises only; the model generalises it to any capability.)_

## Stage Contract

The interface between the Lesson Stage and the Capability Stage is **purely database tables**. The Capability Stage reads only from the lesson-content tables the Lesson Stage wrote; no staging file crosses the boundary. The database is the single hand-off point. This forbids the current dual-read, where the Capability Stage reaches back to disk staging files (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`) for its source material.

This is the operational consequence of **ADR 0011** (capability content is DB-authoritative after seeding): because the Capability Stage seeds capabilities once and corrections then live in the DB, its *input* must also be the DB — a staging-file re-read would reintroduce a source that drifts from the corrected DB state. The typed lesson-content tables the Lesson Stage emits (`lesson_dialogue_lines` today; the `lesson_sections` typed satellites of migration PRs 5–6) **are** that contract. Note the asymmetry: lesson content remains pipeline-is-writer / staging-canonical; only the capability side is DB-authoritative.

The *responsibility split* behind this contract — which work runs in which stage — is recorded in **ADR 0012**: the Lesson Stage owns the full ingestion-to-content chain plus **all learner-facing enrichment, including NL + EN translations**; the Capability Stage reads only the DB (never disk) and generates everything capability-side (deduped `learning_items`, POS, level, exercises, distractors, cloze, interpreted patterns). The dividing line is *what the learner reads* (Lesson Stage) vs. *what is needed to generate or schedule practice* (Capability Stage).

The `lesson_sections.content` JSON blob is **retained** alongside the typed tables (not dropped) — it is the complete authored snapshot of a section; the typed columns + child tables are its projection. Readers (the lesson page, the capability-stage contract) use the typed tables; the blob stays next to them as the round-trippable record.

## Lesson Gate

The quality gate that certifies the **Lesson Stage's output for a single lesson** is complete and correct — Stage A's definition-of-done. It validates the lesson stage's entire write-set: the typed capability-contract tables **and** the retained `content` blob, so both consumers are covered — the Capability Stage (which reads the typed tables) and the lesson reader (which reads the blob). Display-only sections that have no typed table are still gated on their blob shape (generic per-type structure; per-bespoke-page fields remain the lesson page's own concern).

The Lesson Gate is **self-contained to the lesson being published**: it inspects only that lesson's own authored input and its own just-written rows — never cross-lesson vocabulary or any capability-side state. This makes it **fresh-lesson-safe by construction**: a brand-new lesson cannot fail the gate for reasons that only resolve *after* publication. "Is this word known across prior lessons?" is **not** a Lesson Gate question — it belongs to the Capability Stage, asked against the database after Stage A has written this lesson's content. (Contrast the legacy `lint-staging` gate, which validated whole-workflow concerns against post-publish DB state and so could not pass a net-new lesson — see ADR 0013.)

Because the Lesson Stage is independently runnable (ADR 0011's regime split — lesson content is re-published freely; capability content is seeded once), the Lesson Gate certifies Stage A **on its own**; it never gates "readiness to hand off to the Capability Stage." Whether the Capability Stage runs next is a separate orchestration choice.

Its layered mechanism (DB constraints + a single pre-write/pre-flight validator + post-write verification, partitioned by how each column is populated) and the untangling from the legacy whole-workflow `lint-staging` gate are recorded in **ADR 0013**. The Capability Stage has the symmetric, DB-state-aware gate of its own.

## Pipelines are per content origin

The Lesson Stage and Capability Stage above describe the **textbook-lesson** pipeline (HEIC pages → lesson content → capabilities). They are not universal. Each content origin gets its **own separate pipeline**:

- **Textbook lessons** — HEIC pages → lesson content → capabilities (the Lesson Stage / Capability Stage above).
- **Podcasts** — NotebookLM audio → podcast content → podcast capabilities. A podcast is consumed by *listening*, and its `podcast_gist` capability derives from the podcast itself, not from any textbook lesson — so it is built as a parallel pipeline, not forced through the textbook stages. (See `scripts/lib/pipeline/podcast-stage/`, the intended separate podcast deep module; today podcasts exist only as staging files, 0 DB rows.)

The "consumed vs scheduled" split (Lesson-side = what's read/listened to; Capability-side = what FSRS schedules) holds *within* each pipeline. What is **not** shared is ingestion, content, and capability generation — those are per-origin.

What **is** shared, across all pipelines, is the destination and everything downstream of it: the `learning_capabilities` store (every pipeline writes into the one table, tagged by `source_kind`) and the entire **runtime** — session building, FSRS scheduling, review commits, exercise rendering — which is `source_kind`-agnostic and mixes capabilities of every origin in one session. A pipeline is independent right up to the moment it writes a capability row; from the capability table onward, everything is uniform. Separation stops at the shared capability table.
