# Skill Rotation, Bidirectional Asymmetry, and Pedagogical Sequencing — Findings, Comparison, and Proposed Redesign

**Date:** 2026-04-25
**Author context:** Synthesizes a multi-day investigation that started from a production "No exercises available" incident (2026-04-24), uncovered a chain of related issues in the content pipeline, FSRS skill modeling, exercise-direction asymmetry, and stage-promotion gates, and culminated in a proposed redesign that combines per-skill FSRS scheduling with content-derived prerequisite-based item introduction.

**Audience:** A reviewer with no prior context. This document reproduces the findings, evidence, source citations, and reasoning chain in full. It's intended to be self-contained for an independent second-opinion review.

**Repo:** `learning-indonesian` — React 19 + Mantine + Supabase PWA, single-learner (Dutch native, learning Indonesian), self-hosted at `https://indonesian.duin.home`.

---

## Part 0 — Repository context (terms a reviewer needs)

- **`learning_items`** — atomic units of vocabulary/sentences/dialogue/grammar tracked in DB. Columns include `id`, `base_text` (the Indonesian form), `normalized_text` (lowercase trim of base_text — used as a unique key), `item_type` (one of: `word`, `phrase`, `sentence`, `dialogue_chunk`), `pos` (12-value taxonomy), `is_active`.
- **`item_meanings`** — one or more translations per learning_item, with `translation_language` (`'nl'` or `'en'`) and `translation_text`. NL is the user-facing language.
- **`item_contexts`** — surrounding context for an item; `context_type` is one of `vocabulary_list`, `dialogue`, `cloze`, `example_sentence`, `lesson_snippet`, `exercise_prompt`. Cloze contexts are authored carrier sentences with a blank.
- **`exercise_variants`** — published exercise payloads (grammar exercises, MCQ payloads). Linked via `lesson_id` (grammar) or `context_id` (vocab).
- **`learner_item_state`** — per-(user, learning_item) row tracking acquisition stage. `stage` ∈ `{new, anchoring, retrieving, productive, maintenance}`.
- **`learner_skill_state`** — per-(user, learning_item, skill_type) row holding FSRS state (`stability`, `difficulty`, `next_due_at`, `success_count`, `lapse_count`). `skill_type` ∈ `{recognition, meaning_recall, form_recall}`.
- **`learner_grammar_state`** — analogous per-(user, grammar_pattern) FSRS state.
- **FSRS** — Free Spaced Repetition Scheduler (Open SpacedRepetition, `https://github.com/open-spaced-repetition/fsrs4anki`). The algorithm consumes (current stability, current difficulty, rating ∈ {forgot, hard, good, easy}) and returns (next stability, next difficulty, retrievability, next due). FSRS itself doesn't model what the "schedulable unit" should be — that's an application-level decision.
- **Lesson pipeline** — content authoring pipeline producing per-lesson staging files: `sections-catalog.json`, `lesson.ts`, `learning-items.ts`, `grammar-patterns.ts`, `pattern-brief.json`, `candidates.ts`, `vocab-enrichments.ts`, `cloze-contexts.ts`, `review-report.json`. Published to DB via `scripts/publish-approved-content.ts`.

The investigation in this doc spans:
1. Content-pipeline data integrity (orphan items)
2. Per-skill FSRS state modeling (the stuck-in-retrieving problem)
3. Exercise-direction balance (the ID→NL skew)
4. Item-introduction ordering (what gets shown to a new learner first)

---

## Part 1 — The triggering incident (2026-04-24)

### 1.1 Symptom

After deploying the latest exercise-framework PRs to production, the user opened the app on their phone, hit "Start session", and saw:

> **Session Error**
> No exercises available for this session.

Same error in incognito (rules out service-worker cache).

### 1.2 First-pass investigation

Code path: `src/pages/Session.tsx:256` raises this error when `buildSessionQueue(input)` returns an empty array.

`buildSessionQueue` (`src/lib/sessionQueue.ts:52`) does:
1. `filterEligible(items)` — keeps items that have either a user-language meaning OR a context with an active exercise variant.
2. Partitions eligible items into `dueItems` (have an overdue skill) and `newItems` (no learner_item_state OR `stage='new'`).
3. Builds vocab and grammar exercises, interleaves, returns.

If both `dueItems` and `newItems` end up empty → empty queue → error.

### 1.3 Database evidence

