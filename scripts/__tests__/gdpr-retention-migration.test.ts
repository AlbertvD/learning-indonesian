import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// GDPR retention purge (docs/plans/2026-07-02-gdpr-erasure-retention.md §2).
// Fixture-level structural test — asserts the migration.sql text contains
// the cron job + health function exactly as approved. Live semantic checks
// (job actually exists/is active/ran recently) are HC41
// (scripts/check-supabase-deep.ts); the actual-purge proof (data-architect
// G2) is a MANDATORY build-time manual verification, not automatable here —
// a `succeeded` job status proves nothing about row count purged.

const masterSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')

describe('GDPR retention purge — migration.sql (docs/plans/2026-07-02-gdpr-erasure-retention.md §2)', () => {
  it('idempotently unschedules gdpr-retention-purge before scheduling it', () => {
    expect(masterSql).toContain("perform cron.unschedule('gdpr-retention-purge')")
  })

  it('schedules gdpr-retention-purge daily', () => {
    expect(masterSql).toContain("cron.schedule(\n  'gdpr-retention-purge',")
  })

  it('purges both error_logs and capability_resolution_failure_events on a 90-day window', () => {
    expect(masterSql).toContain("delete from indonesian.error_logs\n      where created_at < now() - interval '90 days';")
    expect(masterSql).toContain("delete from indonesian.capability_resolution_failure_events\n      where created_at < now() - interval '90 days';")
  })

  it('defines retention_cron_health() as SECURITY DEFINER reading cron.* with pg_catalog, cron search_path (G4)', () => {
    expect(masterSql).toContain('create or replace function indonesian.retention_cron_health()')
    expect(masterSql).toContain('returns table (jobname text, active boolean, last_status text, last_run_at timestamptz)')
    expect(masterSql).toContain('security definer')
    expect(masterSql).toContain('set search_path = pg_catalog, cron')
    expect(masterSql).toContain("where j.jobname = 'gdpr-retention-purge'")
  })

  it('revokes PUBLIC execute and grants service_role only, with NO authenticated grant (G3)', () => {
    expect(masterSql).toContain('revoke all on function indonesian.retention_cron_health() from public;')
    expect(masterSql).toContain('grant execute on function indonesian.retention_cron_health() to service_role;')
    // The G3 finding: this function must never carry an authenticated grant —
    // assert none exists anywhere the function name appears.
    const fnOccurrences = masterSql.split('indonesian.retention_cron_health()')
    for (let i = 1; i < fnOccurrences.length; i++) {
      const surrounding = fnOccurrences[i].slice(0, 80)
      expect(surrounding).not.toMatch(/grant execute.*to authenticated/i)
    }
  })
})
