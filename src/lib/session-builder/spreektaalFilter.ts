import type { CapabilitySessionDataSnapshot } from './builder'

// Removes capabilities anchored to a register='informal' learning_items row
// (spec docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §5) from a
// loaded session snapshot when the learner has opted out via the Profile
// "Spreektaal (informele woorden) oefenen" toggle
// (src/lib/spreektaalPreferences.ts, src/contexts/SpreektaalContext.tsx).
//
// Client-side by design, mirroring listeningFilter.ts: get_session_build_data
// is parity-locked (docs/plans/2026-07-02-session-data-narrowing-rpc.md), so
// this never touches the RPC or its SQL — it filters the assembled snapshot
// before the planner runs.
//
// Filters both candidate sources the planner draws from:
//  - schedulerRows feeds BOTH the due-review pass (getDueCapabilities) and the
//    scoped practice-review pass (builder.ts's activePracticeReviewCapabilities)
//    — removing a row here removes it from both.
//  - plannerInput.readyCapabilities feeds the new-introduction pass.
// plannerInput.learnerCapabilityStates is left untouched — informal caps are
// never a prerequisite of another capability (spec §4 "Formal-first ordering":
// the formal twin is a prerequisite of the informal cap, never the reverse), so
// an orphaned state entry for an already-filtered-out capability contributes
// nothing to buildUnlockedSourceRefs (pedagogy.ts) and is safely inert.
//
// `informalRefs` is the caller-supplied `learning_items/<normalized_text>`
// sourceRef set for every register='informal' item (builder.ts resolves it via
// the adapter's loadInformalItemSourceRefs — one small read, independent of the
// parity-locked RPC, since register isn't part of the capability projection the
// way listening's `modality` field is). An empty set (toggle on, or the
// register/register_counterpart columns don't exist yet) is a no-op — every
// filter below simply matches nothing.
//
// Toggle-off semantics, stated for the record (spec §8 known limitation,
// listening-toggle parity): stops introductions and mutes reviews in sessions
// only — FSRS state keeps aging, and surfaces computing "due" outside the
// builder (dashboard badge, Voortgang forecast) still count muted cards.
export function excludeSpreektaalCapabilities(
  snapshot: CapabilitySessionDataSnapshot,
  informalRefs: ReadonlySet<string>,
): CapabilitySessionDataSnapshot {
  const isInformal = (canonicalKey: string): boolean => {
    const sourceRef = snapshot.capabilitiesByKey.get(canonicalKey)?.sourceRef
    return sourceRef !== undefined && informalRefs.has(sourceRef)
  }

  return {
    ...snapshot,
    schedulerRows: snapshot.schedulerRows.filter(row => !isInformal(row.canonicalKeySnapshot)),
    plannerInput: {
      ...snapshot.plannerInput,
      readyCapabilities: snapshot.plannerInput.readyCapabilities.filter(cap => !informalRefs.has(cap.sourceRef)),
    },
  }
}
