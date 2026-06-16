# Learning Indonesian Domain Context

This context defines the domain language for the capability-based learning architecture. Use these terms consistently in code, docs, tests, and reviews.

## Content Source

A source of learning material, such as a textbook lesson, dialogue line, podcast segment, story, grammar pattern, or morphology pattern. A content source is provenance and sequencing context; it is not itself the thing scheduled by FSRS.

### Content Source kinds

The fixed set of `source_kind` discriminators a capability carries (the type union in `src/lib/capabilities/capabilityTypes.ts`; the `source_kind` column on `learning_capabilities`). Each names *what kind* of content source a capability reaches via `source_ref`, and resolves to one typed table (ADR 0009). A capability's learned content is frequently *not* a **Learning Item** — only the `item` kind is lexical.

- **`item`** — A single lexical unit: a word or short reusable phrase being learned. Source table: `learning_items`. (See **Learning Item**.)
- **`dialogue_line`** — One complete utterance from a lesson dialogue, used as the carrier for a contextual cloze. Source table: `lesson_dialogue_lines`.
- **`pattern`** — A metalinguistic grammar or number-formation rule drilled as a skill (e.g. the `meN-` prefix, the `belas`-numbers rule). Source table: `grammar_patterns`.
- **`affixed_form_pair`** — A root↔derived morphology pair (e.g. `baca` ↔ `membaca`). Source table: `affixed_form_pairs`. (Grouped under an **Affix** — see below.)
- **`podcast_segment`** — A bounded audio span of a podcast, consumed by listening for gist. Source table: `podcasts` (segment rows). Not yet live (0 capabilities).
- **`podcast_phrase`** — A timecoded phrase *within* a podcast segment (finer-grained than a segment).

_Flagged ambiguity: `podcast_phrase` is latent — no capability type maps to it and it has 0 rows. It is a candidate for removal from the union unless a phrase-level podcast capability is planned. `podcast_segment` is likewise defined but not live (only `podcast_gist` would consume it)._

## Affix

The **organizing unit of the morphology / affix-trainer surface** — a single Indonesian affix (e.g. `meN-`, `-kan`, `ke-…-an`) under which its rule and all its derivations are gathered. An Affix is a *higher* grouping than either of its data homes: one Affix spans **several `grammar_pattern`s** (the rule tier — e.g. `meN-` carries separate nasalization sub-rule patterns) and **many `affixed_form_pair`s** (the application tier — one per root↔derived instance).

There is no `affixes` table. An Affix's identity is the **`affix` value** carried on each `affixed_form_pair` (added by the morphology phase-b work), constrained to a **controlled vocabulary** — the canonical catalog constant in `lib/capabilities/affixCatalog.ts` (sequence rank, gloss, CEFR level, allomorph reference; placed in `lib/capabilities` because both the pipeline validator and the runtime read it — the sole pipeline↔runtime shared seam). Every authored `affix` value MUST be a catalog member; the phase-b validator **and** a live-DB health check assert `affix ∈ catalog` (the three-layer-gate habit), so the catalog grouping cannot silently split one affix across spelling variants (`meN-` vs `me-` vs `meng-`). Concrete once phase-b + the affix trainer ship; see `docs/plans/2026-06-15-affix-trainer-capstone-design.md` §4-A and `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md`.

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

The **one strict, level-independent** definition of mastery for a single capability: `reviewCount ≥ 4` AND FSRS `stability ≥ 14 days` AND reviewed within the last 30 days AND **not currently failing** (`consecutiveFailureCount = 0`). It is the canonical definition (`masteryModel.ts` `labelForCapability`) mirrored into the `get_lessons_overview` SQL to compute per-lesson `% mastered`; the two are kept in lockstep by a parity test (**ADR 0015**). If a more forgiving "good enough" signal is ever wanted, it gets a **different word** (e.g. "proficient") — never a diluted `mastered`. The full cap-level ladder is `at_risk / not_assessed / introduced / learning / strengthening / mastered`; only the `mastered` rung is load-bearing outside the analytics surfaces. **`at_risk` means a genuine lapse** (2026-06-12): *currently failing* **AND** *previously learned* — `consecutiveFailureCount > 0 AND lapseCount > 0`. It is **self-healing** (a correct answer resets `consecutiveFailureCount` → 0 → no longer at-risk; the 2026-06-11 self-healing property is preserved — `lapseCount` is an AND gate, not the permanent OR that was removed). The boundary it draws: *"have you ever learned this word?"* — `lapseCount` is the only counter that survives a failure (stability resets; consecutiveFailureCount is "now"), and FSRS bumps it only when a *graduated* card is forgotten. So a **never-learned word that is currently failing is `introduced`, not `at_risk`** — you can't be "at risk of forgetting" a word you never learned; success (not mere exposure) is what promotes out of `introduced`.

