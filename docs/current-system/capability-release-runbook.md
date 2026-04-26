# Capability Release Runbook

Audience: a future coding session or human operator releasing the capability-based Lesson 1 path to Supabase.

This runbook is intentionally fail-closed. Publishing can create draft catalog rows, but only the promotion gate can make capabilities `ready/published` and schedulable.

## Required Environment

Required for database-writing scripts:

```text
VITE_SUPABASE_URL=https://api.supabase.duin.home
SUPABASE_SERVICE_KEY=<service-role key>
```

Required for Edge Function deployment:

```text
SUPABASE_ACCESS_TOKEN=<Supabase CLI token if using hosted CLI deployment>
SUPABASE_PROJECT_REF=<project ref if using hosted CLI deployment>
SUPABASE_URL=<project URL inside Edge Function env>
SUPABASE_SERVICE_ROLE_KEY=<service-role key inside Edge Function env>
```

Do not put these values in committed files. `.env.local` is local-only.

## Release Order

Run the steps in this exact order:

```text
1. Apply core capability migration.
2. Apply content unit / lesson block migration.
3. Apply capability review RPC migration.
4. Deploy Edge Function commit-capability-answer-report.
5. Run schema visibility checks.
6. Verify/approve a small Lesson 1 pilot artifact set.
7. Publish Lesson 1 in dry-run.
8. Publish Lesson 1 for real.
9. Promote Lesson 1 capabilities dry-run.
10. Promote Lesson 1 capabilities for real.
11. Run DB-backed health checks.
12. Run browser smoke tests.
```

If any step fails, stop. Do not skip ahead to promotion or feature flags.

## 1. Apply Core Capability Migration

Migration:

```text
scripts/migrations/2026-04-25-capability-core.sql
```

This creates:

```text
learning_capabilities
capability_aliases
capability_artifacts
learner_capability_state
capability_review_events
learner_source_progress_events
learner_source_progress_state
```

Rollback file:

```text
scripts/migrations/2026-04-25-capability-core.rollback.sql
```

Expected success:

```text
commit
```

Rollback decision point:

```text
If this migration fails before commit, fix the SQL or environment and rerun.
If it partially applied outside a transaction, inspect tables manually before running rollback.
```

Do not:

```text
Do not publish content before this migration is present.
Do not enable capability flags before source progress and review-event tables exist.
```

## 2. Apply Content Unit / Lesson Block Migration

Migration:

```text
scripts/migrations/2026-04-25-content-units-lesson-blocks.sql
```

This creates:

```text
content_units
lesson_page_blocks
capability_content_units
```

Rollback file:

```text
scripts/migrations/2026-04-25-content-units-lesson-blocks.rollback.sql
```

Expected success:

```text
commit
```

Rollback decision point:

```text
If content_units or lesson_page_blocks fail to create, do not run the publisher.
If capability_content_units fails, do not promote because lesson scoping will be incomplete.
```

Do not:

```text
Do not rely on materialize-capabilities.ts as an executor. It is a planner, not the publisher.
```

## 3. Apply Capability Review RPC Migration

Migration:

```text
scripts/migrations/2026-04-25-capability-review-rpc.sql
```

This creates:

```text
indonesian.commit_capability_answer_report(jsonb)
```

Rollback file:

```text
scripts/migrations/2026-04-25-capability-review-rpc.rollback.sql
```

Expected success:

```text
commit
```

Rollback decision point:

```text
If this RPC cannot be created, capability answer commits must stay disabled.
```

Do not:

```text
Do not call capability review commits directly from browser credentials.
The RPC requires a trusted service-role caller.
```

## 4. Deploy Edge Function

Function:

```text
supabase/functions/commit-capability-answer-report
```

Expected behavior:

```text
Browser calls Edge Function.
Edge Function uses service role.
RPC validates ready/published capability and idempotency.
```

Expected success:

```text
Function deploys and can reach SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY.
```

Rollback decision point:

```text
If deployment fails, leave capability answer commits disabled.
If env vars are missing, do not test with browser-side service keys.
```

Do not:

```text
Do not expose SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY in Vite/browser env.
```

## 5. Schema Visibility Checks

Run in SQL editor or via a trusted DB client:

```sql
select to_regclass('indonesian.learning_capabilities');
select to_regclass('indonesian.content_units');
select to_regclass('indonesian.lesson_page_blocks');
select to_regclass('indonesian.capability_content_units');
select to_regclass('indonesian.capability_artifacts');
select to_regclass('indonesian.learner_source_progress_state');
select to_regclass('indonesian.capability_review_events');
```

Expected success:

```text
Every query returns the table name, not null.
```

Rollback decision point:

```text
If any result is null, stop and apply or repair migrations before publishing.
```

Do not:

```text
Do not run publish-approved-content.ts until all tables are visible.
```

## 6. Verify/Approve Pilot Artifacts

Dry-run:

```bash
npx tsx scripts/approve-staged-capability-artifacts.ts --lesson 1 --dry-run
```

