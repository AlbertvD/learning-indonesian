---
doc_type: process
surface: scripts/publish-approved-content.ts, scripts/triage-residual-capabilities.ts
last_verified_against_code: 2026-05-17
status: stable
---

# Decision 3b rollout runbook (PR-3 of `2026-05-17-extend-decision-3-lesson-id.md`)

Operational steps to flip every non-podcast `learning_capabilities.lesson_id` from null to its introducing lesson — by re-publishing each lesson's capability stage (PR-1's projector + PR-2's reconciled staging do the work via `canonical_key` upsert), then cleaning up what re-publish can't reach.

PR-3's committed artifacts are tiny (this runbook + `scripts/triage-residual-capabilities.ts`). The load-bearing work is operational. **Run this once, against the homelab DB, after PR-3 merges (or right before merge, then paste the output into the PR description).**

After this runbook completes, the DB will satisfy `select count(*) from indonesian.learning_capabilities where lesson_id is null and source_kind not in ('podcast_segment', 'podcast_phrase')` returning `0` — the precondition PR-4's `CHECK` constraint needs.

---

## Prerequisites

- PR-1 + PR-2 merged to `main`; local checkout up-to-date.
- `.env.local` carries `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `POSTGRES_PASSWORD`.
- The supabase instance at `api.supabase.duin.home` is reachable.
- No other operator is publishing lessons at the same time (the runbook upserts via `canonical_key`; a concurrent publish would race on the same rows).

---

## Step 1 — Baseline measurement (≈5 min)

Capture the pre-rollout state so the diff is exactly what we expect. Run this via Supabase Studio (`https://supabase.duin.home` → SQL editor), or via any service-role connection:

```sql
select
  count(*) as total_caps,
  count(*) filter (where lesson_id is null) as null_lesson,
  count(*) filter (where lesson_id is null and source_kind in ('podcast_segment', 'podcast_phrase')) as null_lesson_podcasts,
  count(*) filter (where lesson_id is null and source_kind not in ('podcast_segment', 'podcast_phrase')) as null_lesson_non_podcasts,
  count(*) filter (where projection_version = 'capability-v1') as v1,
  count(*) filter (where projection_version = 'capability-v2') as v2,
  count(*) filter (where projection_version = 'capability-v3') as v3
from indonesian.learning_capabilities;
```

Paste the result into the PR description as the **"before"** snapshot.

Per the plan's pre-flight (queried 2026-05-17): `null_lesson` was 1,613 / 2,649 (61%); v1 = 1,708 and v2 = 941. Expect `null_lesson_non_podcasts` to be near 1,613 (a small number of podcast caps among the nulls). After the rollout, `null_lesson_non_podcasts` MUST be 0.

---

## Step 2 — Re-publish each lesson (≈15–30 min total)

`runCapabilityStage` upserts via `canonical_key` (`scripts/lib/pipeline/capability-stage/adapter.ts:151`). Once PR-1's projector emits `lessonId` on every non-podcast capability (`runner.ts:382`, `projectors/vocab.ts:177`), each re-publish flips the existing NULL row's `lesson_id` in place. This is the canonical "backfill" — no separate SQL UPDATE is needed.

**Order matters very little** (each lesson is independent — no cross-lesson FK), but doing 1..9 in ascending order matches the staging directory ordering and keeps mental tracking simple.

For each `N` in `1..9`:

```bash
bun scripts/publish-approved-content.ts "$N"
```

Expected output:
- Stage A finishes with `"status": "ok"` and a non-empty `lesson.id`.
- Stage B finishes with `"status": "ok"` (or `"partial"` if seed-integrity hooks flagged warnings on pre-existing data — non-blocking; see "If you hit blockers" below).
- The lessonId validator (`scripts/lib/pipeline/capability-stage/validators/lessonId.ts`) does not throw — every emitted capability carried `lessonId`.

After each lesson, verify in Supabase Studio:

