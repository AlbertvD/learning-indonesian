// Phase 0 — grammar verification: merge a lesson's extracted claims with the
// authority verdicts (produced by the web-enabled cross-check agent against
// TBBBI + KBBI) into the final report, asserting full coverage.
//
// Usage:
//   bun scripts/grammar-podcast/build-cross-check-report.ts <orderIndex>
//
// Reads:  content/grammar-review/lesson-<N>.claims.json   (from extract-grammar-claims.ts)
//         content/grammar-review/lesson-<N>.verdicts.json (agent output: ClaimVerdict[])
// Writes: content/grammar-review/lesson-<N>.tbbbi.json    (the report)
//
// Exit 1 if any claim is unresolved or any verdict is orphaned — coverage must be
// complete and provable before corrections are applied.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildReport } from './crossCheckReport'
import type { GrammarClaim } from './grammarClaims'
import type { ClaimVerdict } from './crossCheckReport'

const oi = Number(process.argv[2])
if (!Number.isInteger(oi) || oi < 1) {
  console.error('Usage: bun scripts/grammar-podcast/build-cross-check-report.ts <orderIndex>')
  process.exit(1)
}

const dir = 'content/grammar-review'
const claimsDoc = JSON.parse(readFileSync(`${dir}/lesson-${oi}.claims.json`, 'utf8')) as { claims: GrammarClaim[] }
const verdicts = JSON.parse(readFileSync(`${dir}/lesson-${oi}.verdicts.json`, 'utf8')) as ClaimVerdict[]

const report = buildReport(oi, claimsDoc.claims, verdicts)
const path = `${dir}/lesson-${oi}.tbbbi.json`
writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf8')

const byStatus = report.verdicts.reduce<Record<string, number>>((acc, v) => {
  acc[v.status] = (acc[v.status] ?? 0) + 1
  return acc
}, {})
console.log(`✓ ${path}`)
console.log(`  claims=${report.claimCount} confirmed=${byStatus.confirmed ?? 0} incomplete=${byStatus.incomplete ?? 0} wrong=${byStatus.wrong ?? 0}`)
if (report.unresolved.length) console.error(`  ✗ UNRESOLVED (no verdict): ${report.unresolved.join(', ')}`)
if (report.unknownVerdicts.length) console.error(`  ✗ ORPHAN verdicts: ${report.unknownVerdicts.join(', ')}`)
if (report.unresolved.length || report.unknownVerdicts.length) process.exit(1)