**Moeilijk (stubborn word)** — a *separate* acquisition-difficulty signal (2026-06-12), distinct from `at_risk` (a retention loss): a word **never learned** (`lapseCount = 0`) that the learner keeps failing (`consecutiveFailureCount ≥ STUBBORN_THRESHOLD`, default **4**). It is **not** a `MasteryLabel` and **not** a funnel rung (the rung stays `introduced` — it hasn't progressed); it's surfaced as a separate **callout** whose advice is *change your strategy* — mnemonic / add context / deconstruct — **not** "review more," because more retrieval is the "labor in vain" that isn't working (the bottleneck is encoding). Self-clearing on success. Computed TS-only (`isStubborn` / `deriveStubbornWords` in `masteryModel.ts`), no SQL mirror. It is the go-forward home for the difficulty signal, replacing — not coexisting with — the soon-retired `learnerProgressService` lapse surfaces. See `docs/plans/2026-06-12-mastery-ladder-lapse-and-stubborn.md`.

## Introducible (capability of a lesson)

A lesson capability that is `ready` AND `published` AND not retired — the lesson's full **schedulable** content. It is the **denominator** for a lesson's `% mastered`. Caps that are staged-locked *right now* (receptive-before-productive) are still introducible — they unlock over time. A capability that is *permanently* unreachable (orphan-suppressed) is a **gate/content defect to fix at the source**, never subtracted from the denominator.

## Lesson learner status

How much of a lesson a learner has mastered, expressed as **`% mastered = mastered / introducible`** — a single percentage, **no lesson-level label**. It is one of the **two single-sourced facts** a lesson tile shows; the other is **Activation status** (presence of a `learner_lesson_activation` row). There is **no sequential locking** between lessons and **no recommended-lesson** on the catalog — activation is the learner-controlled gate, and the Today/Session flow is the call-to-action. (Retired 2026-06-09: the `overviewStatus` order-gate, the `in_practice/practiced/later` enum, and the recommender. See `docs/plans/2026-06-09-lesson-status-two-sources-design.md`.)

## Learner Progress Axes

The redesigned learner-facing analytics speak the capability + mastery vocabulary, on **two axes** that read as cause → effect (design 2026-06-10; `lib/analytics/` is read-only — derive, never instrument). The old parallel vocabularies are retired: the 5-stage `itemsByStage` funnel (`new/anchoring/retrieving/productive/maintenance`), the recognition/recall `accuracyBySkillType` split, `MemoryHealthHero`, `avgStability`, latency, and the review forecast — all "decoration that doesn't change practice" — are cut, and the `leaderboard` is decommissioned.

- **Axis 1 — [[Practice Time]]** (input, fast feedback): streak · minutes/day · minutes/week · time per session.
- **Axis 2 — Mastery progression** (outcome, slow): the [[Mastery Model]] ladder shown as a **funnel** (distribution of items across `introduced → learning → strengthening → mastered`, `at_risk` flagged) — *never* a single slow `% mastered` headline, because the lower rungs move daily while `mastered` is deliberately weeks-slow. The funnel is **split by content type**: a **Vocabulary funnel** (vocab `learning_item`s) and a **Grammar funnel** (grammar topics). An item's rung is rolled up **weakest-wins** (consistent with `contentUnit`/`pattern`). Shown at three scopes: whole-learner (voortgang), per-lesson (lesson tiles, extending the shipped `% mastered`), per-grammar-topic (named `grammar_patterns` + their ladder label).

**Weekly Movement** — the fast pulse on the slow axis: how many learnable units advanced a rung this week, **split into vocabulary and grammar** (`advancedVocab` / `advancedGrammar`) plus M reached `mastered`, K slipped to `at_risk`. The counting unit is the **distinct `source_ref`** (a word or grammar topic — a unit counts once even if several of its capabilities advanced), and the **scope is the same two buckets as the funnel**: vocab (`source_kind 'item'`) and grammar (`'pattern'` + `'affixed_form_pair'`); `dialogue_line` / `podcast` kinds are excluded. This keeps the home pulse in the funnel's unit and scope — counting distinct capabilities (or including non-funnel kinds) overstates and can exceed the funnel totals. Derived read-side by recomputing the rung before/after each `capability_review_events` row — **not** snapshotted (**ADR 0016**). The TS recompute (`deriveWeeklyMovement`) and the SQL `get_weekly_movement` are kept in lockstep by HC28 (**ADR 0015**). Surfaced split on the home "Deze week omhoog" card.

**Vocabulary skill profile** (formerly "Skill-Mode Gap Axes") — an *orthogonal* cut to the content funnel, scoped to **vocabulary** (item caps), reporting the receptive→productive→aural gap the SLA literature treats as a core goal (Webb 2008; Laufer & Nation 1999). The seven item capability types collapse into **3 learner-facing modes** — **Recognise** (receptive), **Produce** (productive), **Listen** (aural) — and each mode reports a **count of distinct words** known solidly: a *vocabulary size* that climbs (Anki mature cards, Nation's VST), **not** a ratio over a growing pile (which can't climb) and **not** weakest-wins (which pinned every mode red). Bars scale to the largest mode so the receptive→productive gap reads at a glance; stage badges ①②③ frame the modes as a **sequence, not a ranking** (listening trails because FSRS schedules it last, not because the learner is weaker — an info note says so, and tips are browsable, never auto-opened on a "weakest" mode: gap-shaming an order-of-scheduling artifact is wrong and non-actionable). Gated by `confidence` (thresholds in **words**: <5 → "not enough data yet"). Grammar/morphology and `exposure`/`podcast_gist` are excluded. Redesigned 2026-06-12; see `docs/current-system/modules/analytics-mastery.md` §1.

**Surfaces.** *Home (decide + glance):* focal "start session" CTA + one weekly-pulse strip (minutes · ↑moved-up → links to voortgang) + at-risk rescue + continue-lesson. *Voortgang (reflect):* four parallel tabs — **Woordenschat** (vocab funnel, landing = all lessons + a per-lesson filter, with the moeilijke-woorden callout) · **Grammatica** (grammar funnel, same all/per-lesson filter, plus per-pattern Herkennen/Onderscheiden chips — both receptive facets — when a lesson is selected) · **Vaardigheden** (the 3 skill-mode word-count axes) · **Tijd** (Practice Time week/month). The old single funnel-with-vocab/grammar-toggle was split into the two parallel pages 2026-06-12 to kill the grammar-shown-twice duplication. *Lessons tiles:* per-lesson mini-funnel + activation. The streak is framed **kindly** (coaching language, a forgiveness/freeze affordance — streak-anxiety is a documented harm), and every view is action-linked (`at_risk` is surfaced as "let's strengthen these," linked to a rescue session).

## Practice Time

A learner-facing **engagement** metric: time spent *doing exercises*, never time spent reading lessons or listening to podcasts. Named "practice time" (not "study time") precisely because only the capability/review path produces a `learning_sessions` row — the Lesson and Podcast paths emit no session and no duration. Per-session duration is derived (`duration_seconds` = elapsed from the **first** answer's `submittedAt` to the **last**), so it is a proxy: it includes idle gaps, excludes pre-first-answer reading time, and is `0` for a single-answer session. Surfaced as **streak · minutes/day · minutes/week · time per session**. Read-only, derived — no new instrumentation; if passive reading/listening time is ever wanted it is a *separate* write path with a different name. The all-time rollup that exists today lives inside the soon-to-be-retired `leaderboard` view and must be re-homed into `analytics.engagement` reading `learning_sessions` directly.

**The streak counts COMPLETED sessions, not answers (2026-06-12).** A day counts toward the streak (and toward the home streak-bar's per-day bars) only if the learner **finished a full session** that day — `ExperiencePlayer.onComplete` (queue exhausted) calls `mark_session_complete`, which stamps `learning_sessions.completed_at`. "Full session" = whatever length the learner has configured (`preferredSessionSize`, e.g. 10 or 25) — finishing it counts, a single answer does not. `get_current_streak_days` walks `completed_at` days with a **grace day**: if today isn't finished yet the streak is still alive from yesterday, so it doesn't read 0 until the day's session is done. `mark_session_complete` is `security definer` scoped to `auth.uid()` (authenticated has no write policy on `learning_sessions` under retirement #5). A started-but-abandoned session leaves `completed_at` NULL and never counts.

## CEFR Level

The CEFR band a lesson teaches at — the `level` field on `lessons` (`A1`–`C2`),
sourced from staging `lesson.ts` `"level"` and projected by the Lesson Stage
adapter. We adopt **CEFR** as the scale because the national Indonesian-for-foreign-speakers
curriculum (**BIPA**, *Bahasa Indonesia bagi Penutur Asing*) is CEFR-based
(Permendikbud 27/2017); the bands carry official Indonesian names (A1/A2 = *Pemula 1/2*,
B1/B2 = *Madya 1/2*, C1/C2 = *Mahir 1/2*). `level` reflects **Indonesian-language
demand only** — the Dutch culture essays never raise it.

The diagnostic signal is **affix sequencing**, not topic difficulty: **A1** teaches
only `ber-` productively (all other affixed words are whole-word vocabulary); **A2**
broadens topic/discourse at the *same* structural ceiling (no new productive affix);
**B1** is the morphology threshold where the learner must *productively form* `meN-`/`ber-`
verbs, passive `di-`/`ter-`, and `ke-an`. So a lesson is B1 only when it asks the
learner to *build* `meN-` verbs — not merely for *containing* them. Ties break
downward. The 14 textbook-1 lessons span **A1–B1**; **B2/C1/C2** are reserved for the
second textbook. Full ladder, per-band descriptors, and the change procedure:
`docs/current-system/cefr-level-rubric.md`.

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