```sql
-- replace <N> with the order_index just published
with target as (
  select id from indonesian.lessons where order_index = <N>
)
select
  (select count(*) from indonesian.learning_capabilities, target where lesson_id = target.id) as caps_with_this_lesson,
  (select count(*) from indonesian.learning_capabilities, target where lesson_id = target.id and projection_version = 'capability-v3') as v3_caps,
  (select count(*) from indonesian.learning_capabilities, target where lesson_id = target.id and readiness_status = 'ready') as ready_caps;
```

Cross-check `caps_with_this_lesson` against the count of `"canonicalKey":` in `scripts/data/staging/lesson-<N>/capabilities.ts` after the publish (the runner writes back the regenerated `capabilities.ts`). For lessons 1, 2, 4, 5, 6, 9 the count already matches pre-publish (PR-2 regenerated those). For lessons 3, 7, 8 the count is what the runner produced (PR-2 deferred those to PR-3 because their staging needed runner-only enrichments).

**`v3_caps` should equal `caps_with_this_lesson`** after re-publish — every capability the runner upserts gets `projection_version = 'capability-v3'`. Any residual v1/v2 row for this lesson means the upsert missed a canonical_key (the projector no longer emits that key) — investigate before moving on.

`ready_caps` may be lower than `caps_with_this_lesson` because:
- The publish resets `readiness_status='unknown'` and `publication_status='draft'` on every upsert (`adapter.ts:137-138`).
- `runCapabilityStage` then runs the readiness promotion phase (`runner.ts:599-626`) which promotes caps that pass artifact checks.
- Pre-existing stuck `unknown/draft` rows (issue #2 from the DQ audit) won't promote; that's the deferred problem. Note the count in the PR description but do not block.

**If a publish fails:** stop and investigate. The most likely causes (in order of frequency):
1. The PR-1 validator caught a non-podcast cap with `lessonId === null`. Check the projector code — most likely a new source kind was added that bypasses the runner's stamping.
2. The PR-2 pre-publish lint caught a duplicate item declaration that survived reconciliation. The error message names the duplicate; remove it from the higher-order lesson's `learning-items.ts` and rerun.
3. The seed-integrity hook (`runSeedIntegrity`) flagged a missing artifact (issue #2 from the DQ audit — pre-existing). This returns `status: 'partial'`, NOT a failure — the upserts already happened. Move on; the triage script will not need to handle this.
4. PostgREST timed out on a large lesson (lesson 4 has 472 caps + 135 items + many artifacts). Retry the lesson individually. If it times out twice in a row, pause and investigate.

---

## Step 3 — Run residue triage

After every lesson is re-published, run the triage script in dry-run mode first to inspect what's left:

```bash
bun scripts/triage-residual-capabilities.ts --dry-run
```

This writes a CSV of proposed changes to `/tmp/triage-diff.csv` and prints a summary. Review it: every line should fall into one of three buckets:
- `delete_orphan_no_history` — `source_ref` is a `learning_items/<slug>` that no longer exists in `learning_items.normalized_text`, AND the cap has zero `capability_review_events` rows.
- `default_assign_orphan_with_history` — same source_ref orphan, but the cap has at least one `capability_review_events` row (default-assign to lesson 1; preserves history).
- `default_assign_function_word` — non-orphan but `lesson_id IS NULL` after re-publish (function-word residue with no Woordenlijst match anywhere).

If you see entries outside these buckets, stop. The script's classifier missed a case — add it before applying.

When the dry-run looks right:

```bash
bun scripts/triage-residual-capabilities.ts --apply
```

This runs the same deletes/updates against the homelab DB. **Asserts on exit** that `select count(*) from indonesian.learning_capabilities where lesson_id is null and source_kind not in ('podcast_segment', 'podcast_phrase')` returns `0`. If the assertion throws, PR-3 is incomplete — do NOT open PR-4 until you've reconciled the residue.

**Post-PR-4 (current behaviour):** the script's delete branch issues a single `delete from learning_capabilities where id = $1`. All four child FKs (`capability_aliases.new_capability_id`, `capability_artifacts.capability_id`, `learner_capability_state.capability_id`, `capability_review_events.capability_id`) are `ON DELETE CASCADE` post-PR-4, so the children sweep automatically. `capability_review_events` is additionally guarded by the orphan-with-history skip — caps with events get default-assigned, never deleted — so the cascade only ever fires on caps with zero referencing events. `capability_content_units` and `capability_resolution_failure_events` had `ON DELETE CASCADE` from the original schema.

**Pre-PR-4 history (for archaeology):** the script enumerated child tables explicitly because the FKs were RESTRICT (see `scripts/migrations/2026-04-25-capability-core.sql:33,45,59,86`). The order was `capability_aliases` → `capability_artifacts` → `learner_capability_state` → `learning_capabilities`. PR-4 converted the FKs to CASCADE and the PR-4 followup PR collapsed the script's enumeration accordingly. The explicit enumeration was a PR-3-only idiom.

---

## Step 4 — Final assertion

Re-run the baseline SQL from Step 1. Compare:

| Field | Expected after |
|---|---|
| `total_caps` | ≈ same as before (orphan-no-history deletes shrink it slightly) |
| `null_lesson_non_podcasts` | **0** |
| `null_lesson_podcasts` | ≈ unchanged (whatever the podcast catalog had) |
| `v1` | 0 (every cap was re-projected by the runner) |
| `v2` | 0–small (only untouched podcast caps; the lesson runner produces v3 only) |
| `v3` | majority of `total_caps` |

Then run the deep health check:

```bash
make check-supabase-deep
```

Expect green. Any failure is unrelated to PR-3 (the constraint that PR-4 adds is not yet in place; the deep-check assertion for `null_lesson_non_podcasts === 0` lands in PR-4).

Paste the **"after"** snapshot into the PR description alongside the "before" from Step 1, plus the triage script's stdout.

---

## If you hit blockers

| Symptom | Cause | Action |
|---|---|---|
| Validator throws `null lessonId for non-podcast cap` | PR-1 prerequisite incomplete OR a new source kind was added without runner-stamping coverage | Re-check `scripts/lib/pipeline/capability-stage/runner.ts:382` and `projectors/vocab.ts:177`. If both stamp, grep the projector chain for any cap emission that bypasses both. |
| Readiness phase warns "missing artifact" for many caps in lesson N | Issue #2 from the DQ audit (pre-existing artifact-validation gap; explicitly deferred by the plan) | Continue. Record the lesson + count in the PR description. The triage script does not need to address this — the caps still have non-null `lesson_id`. |
| `make migrate` not relevant (we're not changing schema) | n/a | Skip; PR-3 doesn't touch `scripts/migration.sql`. |
| Triage script's final assertion throws with count > 0 | An unanticipated residue category (e.g., a cap whose `source_ref` slug *does* match a `learning_items` row but the matching lesson's id wasn't resolved correctly) | Re-run the SQL by hand, inspect the surviving rows. Add the bucket to the script before re-running. |
| Triage `--apply` partially completes then errors | Network blip or a constraint violation mid-loop | The script processes one cap at a time with explicit ordering; the partial state is consistent (no orphan child rows for a non-existent parent). Re-run `--apply`. The dry-run/apply path is idempotent — already-deleted caps are silently skipped on the next pass. |
| A capability was accidentally deleted that had history | Logic bug in the script's orphan-with-history skip | Restore from the previous day's Supabase backup. Audit the skip logic before re-running. |

The plan is the source of truth (`docs/plans/2026-05-17-extend-decision-3-lesson-id.md`). If reality conflicts with the plan, surface the conflict before resolving it.

---

## After this runbook

1. Update the plan frontmatter: `status: implementing`, `implementation_pr_3: PR #<N>`, `implementation_pr_3_merged_at: <date>`.
2. Open / unblock PR-4 — the schema is now ready to receive the CHECK constraint cleanly.
3. No user-facing smoke test required. PR-3 changes the *data* but not the *behaviour* learners see. The runtime null-bypass at `src/lib/session-builder/pedagogy.ts:209` still surfaces the same capabilities; PR-4 enforces the invariant, PR-5 starts respecting it.

---

## Phase 1 (post-#59): re-publish for #58

After issue #59 landed (extract `itemSlug` helper + three-layer test gates), 113 multi-word vocabulary items in lessons 2–4 had silently-broken capabilities — `source_ref` slugs were hyphenated while `learning_items.normalized_text` preserved spaces. Issue #58 closed this with a re-publish loop + Phase 2 orphan sweep.

The re-publish loop is identical in shape to Step 2 above. The key differences:

- With `validateItemSourceRefResolvability` wired in at `runner.ts:404`, any staging item referenced by a cap but not declared throws synchronously. STOP on a throw; do not patch around it.
- Lessons 5, 7, 8, 9 carry pre-existing `dialogue-cloze-missing` CRITICAL lint findings (38 deferred dialogue chunks total). These are unrelated to the slug fix. Use `--skip-lint` to bypass the pre-flight gate for those lessons; the Stage B slug validator still runs.
- There is **no programmatic guard against concurrent publishes** — neither `runCapabilityStage` nor `upsertCapabilities` takes an advisory lock. Operator discipline only.

```bash
for n in 1 2 3 4; do
  bun scripts/publish-approved-content.ts "$n"
done
for n in 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts "$n" --skip-lint
done
```

Mid-rollout state: between lessons N and N+1, old hyphen-form caps coexist with new space-form caps for lessons 1..N. HC9 stays red until Phase 2. The live app remains functional because old hyphen-form caps were already silently broken (they fail at the strict resolver in `src/services/capabilityContentService.ts:107-114`).

After all 9 lessons re-publish, commit the regenerated staging files (`scripts/data/staging/lesson-<N>/{capabilities,content-units,exercise-assets,lesson-page-blocks}.ts`). They are the durable record of #59's slug fix landing in staging.

---

## Phase 2 (post-#59): orphan sweep SQL

Single CASCADE-safe DELETE, run via openbrain MCP `execute_sql` with `confirm_destructive: true`. PR-4's CASCADE child FKs (all six — `capability_aliases.new_capability_id`, `capability_artifacts.capability_id`, `learner_capability_state.capability_id`, `capability_review_events.capability_id`, `capability_content_units.capability_id`, `capability_resolution_failure_events.capability_id`) sweep all children automatically.

**Pre-sweep audit** (verify safety, then run the DELETE):

```sql
-- Count current orphans (should match HC9's offender count)
SELECT count(*) AS orphan_count
FROM indonesian.learning_capabilities lc
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Review events on orphans (MUST be 0)
SELECT count(*) AS review_events_on_orphans
FROM indonesian.capability_review_events cre
JOIN indonesian.learning_capabilities lc ON lc.id = cre.capability_id
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Learner state on orphans (audit only; CASCADE-deletes test-seed state)
SELECT lcs.user_id, count(*) AS state_rows_on_orphans
FROM indonesian.learner_capability_state lcs
JOIN indonesian.learning_capabilities lc ON lc.id = lcs.capability_id
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  )
GROUP BY lcs.user_id;
```

If `review_events_on_orphans > 0`, **STOP** — real learner history exists on an orphan. Triage by hand (default-assign instead of delete for those rows) before continuing.

**The sweep itself:**

```sql
DELETE FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );
```

**Post-sweep verification:**

```sql
SELECT count(*) AS after_count
FROM indonesian.learning_capabilities lc
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );
-- MUST return 0
```

Queries use raw `normalized_text` (no `lower(trim(...))`) to match HC9 exactly, so `orphan_count` lines up with HC9's reported offender count. Save the before/after counts to the PR description.

**Why inline SQL and not `triage-residual-capabilities.ts`:** that script's invariant is `lesson_id IS NULL`, not `source_ref` unresolvability. Conflating the two would obscure the invariants. The cleanup belongs in the PR's audit trail, not as committed code.

**Backup before sweep:** export the orphan rows to a local JSON file before running the DELETE. Keep for 7 days as rollback insurance. (CASCADE children are reconstructable from cap IDs via the daily Supabase backup if a hard rollback is ever needed.)