Live DB query (Albert's user, lesson 9):

| Metric | Value |
|---|---|
| Active learning_items | 726 |
| item_meanings rows | 1069 (609 NL + 460 EN) |
| item_contexts rows | 1674 |
| exercise_variants (active) | 716 |
| Learner's itemStates by stage | anchoring: 360, retrieving: 256, productive: 1 |
| Due skill_state rows | 8 |
| Eligible items (filterEligible) | 609 |
| dueCount | 0 |
| newCount | 0 |

The 8 due skill_states all pointed at items where:
- `is_active=true`
- `stage='anchoring'`
- `meanings: []` ← empty
- One `context_type='exercise_prompt'` with no published `exercise_variant`

Each of the 8 items therefore failed `filterEligible` (both branches: no user-language meaning, no context-with-variant) → not in `eligibleItems` → never reached the dueItems/newItems split. They were "due" per FSRS schedule but invisible to the session engine.

### 1.4 Broader pattern

A wider audit found:

- **117 unreviewable `learning_items`** total: 65 sentences + 52 dialogue_chunks + 20 with no contexts at all
- **45 contexts with `source_lesson_id IS NULL`**, all `context_type='exercise_prompt'`
- These items had `learner_skill_state` rows being scheduled by FSRS but no path to render

### 1.5 Stop-gap fix shipped 2026-04-24

1. Marked all 117 unreviewable items `is_active=false` in DB (manual SQL via service role).
2. Added a pre-publish gate in `publish-approved-content.ts` that defers `dialogue_chunk` items lacking `translation_nl` AND a matching cloze context (sets `review_status='deferred_dialogue'` in staging instead of writing to DB).

This unblocked the user but didn't address the upstream pipeline gap or the broader skill-rotation problems that surfaced during deeper investigation.

---

## Part 2 — The content-pipeline orphan problem

### 2.1 Why dialogue_chunks landed unreviewable

Trace through `scripts/generate-staging-files.ts:247-255`:

```ts
items.push({
  base_text: line.text.trim(),
  item_type: 'dialogue_chunk',
  context_type: 'dialogue',
  translation_nl: '',         // ← empty by default
  translation_en: '',         // ← empty by default
  source_page: section.source_pages[0] ?? null,
  review_status: 'pending_review',
})
```

The catalog/scaffolding step emits dialogue_chunks with empty translations. The pipeline assumes a downstream agent (`linguist-structurer`) fills them in. But:

- `linguist-structurer.md:39` (before fix) explicitly said: *"Update grammar/exercise sections to structured format. Do NOT touch vocabulary/expressions/numbers/dialogue/text sections."*
- So no agent ever populated the dialogue translations.
- And `cloze-creator.md:50-55` (before fix) explicitly forbade cloze contexts on dialogue lines: *"Do NOT write cloze contexts for: Full dialogue sentences (entire turns like 'Selamat pagi, apa kabar?') — these are display-only and would be unnatural to blank."*

Result: dialogue_chunks landed in `learning_items` with neither translation nor cloze context. Per `session-engine.md:122-137` the documented intent is for dialogue_chunks to route to `cloze` at retrieving stage and `recognition_mcq` at productive+. Both render paths require artifacts (cloze context or NL meaning) that never get produced.

### 2.2 publish-approved-content.ts step-6 verification gap

The post-publish integrity check at `:626-638` (before fix) had this carve-out:

```ts
// Dialogue chunks have no translations — exclude from NL meaning check
const itemsRequiringNl = publishedItemIds.filter(id => !dialogueItemIds.has(id))
const missingNl = itemsRequiringNl.filter(id => !nlCovered.has(id))
```

The exemption assumed dialogue_chunks would be reviewed via some non-meaning path (cloze). But the cloze-creator was never producing dialogue cloze contexts (per its anti-dialogue rule above), so the items had neither path.

### 2.3 Sentence orphans

Of the 65 orphan sentences, ~45 had `source_lesson_id=NULL`, and content like:
- `"Pilih yang benar: \"Dat kleine huis is goedkoop\""` (Dutch grammar prompt)
- `"De verkoper zegt: \"... bisa Bu\" (het kan NOG NIET, maar misschien straks)..."` (Dutch instruction)

These are exercise *prompts* — meta-text for grammar exercises — that got misclassified as `learning_items` during catalog parsing. They have no place being scheduled by FSRS.

### 2.4 Items with NO contexts at all

Of the 117 orphans, 20 had **zero `item_contexts` rows**. Examples: `"Saya beli buah."`, `"Harganya murah Bu."`, `"Itu mahal ya!"` — likely exercise *answer texts* from grammar candidates that leaked into `learning_items` instead of staying as payload JSON.

Step 6's existing context check (`:645-661`) would now reject this, but these items pre-date the hardening.

### 2.5 Fixes shipped 2026-04-24 (commits in branch `main` ad050fb..ed40af6)

1. **Pre-publish gate hardening** — `dialogue_chunk` items without `translation_nl` AND matching cloze context are deferred (not published).
2. **Step 6 reviewability widening** — for non-dialogue published items, require either NL meaning OR context-with-active-variant. Catches the sentence/no-context orphan patterns going forward.
3. **`reactivate-dialogue-chunks.ts`** — idempotent reactivation script for items that pass the gate after re-publish, scoped to source_lesson_id to prevent cross-lesson collisions.
4. **`dev-stage-force.ts`** — service-role helper for runtime testing (forces `next_due_at` and `stage`).
5. **Plan doc** — `docs/plans/2026-04-24-dialogue-pipeline-completion.md` (v4, approved by both architect and linguist-reviewer agents over three review rounds) detailing the full path to making dialogue_chunks first-class reviewable.

### 2.6 Lesson 9 end-to-end validation completed

After running `linguist-structurer` (translations) and `cloze-creator` (dialogue clozes) against lesson 9 staging, then publishing + reactivating:
- 7 of 11 lesson-9 dialogue_chunks now have full reviewability artifacts and are active.
- 4 short dialogue lines (`"Ada apa?"`, etc.) below the 6-token cloze threshold are deliberately deferred as `review_status='deferred_dialogue'`.
- Lint reports 0 CRITICAL findings on lesson 9 (down from 22 pre-fix).
- Runtime walkthrough via Playwright confirmed the live app renders a `recognition_mcq` on a dialogue chunk with the authored Dutch translation as a correct answer option.

The dialogue pipeline plan's Phase 1 gate is met. Phases 2 (lessons 5/7/8 rollout) and 3 (legacy lessons 1–3 authoring) are pending.

---

## Part 3 — The "stuck in retrieving" problem

### 3.1 Symptom

The user noticed an unusual stage distribution:

| Stage | Count |
|---|---|
| anchoring | 367 |
| retrieving | 256 |
| productive | **1** |
| maintenance | 0 |

Only one item has ever crossed into productive across the user's entire learning history.

### 3.2 Promotion gate definitions (`src/lib/stages.ts`)

```ts
const ANCHORING_RECOGNITION_STABILITY = 1.8
const ANCHORING_RECOGNITION_SUCCESS = 3
const RETRIEVING_STABILITY = 4.5
const RETRIEVING_SUCCESS_GATE_PASSED = 3
const RETRIEVING_SUCCESS_GATE_FAILED = 5
const PRODUCTIVE_STABILITY = 21.0
const ANCHORING_MEANING_RECALL_SUCCESS = 1
```

`checkPromotion` (`stages.ts:32-90`):
- **Anchoring → Retrieving**: requires `recognition.stability ≥ 1.8` AND `recognition.success_count ≥ 3` AND `meaningRecall.success_count ≥ 1`.
- **Retrieving → Productive**: requires ALL THREE skills (`recognition`, `form_recall`, `meaningRecall`) to have `stability ≥ 4.5` AND `success_count ≥ 3` (or 5 if first-time gate failed).
- **Productive → Maintenance**: requires all three at `stability ≥ 21.0` and `lapse_count = 0`.

### 3.3 Skill-row coverage on retrieving items

Live query against `learner_skill_state` for the 256 retrieving items:

| Coverage | Count |
|---|---|
| Has `recognition` skill row | 256 / 256 (100%) |
| Has `form_recall` skill row | 68 / 256 (27%) |
| Has `meaning_recall` skill row | 45 / 256 (18%) |
| Has all 3 skills | 17 / 256 |
| Has only `recognition` | 160 / 256 (62%) |
| Meets full promotion threshold (all 3 skills, stability ≥ 4.5, success ≥ 3) | 15 / 256 |

So 160 items are **structurally unable to promote** — they have only one skill row, but the gate requires three. The 15 items that meet threshold haven't been reviewed since crossing it (promotion fires on review, not in batch).

### 3.4 Why coverage is so skewed

Skill rows are created **lazily** on first review of each skill type. The session engine's stage-based exercise selection (`sessionQueue.ts:467-498`) at anchoring stage rolls:
- recognition_mcq (~30%)
- meaning_recall (typed) (~25%)
- cued_recall (~25%)  ← only place NL→ID MCQ shows up
- cloze_mcq (~20%)
- listening_mcq (variable, conditional on audio)

But `form_recall` exercises are gated to `stage ≥ retrieving` (`sessionQueue.ts:414`):
> `// Stage gate is stricter — only retrieving+ (form_recall is productive-skill).`

So `form_recall` skill rows can ONLY be created after promotion to retrieving — but promotion to *productive* requires `form_recall` to exist and mature. **This is a chicken-and-egg deadlock.**

A bootstrap exists in `sessionQueue.ts:443-464`:

```ts
// items can reach retrieving with only a recognition skill row. Once there,
// they have nothing form_recall-shaped that's ever due, so the queue keeps
// pulling them for recognition forever — they can never promote to productive
// (which gates on form_recall) and never contribute to recall_quality.
// When we serve recognition for such an item, append a one-time
// typed_recall (or cloze for sentence types with anchor context) so
// the first form_recall review creates the skill row and FSRS takes
// over from there.
```

This bootstrap appends a second exercise (typed_recall for words, cloze for sentences) when `recognition` is due AND stage is matured AND the item lacks `form_recall`. But:

- It only fires for `recognition` due items, not `meaning_recall`.
- It requires the user to actively encounter the item in a session — items that aren't due don't get bootstrapped.
- It doesn't bootstrap missing `meaning_recall` skill at all.

The 211 items with no `meaning_recall` skill row are an additional case — they were promoted to retrieving under an earlier gate that didn't require `meaning_recall.success_count ≥ 1`. The gate was tightened later but no backfill happened. They're stuck because they reached retrieving without satisfying the (newer) prereq.

### 3.5 The single productive item

One item managed to cross. Likely circumstances: the user happened to encounter recognition AND the bootstrap fired (creating form_recall), AND the rotation eventually picked meaning_recall (at anchoring before the gate tightening), AND all three skills crossed stability 4.5 within the user's review history. Statistical luck.

---

## Part 4 — The bidirectional asymmetry

### 4.1 Symptom

The user reports seeing significantly more Indonesian-to-Dutch (ID→NL) exercises than Dutch-to-Indonesian (NL→ID) in their sessions.

### 4.2 Exercise type → direction mapping

Mapped by reading each constructor in `src/lib/sessionQueue.ts` and the corresponding render component:

| Exercise type | Constructor | skillType | Direction |
|---|---|---|---|
| `recognition_mcq` | `makeRecognitionMCQ` (`:742`) | recognition | **ID → NL** (MCQ) |
| `listening_mcq` | `makeListeningMcq` (`:869`) | recognition | **ID audio → NL** (MCQ) |
| `meaning_recall` | `makeMeaningRecall` (`:809`) | meaning_recall | **ID → NL** (typed) — see `MeaningRecall.tsx:2`: *"User sees Indonesian, types L1 meaning."* |
| `cloze_mcq` | `makeClozeMcq` (`:975`) | recognition | ID context, ID blank (MCQ) |
| `cued_recall` | `makeCuedRecall` (`:918`) | **meaning_recall** | **NL → ID** (MCQ) |
| `typed_recall` | `makeTypedRecall` (`:793`) | form_recall | **NL → ID** (typed) |
| `cloze` | `makeClozeExercise` (`:1034`) | form_recall | ID context, ID blank (typed) |
| `dictation` | `makeDictation` (`:832`) | form_recall | ID audio → ID (typed) |

### 4.3 Two taxonomy mismatches

**Mismatch A — `meaning_recall` skill is bidirectional in code, unidirectional in docs.**

`stages.ts:14-30` documents the skill as:
> `meaningRecall: NL→ID recognition/recall (anchoring gate + retrieving/productive)`

But the implementation has BOTH `meaning_recall` (ID→NL typed) AND `cued_recall` (NL→ID MCQ) writing `skill_type='meaning_recall'`. So the skill counter aggregates both directions even though the docs say it tracks only NL→ID.

**Mismatch B — `cued_recall` exists only at the anchoring random roll.**

The due-driven branch of `selectExercises` (`sessionQueue.ts:421-464`) routes:
- `recognition` due → `makeRecognitionMCQ` (always ID→NL)
- `meaning_recall` due → `makeMeaningRecall` (always ID→NL typed) — note: NOT `makeCuedRecall` (NL→ID)
- `form_recall` due → typed_recall / cloze / dictation

`cued_recall` (NL→ID MCQ) appears nowhere in the due-driven branch. It only fires in the stage-based random roll for `new`/`anchoring`-stage items (`:469-498`). Once items mature past anchoring, NL→ID MCQ exposure drops to zero.

### 4.4 Net direction skew

For Albert's current state (256 retrieving + 1 productive + 367 anchoring):

| Item state | ID→NL paths | NL→ID paths | ID↔ID paths |
|---|---|---|---|
| Anchoring random roll | recognition_mcq + meaning_recall + listening_mcq ≈ 55–70% | cued_recall ≈ 25% | cloze_mcq ≈ 20% |
| Due-driven retrieving | makeRecognitionMCQ (recognition due, 100% of 256) + makeMeaningRecall (meaning_recall due, ~18% of 256) | typed_recall (form_recall due, ~27% of 256), and only when form_recall skill exists | cloze variants when form_recall due |

Concretely, Albert has 6 reviewable due items right now, all with `recognition` due. All 6 will route to `makeRecognitionMCQ` (ID→NL). NL→ID exposure for him: zero this session.

This matches his observation. The architectural reasons:
1. The `cued_recall` exercise is implementationally orphaned (only at anchoring).
2. The `meaning_recall` skill conflates two directions.
3. `form_recall` skill rows (the only reliable NL→ID-typed path) exist for only 68/256 retrieving items.

---

## Part 5 — Comparison with other FSRS / spaced-repetition implementations

### 5.1 Anki / SuperMemo

**Schedulable unit: card.** A "card" is one direction of one piece of knowledge. To study a word in two directions, you create two cards. Each gets independent FSRS state. There's no item-level concept.

- No stages. No coupling between cards.
- No stuck problem — each card matures independently.
- No "word mastery" rollup; users infer it from card states.
- Source: Anki manual (`https://docs.ankiweb.net/`), FSRS4Anki documentation (`https://github.com/open-spaced-repetition/fsrs4anki`).

For multi-skill coverage, Anki users use card templates ("notes" → multiple cards) — one note can produce N cards (e.g., recognition + production + audio + typing). All independent.

### 5.2 Fluent Forever (Gabriel Wyner)

**Schedulable unit: card, with explicit multi-card-per-word convention.** Wyner's published methodology (book: *Fluent Forever*, 2014; web: `https://fluent-forever.com`) recommends 4–6 card types per vocabulary word:
- Picture → native word (image recognition)
- Native word → target word (production)
- Audio → target word (listening/dictation)
- Target word → native word (reading)
- Personal connection prompt
- Spelling drill

All independent FSRS units. Gabriel Wyner was an early advocate for what your skill_type column is reaching for, but Fluent Forever doesn't add stage gates on top — each card just runs.

### 5.3 Memrise

**Schedulable unit: item, with hard level gates.** Levels: "Plant" (initial encounter) → "Grow" (early reviews) → "Flower" (mature) → "Garden" (long-term).

Within a course, content is organized into hand-curated levels:
- Level 1: vocabulary words
- Level 2: short phrases
- Level 3: full sentences
- Level 4: dialogues

Hard gating: you can't access level 2 items until level 1 is "planted" (all words seen and reviewed at least once). Memrise replaced their core scheduler several times; the post-2023 version uses ML-based ML-driven personalization but kept the level model.

- Pedagogical sequencing is explicit, not derived.
- Level structure is author-curated, not adaptive to learner state at fine grain.
- Source: Memrise's blog and academic papers (e.g., Memrise's Settles & Meeder collaboration).

