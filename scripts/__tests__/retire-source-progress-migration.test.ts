import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('retirement #6 — source-progress → lesson-activation migration (master)', () => {
  const masterSql = readFileSync(
    path.resolve('scripts/migration.sql'),
    'utf8',
  )

  it('creates the learner_lesson_activation table with composite PK', () => {
    expect(masterSql).toContain('create table if not exists indonesian.learner_lesson_activation')
    expect(masterSql).toContain('primary key (user_id, lesson_id)')
  })

  it('enables RLS + owner-read policy on learner_lesson_activation', () => {
    expect(masterSql).toContain('alter table indonesian.learner_lesson_activation enable row level security')
    expect(masterSql).toContain('"lesson activation owner read"')
    expect(masterSql).toContain('using (user_id = auth.uid())')
  })

  it('grants SELECT to authenticated and revokes write privileges (writes via RPC only)', () => {
    expect(masterSql).toContain('grant select on indonesian.learner_lesson_activation to authenticated')
    expect(masterSql).toContain('revoke insert, update, delete on indonesian.learner_lesson_activation from authenticated')
    expect(masterSql).toContain('grant all on indonesian.learner_lesson_activation to service_role')
  })

  it('defines set_lesson_activation RPC with user-mismatch + lesson-existence checks', () => {
    expect(masterSql).toContain('create or replace function indonesian.set_lesson_activation')
    expect(masterSql).toContain("raise exception 'set_lesson_activation user mismatch'")
    expect(masterSql).toContain("raise exception 'set_lesson_activation lesson not found")
    expect(masterSql).toContain('on conflict (user_id, lesson_id) do nothing')
  })

  it('adds learning_capabilities.lesson_id column (nullable, FK to lessons)', () => {
    expect(masterSql).toContain('add column if not exists lesson_id uuid references indonesian.lessons(id) on delete set null')
    expect(masterSql).toContain('create index if not exists learning_capabilities_lesson_idx')
  })

  it('backfills lesson_id from page-block adjacency (idempotent via WHERE … IS NULL; wrapped in column-existence guard post-#61)', () => {
    expect(masterSql).toContain('update indonesian.learning_capabilities c')
    expect(masterSql).toContain('select distinct on (cap_key)')
    expect(masterSql).toContain('unnest(pb.capability_key_refs) as cap_key')
    expect(masterSql).toContain('and c.lesson_id is null')
    // Post-#61: the backfill UPDATE is wrapped in a column-existence DO block so
    // it becomes a no-op once capability_key_refs is dropped from the table.
    // Keeps the file idempotent on fresh DBs AND on already-dropped live DBs.
    expect(masterSql).toMatch(
      /if exists \([\s\S]*?column_name = 'capability_key_refs'[\s\S]*?\) then[\s\S]*?unnest\(pb\.capability_key_refs\) as cap_key/i,
    )
  })

  it('auto-activates legacy lessons {1,2,3} for every existing user (idempotent)', () => {
    expect(masterSql).toContain('insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)')
    expect(masterSql).toContain('where l.order_index in (1, 2, 3)')
    expect(masterSql).toContain('on conflict (user_id, lesson_id) do nothing')
  })

  it('promotes legacy lesson_progress rows using completed_at (no last_accessed_at — that column does not exist; R1 v2 C9)', () => {
    expect(masterSql).toContain('coalesce(lp.completed_at, now())')
    expect(masterSql).toContain('from indonesian.lesson_progress lp')
    // Negative assertion: the phantom column must not appear.
    expect(masterSql).not.toContain('lp.last_accessed_at')
  })

  it('rewrites get_lessons_overview to use activation + lesson_progress union (cleanup stage)', () => {
    expect(masterSql).toContain('create or replace function indonesian.get_lessons_overview(p_user_id uuid)')
    expect(masterSql).toContain('from indonesian.learner_lesson_activation lla')
    expect(masterSql).toContain('from indonesian.lesson_progress lp')
    expect(masterSql).toContain('as has_started_lesson')
  })

  it('drops has_meaningful_exposure from get_lessons_overview return shape', () => {
    // The cleanup-stage rewrite removes the field. Verify by counting occurrences:
    // the only surviving reference should be in narrative comments, not the
    // RETURNS TABLE signature of the new function body. The anchor moved from
    // `-- 6. REWRITE: get_lessons_overview` (retirement #6 cleanup) to the new
    // Phase 1 rewrite block in 2026-05-20.
    const newFnIndex = masterSql.indexOf('-- get_lessons_overview — 2026-05-20')
    expect(newFnIndex).toBeGreaterThan(0)
    const newFnSlice = masterSql.slice(newFnIndex, newFnIndex + 3000)
    expect(newFnSlice).not.toContain('has_meaningful_exposure')
  })

  it('drops both source-progress SQL functions in the cleanup stage', () => {
    expect(masterSql).toContain('drop function if exists indonesian._capability_source_progress_met(uuid, jsonb, text, text) cascade')
    expect(masterSql).toContain('drop function if exists indonesian.record_source_progress_event(jsonb) cascade')
  })

  it('drops the lesson_page_blocks.source_progress_event column conditionally', () => {
    expect(masterSql).toContain('alter table indonesian.lesson_page_blocks drop column source_progress_event')
  })

  it('drops both source-progress tables with CASCADE', () => {
    expect(masterSql).toContain('drop table if exists indonesian.learner_source_progress_state cascade')
    expect(masterSql).toContain('drop table if exists indonesian.learner_source_progress_events cascade')
  })

  it('does NOT recreate the _capability_lesson_activated helper (R1 v3 I19: dropped, zero callers)', () => {
    // The helper was proposed in v0/v1/v2 and dropped in v3 because its only
    // intended consumer (compute_todays_plan_raw) was retired in retirement #4.
    expect(masterSql).not.toMatch(/create or replace function indonesian\._capability_lesson_activated/)
  })
})
