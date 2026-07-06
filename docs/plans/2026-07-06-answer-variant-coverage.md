---
status: shipped
implementation: branch feat/answer-variant-coverage
merged_at: 2026-07-06
implementation_paths:
  - scripts/enrich-answer-variants.ts
  - scripts/lib/answerVariants.ts
  - scripts/lib/answerCoverage.ts
  - scripts/data/answer-variants-seed.json
  - scripts/migration.sql
reviewed_by:
  - staff-engineer (2026-07-06 — re-scoped v1-v3 pipeline path → direct DB seed; UNSOUND-delivery verdict adopted)
  - data-architect (2026-07-06 — v4 direct-seed shape SIGN-OFF; distractor-table + precedent citations fixed)
  - architect (2026-07-06 — v4 placement/seam/ADR-fit SIGN-OFF; R-1 generate/apply split + R-2 cite folded)
supersedes: []
follows: docs/plans/2026-06-02-productive-ceiling-and-paraphrase-acceptance.md
adr:
  - docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md
  - docs/adr/0014-productive-ceiling-item-harvest-is-word-phrase-only.md
---

# Answer-Variant Coverage — seed the accepted-answer sets the grader already splits

> **Revision note.** v1–v3 routed the fix through the content pipeline (new carrier
> column on `lesson_section_item_rows` → Stage-A validator → Stage-B writer → wiring
> checklist). The **staff-engineer** rejected that as over-engineering: `item_answer_variants`
> is DB-authoritative-after-seeding (ADR 0011) — routine publishes never overwrite it —
> so the pipeline path's only benefit (rebuild-from-source) is voided by the table's own
> never-overwrite rule, and "mirror Decision R" copied a lesson-content idiom onto a
> capability-content table (the exact category error ADR 0011 warns against). **v4 is the
> boring version: a standalone maintenance script that seeds `item_answer_variants`
> directly** — how the ~262 existing rows already got there, generalised. No pipeline
> change, no new column.

## Problem (2026-07-06 usage audit, user `7eaacda5`, 3064 reviews)

Productive recall (`recall_meaning_from_text_cap`) has a **32% again-rate**, and
roughly **1 in 4–5 of those "failures" is a grading false-negative** — the learner
typed a correct Dutch answer that was marked wrong. Ground-truth from the live DB:

- `nasi → "rijst"`, `lauk → "bijgerecht"` (singular of "bijgerechten"),
  `pelan-pelan → "rustig aan"`, `siang → "middag"`, `sana → "daar"`,
  `berapa harganya → "wat is de prijs" / "hoeveel kost het"`, `apa kabar → "hoe gaat het"`.
- Of **134** wrong recall attempts with a real typed answer: ~27 provable false
  negatives, ~10 already repaired by the Jul-5 gloss pass but counted as lapses then,
  ~2 typos blocked by the deliberate substitution-exclusion, ~90 genuine confusions
  (~5 uncategorised — buckets approximate).

**Root cause is coverage, not logic.** `checkAnswer` (`src/lib/answerNormalization.ts:87-129`)
exact-matches the typed answer against `translation_nl` + `item_answer_variants`,
splitting `/` and `;` alternatives (shipped 2026-06-02, gated by CS19), then a narrow
fuzzy layer (1-char edits; substitutions excluded for `membeli`/`memberi`). The logic
is correct — but **2168 / 2430 items (89%) have zero accepted NL variants**, and only
**689 / 2430 (28%)** pack any `/` alternative in `translation_nl`. For the majority the
grader matches one gloss string, so correct synonyms/inflections/idioms fail.

The 2026-06-02 plan (`…paraphrase-acceptance.md:279-281`) explicitly deferred "B-2
synonym enrichment … generating additional synonyms for items that store only one
meaning … to a quality follow-on." **This is that follow-on.** The grader is untouched;
we fill the data it assumed.

## Grounding

- **`item_answer_variants` is the target-canonical, DB-authoritative home for accepted
  answers.** Target data model (`docs/plans/2026-05-21-data-model-target.md:92-93,603`)
  names it as the accepted-answer store; ADR 0011 puts it on the
  **DB-authoritative-after-seeding** side: seeded once, additive on re-run, corrections
  live in the DB via the flag→review loop, never overwritten by a routine publish. The
  runtime reads it via `fetchAnswerVariants` (`byKind/item.ts:104`); `acceptedVariantTexts`
  (`answerNormalization.ts:197-204`) filters `is_accepted` + `language` (the reader never
  branches on `variant_type`).