### 5.4 Duolingo

**Schedulable unit: concept (item), with single-strength model.** Each word/concept has ONE "strength" value that decays over time per Duolingo's Half-Life Regression (HLR) model.

- Reference: Settles, B. & Meeder, B. (2016). "A Trainable Spaced Repetition Model for Language Learning." *Proceedings of the 54th Annual Meeting of the ACL*, vol. 1, pp. 1848–1858. (`https://aclanthology.org/P16-1174/`)
- HLR is a generalization of SuperMemo that learns per-feature decay rates from review logs.
- Exercise type per item is picked based on strength: low strength → recognition MCQ; medium → translation; high → typed production.

Duolingo's model captures progression-via-difficulty implicitly (strength → exercise type) but doesn't track separate skill states per word. No multi-skill stuck problem because there's only one skill per item.

Skill tree provides coarse prerequisite ordering (unit-level). Within a unit, content is mixed from day 1 — vocab, phrases, sentences interleaved. Bias toward content using already-known vocab, but not a hard gate.

### 5.5 Glossika

**Schedulable unit: full sentence.** Philosophically opposed to atomic vocabulary drill. Method: ~1000 sentence pairs per language, each shown with audio and translation, reviewed via spaced repetition. The argument (per their methodology page, `https://glossika.com/method/`): sentences provide context that accelerates pattern recognition and acquisition; isolated vocabulary lacks the syntactic grounding needed for production.

