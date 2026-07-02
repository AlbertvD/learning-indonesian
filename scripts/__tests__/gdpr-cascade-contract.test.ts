import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// GDPR erasure (docs/plans/2026-07-02-gdpr-erasure-retention.md §1.2, Testing).
// The delete-account edge function relies entirely on the existing FK
// cascade off auth.users — it never touches an indonesian.* table directly.
// This is a fixture-level (source-scan) test, not a live-DB check: deleting
// a real user to count orphans is destructive and non-reproducible (spec
// §Supabase Requirements → Health check additions). A future FK added with
// default NO ACTION would silently BLOCK the GoTrue admin delete; this test
// is the guard.
//
// Architect W2: the guard must be robust to all three FK declaration forms
// that can appear in migration.sql, not just the one currently in use —
// inline column defs, `ALTER TABLE ... ADD CONSTRAINT ... REFERENCES
// auth.users`, and multi-line declarations where `ON DELETE` lands on a
// following line. A regex anchored only to `REFERENCES auth.users(id)`,
// forward-scanned to the next statement delimiter (`,` or `;`), covers all
// three without assuming a single-line layout — verified against synthetic
// fixtures of each form below.

const masterSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')

function findAuthUsersFkClauses(sql: string): string[] {
  const clauses: string[] = []
  const pattern = /references\s+auth\.users\s*\([^)]*\)/gis
  let match: RegExpExecArray | null
  while ((match = pattern.exec(sql)) !== null) {
    const start = match.index
    const tailStart = start + match[0].length
    const commaIdx = sql.indexOf(',', tailStart)
    const semiIdx = sql.indexOf(';', tailStart)
    const candidates = [commaIdx, semiIdx].filter((i) => i !== -1)
    const end = candidates.length > 0 ? Math.min(...candidates) : tailStart + 300
    clauses.push(sql.slice(start, end))
  }
  return clauses
}

const ON_DELETE_RE = /on\s+delete\s+(cascade|set\s+null)/i

describe('GDPR erasure — auth.users FK cascade completeness (fixture-level, architect W2)', () => {
  const clauses = findAuthUsersFkClauses(masterSql)

  it('finds all 12 REFERENCES auth.users occurrences (audit §2 baseline, re-verified spec §1.2)', () => {
    expect(clauses.length).toBe(12)
  })

  it('every REFERENCES auth.users(id) clause carries an explicit ON DELETE CASCADE or ON DELETE SET NULL', () => {
    const missing = clauses.filter((c) => !ON_DELETE_RE.test(c))
    expect(missing).toEqual([])
  })

  it('the two SET NULL representatives (error_logs, capability_resolution_failure_events) are present', () => {
    const setNullCount = clauses.filter((c) => /on\s+delete\s+set\s+null/i.test(c)).length
    expect(setNullCount).toBe(2)
  })

  it('handles the inline column-def FK form (the only form currently in migration.sql)', () => {
    const fixture = `create table t (\n  user_id uuid not null references auth.users(id) on delete cascade\n);`
    expect(findAuthUsersFkClauses(fixture)).toHaveLength(1)
    expect(findAuthUsersFkClauses(fixture)[0]).toMatch(ON_DELETE_RE)
  })

  it('handles the ALTER TABLE ... ADD CONSTRAINT ... REFERENCES form', () => {
    const fixture = `alter table indonesian.t add constraint t_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;`
    expect(findAuthUsersFkClauses(fixture)).toHaveLength(1)
    expect(findAuthUsersFkClauses(fixture)[0]).toMatch(ON_DELETE_RE)
  })

  it('handles a multi-line declaration where ON DELETE lands on a following line', () => {
    const fixture = `  user_id uuid not null\n    references auth.users(id)\n    on delete set null,`
    expect(findAuthUsersFkClauses(fixture)).toHaveLength(1)
    expect(findAuthUsersFkClauses(fixture)[0]).toMatch(/on\s+delete\s+set\s+null/i)
  })

  it('a future FK with default NO ACTION (no ON DELETE clause) is NOT silently accepted', () => {
    const fixture = `user_id uuid references auth.users(id),`
    expect(findAuthUsersFkClauses(fixture)).toHaveLength(1)
    expect(findAuthUsersFkClauses(fixture)[0]).not.toMatch(/on\s+delete/i)
  })
})
