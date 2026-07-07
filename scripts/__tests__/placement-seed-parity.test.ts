import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLACEMENT_SEED_STABILITY,
  PLACEMENT_SEED_DIFFICULTY,
} from '@/lib/placement/seedConstants'

// ADR 0026 §4.3 / §7.5 parity guard (node context — this dir is not
// browser-typechecked, so node:fs is fine here). Two independent drift risks:
//
//   1. apply_placement_result (scripts/migration.sql) bakes the frozen
//      stability/difficulty as SQL literals. They must match the single
//      source of truth in src/lib/placement/seedConstants.ts EXACTLY — a
//      hand-edited SQL literal that drifts from the TS constant would seed
//      FSRS state the version-pin test (seedConstants.test.ts) never sees,
//      silently corrupting what real learners get scheduled at.
//   2. seedConstants.test.ts re-derives those constants using a LOCAL mirror
//      of the FSRS engine params (ts-fsrs runs client-side in the vitest
//      process; the deployed engine runs Deno-side in the edge function) —
//      the mirror must carry the SAME weights array as the deployed function,
//      or the "re-derivation" is re-deriving against the wrong engine.
const migrationSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')
const edgeFunctionSrc = readFileSync(
  path.resolve('supabase/functions/commit-capability-answer-report/index.ts'),
  'utf8',
)

describe('placement seed constants ↔ migration.sql SQL literal parity (ADR 0026 §4.3)', () => {
  it('migration.sql bakes the frozen stability constant as a literal', () => {
    expect(migrationSql).toContain(String(PLACEMENT_SEED_STABILITY))
  })

  it('migration.sql bakes the frozen difficulty constant as a literal', () => {
    expect(migrationSql).toContain(String(PLACEMENT_SEED_DIFFICULTY))
  })
})

describe('seedConstants.test.ts FSRS weights mirror ↔ deployed edge function parity (ADR 0026 §7.5)', () => {
  it('the edge function still carries the exact weights array seedConstants.test.ts mirrors', () => {
    const weightsLiteral =
      'w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52]'
    expect(edgeFunctionSrc).toContain(weightsLiteral)
  })
})

describe('commit_capability_answer_report accepts the placement provenance (ADR 0026 continuation)', () => {
  // A placement-seeded row's activation_source is sticky and flows through the
  // edge function into stateAfter.activationSource on the FIRST real review. The
  // commit RPC's activationSource allow-list must include 'placement' or that
  // first review is rejected as rejected_invalid_outcome — silently breaking the
  // engine-continuation guarantee. This is the ONLY guard for that fix; no
  // integration path exercises it until the live golden round-trip.
  it("the commit RPC's activationSource allow-list includes 'placement'", () => {
    expect(migrationSql).toContain(
      "not in ('review_processor', 'admin_backfill', 'legacy_migration', 'placement')",
    )
  })
})