- No vocabulary phase, no stages, no skills.
- One strength dimension per sentence.
- Implicit prerequisite: sentences are ordered by syntactic complexity in the curriculum (curated, not derived).
- Research backing: Krashen-style input hypothesis (Krashen, S. *The Input Hypothesis: Issues and Implications.* 1985), Bjork's desirable difficulty research.

### 5.6 LingQ

**Schedulable unit: word, exposure-based.** Reading/listening-heavy. Users encounter words in authentic content (articles, podcasts) and mark each as "known" or "still learning." Spaced review rotates unknowns. No prerequisite ordering — content is whole-text from day 1.

### 5.7 Skritter

**Schedulable unit: card, with strict prerequisite gating for character-based languages.** Closest analog to your proposed prerequisite model. For Chinese:
- Single characters introduced first
- Multi-character words gated behind component characters
- Sentences gated behind component words

Hard gates, derived from the writing system's natural decomposition. Source: Skritter's documentation (`https://skritter.com`).

This works because Chinese has clean compositional structure. For Indonesian (mostly atomic words), the analog would be word → sentence → grammar — which is what your proposed model implements but at a finer grain than Memrise's coarse levels.

### 5.8 Mango / Rosetta Stone / Mondly

Curriculum-driven, no FSRS, no learner-state-driven prerequisites. Lessons proceed in author-defined order. Not directly comparable.

### 5.9 Pleco (Chinese)

Card-based, similar to Anki. Each card direction is a separate card. No stages, no derived prerequisites. Users curate decks manually.

### 5.10 Summary table

| App | FSRS granularity | Bidirectional handling | Prerequisite ordering |
|---|---|---|---|
| Anki | per card | one card per direction (manual) | author-curated decks |
| Fluent Forever | per card | one card per direction (template-driven) | author-curated decks |
| Memrise | per item, levels | implicit via level mix | hard level gates (author-curated) |
| Duolingo | per concept (single strength) | exercise type adapts to strength | unit-level skill tree |
| Glossika | per sentence | n/a (sentences only) | author-curated curriculum order |
| LingQ | per word | n/a (single direction: comprehension) | none |
| Skritter | per card | one card per direction | hard gates derived from script decomposition |
| Mango/Rosetta | n/a | n/a | author-curated curriculum |
| Pleco | per card | one card per direction (manual) | author-curated |
| **Indonesian app (current)** | per (item, skill) with item-level stage gates | three skill_types per item, but mappings are inconsistent (see Part 4) | none — items introduced in lesson order |
| **Indonesian app (proposed)** | per (item, skill), skills seeded at introduction, stages become derived | three skills per item, all in rotation from day 1 | content-derived prerequisite graph + success_count thresholds |

---

## Part 6 — The proposed solution

The combined fix has three layers, each independently sound, that compose into a model not implemented by any mainstream language app.

### Layer 1 — Per-skill FSRS seeding at introduction (was "fix #3")

**Change:** When an item transitions from `new` → `anchoring` (its first review), seed all three `learner_skill_state` rows immediately, not just the one being reviewed.

Concrete change site: `src/lib/reviewHandler.ts:66-79`. Add a step after the first skill upsert:

```ts
if (previousStage === 'new') {
  const seedSkills = (['recognition', 'form_recall', 'meaning_recall'] as const)
    .filter(t => t !== skillType)
  for (const otherSkill of seedSkills) {
    await learnerStateService.seedSkillState({
      userId,
      learningItemId: learningItem.id,
      skillType: otherSkill,
      initialStability: 0,
      initialDifficulty: 5,
      initialDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
  }
}
```

Plus a new `learnerStateService.seedSkillState` that's idempotent (`INSERT … ON CONFLICT DO NOTHING`).

**Effects:**
- All three skills exist from day 2 onwards. No more "stuck with only recognition."
- Stage promotion gates can be met naturally (all required skill rows exist).
- FSRS handles the rotation; the most-overdue skill gets exercised first.
- The 24-hour delay prevents day-1 overwhelm and respects the SLA acquisitional sequence (recognition before production).

**Risk:** Items with mature recognition but novel form_recall will have their form_recall skill register lapses on first encounter. Mitigation: the 24h delay gives anchoring a head start; the user encounters production only after multiple recognition successes have built schema knowledge.

**Backfill:** The 211 currently-stuck items need a one-off SQL backfill that creates missing skill rows for items already at retrieving+ (per Part 3).

```sql
INSERT INTO indonesian.learner_skill_state (
  user_id, learning_item_id, skill_type, stability, difficulty,
  next_due_at, last_reviewed_at, success_count, failure_count, lapse_count,
  consecutive_failures
)
SELECT lis.user_id, lis.learning_item_id, skill.skill_type_to_add,
  0, 5, now() + interval '1 day', NULL, 0, 0, 0, 0
FROM indonesian.learner_item_state lis
CROSS JOIN (VALUES ('form_recall'), ('meaning_recall')) AS skill(skill_type_to_add)
WHERE lis.stage IN ('retrieving', 'productive', 'maintenance')
  AND NOT EXISTS (
    SELECT 1 FROM indonesian.learner_skill_state lss
    WHERE lss.user_id = lis.user_id
      AND lss.learning_item_id = lis.learning_item_id
      AND lss.skill_type = skill.skill_type_to_add
  );
```

### Layer 2 — Resolve the cued_recall and meaning_recall taxonomy

**Two sub-options.**

**Option 2A (small):** Add a due-branch case for `meaning_recall` skill that occasionally routes to `makeCuedRecall` (NL→ID MCQ) instead of always `makeMeaningRecall` (ID→NL typed). E.g., 50/50 split. This restores NL→ID MCQ exposure for matured items without changing the data model. ~15 lines in `sessionQueue.ts:447-448`.

**Option 2B (principled):** Split `meaning_recall` into two skills:
- `meaning_recall` = ID→NL recall (exercised by `makeMeaningRecall`)
- `cued_recall` = NL→ID recall (exercised by `makeCuedRecall`)

Each direction gets its own FSRS state. Promotion gates updated to include the new skill. Migration needed: rename existing rows or create new rows for items at retrieving+.

