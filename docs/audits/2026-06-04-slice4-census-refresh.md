---
date: 2026-06-04
doc_type: pre-drop-census-refresh
relates_to: Capability Stage Slice 4 (#102) — teardown + drop legacy tables (HITL)
refreshes: docs/audits/2026-05-25-pr7-pre-drop-audit.md
audited_against: main HEAD (Slices 1–3 merged: PR #121, #124, #133) + scripts/migration.sql + scripts/migrations/2026-04-25-capability-core.sql
note: >
  The 2026-05-25 census predates Capability-Stage Slices 1–3 and uses the old
  "PR 7" numbering. This addendum re-verifies every blocker it named against the
  code as it stands on 2026-06-04, records the deltas, and restates the Slice 4
  readiness verdict. The base census's per-table Check sections remain the
  reference for tables whose state did NOT change; this doc supersedes its
  verdicts only where a delta is recorded below.
---

# Slice 4 pre-drop census refresh — 2026-06-04

## Why this exists

The base census (`2026-05-25-pr7-pre-drop-audit.md`) was written **before** the
three Capability-Stage redesign slices merged:

- Slice 1 (#99) — item DB→DB spine + Capability Gate — PR #121 (2026-05-31)
- Slice 2 (#100) — pattern `source_kind` DB→DB grammar — PR #124 (2026-06-01)
- Slice 3 (#101) — dialogue_line cloze + affixed_form_pair DB→DB — PR #133 (2026-06-03)

Those slices moved **row data** for the typed kinds onto typed tables and stopped
some writers — but they did **not** retire the runtime *readers* of
`capability_artifacts`, and one `exercise_variants` *writer* is still
conditionally live. This refresh separates what actually cleared from what still
blocks.

---

## Deltas since 2026-05-25 (verified against code)

### CLEARED — blockers the base census named that no longer exist

| # | Base-census finding | Status now | Evidence (file:line) |
|---|---|---|---|
| D1 | `lesson_page_blocks` DEFER (table 13) — blocked by unstarted "PR 5" + 3 runtime readers + RPC | **RESOLVED — table dropped** | `migration.sql:1904` `drop table if exists indonesian.lesson_page_blocks cascade;` (PR 5, 2026-05-25). All `src/` references are now comments only (`adapter.ts:210`, `Session.tsx:44`, `Lessons.tsx:207`, `registry.tsx:86`). RPC re-anchored (`migration.sql:1703,1730`). |
| D2 | CC-4 — `publish-grammar-candidates.ts` active writer to `exercise_variants` + `item_context_grammar_patterns` | **RESOLVED — script deleted** | `scripts/publish-grammar-candidates.ts` no longer exists. No `insert/upsert` to `item_context_grammar_patterns` remains in `scripts/`. |
| D3 | `exercise_variants` runtime reader at `coverageService.ts:78` | **RESOLVED — read removed in Slice 2** | `coverageService.ts:10,68-69` ("exercise_variants is NO LONGER read here (Slice 2)"); current reads (`:40-96`) hit typed grammar tables, `item_contexts`, `grammar_patterns` — not `exercise_variants`. |
| D4 | `item_context_grammar_patterns` DEFER (table 7) — reader **and** active writer | **Writer cleared** (D2); only the admin-page reader remains | Sole remaining consumer: `coverageService.ts:90`. Co-edit on drop, no external blocker. |

### STILL BLOCKING — unchanged or newly-precise

| # | Table | Blocker (current) | Evidence (file:line) |
|---|---|---|---|
| B1 | `capability_artifacts` | **Live session-build reader** — feeds `validateCapability({…, artifacts})` readiness on the production `buildSession` path | `src/lib/session-builder/adapter.ts:283` (+ force-capability path `:365`) |
| B2 | `capability_artifacts` | **Live mastery-analytics reader** | `src/lib/mastery/masteryModel.ts:450` → `evidenceForCapabilities` (`:458`, called `:477,:490`) |
| B3 | `capability_artifacts` | `fetchArtifacts` still exported + reads the table | `src/lib/exercise-content/adapter.ts:316-324` |
| B4 | `capability_artifacts` | **Pipeline reader — runs at step 13 of every publish** | `scripts/promote-capabilities.ts:278` (invoked by `capability-stage/runner.ts`) |
| B5 | `capability_artifacts` | Release-readiness gate + stage self-verify still assert artifact rows | `scripts/check-capability-release-readiness.ts:192`; `capability-stage/verify/countParity.ts:79-81`, `verify/contentNonEmpty.ts:120-126` |
| B6 | `exercise_variants` | **Legacy grammar WRITE path still live for `!usePatternPath` lessons** (L5/7/8 + any lesson with no typed grammar categories) | Writer: `capability-stage/adapter.ts insertExerciseVariantGrammar`; called from `runner.ts:1014` step 10; gate `usePatternPath = patternDb.categories.length > 0` (`runner.ts:446`). **Dies in Slice 5**, not Slice 4. |
| B7 | `exercise_variants` | **CASCADE data-loss risk** — `exercise_review_comments.exercise_variant_id NOT NULL … ON DELETE CASCADE` | `migration.sql:818` (base census CC-3) |
| B8 | `exercise_variants` | HC + admin/build script consumers | `check-supabase-deep.ts:194`; `generate-exercise-audio.ts:287`; `check-vocab-coverage.ts:149`; `check-lesson-coverage.ts:74`; stage `adapter.ts:48 countExerciseVariantsForLesson`, `:1397` |
| B9 | (cross-cut) | `leaderboard` view STILL present — must drop before any user-state table; base census CC-2 unchanged | `migration.sql:277` `CREATE OR REPLACE VIEW indonesian.leaderboard` |

### NEW WRINKLE — schema drift the teardown must own

**W1 — `capability_artifacts` is not defined in the canonical schema file.**
Its `CREATE TABLE` lives only in the standalone paper-trail migration
`scripts/migrations/2026-04-25-capability-core.sql`; `scripts/migration.sql` holds
only the FK `ALTER` at `:2001-2005`. Per CLAUDE.md's migration source-of-truth
rule, the live DB was seeded from the consolidated file, so the table exists in
production but the canonical file never (re)declared it. **Consequence for Slice 4:**
the `drop table if exists indonesian.capability_artifacts cascade;` must be authored
into `scripts/migration.sql`, AND the orphaned `ALTER` block at `:2001-2005` removed
in the same change, then `make migrate-idempotent-check`. (Note also `migration.sql`
comments at `:2170,:2193,:2299,:2328` document the typed tables that *replaced*
artifact rows — useful provenance for the drop.)

---

## Updated drop-readiness table (Slice 4 candidates)

| Table | Base-census verdict | **Refreshed verdict (2026-06-04)** | What stands between us and the drop |
|---|---|---|---|
| `generated_exercise_candidates` | SAFE | **SAFE** (0 rows; `migration.sql:584`) | drop order before `textbook_pages`; FK `SET NULL` on `exercise_variants` |
| `textbook_pages` | SAFE | **SAFE** (0 rows; `:532`) | drop after `generated_exercise_candidates` |
| `textbook_sources` | SAFE | **SAFE** (0 rows; `:520`) | — |
| `review_events` | SAFE | **SAFE** (`:212`) | retire `check-supabase-deep.ts:36,56`; pre-drop `pg_dump` |
| `learner_skill_state` | SAFE | **SAFE** (`:191`) | retire `learnerStateService` methods + `apply_review_to_skill_state` RPC; HC grants |
| `item_meanings` | SAFE (1 co-edit) | **SAFE (1 co-edit)** (`:137`) | `coverageService.ts:89` still reads it → switch to `learning_items.translation_nl IS NOT NULL`; relabel `ExerciseCoverage.tsx` |
| `item_context_grammar_patterns` | DEFER | **NEAR-SAFE (1 co-edit)** — writer cleared (D2/D4) | only `coverageService.ts:90` reader → switch grammar-link Path A to `grammar_patterns.introduced_by_lesson_id` |
| `lesson_page_blocks` | DEFER | **ALREADY DROPPED** (D1) — remove from candidate list | n/a |
| **`capability_artifacts`** | DEFER | **DEFER — 5 live consumers, none retired** (B1–B5) + schema drift W1 | retire session-builder readiness read, mastery evidence read, `fetchArtifacts`, `promote-capabilities`, release-readiness gate + stage verify; author DROP into `migration.sql` (W1) |
| **`exercise_variants`** | DEFER | **DEFER — writer + CASCADE** (B6–B8); reader cleared (D3) | the legacy writer dies in **Slice 5** (B6) → Slice 4/5 sequencing decision; resolve `exercise_review_comments` FK fate (B7) |
| `lesson_progress` | DEFER | **DEFER (out of Slice 4 capability scope)** — user-state table; live Progress-page reader + `leaderboard` view + `get_lessons_overview` RPC | not a capability-stage table; own slice/PR |
| `learner_item_state` | DO NOT DROP | **DO NOT DROP** — live `useProgressData.ts:88` reader | needs FSRS-derived replacement metric (owner decision) |
| `capability_audio_refs` | DO NOT DROP | **DO NOT DROP** — design-intent, 0 rows; `migration.sql:2170` documents it as the artifact-audio replacement | drop only with a deliberate Decision-Q reversal |

---

## Slice 4 readiness verdict (refreshed)

**A clean single-PR teardown of the two flagship tables is still NOT safe.** But the
ground has shifted favourably:

1. **Safe-set is droppable now** — and is *larger* than the base census's 6: the
   original 6 (`generated_exercise_candidates`, `textbook_pages`, `textbook_sources`,
   `review_events`, `learner_skill_state`, `item_meanings`) **plus**
   `item_context_grammar_patterns` (writer cleared; one admin-page co-edit). This is
   the "Slice 4a" unit — mechanical drops + same-PR co-edits + `leaderboard`-view-first
   ordering for any user-state table.

2. **`capability_artifacts` is the real work.** Its drop is gated not by the
   migration but by **retiring two live runtime readers** — the session-build
   readiness path (B1) and the mastery-evidence path (B2) — plus the pipeline
   consumers (B4/B5). These were *out of scope* for Slices 1–3 (which only stopped
   *writing* typed-kind artifacts) and the original migration plan §10.6 never listed
   `masteryModel.ts` or the session-builder sites. Retiring B1 in particular changes
   `validateCapability`'s readiness logic — a behavioural change, not a mechanical drop.

3. **`exercise_variants` is sequencing-blocked on Slice 5.** Its remaining writer
   (B6) is the legacy grammar path that retires with the legacy-projection teardown
   (Slice 5). Slice 4 either (a) absorbs that writer-retirement, or (b) drops
   `exercise_variants` *after* Slice 5. Independently, the `exercise_review_comments`
   CASCADE (B7) needs an explicit fate decision (migrate FK to typed-table ids /
   archive + accept loss).

### Recommended Slice 4 shape

- **Slice 4a (unblocked, draftable now):** the safe-set above. Pure-legacy + empty
  tables; co-edits enumerated per row in the table; `leaderboard` view dropped first;
  `make migrate-idempotent-check` gate.
- **Slice 4b (`capability_artifacts`):** retire B1–B5 in the same PR, author the
  DROP into `scripts/migration.sql` + remove the orphan ALTER (W1), drop the table.
- **Slice 4c (`exercise_variants`):** sequence **after** Slice 5 (or fold the B6
  writer-retirement in), then resolve B7 and drop.

This mirrors the base census's 7a/7b split and matches issue #102's **HITL** tag —
the destructive flagship drops (4b/4c) need a human decision on reader-retirement
behaviour and the CASCADE fate; only 4a is mechanical.

---

## What to carry into the grilling session

- The safe-set vs flagship split is the **first design decision**, not the DROP SQL.
- `capability_artifacts` drop = a **reader-retirement** task (session-build readiness
  + mastery), which touches readiness semantics → **data-architect sign-off mandatory**.
- `exercise_variants` drop has a **Slice 4↔Slice 5 ordering** question and a
  **CASCADE data-loss** question — both must be answered before `status: approved`.
- W1 (canonical-schema drift for `capability_artifacts`) is a concrete migration task,
  not just prose.
