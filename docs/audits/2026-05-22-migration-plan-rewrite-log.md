---
doc_type: rewrite-log
date: 2026-05-22
subject: docs/plans/2026-05-22-data-model-migration.md
rewrite_reason: prior plan used SQL-backfill + in-place destructive drop shape; project uses pipeline-as-writer model
---

# Migration plan rewrite log — 2026-05-22

## Why the rewrite

The prior plan (1,537 lines) treated the database as the source of truth and applied standard production-DB migration discipline: preserve rows, ALTER + BACKFILL + DROP, shadow-run phases for safety. That discipline is correct for systems where the DB *is* the source of truth.

This project's content-layer DB is a **projection** of canonical staging files (`scripts/data/staging/lesson-N/` + `scripts/data/lessons.ts`). The authoritative writer is the pipeline (`bun scripts/publish-approved-content.ts <N>` — Stage A + Stage B). The DB content is fully regenerable on demand. Using SQL-level backfills (`UPDATE learning_items SET translation_nl = (SELECT ... FROM item_meanings ...)`) is never necessary — the pipeline populates new columns when it next runs.

The user identified this misconception on first read and had to correct it twice before the rewrite was commissioned. The correction is codified in the revised plan's §1 ("§1. Fundamental model: the DB is a projection").

## What changed

| Dimension | Prior plan | Revised plan |
|---|---|---|
| **PR count** | 17 (8 capability phases + 5 lesson phases + 3 misc + PR 0) | 8 (PR 0 foundation + 4 source_kinds + 2 Stage A + 1 final cleanup) |
| **SQL backfills** | Present in PR 0 (prerequisite_keys), PR 1.1 (translation_nl/en), PR 1.2 (NOT NULL constraint step), PR 3.5 (lesson_speakers), PR 8 (content_units.lesson_id) | None. Re-publish is the writer for all content tables. |
| **Shadow-run phases** | 3 phases (N.1 writer / N.2 reader / N.3 cleanup) × 4 source_kinds = 12 PRs | 1 PR per source_kind: writer + reader + re-publish in the same PR. Old artifact writes removed in the same commit. |
| **Destructive drops** | Distributed across 12 capability PRs + 3 lesson PRs | All drops consolidated in PR 7 (final cleanup). PRs 0–6 are additive only. |
| **pg_dump archive requirement** | Required before each cleanup phase (12 times) | Required once, before PR 7. Content tables are regenerable; no archive needed for them. |
| **Dual-write window** | Projector wrote old capability_artifacts AND new typed rows simultaneously across a 3-PR window | No dual-write. Old writes removed in same PR as new writes. Re-publish populates new tables. |
| **Line count** | 1,537 | 818 |

## What stayed

- The 7 pipeline gates (G1–G7) — verification structure unchanged.
- Tracer-bullet ordering: item → dialogue_line → affixed_form_pair → pattern.
- Per-PR writer/reader/validator triangle as a required artifact.
- The `?force_capability` bypass as the G7 mechanism (built in PR 0, commit `8ab22f3`).
- Deterministic bypass-driven G7 check (decision Q4 — no 48h wait).
- Fail-loud reader rule (§1.5 in revised plan).
- No-orphan invariant + `check-supabase-deep` pattern (§1.7).
- All schema decisions from `docs/plans/2026-05-21-data-model-target.md` — unchanged.
- The 6 existing commits on `pr-0-data-model-migration` stand as-is.

## Capability ID stability finding

**Question:** does `learning_capabilities.id` (UUID) stay stable across re-publishes, or does upsert regenerate IDs? This determines whether `learner_capability_state` and `capability_review_events` survive the migration unchanged.

**Finding (`scripts/lib/pipeline/capability-stage/adapter.ts:116-146`):** `upsertCapabilities` upserts on `onConflict: 'canonical_key'` and returns the existing `id` from the SELECT. The UUID is assigned once on INSERT and never changes on subsequent upserts. Re-publish updates the row in place.

**Consequence:** all learner state referencing `learning_capabilities.id` survives the migration without any bridge step. No `canonical_key` re-bridging PR is needed.