**Recommendation:** Option 2B. It aligns the data model with the documented intent (`stages.ts:14`), produces independent FSRS trajectories per direction, and matches the Anki/Fluent Forever convention of one schedulable unit per direction. Option 2A is a tactical patch that leaves the underlying conflation in place.

### Layer 3 — Content-prerequisite gate on new-item selection

**Change:** When the session builder picks "new" items to introduce, score each candidate by prerequisite satisfaction and only introduce items above a threshold.

Pseudocode (lives in or near `buildSessionQueue`'s new-items selection):

```ts
function isEligibleForIntroduction(item: LearningItem, learnerState: LearnerState): boolean {
  if (item.item_type === 'word' || item.item_type === 'phrase') return true   // no prereqs

  if (item.item_type === 'sentence' || item.item_type === 'dialogue_chunk') {
    const contentWords = tokenize(item.base_text)
      .map(normalizeDialogueToken)
      .filter(t => isContentWord(t))   // exclude particles, pronouns, proper nouns

    const knownContent = contentWords.filter(t => {
      const vocabItem = vocabPool.findByNormalizedText(t)
      if (!vocabItem) return false
      const recognitionSkill = learnerState.skills[vocabItem.id]?.recognition
      return recognitionSkill && recognitionSkill.success_count >= 2
    })

    return knownContent.length / contentWords.length >= PREREQ_THRESHOLD   // e.g. 0.8
  }

  // Grammar patterns: similar logic against the pattern's vocabulary pool from pattern-brief.json
  // ...
}
```

**Effects:**
- A fresh learner sees only `word`/`phrase` items for the first ~3–5 days.
- Sentences and dialogue lines unlock individually as their content vocab matures.
- Grammar patterns unlock once their introducing-lesson vocab is anchored.
- The learner's experience naturally graduates from "atomic vocab drill" to "applied vocab in sentence context" to "structural pattern recognition."

**Threshold tuning:** Start with 0.8 (80% of content words must be at success_count ≥ 2). Empirically tune. A first lesson's grace period might be appropriate (lower threshold for lesson 1 to avoid trapping the learner in the warmup phase too long).

**Edge cases:**
- An item with no content words (or all proper nouns) auto-passes — it's vocab-equivalent.
- A sentence with one unknown content word and 9 known ones: 90% coverage, passes the 80% threshold. The unknown word is encountered in context (slight i+1 stretch per Krashen).
- A grammar pattern's vocabulary pool comes from `pattern-brief.json` (already produced by the linguist-structurer agent); pattern-prereq is a straightforward extension of the same logic.

### Layer 4 (composition) — Stage as a derived view, not a gate

With Layers 1 + 2 + 3 in place, the `learner_item_state.stage` column shifts role:
- **Today**: it's a gate — stage controls which exercises are eligible (`selectExercises` branches on stage).
- **Proposed**: it becomes a derived read-only summary — stage is computed from the joint skill states for display purposes (dashboard, progress widgets) but doesn't control routing.

Routing instead becomes:
- `selectExercises` picks an exercise for the most-overdue skill on the candidate item.
- The exercise type is determined by the skill type (recognition → MCQ, meaning_recall → typed, etc.) and item type (word → simple form, sentence → cloze).
- No stage check needed.

This eliminates the chicken-and-egg deadlock entirely: the stage promotion logic still runs and updates the column for display, but the column doesn't gate anything that creates the deadlock.

### Layer 5 (combined cadence) — what a fresh user experiences

**Day 1 (`preferredSessionSize=25`, `daily_new_items_limit=10`):**
- Session pulls from new-items pool. Layer 3's filter limits this to `word`/`phrase` items.
- 10 new vocab items introduced.
- Layer 1 seeds 3 skill rows per item (one immediately due from this review, two due tomorrow).
- Session shows 10 introductions plus rotation of the freshly-introduced skills as they tick into "due" within the session — likely just the introductions on day 1 = ~10 exercises.

**Day 2:**
- Yesterday's items have skills coming due (FSRS scheduled).
- 10 more new vocab introductions.
- Session ≈ 20 exercises = mix of yesterday-reviews + today-intros.
- Bidirectional rotation begins (cued_recall, meaning_recall, typed_recall start appearing per skill due dates).

**Day 3–5:**
- Lesson 1 vocab continues introducing (10/day).
- Day-1 items cross `recognition.success_count ≥ 2` threshold.
- **First sentences become eligible** under Layer 3's prereq filter.
- Session starts including 1–2 sentence intros + many vocab reviews + new vocab intros.

**Day 6–10:**
- Most lesson-1 vocab anchored.
- Sentences from lesson 1 actively rotating.
- Grammar patterns start introducing (their pattern vocab is now anchored).
- Dialogue chunks (the largest items) introduce last.

**Day 10+:**
- Lesson 1 mostly mature. Lesson 2 vocab begins entering the new-items pool.
- Steady-state mixed sessions.

This cadence is what the user described informally and what's documented in this plan.

---

## Part 7 — Why this is good (pedagogical justification)

### 7.1 Aligns with documented SLA research

**Laufer, B. & Goldstein, Z. (2004).** "Testing Vocabulary Knowledge: Size, Strength, and Computer Adaptiveness." *Language Learning* 54(3): 399–436. Cited in `stages.ts:14`. Establishes the four-knot acquisitional sequence:
1. Receptive recognition (passive)
2. Productive recognition (active recognition)
3. Receptive recall (productive partial)
4. Productive recall (full production)

Layer 1 (per-skill FSRS) directly maps to this: each knot becomes its own schedulable skill. Layer 4 (stages as derived) preserves the ladder for display while letting FSRS handle the actual scheduling.

**Nation, I.S.P. (2006).** "How Large a Vocabulary is Needed for Reading and Listening?" *The Canadian Modern Language Review* 63(1): 59–82. Establishes the 95–98% lexical coverage threshold for comprehension. Below 95% known vocabulary in a passage, comprehension breaks down.

Layer 3's prerequisite gate (80% threshold default) operationalizes this for sentence introduction — sentences come up only when coverage is high enough for comprehensible input. Tunable upward to 95% if research suggests stricter.

**Krashen, S. (1985).** *The Input Hypothesis: Issues and Implications*. Longman. Proposes the "i+1" model: optimal input is just slightly above current competence.

A sentence with 80% known vocab introduces 1–2 new content words in a familiar context — a textbook i+1 condition. Layer 3 enforces this statistically.

**Bjork, R.A. & Bjork, E.L. (1992).** "A new theory of disuse and an old theory of stimulus fluctuation." Bjork's "desirable difficulty" research establishes that retrieval difficulty (within reason) strengthens long-term retention.

The 24-hour delay on seeded skill rows (Layer 1) creates a small but desirable difficulty: by the time form_recall first comes due, recognition is partially decayed but recoverable, generating productive retrieval effort.

### 7.2 Aligns with FSRS design philosophy

FSRS (Open SpacedRepetition) is a scheduler — it answers "when should I show this next?" given (current state, current rating). It's agnostic to what the schedulable unit is.

Layer 1 makes each (item, skill) tuple a first-class FSRS unit. This is structurally identical to how Anki treats cards: independent units with independent FSRS state. The Indonesian app's current model attempts joint scheduling via the stage column, which the FSRS algorithm wasn't designed to support and which creates the chicken-and-egg deadlock observed.

### 7.3 Aligns with vocabulary acquisition research

**Webb, S. & Nation, I.S.P. (2017).** *How Vocabulary is Learned*. Oxford University Press. Argues that vocabulary acquisition requires multiple meaningful exposures, ideally distributed across contexts and modalities.

Layer 1 + 2 ensures multi-modal exposure (recognition, production, listening, contextual) per word over time. Layer 3 ensures contextual exposure (in sentences) only happens after the word is anchored — preventing the "unknown word in unknown context" double-miss that Webb & Nation flag as low-yield.

### 7.4 Avoids known failure modes

The current model's stuck-in-retrieving problem is documented as a comment in `sessionQueue.ts:443-452` ("they can never promote to productive"). The proposed model eliminates the failure mode by construction — all skills exist from introduction, all are independently schedulable, no joint gate creates a deadlock.

The current model's direction skew (Part 4) similarly resolves automatically: with separate FSRS states for ID→NL and NL→ID recall (Layer 2B), the rotation balances naturally.

---

## Part 8 — Why this is novel

I'm not aware of any mainstream language-learning app that combines these three layers as proposed. The closest analogues:

| Approach | Layers present | What's missing vs. proposed |
|---|---|---|
| Anki (default) | Layer 1 (per-card FSRS) | No layers 3–4. No prerequisite ordering, no semantic stage tracking. Author manually orders decks. |
| Memrise | Coarse layers 3–4 (level gates, level-derived stage) | No layer 1 (uses level-based scheduling, not per-skill FSRS). Hard gates instead of statistical thresholds. |
| Duolingo | Layer 4 (single-strength = derived stage). Coarse layer 3 (skill tree). | No layer 1 (single-strength model). No fine-grained per-item prereq. |
| Skritter | Layers 1 + 3 for character-decomposable languages | Layer 3 is orthographic (character-derived), not semantic (vocab-derived). Doesn't generalize to languages without compositional script. |
| Fluent Forever | Layer 1 (multiple cards per concept) | No layers 3–4. Author manually curates deck order. |
| Glossika | Implicit layer 4 (sentences only) | No layers 1, 3. Philosophically opposes vocabulary atomization. |

**Specifically novel combination:**

1. **Per-skill FSRS scheduling with semantic-content-derived prerequisites.** No app combines these. Anki has per-card FSRS but no derived prerequisites. Memrise has prerequisites but they're hand-curated levels, not derived. Skritter has derived prerequisites but only for orthographic decomposition, not semantic vocabulary.

2. **Statistical prerequisite thresholds rather than binary gates.** Memrise gates are binary (level 1 done → level 2 unlocked). The proposed model uses `success_count ≥ 2` per content word and a coverage threshold (80%), which is continuous and adaptive to actual learner performance. A learner who's nearly-mastered some lesson-1 vocab unlocks sentences using those specific words first; their less-mastered vocab keeps related sentences in the wait queue.

3. **Stage as a derived view rather than a routing gate.** This is actually closer to Duolingo's strength model than to Memrise/Skritter's gates, but at finer granularity (per skill per item rather than per concept).

4. **No author burden for prerequisite curation.** The prerequisite graph is derived from item content (what words a sentence contains, what vocabulary a grammar pattern references). Authors only produce content — they don't sequence it. This reduces curation burden, which has been a major Memrise pain point.

5. **Adaptive cadence within and across lessons.** A learner who breezes through lesson 1 vocab unlocks sentences quickly. A learner who struggles spends more days on vocabulary first. Both are pedagogically appropriate; neither is rigidly forced.

The combination encodes a research-grounded theory of language acquisition (Laufer-Goldstein + Nation + Krashen) directly into the data model, rather than relying on author-curated curriculum to encode it. This is the architectural novelty.

---

## Part 9 — Risks and mitigations

### 9.1 Cold start feels narrow

**Risk:** First 2–3 days are vocab-only. Some learners want to see "real" sentences from day 1 (Glossika's argument).

**Mitigation:** Front-load motivation signal: dashboard shows "Day 2 of foundation building. Sentences unlock when 80% of lesson 1 vocab is anchored — you're at 60%." Explicit progress visibility.

Alternative: reduce threshold for lesson 1 only (grace period). Or introduce a single "preview sentence" per session that's marked as preview-only (not scored) for engagement.

### 9.2 Threshold tuning

**Risk:** 80% might be wrong. Too low → sentences with too many unknowns. Too high → sentences delayed forever.

**Mitigation:** A/B testing is hard for a single-user app. Use empirical observation: track time-to-first-sentence and reading comprehension subjective rating; tune accordingly. Default at 80% based on Nation 95% literature minus a buffer.

### 9.3 Cross-lesson dependencies

**Risk:** A user who skips ahead to lesson 9 will find many lesson-9 sentences locked because they reference lesson 4–8 vocab.

**Mitigation:** Document that lessons are designed to be done in order. Add a dashboard panel showing "32 lesson 9 sentences waiting on prerequisites from lessons 4, 5, 7, 8." This makes the ordering visible and motivates linear progression.

### 9.4 Lesson-internal fragmentation

**Risk:** With 10 new items/day and 50 words/lesson, each lesson takes ~5 days for vocab alone, plus more for sentences. A user is "in" a lesson for 2–3 weeks. Memrise's per-level bursts (10 items, done in 30 minutes, on to the next level) are more satisfying.

**Mitigation:** Lesson 1 with 50 words is unusually large. Many lessons have ~30 items (lesson 6 has 49 items per the count earlier). Tune `daily_new_items_limit` per learner preference. Or surface "sub-lessons" within a lesson (e.g., lesson 1 has Topic A vocab + Topic B vocab + dialogue) so the learner sees finer progress.

### 9.5 Form_recall pedagogical timing

**Risk:** Layer 1's 24-hour delay seeds form_recall on day 2, when recognition is barely anchored. Asking a learner to type the Indonesian for "huis" → "rumah" on day 2 might generate frustration if they can only just recognize the word.

**Mitigation:** Increase the delay for form_recall specifically: seed it 3 days out instead of 1. Or make the delay proportional to item difficulty. Or wait until recognition.success_count ≥ 2 before seeding form_recall (a stage-transition variant of Layer 1).

The stage-transition variant is worth consideration: seed `recognition` on introduction (day 1), seed `meaning_recall` after `recognition.success_count ≥ 1`, seed `form_recall` after `recognition.success_count ≥ 2`. This naturally enforces SLA acquisitional order.

### 9.6 Grammar pattern timing

**Risk:** Grammar patterns currently exist as 47 entries in `grammar_patterns` with 0 due / 0 new for the user. Whatever introduced them in the past has stalled. Layer 3 won't auto-fix this — the user already has `learner_grammar_state` rows for all 47, none new, none due.

**Mitigation:** Separate concern from this redesign. Grammar lifecycle has its own scheduler bug (out of scope here). Note for future investigation.

### 9.7 Backfill complexity

**Risk:** The 211 currently-stuck items need backfill SQL (Part 6, Layer 1). Running this with arbitrary `next_due_at` could flood the user with sudden due exercises.

**Mitigation:** Set `next_due_at` to a staggered distribution (`now() + interval '1 day' * random()`) so backfilled skills don't all come due at once.

### 9.8 Stage-as-derived requires migration

**Risk:** `selectExercises` currently switches on `stage`. Removing stage as a routing gate (Layer 4) changes routing for 100% of items. Could surface latent bugs.

**Mitigation:** Phased rollout. First implement Layer 1 + Layer 2B + Layer 3 with stage still as gate. Verify in production. Then convert stage to derived in a separate change.

---

## Part 10 — What this redesign does NOT address

For the reviewer's awareness, the following are out of scope:

1. **Audio for dialogue lines (listening_mcq).** Covered separately by `docs/plans/2026-04-16-exercise-audio-design.md`.
2. **Dialogue pipeline completion (Phase 2, 3 rollout).** Covered by `docs/plans/2026-04-24-dialogue-pipeline-completion.md`.
3. **Grammar scheduler stall.** 47 patterns exist, none due/new. Separate investigation.
4. **Dutch-grammar-prompts misclassified as `sentence` learning_items.** Catalog-agent classification rule fix; separate plan.
5. **Sibling DQ-at-rest plan.** `scripts/check-content-health.ts` for nightly orphan/zombie detection. Out of scope here, will be its own plan.
6. **Session UX for "caught up" state.** Currently empty queue shows "Session Error"; should ideally show a friendly "You're done for today" state.

---

## Part 11 — Implementation outline (rough sequencing)

This is an implementation skeleton, not a finalized plan. Subject to architect/linguist review.

**Phase A — Layer 1 (per-skill seeding):**
- A.1: Add `learnerStateService.seedSkillState` (idempotent INSERT … ON CONFLICT DO NOTHING).
- A.2: Modify `reviewHandler.ts` to seed remaining two skill rows on `previousStage === 'new'` transition.
- A.3: Backfill SQL for 211 stuck retrieving items.
- A.4: Unit tests for the seeding behavior.
- A.5: Runtime verification — observe one user-introduced item, confirm three skill rows exist, confirm all surface in rotation over 3–4 sessions.

**Phase B — Layer 2B (split meaning_recall / cued_recall skills):**
- B.1: Add `cued_recall` to the `skill_type` CHECK constraint (DB migration).
- B.2: Update `makeCuedRecall` to write `skill_type='cued_recall'` instead of `meaning_recall`.
- B.3: Update `selectExercises` due-branch to add a `cued_recall` case routing to `makeCuedRecall`.
- B.4: Update `stages.ts` promotion gates to include `cued_recall` (or define an updated joint-skill rule).
- B.5: Update `linguist-reviewer.md` Check 13 to reference the new skill type if relevant.
- B.6: Migration: existing `learner_skill_state` rows with `skill_type='meaning_recall'` that came from `cued_recall` reviews need to be split. Without per-review history we may have to seed `cued_recall` rows with stability=0 for items where `meaning_recall` exists, treating it as a fresh start for that direction.

**Phase C — Layer 3 (prerequisite gate on new-item selection):**
- C.1: Implement `isEligibleForIntroduction(item, learnerState)` per Part 6.
- C.2: Modify the "new items" selection in `buildSessionQueue` to filter through this function.
- C.3: Add `daily_new_items_limit` per-day cap (already exists in profile, verify it's used).
- C.4: Lint rule: every `sentence`/`dialogue_chunk` must have at least one content word that's a learning_item in current or prior lesson, otherwise it's unreachable.
- C.5: Dashboard widget showing "X sentences waiting on prerequisites" for visibility.

**Phase D — Layer 4 (stage as derived view):**
- D.1: Remove stage checks from `selectExercises`. Routing decided by skill type and item type.
- D.2: Stage column updated by `checkPromotion` for display only.
- D.3: Update `Progress.tsx` and dashboard widgets to read stage as a summary, not a gate.
- D.4: Update `session-engine.md` documentation to reflect the new model.

**Phase E — Documentation, tests, observability:**
- E.1: Update `docs/architecture/session-engine.md` to reflect derived-stage routing and Layer 1–3 logic.
- E.2: Update `stages.ts` comments to reflect new skill semantics.
- E.3: Comprehensive unit tests for all layers.
- E.4: Add metrics/logging for session-pool composition (how many words, sentences, grammar; how many due-driven vs new) so we can observe cadence in production.

---

## Part 12 — Open questions for the reviewer

1. **Layer 1 24h delay vs. stage-transition seeding** — which is pedagogically better? The 24h seed is simpler; stage-transition seeding (recognition on intro, meaning_recall after recognition.success≥1, form_recall after recognition.success≥2) more strictly enforces the Laufer-Goldstein order but is more complex to implement and verify.

2. **Prerequisite threshold default** — 0.8 is a guess. Nation 1990s research suggests 95% for free reading comprehension, but for sentence-as-exercise where translation provides context, lower may be acceptable. Empirical tuning needed.

3. **First-lesson grace period** — should lesson 1 sentences introduce sooner (lower threshold) to engage new learners?

4. **Layer 2A (small) vs. 2B (split skills)** — is the cleaner data model worth a migration, or is the small patch sufficient?

5. **Stage-as-derived migration risk** — is Phase D worth the complexity, or should stage stay as a routing gate (with the deadlock fixed by Layer 1)?

6. **Grammar patterns** — separately stalled. Should this redesign tackle them, or scope to vocabulary/sentences?

7. **`dialogue_chunk` continued existence** — given the dialogue pipeline plan landed, do dialogue_chunks remain a distinct item_type or get merged into `sentence`? The proposed model treats both the same way (both are content-bearing prereq-gated items); merging would simplify.

---

## Part 13 — Sources

### Academic / pedagogical

- Laufer, B. & Goldstein, Z. (2004). "Testing Vocabulary Knowledge: Size, Strength, and Computer Adaptiveness." *Language Learning* 54(3): 399–436. — cited in `src/lib/stages.ts:14` for SLA acquisitional sequence.
- Nation, I.S.P. (2006). "How Large a Vocabulary is Needed for Reading and Listening?" *The Canadian Modern Language Review* 63(1): 59–82. — vocabulary coverage thresholds for comprehension.
- Webb, S. & Nation, I.S.P. (2017). *How Vocabulary is Learned*. Oxford University Press. — vocabulary acquisition principles.
- Krashen, S. (1985). *The Input Hypothesis: Issues and Implications*. Longman. — i+1 input principle.
- Bjork, R.A. & Bjork, E.L. (1992). "A new theory of disuse and an old theory of stimulus fluctuation." — desirable difficulty research.
- Settles, B. & Meeder, B. (2016). "A Trainable Spaced Repetition Model for Language Learning." *ACL 2016*. — Duolingo's HLR model.

### Apps / products referenced

- Anki: `https://docs.ankiweb.net/`
- FSRS4Anki: `https://github.com/open-spaced-repetition/fsrs4anki`
- Fluent Forever (Wyner 2014, web at `https://fluent-forever.com`)
- Memrise: `https://memrise.com` (post-2023 ML-personalized scheduler)
- Duolingo: HLR paper above; Owl personalization and Birdbrain models documented in subsequent papers
- Glossika: methodology at `https://glossika.com/method/`
- LingQ: `https://lingq.com`
- Skritter: `https://skritter.com`
- Pleco: `https://pleco.com`

### This codebase (specific file:line references)

- Session error origin: `src/pages/Session.tsx:256`
- Session queue builder: `src/lib/sessionQueue.ts:52`
- filterEligible (current): `src/lib/sessionQueue.ts:347-378` (post-Task-1.7 filterEligible C-1 dialogue guard)
- Stage promotion logic: `src/lib/stages.ts:32-90`
- Skill type definitions: `src/lib/stages.ts:14-30` (with the documented intent vs implementation mismatch)
- Exercise constructors:
  - `makeRecognitionMCQ`: `src/lib/sessionQueue.ts:742`
  - `makeMeaningRecall`: `src/lib/sessionQueue.ts:809`
  - `makeCuedRecall`: `src/lib/sessionQueue.ts:918`
  - `makeTypedRecall`: `src/lib/sessionQueue.ts:793`
  - `makeClozeMcq`: `src/lib/sessionQueue.ts:975`
  - `makeClozeExercise`: `src/lib/sessionQueue.ts:1034`
  - `makeListeningMcq`: `src/lib/sessionQueue.ts:869`
  - `makeDictation`: `src/lib/sessionQueue.ts:832`
- Form_recall stage gate (the chicken-and-egg comment): `src/lib/sessionQueue.ts:443-464`
- Review handler (where new→anchoring transition + skill upsert happens): `src/lib/reviewHandler.ts:51-105`
- Auth store profile loading (with the silent catch): `src/stores/authStore.ts:53-86`
- ProtectedRoute loading guard: `src/components/ProtectedRoute.tsx:32-50`
- Pre-publish gate (deferredDialogueChunks) — this morning's stop-gap: `scripts/publish-approved-content.ts:266-306`
- Step 6 verification (post-Task-1.5 widening): `scripts/publish-approved-content.ts:626-720`
- Lint rule for dialogue clozes (this morning's Task 1.4): `scripts/lint-staging.ts:checkDialogueClozes`
- Architecture docs: `docs/architecture/session-engine.md`, `docs/architecture/data-model.md`
- Dialogue pipeline plan (companion to this redesign): `docs/plans/2026-04-24-dialogue-pipeline-completion.md`

### Live database evidence (Albert's user, 2026-04-24/25)

All numbers in this document are from live queries against the homelab Supabase via service-role:

- 726 active learning_items
- 1069 item_meanings (609 NL + 460 EN)
- 1674 item_contexts
- 716 active exercise_variants
- 47 grammar_patterns
- 617 learner_item_state rows (this user)
- 731 learner_skill_state rows (this user)
- Stage distribution: 367 anchoring, 256 retrieving, 1 productive, 0 maintenance
- Skill coverage on retrieving items: 256 recognition, 68 form_recall, 45 meaning_recall, 17 with all 3, 160 with only recognition
- 15 items meeting full promotion threshold but not yet promoted (awaiting next review)
- 117 items deactivated 2026-04-24 as orphans (52 dialogue_chunk + 65 sentence + 20 with no contexts)
- 8 due skills currently pointing at inactive (zombie) items

---

## Part 14 — Conversation context for the reviewer

This document was produced after a multi-hour investigation by Claude (Opus 4.7) on 2026-04-24 in conversation with the user (Albert van Duijn, sole learner-user of the app). The conversation flowed:

1. Production deploy → "No exercises available" → root-caused to orphan dialogue items.
2. Investigation of pipeline gaps → publish-script and lint hardening.
3. Three-round design review of the dialogue-pipeline-completion plan (architect + linguist-reviewer agents).
4. Implementation through Phase 1 (lesson 9 end-to-end validation passed live).
5. User noticed stage distribution skew (367/256/1) → investigation of skill coverage gaps.
6. User noticed direction asymmetry (more ID→NL than NL→ID) → mapping of exercise types to skills/directions.
7. Discussion of how other apps handle multi-skill scheduling.
8. User proposed combining per-skill FSRS with prerequisite-based introduction.
9. Discussion of how this combination compares to Memrise/Anki/Duolingo/etc.
10. User requested this comprehensive document for second-opinion review.

Throughout, the user emphasized **quality of learning experience** as the priority over implementation simplicity, and they're the only user of this app — so backwards-compatibility constraints are minimal and authoring effort can be invested in quality.

The proposed Layer 1 + Layer 2B + Layer 3 + Layer 4 redesign reflects this priority: it's a more invasive change than the alternative quick patches, but produces a pedagogically principled architecture that aligns with research and avoids known failure modes. The dialogue pipeline plan (already in v4, approved by both review agents) is the immediately preceding context — if it's helpful, the reviewer should read that plan first to understand the mid-2026-04-24 state of the codebase.

---

## Appendix A — Glossary of stage transitions and skill types

| Term | Definition |
|---|---|
| `new` | Item exists in DB but user has never seen it. No `learner_item_state` row OR `stage='new'`. |
| `anchoring` | First exposure phase. User has seen the item at least once. Skill rows being established. |
| `retrieving` | Mid-acquisition. Recognition skill is stable (≥1.8 stability, ≥3 success). Production skills being built. |
| `productive` | Full bidirectional knowledge. All three skills mature (≥4.5 stability, ≥3 success). |
| `maintenance` | Long-term retention. All three skills very stable (≥21.0). |
| `recognition` skill | Per current code: ID→NL passive recognition (MCQ). |
| `meaning_recall` skill | Per current code: ID→NL typed recall (and via cued_recall, NL→ID MCQ — bidirectional in implementation, unidirectional in docs). |
| `form_recall` skill | Per current code: NL→ID typed production (and ID→ID cloze/dictation). |
| Stability (FSRS) | Number of days until predicted recall probability drops below threshold. |
| Difficulty (FSRS) | Per-card difficulty parameter, ~0–10 scale. |
| Lapse | A "forgot" rating after the item was previously known. Lapses penalize stability heavily. |

---

## Appendix B — Prior commits relevant to this redesign

Listed in chronological order on `main`:

- `fca40de chore(agents): track .claude/agents/ definitions in repo` — moved agent definitions into version control.
- `276d30d feat(agents): rewrite linguist-reviewer Check 13 for dialogue cloze contract` — Phase 0 Task 0.2.
- `72aff16 docs(plans): 2026-04-24 dialogue pipeline completion (v4)` — companion plan.
- `f2c2abf feat(pipeline): enforce dialogue reviewability at lint + publish gates` — Tasks 1.4 + 1.5.
- `ca5493a feat(session): filterEligible enforces dialogue_chunk C-1 contract` — Task 1.7 + runtime guard.
- `ea87877 content(lesson-9): translate 11 dialogue_chunk lines (Task 1.1)` — linguist-structurer output.
- `ed40af6 content(lesson-9): 7 dialogue clozes + 4 skips (Task 1.2)` — cloze-creator output.
- `83b30d3 content(lesson-9): linguist-reviewer approval for Task 1.3` — review report.
- `ad050fb content(lesson-9): publish state — 7 published, 4 deferred_dialogue (Task 1.6)` — Phase 1 closeout.
- `dfe6b0f feat(scripts): Task 4.1 dialogue reactivation + dev stage-force helper` — Phase 4 Task 4.1.
