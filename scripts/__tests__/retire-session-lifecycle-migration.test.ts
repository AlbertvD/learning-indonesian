import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('retirement #5 — session lifecycle migration (master)', () => {
  const masterSql = readFileSync(
    path.resolve('scripts/migration.sql'),
    'utf8',
  )

  it('drops the dead learning_sessions_write RLS policy', () => {
    expect(masterSql).toContain('drop policy if exists "learning_sessions_write" on indonesian.learning_sessions')
  })

  it('unschedules the finalize-stale-sessions cron job and drops the function', () => {
    expect(masterSql).toContain("perform cron.unschedule('finalize-stale-sessions')")
    expect(masterSql).toContain('drop function if exists indonesian.job_finalize_stale_sessions() cascade')
  })

  it('narrows learning_sessions GRANT to SELECT only for authenticated', () => {
    expect(masterSql).toContain('GRANT SELECT ON indonesian.learning_sessions TO authenticated')
    expect(masterSql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learning_sessions TO authenticated')
  })

  it('adds submittedAt to the commit_capability_answer_report required-fields validation', () => {
    expect(masterSql).toContain("or not (p_command ? 'submittedAt')")
    expect(masterSql).toContain("or nullif(p_command->>'submittedAt', '') is null")
  })

  it('upserts learning_sessions on each commit with end_time = greatest(existing, submittedAt)', () => {
    expect(masterSql).toContain('insert into indonesian.learning_sessions (id, user_id, session_type, started_at, ended_at)')
    expect(masterSql).toContain('on conflict (id) do update')
    expect(masterSql).toContain('set ended_at = greatest')
    expect(masterSql).toContain('indonesian.learning_sessions.ended_at')
    expect(masterSql).toContain('excluded.ended_at')
  })

  it('hardcodes session_type=learning in the upsert (only the capability path commits via this RPC)', () => {
    // The substring `'learning'` appears in the session_type column literal
    // within the new upsert. Confirm by colocation with the upsert keywords.
    const upsertIndex = masterSql.indexOf('insert into indonesian.learning_sessions (id, user_id, session_type, started_at, ended_at)')
    expect(upsertIndex).toBeGreaterThan(0)
    const upsertSlice = masterSql.slice(upsertIndex, upsertIndex + 600)
    expect(upsertSlice).toContain("'learning'")
    expect(upsertSlice).toContain("(p_command->>'submittedAt')::timestamptz")
    expect(upsertSlice).toContain("(p_command->>'sessionId')::uuid")
  })

  it('does not retain the old job_finalize_stale_sessions definition outside the retirement-#5 drop', () => {
    // The function definition was previously at migration.sql:1100-1140; under
    // retirement #5 it is removed from the master and replaced with a stub
    // comment + drop in the EOF retirement-#5 section.
    expect(masterSql).not.toMatch(/CREATE OR REPLACE FUNCTION indonesian\.job_finalize_stale_sessions/)
    expect(masterSql).toContain('Stale-session sweep + cron retired in 2026-05-07 retirement #5')
  })

  it('preserves service-role-only execution on commit_capability_answer_report', () => {
    expect(masterSql).toContain('grant execute on function indonesian.commit_capability_answer_report(jsonb) to service_role')
    expect(masterSql).toContain('revoke all on function indonesian.commit_capability_answer_report(jsonb) from authenticated')
  })
})