Expected success after the current pilot approval:

```text
"approved": 0
"blocked": 434
"unchanged": 7
```

Apply only when the dry-run lists reviewed concrete assets you intend to approve:

```bash
npx tsx scripts/approve-staged-capability-artifacts.ts --lesson 1 --apply
```

Rollback decision point:

```text
If placeholders appear in approved output, stop and fix staging.
If unreviewed concrete payloads appear, stop and add review metadata or block them.
```

Do not:

```text
Do not hand-edit quality_status to approved without running the approval gate.
```

## 7. Publish Lesson 1 Dry-Run

Command:

```bash
npx tsx scripts/publish-approved-content.ts 1 --dry-run
```

Expected success:

```text
Local Slice 10 validation passed before publish simulation
Would upsert 70 content units
Would upsert 138 lesson page blocks
Would upsert 190 capabilities
Would upsert 441 exercise assets
Successfully processed lesson 1
```

Rollback decision point:

```text
Dry-run writes nothing. If it fails, fix staging or validators and rerun.
```

Do not:

```text
Do not use --skip-lint for release unless this is an emergency diagnostic and the skipped check has been run separately.
```

## 8. Publish Lesson 1 For Real

Command:

```bash
npx tsx scripts/publish-approved-content.ts 1
```

Expected success:

```text
Upserted content units
Upserted lesson page blocks
Upserted capabilities
Upserted capability artifacts
Capability rows were published as draft/unknown.
```

Rollback decision point:

```text
If content writes fail, do not promote.
If artifacts fail to write, rerun publish after fixing the cause; upserts are intended to be idempotent.
```

Do not:

```text
Do not expect publish to make capabilities schedulable.
Publish writes capability rows as readiness_status = unknown and publication_status = draft.
```

## 9. Table Count Checks After Publish

Run:

```sql
select count(*) from indonesian.content_units;
select count(*) from indonesian.lesson_page_blocks;
select count(*) from indonesian.capability_content_units;
select readiness_status, publication_status, count(*)
from indonesian.learning_capabilities
group by readiness_status, publication_status;
select count(*) from indonesian.capability_artifacts;
```

Expected success:

```text
content_units has Lesson 1 rows.
lesson_page_blocks has Lesson 1 rows.
capability_content_units has relationship rows for capability scoping.
learning_capabilities shows unknown/draft rows before promotion.
capability_artifacts has rows, with approved artifacts only for the reviewed pilot subset.
```

Rollback decision point:

```text
If counts are zero after real publish, stop and inspect service-role env and schema.
If learning_capabilities are already ready/published before promotion, stop and investigate.
```

## 10. Promote Lesson 1 Dry-Run

Command:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run
```

Expected success:

```text
Lists exact capabilities that will become ready/published.
Lists blocked capabilities with reasons.
Does not write to the database.
```

Rollback decision point:

```text
If zero promotions are listed, stop. Either no approved pilot artifacts exist or the contract gate is blocking correctly.
If too many capabilities are listed, stop and inspect artifact approval status.
```

Do not:

```text
Do not apply promotion until a human/reviewer accepts the dry-run report.
```

## 11. Promote Lesson 1 For Real

Command:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --apply
```

Expected success:

```text
Only validated capabilities move to readiness_status = ready and publication_status = published.
Blocked and draft capabilities remain unschedulable.
```

Rollback decision point:

```text
If promotion updates the wrong capabilities, immediately disable capability feature flags and inspect learning_capabilities status.
```

Do not:

```text
Do not bulk update learning_capabilities to ready/published manually.
```

## 12. DB-Backed Health Checks

Command:

```bash
npx tsx scripts/check-capability-health.ts --lesson 1 --strict
```

Expected success:

```text
criticalCount is 0 for ready/published capabilities.
Draft/unknown capabilities may appear as warnings.
```

Rollback decision point:

```text
If critical findings appear, do not enable learner-facing capability session flags.
If findings mention missing artifacts, fix approval/publish before retrying.
If findings mention source progress refs, fix lesson-page block or content-unit scoping.
```

## 13. Browser Smoke Tests

Use a test account.

Expected checks:

```text
Lesson reader loads Lesson 1 from lesson_page_blocks.
Opening/reading blocks writes source progress.
Capability session loads only ready/published capabilities.
Experience Player renders Dutch learner-facing text.
Answering one capability card commits through the Edge Function.
Repeating the same idempotency key returns duplicate_returned.
```

Rollback decision point:

```text
If source progress does not write, keep capability introductions disabled.
If review commit fails, keep capability sessions disabled.
If raw canonical keys appear in learner UI, keep the new session UI behind flags.
```

## Feature Flag Rule

Keep learner-facing capability flags disabled until all of these are true:

```text
migrations visible
publish dry-run passes
real publish succeeds
promotion dry-run accepted
promotion apply succeeds
DB-backed health has no critical findings
browser smoke passes for lesson reader, source progress, session load, and review commit
```
