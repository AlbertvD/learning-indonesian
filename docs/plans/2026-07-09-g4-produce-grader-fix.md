---
status: approved
program: docs/research/2026-07-06-grammar-teaching-review.md (finding F4, ranked idea 4)
reviewed_by: [staff-engineer, architect, data-architect]
approved_at: 2026-07-09
---

# G4 — fix the grammar produce grader (acceptable_answers false negatives)

## 1. Problem (verified 2026-07-06/09)

The grammar produce exercises grade free-typed sentences against sparse authored
lists: `sentence_transformation_exercises.acceptable_answers text[]` (761 rows) and
`constrained_translation_exercises` (955 rows), avg ~1.9 answers each. The fuzzy
layer short-circuits at length-diff >1 (`answerNormalization.ts:25,46`), so grading
is effectively exact-match against ~2 strings. Valid alternative transformations /
translations are marked wrong — on the *hardest* exercises — poisoning trust and
FSRS state. Same bug class as the shipped vocab thin-variants fix (v4,
`scripts/enrich-answer-variants.ts`, verified applied 2026-07-09); this is its
grammar twin (grammar review F4). 4 of the owner's in-app flags are this bug.

Additionally, the Spreektaal core spec (`2026-07-09-spreektaal-lesson-woven-core.md`)
promises colloquial answers are never marked wrong — a produce answer containing
*nggak* for *tidak* must pass. Enumerating colloquial combinations by hand explodes
(a sentence with *tidak+sudah+saja* has 8 variants), so colloquial acceptance here
must be derived, not authored.

## 2. The unmade design decision, now made (recommendation)

From the 2026-07-05 exercise-quality pass, three options were open for
`transform_sentence`: (a) restructure content toward single-element answers,
(b) LLM-grade free sentences, (c) broaden fuzzy matching (rejected — false accepts).

**Decision this spec proposes: (a)+(enrichment), no grader logic change.**

1. **Audit + restructure the outliers (small, targeted).** Deterministic audit
   script classifies each of the 1,716 exercises by answer-freedom. **Classifier
   rule (architect r2 W1 — stated so the classification is reviewable, since the
   "majority are single-element" premise is load-bearing):** compute the
   token-level edit footprint between the exercise's source/prompt sentence and
   the canonical answer; **single-element** = the transformation is one contiguous
   edit span (one insertion/replacement/deletion region — e.g. insert *sedang*,
   swap one verb form), where exact grading is fair; everything else
   (multi-span edits, reorderings, translations with >1 free lexical choice) is
   **multi-answer/free** — the false-negative surface and the enrichment
   universe. The classification report is committed as an artifact (step 1) and
   human-reviewed before anything downstream consumes it. Only the free outliers
   whose answers can't be enumerated get content restructuring (tighter prompt or
   cloze-style constraint), via the flag→review loop. No blanket rewrite.
2. **Enrich `acceptable_answers` for the multi-answer universe** with a
   generate/apply split, exactly the v4 shape the architect mandated there
   (generate = LLM once → committed artifact under `scripts/data/`; apply =
   deterministic, re-runnable, never re-invokes the LLM). This is a **new sibling
   maintenance script** — `scripts/enrich-grammar-acceptable-answers.ts` — not an
   extension of `enrich-answer-variants.ts` (different tables). Conservative
   expansion: attested word-order permutations, optional-particle presence, clitic
   alternates — reviewed before apply. Direct-DB seed is correct here for the same
   ADR-0011 reason as v4: these tables are DB-authoritative content; routine
   publish does not overwrite. **Apply semantics (data-architect r2 MAJOR —
   `text[]` has no per-element uniqueness, so nothing is idempotent for free):
   apply always computes the FULL target set** (canonical ∪ generate artifact ∪
   register expansion from §2.3) **and performs a value-guarded
   `UPDATE … SET acceptable_answers = <computed>`** (skip when already equal) —
   never an append; re-runs are exact no-ops by construction.
3. **Colloquial acceptance is derived at apply time, not authored:** the apply pass
   expands each accepted answer with register substitutions from the shared
   `scripts/data/register-pairs.ts` artifact (Spreektaal spec §3.1) — token-level
   formal→informal substitution over the closed pair list. Expansion is the FULL
   combination set when an answer contains ≤3 substitutable tokens (≤8 combos —
   covers virtually all rows; staff-engineer r1 closed the mixed-register hole a
   substitute-all+each-singly cap would leave); above 3 tokens it falls back to
   substitute-all + substitute-each-singly and the residual mixed-register
   rejections are accepted flag→review territory (stated, not silent). Data-side
   expansion keeps the grader untouched — the deliberately narrow matcher
   (substitution-exclusion for *membeli/memberi*) stays exactly as shipped.
   Alternative considered: runtime colloquial→baku normalization in
   `answerNormalization.ts` — one function covering all future content, but it
   changes sensitive grader code and needs a bypass for future register-transform
   exercises (Spreektaal slice 4) where register IS the tested thing. Data-side
   expansion has neither problem; re-running apply after new content is the
   already-accepted maintenance cost of the v4 groove. Staff-engineer to adjudicate
   if this trade reads wrong.

## 3. Grounding

- `docs/target-architecture.md` — no runtime module is touched (data-only; the one
  candidate runtime change, grader normalization, is explicitly declined in §2.3).
  No constraints found for the maintenance-script surface (`scripts/`).
- ADR 0011 / v4 precedent: `project_grader_thin_variants_false_negatives` — the
  pipeline-carrier version of this exact fix was ruled over-engineered for
  DB-authoritative-after-seeding tables; this spec starts from the v4 shape.
- Learner data: NOT touched. False-lapse pollution self-heals as grading becomes
  fair (same call as v4); stuck leeches via the flag→review loop, never SQL.

## 4. Supabase Requirements

### Schema changes
- None. `acceptable_answers text[]` columns exist on both exercise tables.

### homelab-configs changes
- [ ] PostgREST / Kong / GoTrue / Storage: N/A — no schema, auth, or transport change.

### Health check additions
- `check-supabase-deep.ts`:
  1. Thin-set guard **scoped to the audit-classified multi-answer universe**
     (architect r2 W2 — the single-element majority legitimately sits at length 1
     forever; an unscoped guard is permanently red): for exercise ids the
     committed audit artifact classifies multi-answer, flag
     `array_length(acceptable_answers,1) < 2` after apply.
  2. Register-expansion predicate, concrete (data-architect r2, HC35-style named
     predicate): for every active produce exercise whose canonical answer contains
     a formal token from `register-pairs.ts`, assert the informal-substituted form
     is present in `acceptable_answers`.

## 5. Build order

1. Audit script + classification report (deterministic, read-only) — decides the
   restructure list and the enrichment universe. Committed as an artifact.
2. Generate pass (LLM once) → reviewed candidate artifact.
3. Apply pass (idempotent seed incl. register expansion; depends on
   `register-pairs.ts` landing via the Spreektaal spec step 2) + health checks.
4. Restructure the audited outliers via flag→review.

## 6. Out of scope

Grader logic changes (incl. colloquial normalization), LLM runtime grading (grammar
review idea 6, Phase-2), new produce content, retro-editing learner state,
`transform_sentence` UI changes.