- **No pipeline writer exists** (grep of `scripts/` finds only the CS19 validator + the
  health-check read). The ~262 populated rows were written out-of-band, directly to the
  DB. This plan generalises that: a maintenance script, not a pipeline stage — the correct
  shape for a DB-authoritative surface (cf. `scripts/collections/seed-collection.ts` and
  `scripts/backfill-pos.ts` — established dry-run/apply maintenance scripts in the repo).
- **`translation_nl` stays a clean display gloss.** It is reused as the feedback-screen
  answer and the MCQ option label (`byKind/item.ts:36,90-92`, `resolveDistractorMaps`), so
  synonyms go to grading-only `item_answer_variants`, never packed into `translation_nl`.

## Goal

Every productive-recall / cloze item accepts the reasonable set of correct L1 answers
(synonyms, register variants, singular/plural + article forms, idiomatic paraphrases)
**without degrading the displayed gloss or MCQ options**, maintained the same way the
existing 262 rows are — directly in the DB-authoritative table.

## Design

### Part 1 — Enrichment seed script (the fix)

A standalone script — `scripts/enrich-answer-variants.ts`, dry-run/apply/JSON-report
(the established maintenance-script pattern: `scripts/backfill-pos.ts`,
`scripts/collections/seed-collection.ts`) — that:

1. **Reads the deduped `learning_items` catalog from the live DB** (active `word`/`phrase`
   items + `translation_nl`/`translation_en` + item_type). Reading the *already-deduped*
   catalog means there is **no per-occurrence union problem and no "author to
   context-independent meaning" footgun** — the item is global by construction.
2. **LLM authors, per item, an NL (and EN — O3) accepted-answer set** beyond the primary
   gloss: synonyms, register variants, singular/plural + with/without-article forms, short
   idiomatic paraphrases. Genuinely creative linguistic work → LLM is the right tool.
   **Conservative** (clear synonyms/inflections only, never near-miss confusables — the
   failure mode here is a *false-accept*, symmetric to the false-rejects it cures) and
   **reviewed** via the dry-run report before apply.
3. **Collision-drop, in-script.** A candidate equal to any of the item's selected
   distractors is dropped (a string that is a wrong MCQ option must not also grade
   correct). Distractors are resolved via the unified `distractors(capability_id, item_id)`
   pointer table (`byKind/item.ts:73-99`) — the script should **import and reuse the pure
   `resolveDistractorMaps`** rather than re-derive the logic (a second implementation could
   disagree): the item's capability IDs → `distractors` rows → the target item's
   `translation_nl`/`base_text` rendered per capability type, grouped under
   `learning_items.id`, before comparing. (One-directional — `item_answer_variants` is never
   a distractor source, so no reverse risk. The old `recognition_mcq_distractors` /
   `cued_recall_distractors` tables were retired, `migration.sql:2799-2800`.)
4. **Inserts directly into `item_answer_variants`** — `is_accepted=true`,
   `variant_type ∈ {'alternative_translation','informal'}` (reuse existing CHECK values;
   NEVER `'paraphrase'`; `'informal'` for register variants, `'alternative_translation'`
   otherwise), `variant_text` lowercase-trimmed — with
   `INSERT … ON CONFLICT (learning_item_id, variant_text, language) DO NOTHING`.

**Two phases — GENERATE (once, at authoring) vs APPLY (deterministic, re-runnable) —
must be split (R-1).** The LLM runs in a *generate* step that writes a **committed
artifact** (the reviewed candidate variant sets); the *apply* step reads that artifact and
does the collision-drop + insert. Apply/re-run must **never re-invoke the LLM** — re-running
generation on every rebuild fails the token-cost bar ("Tokens are complexity") and a
DB-authoritative surface must replay deterministically at zero token cost. This is the
established generate-once/commit/seed shape (`scripts/collections/`,
`morphology-roots`→`morphology-patterns`), not the cut pipeline mechanism; the committed
artifact is the *seed input*, not a second source of truth (the DB stays authoritative
after seeding, and additive `ON CONFLICT DO NOTHING` leaves DB-only corrections untouched).

