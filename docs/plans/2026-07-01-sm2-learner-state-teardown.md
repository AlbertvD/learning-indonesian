---
status: shipped
approved_at: 2026-07-01
implementation: PR #328
merged_at: 2026-07-01
implementation_paths:
  - scripts/migration.sql
  - scripts/check-supabase-deep.ts
  - scripts/lib/pipeline/capability-stage/adapter.ts
  - src/services/lessonService.ts
doc_type: schema-teardown-plan
issue: "#150"
parent_epic: "#98"
last_verified_against_code: 2026-07-01
reviewed_by:
  - "architect: APPROVED-WITH-CHANGES 2026-07-01 — single-PR collapse, #212 churn fold, and backfill removal all sound; 1 required change folded (Step 3 review_events DDL enumeration extended to :904-909, :968-976, :1237-1238)."
  - "data-architect: PASS-WITH-CHANGES 2026-07-01 — CASCADE/idempotency sound; 3 changes folded: F1 live review_events pre-clear .delete() in adapter.ts:819-828 + its test mocks retired (census 'writers' corrected), F2 the 3 missed review_events ALTERs enumerated, F3 the retire-source-progress test:51-56 removed. F4 comment trim (:49) folded."
depends_on:
  - 2026-05-21-data-model-target.md            # Decisions L + M (superseded proposal; re-derived below)
  - 2026-06-04-capability-stage-slice-4-teardown.md  # sibling teardown; split #150 out of scope
grounded_against:
  - live DB census 2026-07-01 (this document, § Census)
  - docs/target-architecture.md
supersedes: []
---

# SM-2 / learner-state teardown — drop the legacy scheduler tables (#150)

