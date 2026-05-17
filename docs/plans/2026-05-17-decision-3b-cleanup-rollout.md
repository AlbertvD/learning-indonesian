---
status: approved
implementation: TBD
merged_at: null
implementation_paths:
  - docs/process/decision-3b-rollout.md
  - docs/plans/2026-05-17-extend-decision-3-lesson-id.md
supersedes: []
---

# Decision 3b cleanup rollout — issue #58 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to drive this task-by-task.

**Goal:** Close the Decision 3b rollout by recovering 113 silently-broken multi-word vocabulary items (re-publish lessons 1–9 now that #59's slug fix has landed) and deleting all residual orphan item capabilities so HC9 turns green.

**Architecture:** Operational two-phase rollout, no new product code. Phase 1 re-publishes each lesson via the standard pipeline (`bun scripts/publish-approved-content.ts <N>`); #59's fix to `itemSlug` and the new `validateItemSourceRefResolvability` validator guarantee the regenerated `learning_capabilities` rows have space-form `source_ref`s that resolve cleanly. Phase 2 runs a single CASCADE-safe SQL delete against the live DB to sweep the surviving hyphen-form orphans (the 113 superseded multi-word items + the 88 Type-B genuine orphans). Total committed-code delta is documentation + a staging-file regeneration trail.

**Tech Stack:** Bun (`scripts/publish-approved-content.ts`), Supabase Postgres (via openbrain MCP `execute_sql` for Phase 2), `make check-supabase-deep` (HC8 + HC9 gates), Playwright (functional smoke).

---

## Issue resolved

GitHub issue #58 — *Cleanup: re-publish lessons 1-9 + delete 88 Type B orphan caps (post-#59)*.

## Required reading (executor must read before starting)

1. `gh issue view 58 -R AlbertvD/learning-indonesian` — the spec. Pay attention to the two-phase plan, the Type A vs Type B typology, and the acceptance bullets.
2. `gh issue view 59 -R AlbertvD/learning-indonesian` and `git log --grep="#59"` — the deliverables that unblocked this cleanup (`itemSlug`, the validator wiring at `scripts/lib/pipeline/capability-stage/runner.ts:404`, HC9 in `scripts/check-supabase-deep.ts`).
3. `src/lib/capabilities/itemSlug.ts:23-25` — the canonical helper. One line: `baseText.toLowerCase().trim()`. Internal spaces are preserved; this is the load-bearing semantic the rest of the plan depends on. Read first.
4. `docs/process/decision-3b-rollout.md` — the precedent for the per-lesson re-publish + verify pattern. PR-3 used the same shape.
5. `scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts` — understands what will throw if a Type A item is still mis-slugged after #59 OR if a staging item is referenced by a cap but not declared.
6. `scripts/check-supabase-deep.ts` HC9 block (the `HC9` comment + closure spanning ~75 lines after it) — HC9's exact comparison logic. It loads `learning_items.normalized_text` raw (NO `lower(trim(...))`), then `caps.filter((c) => !slugs.has(c.source_ref.replace(/^learning_items\//, '')))`. Phase 2's SQL matches this exactly — no `lower(trim(...))` hedge — so `before_count` and HC9's offender count are directly comparable. (Relies on the `itemSlug` write-side invariant: `normalized_text` is already lower + trimmed.)
7. `scripts/triage-residual-capabilities.ts:50-63,177-237` — note that this script is keyed on `lesson_id IS NULL`, NOT `source_ref` unresolvability. **Do not amend it for Phase 2** — it answers a different question. Inline SQL via openbrain MCP is the cleaner audit trail.
8. `CLAUDE.md` — Migration source-of-truth rule (Phase 2 SQL is one-shot, NOT added to `scripts/migration.sql`); plan-status awareness (this plan starts `draft`, flips to `approved` after architect, then `shipped` post-merge).

## Pre-flight verification (run before starting)

```bash
# 1. #59 must be on main
ls src/lib/capabilities/itemSlug.ts
grep -B 1 -A 3 "HC9" scripts/check-supabase-deep.ts | head -5
# Both must produce output.

# 2. Live DB state — HC8 green, HC9 red
make check-supabase-deep 2>&1 | grep -E "HC8|HC9"
# Expected:
#   ✓ HC8 learning_capabilities.lesson_id non-null for non-podcast caps (ADR 0006)
#   ✗ HC9 item caps source_ref resolves to learning_items.normalized_text (#59) — EXPECTED RED until issue #58 cleanup completes

# 3. No other operator is publishing lessons concurrently. There is NO
#    programmatic guard against this — neither runCapabilityStage nor
#    upsertCapabilities takes an advisory lock. A concurrent re-publish
#    against the same lesson would race on the canonical_key upserts.
#    Operator discipline is the only protection; for a single-developer
#    project this is acceptable but should be re-noted by anyone reusing
#    this runbook.
```

If HC8 is RED, stop — Decision 3b PR-3 invariant has regressed and Phase 1 is unsafe to run. If HC9 is already GREEN, stop — someone else has done this cleanup; confirm with the user before proceeding.

## Scope

### In scope

1. New plan doc (this file).
2. Operational execution: 9 lesson re-publishes + 1 SQL delete + verification SQL between each step.
3. Per-lesson staging file regeneration committed (the durable evidence of #59's slug fix landing in `staging/`).
4. Update `docs/process/decision-3b-rollout.md` with two new sections (Phase 1: re-publish for #58; Phase 2: orphan sweep).
5. Update `docs/plans/2026-05-17-extend-decision-3-lesson-id.md` frontmatter with a `cleanup_completed_at` field referencing this plan + the resulting PR.
6. Flip this plan's frontmatter to `status: shipped` after merge.

### Out of scope

- **No `scripts/migration.sql` changes.** The Phase 2 SQL is a one-shot operational cleanup, not an invariant. It does NOT go into `scripts/migration.sql`. Consequently `make migrate-idempotent-check` is not applicable to this PR.
- **No amendment to `scripts/triage-residual-capabilities.ts`.** That script's invariant (`lesson_id IS NULL`) is a different thing from this cleanup's invariant (`source_ref` unresolvable). Amending it would conflate two purposes; inline SQL via the openbrain MCP gives a cleaner audit trail.
- **No new product code.** If a re-publish fails with a `validateItemSourceRefResolvability` throw, that is a signal to STOP and investigate (it means staging has a Type B item not declared in `learning-items.ts`, or #59's fix didn't fully land). Do NOT patch around it in this PR.
- **No HC4 audio coverage parity fix.** HC4 (`scripts/check-supabase-deep.ts` HC4 block) checks `lesson_sections.content` dialogue + vocab items against `audio_clips` by `(normalized_text, voice_id)`. The audio orchestrator runs in Stage A and is keyed on lesson dialogue/vocab text — re-publishing **without changing that text** is unlikely to add new audio clips. **Expect HC4 status unchanged.** If it does improve, treat it as side-benefit. If it doesn't, file a follow-up issue. Do not interpret an unchanged HC4 as a Phase 1 failure.
- **No homelab redeploy.** This is data-only; the live app picks up new caps on the next session load.

---

## Task 1 — Create cleanup worktree

**Step 1: Confirm clean tree**

Run: `git status`
Expected: only the three already-modified `.claude/agents/*.md` files + two PR-5 PNGs noted (these are pre-existing dirty state from previous work, untracked). No new work blocked.

**Step 2: Create worktree**

```bash
git worktree add ../learning-indonesian-cleanup -b chore/decision-3b-cleanup main
cd ../learning-indonesian-cleanup
```

**Step 3: Verify worktree at correct base**

Run: `git log --oneline -3`
Expected: `0531869 Merge pull request #60 from AlbertvD/feat/itemslug-shared-helper` at HEAD or close to it.

**Step 4: Move this plan into the worktree**

```bash
cp ../learning-indonesian/docs/plans/2026-05-17-decision-3b-cleanup-rollout.md docs/plans/
git add docs/plans/2026-05-17-decision-3b-cleanup-rollout.md
git commit -m "docs(plans): add approved plan for decision-3b cleanup (#58)"
```

---

## Task 2 — Pre-cleanup audit snapshot

**Files:**
- Create: `/tmp/decision-3b-cleanup-backup-2026-05-17.json` (NOT committed — local-only insurance)

Rationale: Phase 2 is destructive and CASCADE-deletes child rows. The issue body asserts (verified 2026-05-17) that 0 `capability_review_events` reference orphan caps and `learner_capability_state` only has single-digit test-seed rows. Re-verify before deleting and save the export to disk for 7 days as rollback insurance.

**Step 1: Count orphans and verify CASCADE-safe**

Run via openbrain MCP `execute_sql`. NOTE: queries use raw `normalized_text` (no `lower(trim(...))`) to match HC9 exactly so the counts are directly comparable.

```sql
-- Count current orphans (must match HC9's reported count)
SELECT count(*) AS orphan_count
FROM indonesian.learning_capabilities lc
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Review events referencing orphans (must be 0)
SELECT count(*) AS review_events_on_orphans
FROM indonesian.capability_review_events cre
JOIN indonesian.learning_capabilities lc ON lc.id = cre.capability_id
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Learner state on orphans (audit only; OK if non-zero — testuser test seeds)
SELECT count(*) AS learner_state_on_orphans
FROM indonesian.learner_capability_state lcs
JOIN indonesian.learning_capabilities lc ON lc.id = lcs.capability_id
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );
```

**Acceptance:**
- `orphan_count` ≈ 777 — should **exactly match** HC9's offender count (both queries use raw `normalized_text`). If off by more than ±5, investigate before proceeding.
- `review_events_on_orphans` = 0 — **HARD GATE**, abort if non-zero
- `learner_state_on_orphans` ≤ 20 — testuser-seeded; safe to CASCADE-delete

If `review_events_on_orphans > 0`: STOP. Real learner history exists on an orphan. Triage by hand before continuing (default-assign instead of delete for those rows, per the pre-#56 pattern in `triage-residual-capabilities.ts:80-83`).

**Step 2: Snapshot the orphan rows to disk**

```sql
-- Run via openbrain MCP execute_sql; capture full result into the JSON snapshot
SELECT lc.id, lc.canonical_key, lc.source_ref, lc.lesson_id, lc.projection_version, lc.created_at
FROM indonesian.learning_capabilities lc
WHERE lc.source_kind = 'item'
  AND lc.source_ref LIKE 'learning_items/%'
  AND substring(lc.source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  )
ORDER BY lc.source_ref;
```

Save the output to `/tmp/decision-3b-cleanup-backup-2026-05-17.json` (cap rows only; the CASCADE children can be reconstructed from the cap IDs via Supabase backup if rollback is ever needed).

---

## Task 3 — Phase 1: re-publish lesson N (for N in 1..9)

**Files:**
- Regenerates: `scripts/data/staging/lesson-<N>/capabilities.ts`, `content-units.ts`, `exercise-assets.ts`, `lesson-page-blocks.ts` (per CLAUDE.md "Derived staging files" — these are write-back targets of the runner).
- Writes: rows in `indonesian.learning_capabilities`, `learning_items`, `item_meanings`, `capability_artifacts`, `lessons`, `lesson_sections`, `audio_clips` for lesson N.

**Step 1: Run the publish script**

```bash
bun scripts/publish-approved-content.ts <N>
```

Expected runtime: 30–60s per lesson; lesson 4 is the largest (~90s).

Expected output ending:
```
Stage A: status: "ok", lesson.id: <uuid>
Stage B: status: "ok"
```

**Step 2: Verify lesson N's new caps exist with space-form source_refs**

Via openbrain MCP `execute_sql`:

```sql
-- Count caps for lesson N with the new space-preserving slug shape
WITH target AS (SELECT id FROM indonesian.lessons WHERE order_index = <N>)
SELECT
  count(*) FILTER (WHERE source_kind = 'item' AND source_ref ~ ' ') AS space_form_item_caps,
  count(*) FILTER (WHERE source_kind = 'item') AS all_item_caps,
  count(*) AS total_caps
FROM indonesian.learning_capabilities lc, target
WHERE lc.lesson_id = target.id
  AND lc.projection_version = 'capability-v3';
```

For each lesson the `space_form_item_caps` count should be > 0 if the lesson has multi-word items (every lesson does — at minimum dialogue items like "selamat datang"). The exact number depends on lesson content; rough per-lesson expectations:

| Lesson | Pre-#58 multi-word item count (rough) | Notes |
|---|---|---|
| 1 | ~4 | "selamat pagi", "apa kabar" — small lesson |
| 2 | ~16 | First larger multi-word vocab block |
| 3 | ~20 | More multi-word + dialogue chunks |
| 4 | ~38 | Largest multi-word block |
| 5–9 | varies | smaller per-lesson |

**Acceptance:** `space_form_item_caps` > 0 for every lesson with multi-word vocab. If a lesson reports 0, investigate before continuing.

**Step 3: Confirm the validator did not throw**

The validator (`validateItemSourceRefResolvability` at `scripts/lib/pipeline/capability-stage/runner.ts:404`) throws synchronously if any emitted item-source-kind cap has an unresolvable source_ref. If Stage B finished with `status: "ok"`, the validator passed.

If it threw with `[itemSourceRefResolvability validator] N item-source-kind capabilities …`:
- The named slugs are NOT declared in `staging/lesson-N/learning-items.ts` but ARE referenced by some cap (Type B in staging).
- STOP at lesson N. **Lessons 1..N-1 are already cleanly re-published and in a valid quiescent state** — those completed before this throw, and `validateItemSourceRefResolvability` throws before any DB write for the FAILING lesson, so Phase 1 has no within-lesson partial state to repair.
- Do NOT patch staging in this PR. File a follow-up issue for the Type B staging cleanup, then either: (a) resume from lesson N once the follow-up lands, OR (b) ship a smaller cleanup that recovered lessons 1..N-1 and explicitly defers lessons N..9 to the follow-up.
- No live-DB reset needed. The mixed state (1..N-1 fresh, N..9 still orphan-bearing) is the same kind of mixed state described in the Mid-rollout note below.

**Step 4: Commit per-lesson? NO.**

The re-publish operation writes to the DB only; there's no code-side commit per lesson. The committable artifact during Phase 1 is the regenerated `staging/lesson-N/*` files. Commit them all in a single end-of-Phase-1 commit at Task 4.

**Step 5: Loop**

Repeat Steps 1–3 for N = 1, 2, 3, 4, 5, 6, 7, 8, 9.

**Mid-rollout state expectation:** Between lessons N and N+1, the live DB has a mix of new space-form caps for lessons 1..N and old hyphen-form caps for lessons N+1..9. The live app remains functional because old hyphen-form caps were already silently broken (HC9 was red pre-#58 — they silently fail at the strict resolver in `src/services/capabilityContentService.ts:107-114`); re-publishing only adds new working caps alongside them. No user-visible regression.

---

## Task 4 — Phase 1 verification + staging commit

**Step 1: Commit regenerated staging files**

`runCapabilityStage` rewrites `staging/lesson-N/{capabilities,content-units,exercise-assets,lesson-page-blocks}.ts` unconditionally for every lesson. The `source_ref` values in `capabilities.ts` shift from hyphen-form to space-form for the multi-word items — **this is the durable evidence of #59's fix landing in staging**. Commit unconditionally (do not gate on diff size).

```bash
cd ../learning-indonesian-cleanup
git status scripts/data/staging/
git add scripts/data/staging/
git commit -m "chore(staging): regenerate capabilities.ts via decision-3b cleanup re-publishes (#58)"
```

If the diff turns out to be empty (no slug shifts), that's a signal that the re-publishes didn't actually fix anything — STOP and investigate before continuing to Phase 2.

**Step 2: Confirm HC8 still green; HC9 still red**

```bash
make check-supabase-deep 2>&1 | grep -E "HC[0-9]"
```

Expected:
- HC8: PASS (`learning_capabilities.lesson_id non-null for non-podcast caps`)
- HC9: STILL FAIL with offender count UNCHANGED or slightly reduced (~777). HC9 stays red here because old hyphen-form caps are still present in the DB; only Phase 2 removes them.

Also note:
- HC4 (audio coverage parity): **expect unchanged status.** Re-publishing without changing dialogue/vocab text doesn't trigger new audio synthesis. If it improved, treat it as side-benefit; if it didn't, that's the expected outcome (not a failure of Phase 1).

**Acceptance:**
- HC8 green
- HC9 still red (orphans still there; Phase 1 added new caps, didn't delete old ones)
- new caps for every lesson visible per Task 3 Step 2 verification
- staging-file commit present in git history

---

## Task 5 — Phase 2: orphan sweep via openbrain MCP

**Run as TWO openbrain MCP `execute_sql` invocations**, NOT one block-with-COMMIT. The transaction wrapper in a single block won't actually rollback on `after_count > 0` — `COMMIT` runs unconditionally. Splitting into two invocations gives the operator a manual gate to substitute `ROLLBACK` for `COMMIT` if the assertion fails.

### Invocation 1: BEGIN + before/delete/after + INSPECT, do NOT commit yet

```sql
BEGIN;

-- Count before
SELECT count(*) AS before_count
FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Sweep
DELETE FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Count after — MUST be 0
SELECT count(*) AS after_count
FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );
```

**Operator inspects the result before sending the next invocation:**
- `before_count` ≈ 777 (matches HC9's offender count)
- `after_count` = 0
- DELETE succeeded without FK error (PR-4's CASCADE makes this safe — see Acceptance below)

### Invocation 2: COMMIT (only if Invocation 1 shows after_count = 0)

```sql
COMMIT;
```

If `after_count > 0` from Invocation 1: send `ROLLBACK;` instead of `COMMIT;`. The transaction is then aborted and the DB is unchanged from its pre-Phase-2 state.

### Alternative (self-aborting single block)

If executing as one MCP call is preferred for audit-trail uniformity, wrap the assertion in a `DO $$ … RAISE EXCEPTION $$` so the transaction self-aborts on assertion failure:

```sql
BEGIN;

DELETE FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM indonesian.learning_capabilities
  WHERE source_kind = 'item'
    AND source_ref LIKE 'learning_items/%'
    AND substring(source_ref, length('learning_items/') + 1) NOT IN (
      SELECT normalized_text FROM indonesian.learning_items
    );
  IF n > 0 THEN
    RAISE EXCEPTION 'Phase 2 sweep left % orphan(s) — aborting', n;
  END IF;
END $$;

COMMIT;
```

The `RAISE EXCEPTION` aborts the transaction; the `COMMIT` becomes effectively a no-op (Postgres auto-ROLLBACKs the aborted txn). Either approach is acceptable; the two-invocation form is more transparent for operator inspection.

**Acceptance:**
- `before_count` ≈ 777 (matches HC9's failure count exactly; both use raw `normalized_text`)
- `after_count` = 0
- COMMIT succeeds without FK error (PR-4's CASCADE makes this safe; the six child FKs — `capability_aliases.new_capability_id`, `capability_artifacts.capability_id`, `learner_capability_state.capability_id`, `capability_review_events.capability_id`, `capability_content_units.capability_id`, `capability_resolution_failure_events.capability_id` — all sweep automatically per the grep against `scripts/migration.sql:2041-2071` + the two original-schema CASCADEs)

If `after_count > 0`: ROLLBACK. Inspect surviving rows. Most likely cause: a race with a concurrent publish. Re-run after confirming no concurrent operations.

**Save SQL output to PR description** as the operational audit trail:

```
Before:   777 orphan item-source-kind capabilities
After:    0 orphan item-source-kind capabilities
Deleted:  777 (and their CASCADE children — see backup at /tmp/decision-3b-cleanup-backup-2026-05-17.json)
```

---

## Task 6 — Phase 2 verification

**Step 1: HC8 + HC9 both green**

```bash
make check-supabase-deep 2>&1 | grep -E "HC[0-9]"
```

Expected:
- HC8: PASS
- HC9: PASS (`item caps source_ref resolves to learning_items.normalized_text (#59)`)
- HC4: status unchanged from Phase 1 (expected). If improved, side-benefit; if not, the 98/707 missing pairs is a separate audio-synthesis issue.

**Step 2: Spot-check the regression risk**

```bash
make check-supabase-deep 2>&1 | tail -5
# Expected: "All checks passed" OR only known pre-existing failures (lesson audio_path on 5 lessons, etc.).
```

**Step 3: Run full pre-deploy gate**

```bash
make pre-deploy 2>&1 | tail -30
```

Expected: green except known pre-existing failures (the lesson audio_path 5-failure cluster is pre-existing and not introduced by this PR).

---

## Task 7 — Functional smoke test as testuser

Use Playwright MCP to log in as testuser and verify multi-word items now appear.

**Step 1: Log in as testuser**

```
mcp__playwright__browser_navigate  → https://indonesian.duin.home/login
fill email: testuser@duin.home / password: TestUser123!  (per reference memory)
click Log in
```

**Step 2: Activate lessons 1, 2, 3 (idempotent)**

Navigate to `/lessons`. Verify lessons 1, 2, 3 are active or activate them.

**Step 3: Open standard session**

Navigate to `/session?mode=standard`. Walk through 5–10 exercises looking for any of these previously-broken multi-word items:
- bandar udara (L2 — airport)
- apa kabar (L1 — how are you)
- terima kasih (L1 — thank you)
- tidak apa apa (L2 — it's nothing / no problem)
- jalan-jalan (L3 — to go out / take a walk)
- selamat datang (L1 — welcome)

**Step 4: Screenshot any successfully-rendered multi-word exercise**

Save via `mcp__playwright__browser_take_screenshot` to a temporary file. Embed in the PR description as proof of recovery.

**Acceptance:** at least 1 multi-word item appears as an exercise. If none appear after 10 exercises, walk through more — the runtime resolver does cap-based session building so all the new space-form caps should be candidates. If 0 appear after 20 exercises, that's a separate live-app regression to investigate (not in scope for this PR).

---

## Task 8 — Update docs

### Step 1: Append Phase 1 + Phase 2 sections to the rollout runbook

**File:** `docs/process/decision-3b-rollout.md`

Add two new top-level sections at the end (after the existing "After this runbook" section):

```markdown
---

## Phase 1 (post-#59): re-publish for #58

After issue #59 landed (extract `itemSlug` helper + three-layer test gates), 113 multi-word vocabulary items in lessons 2–4 had silently-broken capabilities — `source_ref` slugs were hyphenated while `learning_items.normalized_text` preserved spaces. Issue #58 closed this with a re-publish loop + Phase 2 orphan sweep.

The re-publish loop is identical in shape to Step 2 above. The key difference: with `validateItemSourceRefResolvability` wired in at `runner.ts:404`, any staging item referenced by a cap but not declared throws synchronously. STOP on a throw; do not patch around it. Note that there is no programmatic guard against concurrent publishes — operator discipline only.

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  bun scripts/publish-approved-content.ts "$n"
done
```

Mid-rollout state: between lessons N and N+1, old hyphen-form caps coexist with new space-form caps for lessons 1..N. HC9 stays red until Phase 2.

## Phase 2 (post-#59): orphan sweep SQL

Single CASCADE-safe DELETE, run via openbrain MCP `execute_sql` as a two-step transaction so the operator can substitute `ROLLBACK` for `COMMIT` if the post-delete count is non-zero. Alternatively use a single block with a `DO $$ RAISE EXCEPTION` self-aborting assertion. PR-4's CASCADE child FKs sweep all children automatically.

```sql
BEGIN;

SELECT count(*) AS before FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

DELETE FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

SELECT count(*) AS after FROM indonesian.learning_capabilities
WHERE source_kind = 'item'
  AND source_ref LIKE 'learning_items/%'
  AND substring(source_ref, length('learning_items/') + 1) NOT IN (
    SELECT normalized_text FROM indonesian.learning_items
  );

-- Operator inspects after_count. If 0, send: COMMIT;
-- If > 0, send: ROLLBACK;
```

Queries use raw `normalized_text` (no `lower(trim(...))`) to match HC9 exactly, so `before_count` lines up with HC9's reported offender count. `after` MUST be 0. Save before/after counts to the PR description.

**Why inline SQL and not `triage-residual-capabilities.ts`:** that script's invariant is `lesson_id IS NULL`, not `source_ref` unresolvability. Conflating the two would obscure the invariants. The cleanup belongs in the PR's audit trail, not as committed code.
```

### Step 2: Update Decision 3b plan's frontmatter

**File:** `docs/plans/2026-05-17-extend-decision-3-lesson-id.md`

Append a `cleanup_completed_at` field referencing this plan + the resulting PR:

```yaml
cleanup_completed_at: 2026-05-17  # via issue #58 cleanup, PR #<NN>; see docs/plans/2026-05-17-decision-3b-cleanup-rollout.md
```

### Step 3: Flip this plan's frontmatter

After PR merge, edit this plan's frontmatter:

```yaml
status: shipped
implementation: PR #<NN>
merged_at: 2026-05-17
implementation_paths:
  - docs/process/decision-3b-rollout.md
  - docs/plans/2026-05-17-extend-decision-3-lesson-id.md
  - scripts/data/staging/lesson-1/
  - scripts/data/staging/lesson-2/
  - scripts/data/staging/lesson-3/
  - scripts/data/staging/lesson-4/
  - scripts/data/staging/lesson-5/
  - scripts/data/staging/lesson-6/
  - scripts/data/staging/lesson-7/
  - scripts/data/staging/lesson-8/
  - scripts/data/staging/lesson-9/
```

---

## Task 9 — Open PR + close #58

**Step 1: Push branch**

```bash
cd ../learning-indonesian-cleanup
git push -u origin chore/decision-3b-cleanup
```

**Step 2: Open PR**

Title: `chore(decision-3b): cleanup rollout — recover 113 multi-word items + sweep orphans (#58)`

Body (template):

```markdown
## Summary

Closes #58. Two-phase operational cleanup that retires the Decision 3b rollout end-to-end.

- **Phase 1** — Re-published lessons 1–9. With #59's slug fix in place, the regenerated capabilities have space-form source_refs that resolve against `learning_items.normalized_text`. Staging files committed as the durable record.
- **Phase 2** — Single CASCADE-safe SQL delete swept 777 residual orphan item caps (the old hyphen-form survivors + the 88 Type-B genuine orphans listed in #58).

## Before / after

| Metric | Before | After |
|---|---|---|
| HC8 (lesson_id non-null) | ✓ green | ✓ green |
| HC9 (source_ref resolvable) | ✗ red, 777 offenders | ✓ green |
| HC4 (audio coverage parity) | ✗ 98/707 missing | <fill in — expected unchanged> |
| Orphan item caps | 777 | 0 |

## Operational log

- Re-publish runtime: <total minutes>
- Phase 2 SQL: deleted 777 caps, COMMIT clean, CASCADE swept children
- Backup: `/tmp/decision-3b-cleanup-backup-2026-05-17.json` (~777 rows, kept locally for 7 days)
- Smoke test: <link to screenshot showing multi-word item in session>

## Test plan

- [x] `make check-supabase-deep` shows HC8 + HC9 green
- [x] `make pre-deploy` clean (modulo known pre-existing audio_path failures)
- [x] testuser session surfaces previously-unreachable multi-word items
- [x] PR description has before/after counts + smoke screenshot
- [x] docs/process/decision-3b-rollout.md updated with Phase 1 + Phase 2 sections
- [x] docs/plans/2026-05-17-extend-decision-3-lesson-id.md frontmatter has `cleanup_completed_at`
- [x] this plan's frontmatter flipped to `status: shipped`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Step 3: Close issue #58**

After the PR is merged via GitHub Actions, comment on issue #58 with the final count snapshot + link to the PR, then close it.

---

## Rollback strategy

**During Phase 1 (a re-publish fails mid-loop):**

`validateItemSourceRefResolvability` throws BEFORE any DB write for the failing lesson, so there is no within-lesson partial state. Lessons 1..N-1 that already re-published are in a valid quiescent state — the live app continues to function in mixed mode (same reasoning as the Mid-rollout note in Task 3). To recover: investigate the validator throw, file a follow-up issue if it's a Type B staging gap, and either fix-and-retry from lesson N OR ship a smaller cleanup that explicitly defers lessons N..9. No DB rollback needed; Phase 1 is additive.

**During Phase 2 (the SQL transaction):**

In the two-invocation form, the operator inspects `after_count` from Invocation 1 before sending COMMIT. If non-zero, send `ROLLBACK;` instead. In the self-aborting single-block form, the `RAISE EXCEPTION` aborts the transaction automatically. Either way, the DB is left in post-Phase-1 state — HC9 still red but HC8 green.

**Post-Phase-2 (rollback after COMMIT):**

`/tmp/decision-3b-cleanup-backup-2026-05-17.json` has the deleted cap rows; CASCADE children are NOT in the snapshot (per the audit, 0 review events and only test-seed learner state). If a rollback is genuinely needed: restore caps from the snapshot via `INSERT` (children regenerate on next re-publish; learner state is fine to lose since it was test-seed only). Keep the snapshot for 7 days post-merge.

**Worst-case (DB-wide regression):** the homelab's daily Supabase backup (per `homelab-configs/services/supabase/`) is the last-resort rollback. ~24h RPO; acceptable given the cleanup's blast radius is bounded to ~777 cap rows.

---

## Architect review (2026-05-17)

Verdict: **APPROVE-WITH-NITS**, addressed in this revision. Architect confirmed:
- CASCADE coverage is exhaustive (all six child FKs are `ON DELETE CASCADE`).
- `validateItemSourceRefResolvability` throws before any write — Phase 1 has no within-lesson partial state.
- Mid-rollout reasoning holds (old hyphen-form caps were already silently broken at the strict resolver in `src/services/capabilityContentService.ts:107-114`).
- Inline SQL via openbrain MCP is the right execution channel; `triage-residual-capabilities.ts` is deliberately not amended.
- HC9 pre-cleanup red state is the trigger signal, not a regression.

Nits incorporated:
1. Phase 2 transaction split into two invocations OR self-aborting `DO $$ RAISE EXCEPTION` — original single-block-with-COMMIT couldn't actually rollback.
2. SQL queries use raw `normalized_text` (no `lower(trim(...))`) so `before_count` matches HC9's offender count exactly.
3. Staging-file commit made unconditional (the durable record of #59's slug fix in `staging/`).
4. Concurrent-publish race explicitly named as unguarded (operator discipline only).
5. HC4 expectation reframed: unchanged is the expected outcome; improvement is side-benefit.
6. `itemSlug.ts` added to Required Reading.
7. Validator-throw recovery clarified: lessons 1..N-1 are quiescent; no live-DB reset needed.
8. Out-of-scope explicitly names `make migrate-idempotent-check` as N/A.

---

## Estimated diff size

- This plan: ~330 LOC (committed)
- `docs/process/decision-3b-rollout.md` update: ~50 LOC (committed)
- `docs/plans/2026-05-17-extend-decision-3-lesson-id.md` frontmatter tweak: ~2 LOC (committed)
- Staging file regen (`scripts/data/staging/lesson-<N>/{capabilities,content-units,exercise-assets,lesson-page-blocks}.ts` × 9): unknown until re-publish runs; expected to be primarily slug shifts on `source_ref` fields, hundreds of lines of diff aggregate
- Operational work: 9 publishes + 1 SQL + 1 smoke test