**Maintenance:** re-run *apply* to cover new lessons (additive; existing rows and any
DB-authored `is_accepted=false` rejections are preserved by the conflict no-op). Corrections
are DB edits via the flag→review loop — never a staging edit, never a delete-sync. **After a
destructive `--regenerate <lesson>`** (ADR 0011's opt-out), that lesson's items get fresh
`learning_items.id`s and their variants cascade away — re-run *apply* for it (the Part-2
health metric self-surfaces the gap). Routine republish is id-stable
(`upsertLearningItemIdempotent` conflicts on `normalized_text`), so variants survive it.
This is the ADR 0011 regime used as intended.

### Part 2 — Coverage guard (health-check only)

A **warning metric in `scripts/check-supabase-deep.ts`** (not a pipeline gate — there is no
pipeline write to gate). One shared predicate, two shapes:

- **Thin-set:** productive-recall items whose total accepted set (primary + variants, after
  `splitAlternatives`) is a **single** L1 form → reported count.
- **Unfair-length:** items whose **shortest** accepted alternative is a phrase of ≥ N=4
  tokens → reported. Metric is the *shortest* alternative (`jalan="rijden/gaan/lopen"` is
  fair; `apa kabar="hoe gaat het ermee"` is not) — only ~4 items flag today
  (`harganya murah`, `saya pulang dulu`, `apa kabar`, `baik-baik saja`), hand-shortenable.

Warning-level, never a hard fail — this is content coverage, not structural breakage.

### Part 3 — Grader

Unchanged. Keep the substitution-exclusion, the `/`+`;` split, and CS19.

### Non-goal — learner-data repair

Do **not** retro-edit `capability_review_events` / `learner_capability_state` (precious,
gated). The pollution self-heals: once grading is fair, mis-scored leeches earn Good and
stability recovers in a few reviews. Un-stick specific leeches via the flag→review loop,
never raw SQL.

## Supabase Requirements

### Schema changes
- **One new unique index:** `CREATE UNIQUE INDEX IF NOT EXISTS
  item_answer_variants_item_text_lang_key ON indonesian.item_answer_variants
  (learning_item_id, variant_text, language)` in `scripts/migration.sql` (natively
  idempotent idiom; `ON CONFLICT (cols)` binds to it). `is_accepted` deliberately **out of
  the key** — so `ON CONFLICT DO NOTHING` no-ops against a pre-existing row regardless of
  its `is_accepted`, never resurrecting a DB-authored rejection as accepted.
- **No new tables or columns.** `variant_text/variant_type/language/is_accepted` already
  exist (`migration.sql:267-275`); reuses existing `variant_type` CHECK values.
- **Pre-flight before the index DDL:** run `GROUP BY (learning_item_id, variant_text,
  language) HAVING count(*) > 1` against live data — the ~262 out-of-band rows predate this
  key; an existing collision would fail index creation (loud; caught by
  `make migrate-idempotent-check`, cheaper to pre-check). Existing rows may be mixed-case;
  an optional one-off lowercase-trim normalize is build cleanup.
- Run `make migrate-idempotent-check` before merge. RLS/grants unchanged
  (`item_answer_variants_read` / `_admin_write` exist; the script writes service-role).

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage: N/A.

### Health check additions
- `check-supabase-deep.ts`: the Part 2 thin-set + unfair-length warning metric, sharing one
  predicate function between the two counts (no drift).

## Resolved decisions

- **Delivery:** direct DB seed script, not a pipeline path (staff-engineer). ✅
- **Channel:** `item_answer_variants`, grading-only; `translation_nl` stays clean. ✅
- **Idempotency:** additive `ON CONFLICT DO NOTHING` on the new unique index; `is_accepted`
  always true on insert, rejections stay DB-only. ✅
- **variant_type:** reuse `'alternative_translation'`/`'informal'`. ✅
- **Unfair-length N:** 4 tokens on the shortest alternative. ✅

Still open (minor):
- **O3 — EN scope:** recommend NL+EN in the same pass (same cost).

## Rollout

1. Land the unique index (+ pre-flight dup check) + the Part 2 health metric — deterministic,
   no content.
2. Run the enrichment script: dry-run → review the report → apply. Additive; re-runnable per
   new lessons. **Re-verify the 89% / 689 counts live at build time** so the coverage premise
   hasn't drifted.
3. No learner-data migration. Grading fairness improves immediately as rows land; FSRS
   pollution self-heals.
