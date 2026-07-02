import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ADR 0015 parity guard, layer (a): the get_session_build_data RPC's
// candidate_caps inclusion predicate must match the documented sufficiency
// clauses (docs/plans/2026-07-02-session-data-narrowing-rpc.md, "Sufficiency
// predicate"). This is a structural (source-scan) test, not a live-DB check —
// it catches a drift where a clause is dropped/reworded in migration.sql
// without a corresponding spec/CONTEXT.md update. The live semantic parity
// check is HC40 (scripts/check-supabase-deep.ts).

const migrationSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')

function rpcBody(): string {
  const start = migrationSql.indexOf('create or replace function indonesian.get_session_build_data(')
  expect(start).toBeGreaterThan(-1)
  const end = migrationSql.indexOf('$$;', start)
  expect(end).toBeGreaterThan(start)
  return migrationSql.slice(start, end)
}

function candidateCapsCte(): string {
  const body = rpcBody()
  const start = body.indexOf('candidate_caps as (')
  expect(start).toBeGreaterThan(-1)
  const end = body.indexOf('reviewed_today as (', start)
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end)
}

describe('get_session_build_data RPC — sufficiency predicate structural parity (ADR 0015)', () => {
  it('is SECURITY INVOKER with a jsonb scalar return (PGRST_DB_MAX_ROWS-immune)', () => {
    expect(migrationSql).toContain('drop function if exists indonesian.get_session_build_data(uuid, text, text[], timestamptz);')
    expect(rpcBody()).toContain('returns jsonb')
    expect(rpcBody()).toContain('language sql stable security invoker')
  })

  it('accepts p_user_id, p_mode, p_selected_source_refs, and p_day_start (browser-local midnight, ADR-0015 open question 1)', () => {
    const body = rpcBody()
    expect(body).toContain('p_user_id             uuid')
    expect(body).toContain('p_mode                text')
    expect(body).toContain("p_selected_source_refs text[]      default '{}'")
    expect(body).toContain("p_day_start           timestamptz  default date_trunc('day', now())")
  })

  it('guards candidate_caps on ready + published + not-retired', () => {
    const cte = candidateCapsCte()
    expect(cte).toContain("c.readiness_status = 'ready'")
    expect(cte).toContain("c.publication_status = 'published'")
    expect(cte).toContain('c.retired_at is null')
  })

  it('includes all five documented sufficiency arms (A-E)', () => {
    const cte = candidateCapsCte()
    // (A) learner_capability_state row exists for p_user_id — unconditional across every mode.
    expect(cte).toContain('exists (select 1 from user_states us where us.capability_id = c.id)')
    // (B) standard mode AND lesson_id activated.
    expect(cte).toContain('c.lesson_id in (select lesson_id from activated_lessons)')
    // (C) standard mode AND source_ref in activated collection ∪ reading-harvest member refs.
    expect(cte).toContain('c.source_ref in (select source_ref from activated_member_refs)')
    // (D) standard mode AND lesson_id IS NULL (podcast carve-out, ADR 0006).
    expect(cte).toContain('c.lesson_id is null')
    // (E) scoped mode AND source_ref = ANY(p_selected_source_refs).
    expect(cte).toContain('c.source_ref = any(p_selected_source_refs)')
  })

  it('gates B/C/D behind standard mode and E behind non-standard (scoped) mode', () => {
    const cte = candidateCapsCte()
    expect(cte).toContain("p_mode = 'standard' and (")
    expect(cte).toContain("p_mode <> 'standard' and c.source_ref = any(p_selected_source_refs)")
  })

  it('clause A is NOT gated by mode (unconditional — due caps ignore activation, Trap 1)', () => {
    const cte = candidateCapsCte()
    // Clause A must appear before the mode-gated OR arms, and outside any
    // `p_mode = 'standard'` guard — i.e. it is the first disjunct of the WHERE's
    // outer OR, unconditional across every mode.
    const clauseAIndex = cte.indexOf('exists (select 1 from user_states us where us.capability_id = c.id)')
    const modeGuardIndex = cte.indexOf("p_mode = 'standard' and (")
    expect(clauseAIndex).toBeGreaterThan(-1)
    expect(modeGuardIndex).toBeGreaterThan(clauseAIndex)
  })

  it('activated_member_refs mirrors lib/collections/membership.resolveActivatedMemberRefs (no is_published filter, UNION of collections + harvest, learning_items/ prefix)', () => {
    const body = rpcBody()
    const start = body.indexOf('activated_member_refs as (')
    const end = body.indexOf('user_states as (', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const cte = body.slice(start, end)
    expect(cte).toContain("'learning_items/' || li.normalized_text")
    expect(cte).toContain('indonesian.collection_items ci')
    expect(cte).toContain('indonesian.learner_collection_activation lca')
    expect(cte).toContain('indonesian.learner_reading_harvest lrh')
    expect(cte).toContain('union')
    expect(cte).not.toContain('is_published')
  })

  it('reviewed_today uses the caller-supplied p_day_start (browser-local midnight), not now()', () => {
    const body = rpcBody()
    const start = body.indexOf('reviewed_today as (')
    expect(start).toBeGreaterThan(-1)
    const end = body.indexOf('select jsonb_build_object', start)
    expect(end).toBeGreaterThan(start)
    const cte = body.slice(start, end)
    expect(cte).toContain('e.created_at >= p_day_start')
    expect(cte).toContain('select distinct e.capability_id')
  })

  it('the jsonb payload carries all six pieces the adapter assembles from', () => {
    const body = rpcBody()
    expect(body).toContain("'capabilities', coalesce((")
    expect(body).toContain("'learner_states', coalesce((")
    expect(body).toContain("'activated_lesson_ids', coalesce((")
    expect(body).toContain("'lessons', coalesce((")
    expect(body).toContain("'reviewed_today_capability_ids', coalesce((")
    expect(body).toContain("'activated_member_refs', coalesce((")
  })

  it('is locked down to authenticated + service_role only (no public/anon execute)', () => {
    expect(migrationSql).toContain('revoke all on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) from public;')
    expect(migrationSql).toContain('grant execute on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) to authenticated, service_role;')
  })
})
