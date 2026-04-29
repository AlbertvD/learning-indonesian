import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('capability review RPC migration', () => {
  const migrationSql = readFileSync(
    path.resolve('scripts/migrations/2026-04-25-capability-review-rpc.sql'),
    'utf8',
  )

  it('does not expose hand-authored FSRS state commits directly to authenticated clients', () => {
    expect(migrationSql).not.toContain('grant execute on function indonesian.commit_capability_answer_report(jsonb) to authenticated')
    expect(migrationSql).toContain('grant execute on function indonesian.commit_capability_answer_report(jsonb) to service_role')
  })

  it('validates state snapshots, algorithm version, and counter deltas inside the RPC', () => {
    expect(migrationSql).toContain("not (p_command ? 'canonicalKeySnapshot')")
    expect(migrationSql).toContain("nullif(p_command->>'canonicalKeySnapshot', '') is null")
    expect(migrationSql).toContain("jsonb_typeof(p_command->'answerReport') is distinct from 'object'")
    expect(migrationSql).toContain("jsonb_typeof(p_command->'schedulerSnapshot') is distinct from 'object'")
    expect(migrationSql).toContain("jsonb_typeof(p_command->'artifactVersionSnapshot') is distinct from 'object'")
    expect(migrationSql).toContain("p_command->>'fsrsAlgorithmVersion' is distinct from 'ts-fsrs:language-learning-v1'")
    expect(migrationSql).toContain("p_command->>'rating' is null")
    expect(migrationSql).toContain("v_state_before->>'activationState'")
    expect(migrationSql).toContain("v_state_after->>'reviewCount'")
    expect(migrationSql).toContain("v_state_after->>'lapseCount'")
    expect(migrationSql).toContain("v_state_after->>'consecutiveFailureCount'")
    expect(migrationSql).toContain('is distinct from v_state.state_version')
  })

  it('validates activation commands before inserting a new active state', () => {
    const firstStateInsert = migrationSql.indexOf('insert into indonesian.learner_capability_state')
    const stateAfterValidation = migrationSql.indexOf("v_state_after->>'activationState' is distinct from 'active'")

    expect(stateAfterValidation).toBeGreaterThan(0)
    expect(firstStateInsert).toBeGreaterThan(stateAfterValidation)
  })

  it('serializes duplicate commits before idempotency lookup', () => {
    const lockIndex = migrationSql.indexOf('pg_advisory_xact_lock')
    const duplicateLookupIndex = migrationSql.indexOf('from indonesian.capability_review_events')

    expect(lockIndex).toBeGreaterThan(0)
    expect(duplicateLookupIndex).toBeGreaterThan(lockIndex)
  })

  it('preserves existing activation provenance on updates', () => {
    expect(migrationSql).toContain("activation_source = coalesce(activation_source, v_state_after->>'activationSource', 'review_processor')")
  })
})
