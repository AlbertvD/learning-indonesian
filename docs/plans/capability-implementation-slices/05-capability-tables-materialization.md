# Slice 05: Capability Tables, Materialization, and Source Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce persistence for capabilities, artifacts, learner capability state, review event snapshots, aliases, and source progress without switching scheduling behavior.

**Architecture:** Add schema-qualified Supabase tables and compatibility materialization around canonical keys, with UUID IDs becoming authoritative for legacy state only after dry-run and backfill validation are clean.

**Tech Stack:** TypeScript, Supabase SQL/RPC conventions already used by repo scripts, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`

---

## Scope

Schema and backfill/migration support. Legacy state remains authoritative.

## Files

- Create source-of-truth migration SQL: `scripts/migrations/2026-04-25-capability-core.sql`.
- If the current runner only accepts `scripts/migration.sql`, copy the migration content there for execution, but do not treat `scripts/migration.sql` as the source of truth.
- Modify or confirm: `scripts/migrate.ts` can execute the migration safely.
- Create: `src/services/capabilityService.ts`
- Create: `src/services/sourceProgressService.ts`
- Create: `src/__tests__/capabilityService.test.ts`
- Create: `src/__tests__/sourceProgressService.test.ts`
- Create: `scripts/materialize-capabilities.ts`
- Create: `scripts/__tests__/materialize-capabilities.test.ts` with extracted pure planning logic.

## Migration Execution and Rollback Gate

The current migration runner streams `scripts/migration.sql` to `psql` with `ON_ERROR_STOP`, so the executable migration must be explicit:

- Source migration `scripts/migrations/2026-04-25-capability-core.sql` must be wrapped in `begin; ... commit;`.
- Source migration must include a clearly marked rollback section or companion rollback file with `drop policy`, `revoke`, and `drop table/function if exists` statements in dependency order.
- Before execution, copy the reviewed source migration into `scripts/migration.sql` and run the existing `scripts/migrate.ts` path.
- If any statement fails, the transaction must roll back all DDL from this slice.
- Do not enable any app feature flag until migration, schema-cache checks, and service smoke tests pass.
- Rollback verification must prove capability flags can remain disabled while new tables are absent or removed.

## Supabase Schema Rules

- Create all new tables and functions in the `indonesian` schema, matching existing service usage such as `supabase.schema('indonesian')`.
- Schema-qualify every DDL object as `indonesian.<object_name>`.
- Enable RLS on every learner-facing table.
- Grant schema usage and table/function access deliberately to the roles currently used by the app.
- Services must read/write through `supabase.schema('indonesian')`, not implicit public schema access.
- Add a schema-cache verification step after migration so PostgREST/Supabase can see new tables/functions before app code relies on them.

## Tables

- `indonesian.learning_capabilities`
- `indonesian.capability_aliases`
- `indonesian.capability_artifacts`
- `indonesian.learner_capability_state`
- `indonesian.capability_review_events`
- `indonesian.learner_source_progress_events`
- `indonesian.learner_source_progress_state`

## Key Columns and Constraints

`indonesian.learning_capabilities`:

```text
id uuid primary key
canonical_key text unique not null
source_kind text not null check source_kind in ('item','pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')
source_ref text not null
capability_type text not null
direction text not null
modality text not null
learner_language text not null
projection_version text not null
readiness_status text not null check readiness_status in ('ready','blocked','exposure_only','deprecated','unknown')
publication_status text not null check publication_status in ('draft','published','retired')
source_fingerprint text
artifact_fingerprint text
metadata_json jsonb not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

```text
unique(canonical_key)
index(source_kind, source_ref)
index(readiness_status, publication_status)
```

`indonesian.capability_aliases`:

```text
id uuid primary key
old_canonical_key text not null
new_canonical_key text not null
new_capability_id uuid references indonesian.learning_capabilities(id)
alias_reason text not null
mapping_kind text not null check mapping_kind in ('rename','split','merge','grammar_inference','manual')
migration_confidence text not null check migration_confidence in ('exact','high','medium','low','inferred','manual_required')
split_group_id text
weight numeric
created_at timestamptz not null default now()
unique(old_canonical_key, new_canonical_key, mapping_kind)
```

Alias materialization must reject cycles and chains longer than one hop unless an ADR explicitly allows them. One old key may map to multiple new keys for split migrations. FSRS state migration may only auto-apply `exact` or explicitly approved `high` confidence aliases; `inferred`, `medium`, `low`, and `manual_required` mappings require explicit migration review.

`indonesian.capability_artifacts`:

```text
id uuid primary key
capability_id uuid not null references indonesian.learning_capabilities(id)
artifact_kind text not null
quality_status text not null check quality_status in ('draft','approved','blocked','deprecated')
artifact_ref text
artifact_json jsonb not null default '{}'
artifact_fingerprint text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(capability_id, artifact_kind, artifact_fingerprint)
```

`indonesian.learner_capability_state`:

```text
id uuid primary key
user_id uuid not null
capability_id uuid not null references indonesian.learning_capabilities(id)
canonical_key_snapshot text not null
activation_state text not null check activation_state in ('dormant','active','suspended','retired')
activation_source text check activation_source in ('review_processor','admin_backfill','legacy_migration')
activation_event_id uuid
fsrs_state_json jsonb
stability double precision
difficulty double precision
next_due_at timestamptz
last_reviewed_at timestamptz
review_count integer not null default 0
lapse_count integer not null default 0
consecutive_failure_count integer not null default 0
state_version integer not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(user_id, capability_id)
```

Indexes:

```text
index(user_id, activation_state, next_due_at)
index(capability_id)
```