> **What this is.** Epic-#98's final teardown: drop the pre-capability SM-2 /
> learner-state tables that the capability model (ADR 0001–0004) and the two-axis
> analytics redesign (#206–#229) replaced. Split OUT of Slice-4 (PR #327) because
> it is a different subsystem. **Re-derived against current `main` + the live DB
> on 2026-07-01** — the June-4 scope (Decisions L + M) is 4 weeks stale and the
> analytics redesign already moved this subsystem.

## Census — live DB + current `main`, 2026-07-01

Verified by read-only SQL against the live homelab DB (OpenBrain SQL bridge) and
by reading current `main` (HEAD `f3fb3e93`). **The June-4 scope named 5 surfaces;
2 are already dropped live** — same shape as Slice-4c (8 of 11 already done).

| June-4 unit (Decisions L + M) | Live DB (2026-07-01) | Consumers on `main` | Verdict |
|---|---|---|---|
| `learner_item_state` | **ABSENT** — dropped by analytics redesign #212 | migration.sql still CREATEs (`:278`) → drops (`:3651`); leaderboard view reads it (`:407`) | already dropped live; dead create-then-drop churn remains |
| `leaderboard` (view) | **ABSENT** — decommissioned #212 (`analytics.md:30`) | migration.sql still CREATEs (`:396`) → drops (`:3650`); GRANT `:450` | already dropped live; Decision L's "rewrite" is moot |
| `learner_skill_state` | **LIVE — 737 rows, last write 2026-05-01** | **0 live app readers/writers.** `scripts/repair-stability.ts` (dead one-off, no CI wiring); migration.sql DDL/CHECK; `check-supabase-deep` set; docs | **DROP** |
| `review_events` | **LIVE — 2,695 rows, last write 2026-05-01** | **0 live app readers** (`masteryModel.ts:1106` = `capability_review_events`, substring false-positive). **1 live pipeline *writer*** — a pre-clear `.delete()` at `capability-stage/adapter.ts:821` (`deleteLegacyPatternsForLesson`), fires on every publish that retires a grammar pattern (data-architect F1); becomes unnecessary once the table's FK + `source_check` drop with it. Plus migration.sql DDL/CHECK/FK; `check-supabase-deep`; docs | **DROP** |
| `lesson_progress` | **LIVE — 14 rows, last write 2026-04-16** | **0 live readers** — `get_lessons_overview` union already dropped (comment-only match); `lessonService.getUserLessonProgress` is a **dead uncalled method**; backfill `:2028-2031` (one-time, already applied) | **DROP** |

### Drop-safety (live-verified)
- **No table FKs *into* the three.** All 8 FKs on these tables point *outward*
  (→ `auth.users`, `learning_items`, `learning_sessions`, `grammar_patterns`,
  `lessons`). Dropping cascades **nothing** into any surviving user-state table.
- **0 views**, **1 function** reference them — `get_lessons_overview`, and its
  `lesson_progress` match is a **comment** (the union was dropped 2026-06-09;
  `is_activated` = pure `learner_lesson_activation` EXISTS). No live RPC reads any.
- **0 live app writers.** `progressService.markLessonComplete` and
  `learnerStateService.upsertItemState` are already absent from `src/`. **One
  pipeline writer** to `review_events` remains — the pre-clear `.delete()` at
  `capability-stage/adapter.ts:821`, retired in Step 1 (data-architect F1); it
  guarded a FK/`source_check` interaction that vanishes with the table.
- **0 runtime `src/` readers.** The only app method touching any of the three —
  `lessonService.getUserLessonProgress` — has **no caller** (repo-wide grep: only
  its own definition + comments + a test-file note).

### The "unmade product decisions" — all resolved by prior work, none open
The scope note flagged three. Every one was closed by the analytics redesign:
1. **`learner_item_state` → FSRS-derived replacement for the Progress page** —
   resolved by #212. Table already gone; no `src/` reader survives; the mastery
   path sources from `capability_review_events` + `learner_capability_state`.
2. **`leaderboard` rewrite vs decommission** — resolved: **decommissioned**, not
   rewritten (`analytics.md:30`). Decision L's rewrite is moot.
3. **`lesson_progress` live readers (Progress + `get_lessons_overview`)** —
   resolved: RPC union already dropped; `getUserLessonProgress` is dead-uncalled.
   Decision M's "the fallback can be removed" — it already was.

**No product decision blocks the drop.** The three tables are cold, inert,
disposable single-learner test data (CLAUDE.md Operating Context).

### Scope decision (user, 2026-07-01)
**Fold in the #212 create-then-drop churn cleanup.** #150 also excises the dead
`learner_item_state` + `leaderboard` CREATE blocks and their bottom drops, so
migration.sql never mentions the two already-dropped surfaces (Slice-4c
`artifact_fingerprint`-strip precedent: a CREATE block is *target state*, never
create-then-dropped). Same `migrate-idempotent-check` gate covers it.

## Plan — single PR

Per Minimum Mechanism + the Slice-4c precedent (3 gated PRs collapsed to 1 once
inert): all three tables are fully inert with no cross-dependency and **no runtime
deploy-ordering hazard** (no deployed-app reader, no view/RPC reader), so the
June-4 multi-step structure collapses to one PR. Branch off `main`.

### Step 1 — Retire dead consumers (code-first; verified inert above)
| Consumer | File | Action |
|---|---|---|
| **Live pipeline writer (data-architect F1)** | `capability-stage/adapter.ts:787-795` (LEGACY docstring) + `:819-828` (the `review_events` pre-clear `.delete()` block) | **delete both.** The pre-clear existed only to satisfy `review_events`'s `ON DELETE SET NULL` FK + `review_events_source_check` when retiring a grammar pattern; both drop with the table, so the step is broken *and* unnecessary post-drop. Also strip its test mocks: `__tests__/adapter.grammarExercises.test.ts` (`reviewEventsCleared` tracking `:113`/`:122`/`:201-202`) + `__tests__/patternPath.test.ts:57-58` (`review_events` mock arm). |
| Dead maintenance script | `scripts/repair-stability.ts` | **delete** (reads+writes `learner_skill_state`; no Makefile/package.json/CI wiring). |
| **Migration test (data-architect F3)** | `scripts/__tests__/retire-source-progress-migration.test.ts:51-56` | **delete the test case** — it positively asserts BACKFILL Step 2 (`from indonesian.lesson_progress lp` + `coalesce(lp.completed_at, now())`) exists in `migration.sql`; removing the backfill (Step 3) makes it fail → breaks `make pre-deploy`. The `:58-76` negative-assertion test (union is gone) is unaffected — keep it. |
| Dead reader method | `src/services/lessonService.ts:25-33` `getUserLessonProgress` | **delete the method** (no caller). Keep `getAudioUrl`. |
| Dead type | `src/types/progress.ts` `LessonProgress` | **delete** (only used by the deleted method). |
| Stale comments | `src/lib/lessons/adapter.ts:12`, `src/lib/lessons/__tests__/adapter.test.ts:7` | drop the `getUserLessonProgress`/`lesson_progress` mentions. |
| Health-check set | `scripts/check-supabase-deep.ts` `EXPECTED_TABLES` (`:45-47`) + `EXPECTED_GRANTS` (`:70-72`) | remove the three entries. |

### Step 2 — Archive (before dropping)
`pg_dump` all three non-empty tables to a local archive (737 + 2,695 + 14 rows).

### Step 3 — `scripts/migration.sql` (canonical; the only file `make migrate` applies)

**Strip the three tables' CREATE + all attached DDL** (target state = never created):
- CREATE blocks: `learner_skill_state` (`:296`), `review_events` (`:317`), `lesson_progress` (`:336`).
- Indexes: `idx_learner_skill_state_due` (`:420`), `idx_review_events_user_time` (`:421`).
- Grants: `:437`, `:438`, `:439`.
- RLS `ENABLE`: `:469`, `:470`, `:471`.
- Policies (DROP-IF-EXISTS + CREATE pairs): `learner_skill_state_owner` (`:550-551`), `review_events_read`/`review_events_insert` (`:554-558`), `lesson_progress_read`/`lesson_progress_write` (`:561-566`).
- `review_events` FK + CHECK + column churn (data-architect F2 — strip **all** of these, else a fresh `migrate-idempotent-check` second apply 404s):
  - `:377-381` — exercise_type CHECK drop + `review_events_session_id_fkey`.
  - `:904-909` — the "grammar pattern reviews" block: `learning_item_id DROP NOT NULL` (`:906`) **and** `ADD COLUMN grammar_pattern_id … REFERENCES grammar_patterns` (`:908-909`). (Cut the whole block, not just `:906`.)
  - `:968-976` — the `review_events_source_check` DO-block (its `EXCEPTION WHEN duplicate_object` catches `42710`, not the `42P01` a dropped table raises).
  - `:1237-1238` — `DROP COLUMN IF EXISTS score` / `feedback_type` (`IF EXISTS` guards the column, not the table).
- `skill_type` CHECK churn on `learner_skill_state` + `review_events`: `:640-657` (all four DROP/ADD CONSTRAINT pairs + the two `UPDATE … SET skill_type` backfills at `:648-649`).

**Fold the #212 churn cleanup (excise, don't create-then-drop):**
- Remove the `leaderboard` view CREATE (`:396-414`) + its GRANT (`:450`).
- Remove the `learner_item_state` CREATE (`:278`), index `:419`, grant `:436`, RLS `:468`, policy `:546-547`.
- Remove the #212 teardown block (`:3638-3651`) entirely — with the CREATEs gone, its `drop view/table` become no-ops (live DB already has both absent; `migrate-idempotent-check`'s fresh double-apply never recreates them). File no longer mentions either surface.

**Remove the landmine backfill (prompt's guard-or-remove rule):**
- Delete BACKFILL Step 2 (`:2023-2031`) — the `INSERT … SELECT FROM lesson_progress`
  promotion. It is one-time and already applied live; on a fresh rebuild post-drop it
  would 404. **Remove, not `to_regclass`-guard** — the promotion's job is done and its
  source is being dropped (Minimum Mechanism). Step 1 auto-activate (`:2014-2021`,
  touches only `lessons`/`learner_lesson_activation`) **stays**.

**Comment hygiene:** update the leaderboard-referencing comments that outlive it —
`:49` (profiles: trim "used by **leaderboard and** sharing UI" → "sharing UI"; data-architect F4),
`:441-448` (learning_sessions grant history: keep the REVOKE, drop the "SELECT
preserved for the leaderboard view" clause) and `:481-484` (profiles_read: the
"leaderboard is decommissioned" note stays accurate — leave or trim). Optionally
refresh `:1248-1249` (the `apply_review_to_skill_state` DROP-FUNCTION comment that
says `learner_skill_state` is "left in place … a follow-up may drop it" — #150 is
that follow-up; the idempotent `DROP FUNCTION IF EXISTS` itself stays).

**Add the #150 teardown block** (drop section, after the collections block or near
the old #212 block's location):
```sql
-- ============================================================
-- SM-2 / learner-state teardown (#150, 2026-07-01) — epic #98 final teardown.
-- The capability model (ADR 0001-0004) + two-axis analytics (#206-229) replaced
-- these. 0 live readers, 0 live writers, no FK points into them (verified
-- 2026-07-01). Build-stage disposable data (CLAUDE.md Operating Context);
-- pg_dump archived before drop. CASCADE covers each table's own index/grant/
-- RLS/policy + its outbound FKs.
drop table if exists indonesian.learner_skill_state cascade;
drop table if exists indonesian.review_events cascade;
drop table if exists indonesian.lesson_progress cascade;
```

### Step 4 — Health check (drop-assertion, mirroring HC25/HC37)
Add one HC to `check-supabase-deep.ts` asserting all three relations are absent
(`to_regclass(...) IS NULL` / probe → PGRST205). Removing them from
`EXPECTED_TABLES` (Step 1) means their absence is *tolerated*; the new HC makes it
*asserted* (a resurrected table = regression).

### Step 5 — Docs
- `docs/current-system/data-model.md`: remove the **Legacy-retained** row (`:29`),
  the three per-table entries (`:194-196`), the leaderboard-view section
  (`:233-238`) if not already gone, and the "candidates for future retirement"
  note (`:256`). Note the retirement is complete.
- Update this plan's frontmatter to `status: shipped` + `implementation_paths` +
  `merged_at` in the merge commit (PR template rule).

## Supabase Requirements

### Schema changes
- **Drop tables:** `learner_skill_state` (737), `review_events` (2,695),
  `lesson_progress` (14). **Excise (already-dropped-live) CREATEs:**
  `learner_item_state`, `leaderboard` view. All authored into
  `scripts/migration.sql` (canonical). RLS/grants/policies/indexes/CHECKs removed
  with each table (CASCADE covers the live DB; CREATE-block excision covers fresh
  rebuild). No new RLS/grants.

### homelab-configs changes
- [ ] PostgREST: N/A (no schema exposure change). — [ ] Kong: N/A. —
  [ ] GoTrue: N/A. — [ ] Storage: N/A.

### Health check additions
- `check-supabase.ts`: N/A. — `check-supabase-deep.ts`: add the three-table
  drop-assertion HC; remove the three from `EXPECTED_TABLES` + `EXPECTED_GRANTS`.

## Gates & acceptance
- `pg_dump` all three non-empty tables before dropping (non-empty archive).
- `make migrate-idempotent-check` green (fresh double-apply — catches the
  2026-05-02/05-08 bulk-drop class + any create-then-drop residue).
- `make pre-deploy` green (lint + tests + build + tier-1 + tier-2).
- `make migrate` (HITL, operator-run) applies live; `check-supabase-deep` green
  post-migrate; the new HC confirms all three absent; app still renders + sessions
  build + reviews commit.
- Finish gate: `Dev-Workflow-DB-Verified` trailer (plan-vs-actual + live-DB query)
  + `Dev-Workflow-Lesson` trailer.

## Risks
- **R1 — a live RPC/view 404s post-drop.** None: 0 views, `get_lessons_overview`
  reference is a comment (verified via `pg_get_functiondef`), 0 live `src/` readers.
- **R1b — the publish pipeline aborts post-drop.** The one live `review_events`
  writer (pre-clear `.delete()` at `adapter.ts:821`) would throw on a pattern-retiring
  publish once the table is gone. Retired in Step 1 (data-architect F1); the
  capability-stage tests (run under `make pre-deploy`) exercise the path.
- **R2 — fresh rebuild fails on a dangling reference to a dropped table.**
  Mitigated by removing BACKFILL Step 2 (`:2028-2031`) + excising the leaderboard
  view CREATE; `migrate-idempotent-check`'s fresh double-apply is the gate.
- **R3 — CASCADE row-loss in a surviving table.** None: no FK points into the
  three; all their FKs are outbound (verified `pg_constraint` 2026-07-01).
- **R4 — audit-trail `scripts/migrations/*.sql` reference the dropped tables.**
  Acceptable: those files are historical paper-trail, never applied by
  `make migrate` (CLAUDE.md migration source-of-truth rule). Left as-is.
