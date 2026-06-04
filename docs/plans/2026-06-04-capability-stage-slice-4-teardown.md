---
status: approved
approved_at: 2026-06-04
doc_type: capability-stage-slice-plan
issue: "#102"
parent_epic: "#98"
last_verified_against_code: 2026-06-04
reviewed_by:
  - "architect: APPROVED 2026-06-04 — M1 (target-arch :1462/:1502 contradiction acknowledged+struck), M2 (capabilityCatalog.ts:102/:113 writer enumerated), M3 (per-PR code-first deploy ordering) all resolved"
  - "data-architect: PASS 2026-06-04 — 3 MINOR resolved (MINOR-2 deferred to PR 4c per correct gate ordering); D3/D4/D6/W1 confirmed against code"
depends_on:
  - 2026-05-21-data-model-target.md   # approved; Decisions A/B/K
  - 2026-06-02-capability-stage-slice-3-dialogue-affixed-cloze.md
grounded_against:
  - docs/audits/2026-06-04-slice4-census-refresh.md
  - docs/target-architecture.md
---

# Capability Stage Redesign — Slice 4: teardown + drop legacy tables (HITL)

## Grounding (per CLAUDE.md plan-grounding rule)

- **`docs/target-architecture.md`** — `capability_artifacts` **is** listed in the "Things that explicitly stay" set (`:1462`: "The capability-related tables … `capability_artifacts` … central to the architecture") and in the standalone-fold backlog enumeration (`:1502`). **That line is superseded** by the approved `data-model-target.md` Decision A (`:865` — RETIRED) + Decision B (`exercise_variants` → 4 typed tables). To stop target-architecture contradicting the approved target, **4b/4c must strike `capability_artifacts` and `exercise_variants` from `:1462` and the `:1502` backlog list in the same PR as their drops** (leaving them is doc-drift). Rule #10 ("don't keep dead infrastructure on speculation") governs the drops. The full standalone-fold backlog item is the home of the W1 wrinkle below.
- **Census refresh** (`docs/audits/2026-06-04-slice4-census-refresh.md`) is the live-verified blocker map this plan executes against.
- **No new module / no fold** — this is a teardown of retired surfaces, not a relocation.

## Goal

Complete the subtractive half of epic #98: drop the legacy `capability_artifacts` and `exercise_variants` tables plus the capability-layer safe-set, after retiring their consumers. Shipped as **three independently-reversible PRs** (HITL — destructive, runs `make migrate` against the live homelab DB).