`indonesian.capability_review_events`:

```text
id uuid primary key
user_id uuid not null
capability_id uuid not null references indonesian.learning_capabilities(id)
learner_capability_state_id uuid not null references indonesian.learner_capability_state(id)
idempotency_key text not null
session_id text not null
session_item_id text not null
attempt_number integer not null
rating integer not null check rating between 1 and 4
answer_report_json jsonb not null
scheduler_snapshot_json jsonb not null
state_before_json jsonb not null
state_after_json jsonb not null
artifact_version_snapshot_json jsonb not null
created_at timestamptz not null default now()
unique(user_id, idempotency_key)
unique(session_id, session_item_id, attempt_number)
```

## Source Progress Model

Use append-only events plus a materialized current-state table. Do not collapse history into a single `(user_id, source_ref, progress_event)` row.

`indonesian.learner_source_progress_events`:

```text
id uuid primary key
user_id uuid not null
source_ref text not null
source_section_ref text not null default '__lesson__'
event_type text not null check event_type in ('opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')
occurred_at timestamptz not null
metadata_json jsonb not null default '{}'
idempotency_key text
created_at timestamptz not null default now()
unique(user_id, idempotency_key)
```

`indonesian.learner_source_progress_state`:

```text
id uuid primary key
user_id uuid not null
source_ref text not null
source_section_ref text not null default '__lesson__'
current_state text not null check current_state in ('not_started','opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')
completed_event_types text[] not null default '{}'
last_event_at timestamptz not null
metadata_json jsonb not null default '{}'
updated_at timestamptz not null default now()
unique(user_id, source_ref, source_section_ref)
```

Rules:

- `opened` and `lesson_completed` apply to `source_section_ref = '__lesson__'`.
- Section-level events use stable section refs from lesson page blocks.
- The service updates state idempotently from events and never deletes events during normal operation.

## RLS, Grants, and Schema Cache

Minimum migration checks:

- Enable RLS: `alter table indonesian.<table> enable row level security;`.
- Add owner read policies so authenticated learners can read only rows where `user_id = auth.uid()` for learner state, progress, and review-event tables.
- Allow direct authenticated learner writes only for source progress event capture where the service records lesson-reader progress, and require owner-write policies with `WITH CHECK (user_id = auth.uid())` for inserts and updates.
- Do not allow direct authenticated inserts or updates on `indonesian.learner_capability_state` or `indonesian.capability_review_events`; those writes are RPC-only through the Review Processor write seam.
- Keep catalog/content tables read-only to authenticated learners unless an admin publishing path is used.
- Grant `usage` on schema `indonesian` and necessary privileges per table: `select` for row-owner learner reads, `insert/update` only for source progress tables with `WITH CHECK`, no direct write grants for learner capability state or review events, and function execution only for approved RPC seams.
- Verify PostgREST schema visibility with a smoke query through `supabase.schema('indonesian')` for each new service before enabling any app path.

## Canonical-Key-to-UUID Transition Rules

- New capability-owned tables may use internal UUID FKs to other new capability-owned tables.
- Do not alter legacy tables to require capability UUID FKs in this slice.
- Do not make UUIDs authoritative for migrated learner FSRS state until dry-run/backfill reports are clean and reviewed.
- During migration, canonical key remains the reconciliation Interface; UUID is an implementation detail behind the service seam.

## Materialization Phases

1. Upsert `learning_capabilities` by canonical key.
2. Verify one canonical key maps to one UUID.
3. Upsert aliases with old key, new key, reason, and migration confidence; reject alias cycles.
4. Upsert `capability_artifacts` by capability, kind, and fingerprint.
5. Dry-run learner state backfill for ready and published capabilities with clear mappings.
6. Write `learner_capability_state` only for unambiguous mappings where `readiness_status = 'ready'` and `publication_status = 'published'`.
7. Report ambiguous, blocked, deprecated, exposure-only, and unmapped rows.
8. Enable UUID FKs from legacy tables only as a later subphase after dry-run/backfill reports are clean and reviewed.

## Verification

Run:

```bash
bun run test -- src/__tests__/capabilityService.test.ts src/__tests__/sourceProgressService.test.ts scripts/__tests__/materialize-capabilities.test.ts
bun scripts/materialize-capabilities.ts --dry-run
bun run build
```

Manual/Supabase verification:

```text
select to_regclass('indonesian.learning_capabilities');
select to_regclass('indonesian.learner_source_progress_events');
```

## Acceptance Criteria

- Dry run reports planned inserts and mapping gaps.
- Blocked/exposure-only capabilities can exist for diagnostics but cannot create learner FSRS rows.
- Source progress records `opened`, `section_exposed`, `intro_completed`, `heard_once`, `pattern_noticing_seen`, `guided_practice_completed`, and `lesson_completed` at lesson or section granularity.
- Review event schema supports idempotency keys, scheduler snapshots, and before/after state snapshots.
- RLS policies preserve write ownership: source progress can be learner-written, but learner capability state and capability review events are Review Processor/RPC-only writes.
- Artifact quality vocabulary matches the architecture: `draft`, `approved`, `blocked`, `deprecated`.
- Alias records include old key, new key, reason, mapping kind, and migration confidence, including `inferred` for reviewed grammar migration cases.
- Learner state backfill is blocked for draft, retired, unpublished, blocked, exposure-only, deprecated, or unknown capabilities.
- Services use `supabase.schema('indonesian')` and pass schema visibility smoke tests.
- Legacy learner state remains untouched.

## Out Of Scope

- Capability-native review commits.
- Session composer switch.
- UI source progress display.
