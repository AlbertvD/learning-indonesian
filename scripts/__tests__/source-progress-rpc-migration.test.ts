import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('source progress RPC migration', () => {
  const migrationSql = readFileSync(
    path.resolve('scripts/migrations/2026-04-25-capability-core.sql'),
    'utf8',
  )

  it('records source progress through an atomic monotonic RPC', () => {
    expect(migrationSql).toContain('create or replace function indonesian.record_source_progress_event(p_event jsonb)')
    expect(migrationSql).toContain('on conflict (user_id, idempotency_key) do nothing')
    expect(migrationSql).toContain('on conflict (user_id, source_ref, source_section_ref) do update')
    expect(migrationSql).toContain('completed_event_types = (')
    expect(migrationSql).toContain('last_event_at = greatest')
  })

  it('does not grant direct authenticated writes to source progress tables', () => {
    expect(migrationSql).toContain('revoke all on function indonesian.record_source_progress_event(jsonb) from public')
    expect(migrationSql).toContain('grant execute on function indonesian.record_source_progress_event(jsonb) to authenticated, service_role')
    expect(migrationSql).toContain('revoke insert, update, delete on indonesian.learner_source_progress_events from authenticated')
    expect(migrationSql).toContain('revoke insert, update, delete on indonesian.learner_source_progress_state from authenticated')
    expect(migrationSql).not.toContain('create policy "source progress events owner insert"')
    expect(migrationSql).not.toContain('create policy "source progress state owner update"')
  })
})