**Out of scope (filed/owned elsewhere):**
- Legacy SM-2 learner-state teardown (`learner_item_state`, `learner_skill_state`, `review_events`, `lesson_progress`, leaderboard rewrite) → **#150** (Decision L/M). Different subsystem; carries unmade product decisions. Not a child of #98.
- The global no-disk gate + legacy-projection regeneration retirement → **Slice 5 (#147)**.
- The full standalone-schema → `migration.sql` fold → target-architecture backlog (this plan authors only the two DROPs it needs).
- `capability_audio_refs` / Decision Q stays (design-intent, 0 rows; DO NOT DROP).

## Decisions resolved (grilling 2026-06-04)

| # | Decision | Basis |
|---|---|---|
| D1 | **Three gated PRs**: 4a safe-set (now) → 4b `capability_artifacts` (now) → 4c `exercise_variants` (after #147). | Each independently reversible; only 4c's *writer* is Slice-5-gated. |
| D2 | **Slice 4 = capability-layer only.** SM-2 user-state → #150. | Subsystem coherence; SM-2 carries user-facing metric decisions + a live Progress reader. |
| D3 | **4b reader-retirement is behavioural-in-principle but inert-in-practice.** Move readiness/mastery off `required_artifacts` (Decision A: typed-table existence is the contract). | Verified live 2026-06-04: 4,057 live caps all `ready`; 3,699 carry non-empty `required_artifacts` and **0** lack their approved artifacts → **0 readiness flips**. |
| D4 | **`required_artifacts` retired by code-ignore + column drop**, not SQL backfill. | The readers compute readiness from the cap's column ∪ contract; making both empty is a code change. No content backfill (ADR 0011 — caps are DB-authoritative; a normalising UPDATE is avoidable). |
| D5 | **4b retires the residual `capability_artifacts` writer** (audio/non-item assets) by deleting the artifact-upsert step — NOT by wiring Decision Q. | Audio resolves at render time via the `get_audio_clips` RPC; nothing reads the audio artifacts. Avoids building speculative Decision-Q infra during a teardown. |
| D6 | **`exercise_review_comments` CASCADE is already resolved** — no decision. | Slice 2 Task 8 dropped the FK (`migration.sql:874-884`, name-agnostic DO block, applied live). Dropping `exercise_variants` will not cascade-delete comments. |

---

## PR 4a — capability-layer safe-set (unblocked, mechanical)

**Drop these tables** (live state 2026-06-04):

| Table | Rows | Pre-drop co-edit (same PR) |
|---|---|---|
| `item_meanings` | 1,248 | `coverageService.ts:89` → switch `hasMeanings` to `learning_items.translation_nl IS NOT NULL`; relabel `ExerciseCoverage.tsx`. (Decision R columns already live.) |
| `item_context_grammar_patterns` | 0 | `coverageService.ts:90` → grammar-link Path A → `grammar_patterns.introduced_by_lesson_id` (already Path C). Writer already gone (publish-grammar-candidates deleted, Slice 2). |
| `generated_exercise_candidates` | 0 | none. `exercise_variants.source_candidate_id` FK is `ON DELETE SET NULL` (safe); drop this BEFORE `textbook_pages`. |
| `textbook_pages` | 0 | none (FK to `textbook_sources`). |
| `textbook_sources` | 0 | none. |
| `lesson_blocks` | 0 | none (Decision K, added 2026-06-04 — orphan empty of dead Decision C). |
| `lesson_block_reading_section` | 0 | none (drop before `lesson_blocks`). |

**Drop order** (FK-safe): `generated_exercise_candidates` → `textbook_pages` → `textbook_sources`; `lesson_block_reading_section` → `lesson_blocks`; `item_context_grammar_patterns`; `item_meanings`.

**Not touched by 4a:** the `leaderboard` view (reads `learner_item_state`/`lesson_progress`, neither dropped here — that's #150). No view/RPC references any 4a table.

**Tasks:** co-edits above → `drop table if exists indonesian.<t>;` in `migration.sql` (no CASCADE needed — verified no inbound FK except the SET-NULL one) → remove CREATE/ALTER/RLS/GRANT/index blocks for each → `make migrate-idempotent-check` → `make pre-deploy`. Pre-drop `pg_dump` archive of any non-empty table (`item_meanings`).

---

## PR 4b — drop `capability_artifacts` (10,222 rows; unblocked, behavioural-but-inert)

The headline of Decision A. Three retirements before the drop, then the drop.

### 4b.1 — Retire the `required_artifacts` dependency (D3/D4)
- **Stop reading** (readiness becomes "contract has a compatible exercise for cap_type+sourceKind"):
  - `src/lib/session-builder/adapter.ts:137` (`requiredArtifacts: row.required_artifacts ?? []`) → drop the field from the projection; `capabilityContracts.ts:51` `validateCapability` no longer unions `capability.requiredArtifacts` (it is already `[]` from every render contract — `renderContracts.ts:56-157`). Delete the `artifacts`/`ArtifactIndex` parameter + `buildArtifactIndex` (`adapter.ts:183,289,365`) + the `capability_artifacts` read.
  - `src/lib/mastery/masteryModel.ts:147` (`requiredArtifacts(row)`) + `:194-195` predicate → the artifact-satisfaction check becomes vacuous; remove it + the `artifacts()` reader (`:448`) + `evidenceForCapabilities`'s artifact arm.
  - `src/lib/exercise-content/adapter.ts:316-324` `fetchArtifacts` → delete (only caller is the mastery path).
- **Stop writing**: `scripts/lib/pipeline/capability-stage/adapter.ts:140` + `:1303` (`required_artifacts: capability.requiredArtifacts`) → stop writing the column; drop `requiredArtifacts` from the projector output. **The literals themselves originate in `src/lib/capabilities/capabilityCatalog.ts:102` (`audio_recognition` → `['audio_clip','meaning:l1']`) + `:113` (`dictation` → `['audio_clip','base_text','accepted_answers:id']`)** — the catalog is the writer of the retired readiness semantics. Zero these (`requiredArtifacts: []`) or remove the field; they become inert once the union collapses to the contract side (all `[]`). This is the one un-obvious source-of-truth for the dying contract — enumerated here so the retirement is complete.
- **Drop the column**: `learning_capabilities.required_artifacts` in `migration.sql`. (Verify `artifact_fingerprint` location at build — if a `learning_capabilities.artifact_fingerprint` column exists per Decision A, retire it here; the `capability_artifacts.artifact_fingerprint` column dies with the table.)

### 4b.2 — Retire the residual `capability_artifacts` writer (D5)
- `scripts/lib/pipeline/capability-stage/runner.ts:883-890` (`artifactInputs` build for non-item assets) + `:962` `upsertCapabilityArtifacts` call → delete. `upsertCapabilityArtifacts` (`adapter.ts`) + `CapabilityArtifactInput` → delete.
- **Build-time confirmation (data-architect gate):** prove no runtime audio path reads `capability_artifacts` — audio resolves via `get_audio_clips` RPC (`audioService.ts:50`). Before deleting the writer, run a concrete census of what still flows through it: `select distinct artifact_kind, count(*) from indonesian.capability_artifacts where capability_id in (select id from indonesian.learning_capabilities where source_kind <> 'item') group by 1;` — name the surviving `artifact_kind`s so the deletion's blast radius is explicit, not asserted.
- **Retire ALL pipeline + diagnostic consumers (completeness — enumerate-consumers rule):** `scripts/promote-capabilities.ts:278` (promotion validation → switch to typed-table existence or drop the artifact arm), `scripts/check-capability-release-readiness.ts:192`, the stage self-verify (`verify/countParity.ts:79-81`, `verify/contentNonEmpty.ts:120-126`), **`scripts/check-capability-health.ts:523`** (chunked reader → `loadStagedContentSnapshot`), and **`scripts/check-lesson-coverage.ts:66`** (count-only). The one-shot bridge scripts `migrate-typed-tables-pr2-dialogue.ts:180` + `migrate-typed-tables-pr3-affixed-form-pair.ts:137` read it too — already-run; note "keep as audit trail (reads 404 post-drop)" or delete. Remove the `capability_artifacts` assertions from each.

### 4b.3 — Drop the table + the W1 wrinkle
- `capability_artifacts`'s `CREATE TABLE` lives only in `scripts/migrations/2026-04-25-capability-core.sql` (paper-trail, not applied by `make migrate`); `migration.sql` holds only the FK `ALTER` at `:2001-2005`. **Author `drop table if exists indonesian.capability_artifacts cascade;` into `migration.sql`** AND remove the orphan ALTER block at `:2001-2005`. (Full standalone-fold stays a backlog item.)
- Retire `src/lib/capabilities/artifactRegistry.ts`, `ArtifactKind`/`ArtifactIndex`/`CapabilityArtifact` types, and `check-supabase-deep.ts` artifact references. Deleting `fetchArtifacts` (`exercise-content/adapter.ts:318`, zero runtime callers) requires updating its enforcement test (`noLegacyItemReader.test.ts` references it as a positive control).
- **Amend `docs/target-architecture.md` in this PR (M1):** strike `capability_artifacts` from the "Things that explicitly stay" line (`:1462`) and from the standalone-fold backlog enumeration (`:1502`).

### 4b.4 — Parity guard (THREE explicit layers, per [[project_three_layer_invariant_gates]])
The inert-change proof must be all three gates in this PR, not one:
1. **Shared helper + unit test:** `validateCapability({ capability: { requiredArtifacts: [] }, artifacts: emptyIndex })` returns `ready` (not `blocked`) for a cap whose render-contract `requiredArtifacts` is `[]`.
2. **Capability Gate assertion (pre-write/stage):** the gate asserts that, with an empty artifact index, every cap with an empty contract validates `ready` — so the stage can't regress readiness off the artifact bag.
3. **Live-DB health check (pre + post deploy):** `check-supabase-deep` counts `readiness_status='ready'` caps before and after deploy and asserts no decrease. Catches any cap whose readiness silently depended on an artifact.

---

## PR 4c — drop `exercise_variants` (716 rows; GATED ON Slice 5 #147)

**Gate:** #147 retires the legacy grammar **writer** (`runner.ts:1014` step 10, `!usePatternPath`). Until then a re-publish of an `!usePatternPath` lesson re-creates rows. 4c lands after #147 (or folds the writer-retirement in, if #147 slips).

**When unblocked:**
- Remaining reads/writes to retire: `adapter.ts:707/920/956/1397` (stage), `check-supabase-deep.ts:194` (HC), `generate-exercise-audio.ts:287`, `check-vocab-coverage.ts:149`, `check-lesson-coverage.ts:74` (admin/build scripts). Runtime + admin review (`coverageService`, `exerciseReviewService`) are already off it (Slice 2/4a).
- **No CASCADE risk** (D6): the `exercise_review_comments → exercise_variants` FK is already dropped (`migration.sql:874-884`). Re-confirm at build via a `pg_constraint` check. **But the `CREATE TABLE IF NOT EXISTS exercise_review_comments` DDL at `migration.sql:818` still declares `exercise_variant_id uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE` inline** — on a fresh DB after 4c drops `exercise_variants`, that CREATE would fail. **Replace `:818` with bare `exercise_variant_id uuid NOT NULL` + a comment** noting the FK was intentionally dropped (Slice 2). The column is retained (holds typed-row ids; app resolves across the 4 typed tables); optionally rename for clarity (cosmetic, non-blocking).
- `exercise_variants.source_candidate_id` FK target (`generated_exercise_candidates`) is already dropped in 4a (SET NULL) — no issue.
- Author `drop table if exists indonesian.exercise_variants;` into `migration.sql`; remove its CREATE/ALTER/index/RLS/GRANT blocks; retire `migrate-typed-tables-pr4-grammar.ts` (already-run bridge) or keep as audit trail. Add a HC against the 4 typed tables to replace HC at `:194`.

---

## Supabase Requirements

### Schema changes
- **Drops (4a):** `item_meanings`, `item_context_grammar_patterns`, `generated_exercise_candidates`, `textbook_pages`, `textbook_sources`, `lesson_blocks`, `lesson_block_reading_section`.
- **Drops (4b):** `capability_artifacts`; column `learning_capabilities.required_artifacts` (+ `artifact_fingerprint` if present on `learning_capabilities`).
- **Drops (4c, post-#147):** `exercise_variants`.
- All authored into `scripts/migration.sql` (canonical). `capability_artifacts` DROP + removal of the orphan ALTER `:2001-2005` (W1). RLS policies — N/A (only drops). Grants — removed with each table.

### homelab-configs changes
- [ ] PostgREST: none (no new schema exposure). N/A.
- [ ] Kong: none. N/A.
- [ ] GoTrue: none. N/A.
- [ ] Storage: none. N/A.

### Health check additions
- `check-supabase.ts`: N/A (no new functional surface).
- `check-supabase-deep.ts`: **remove** monitored-table/grant entries for every dropped table (`item_meanings`, `capability_artifacts`, `exercise_variants`, …); add the 4b parity check + the 4c typed-table HC replacing the `exercise_variants` HC.

## Deploy ordering (per-PR, not constant — M3)
Each PR mixes a code change with a destructive migrate; old deployed code reading a dropped table = the 2026-05-02/PR-1 outage shape. So:
- **4a — code-first:** deploy the `coverageService.ts` co-edit (item_meanings → `translation_nl`; grammar-link Path A → `introduced_by_lesson_id`) BEFORE `make migrate` drops the tables.
- **4b — code-first:** deploy the reader retirements (session-builder, mastery, fetchArtifacts removal) BEFORE dropping `capability_artifacts` + the `required_artifacts` column.
- **4c — code-first, after #147:** deploy the remaining reader/HC retirements, then drop `exercise_variants`.

## Gates & acceptance
- Per PR: `make migrate-idempotent-check` green, `make pre-deploy` green, app verified (lessons render, sessions build, reviews commit, Progress/Coverage admin pages load).
- **W1 acceptance:** with the `capability_artifacts` DROP authored + the orphan ALTER (`:2001-2005`) removed, `make migrate-idempotent-check` stays green (run-2 is a no-op via `if exists`); confirm the residual `migration.sql` references at `:2170/:2193/:2299/:2328` are comments only (no live DDL touches the dropped table).
- 4b: the three-layer parity guard (4b.4) proves 0 readiness flips, pre- and post-deploy; a real session still renders + commits (`capability_review_events` row).
- HITL: each destructive `make migrate` is operator-run with drop-risk acceptance; pre-drop `pg_dump` archive of any non-empty dropped table.

## Risks
- **R1 — a cap silently depends on an artifact for readiness.** Mitigated by the 4b.4 parity guard (verified 0 today; guard catches regressions). 
- **R2 — the audio-artifact writer deletion breaks audio.** Mitigated by D5's build-time confirmation that audio resolves via `get_audio_clips`, not artifacts.
- **R3 — 4c ships before #147 and a re-publish re-creates `exercise_variants` rows.** Mitigated by the explicit Slice-5 gate on 4c.
- **R4 — bulk-drop idempotency regression** (the 2026-05-02/05-08 class). Mitigated by `make migrate-idempotent-check` per PR + per-table explicit `drop ... if exists`.
