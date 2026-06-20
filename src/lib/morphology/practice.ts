// lib/morphology/practice — the scoped-session launch doorway. The trainer hosts
// NO drills: "Practise <affix>" navigates to the normal Session route filtered to
// the affix (mode=affix_practice). The affix label travels in the URL so the
// scope survives refresh/bookmark; the Session page resolves it to source_refs via
// loadSelectedAffixScope (adapter.ts). This file owns only the route shape + a
// pure snapshot→scope helper (the launch is a route, never a session-builder import).

import type { MorphologySnapshot } from './adapter'

/** The SessionMode value an affix session runs under (mirrors the session-builder
 *  literal; kept here so the trainer never hardcodes it inline). */
export const AFFIX_SESSION_MODE = 'affix_practice' as const

/** The Session route for practising one affix. */
export function affixPracticePath(affix: string): string {
  const params = new URLSearchParams({ mode: AFFIX_SESSION_MODE, affix })
  return `/session?${params.toString()}`
}

/** Pure scope from a loaded snapshot — the ready+published cap source_refs of the
 *  affix (null-affix rows excluded defensively). The runtime resolver
 *  (loadSelectedAffixScope) does the same over a focused DB query; this mirror is
 *  the testable reference + lets the detail page show "nothing to practise yet". */
export function affixScopeFromSnapshot(snapshot: MorphologySnapshot, affix: string): string[] {
  const refs = new Set<string>()
  for (const pair of snapshot.pairs) {
    if (pair.affix !== affix) continue
    const cap = snapshot.pairCapsById.get(pair.capabilityId)
    if (cap && cap.readinessStatus === 'ready' && cap.publicationStatus === 'published') {
      refs.add(cap.sourceRef)
    }
  }
  return [...refs]
}
