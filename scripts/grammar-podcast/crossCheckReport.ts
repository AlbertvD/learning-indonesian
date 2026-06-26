// Phase 0 — grammar verification: the report contract. Pairs every extracted
// grammar claim with exactly one authority verdict (TBBBI / KBBI), and surfaces
// any claim left without a verdict in `unresolved` — so coverage is provable and
// nothing is silently dropped.

import type { GrammarClaim } from './grammarClaims'

export type VerdictStatus = 'confirmed' | 'wrong' | 'incomplete'

export interface ClaimVerdict {
  claimId: string
  status: VerdictStatus
  citation: string // e.g. "TBBBI §V.2.1" / "KBBI: lema 'beli'" — the specific entry behind the verdict
  note: string // own-words finding / suggested correction (never copied source text)
}

export interface CrossCheckReport {
  lesson: number
  source: 'TBBBI+KBBI'
  claimCount: number
  verdicts: (GrammarClaim & ClaimVerdict)[]
  unresolved: string[] // claimIds with no verdict — must be empty for a complete pass
  unknownVerdicts: string[] // verdicts referencing a claimId that does not exist
}

// Build the report by joining claims to verdicts on claimId. One verdict per
// claim; extra/duplicate/orphan verdicts are reported, not silently merged.
export function buildReport(lesson: number, claims: GrammarClaim[], verdicts: ClaimVerdict[]): CrossCheckReport {
  const byClaim = new Map<string, GrammarClaim>(claims.map((c) => [c.claimId, c]))
  const seen = new Set<string>()
  const joined: (GrammarClaim & ClaimVerdict)[] = []
  const unknownVerdicts: string[] = []

  for (const v of verdicts) {
    const claim = byClaim.get(v.claimId)
    if (!claim) {
      unknownVerdicts.push(v.claimId)
      continue
    }
    if (seen.has(v.claimId)) {
      // Duplicate verdict for a claim — keep the first, flag the rest as unknown
      // (a verdict that can't cleanly attach is surfaced, never dropped silently).
      unknownVerdicts.push(`${v.claimId} (duplicate)`)
      continue
    }
    seen.add(v.claimId)
    joined.push({ ...claim, ...v })
  }

  const unresolved = claims.map((c) => c.claimId).filter((id) => !seen.has(id))

  return {
    lesson,
    source: 'TBBBI+KBBI',
    claimCount: claims.length,
    verdicts: joined,
    unresolved,
    unknownVerdicts,
  }
}
