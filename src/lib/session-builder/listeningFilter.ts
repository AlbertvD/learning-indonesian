import type { CapabilitySessionDataSnapshot } from './builder'

// Removes audio-modality capabilities (recognise_meaning_from_audio_cap,
// produce_form_from_audio_cap, recognise_gist_from_audio_cap — every
// CapabilityModality === 'audio' type, verified against capabilityCatalog.ts
// and podcastProjectionRules.ts) from a loaded session snapshot when the
// learner has opted out via the Profile "disable listening exercises" toggle
// (src/lib/listeningPreferences.ts, src/contexts/ListeningContext.tsx).
//
// Client-side by design: get_session_build_data is parity-locked (docs/plans/
// 2026-07-02-session-data-narrowing-rpc.md), so this never touches the RPC or
// its SQL — it filters the assembled snapshot before the planner runs.
//
// Filters both candidate sources the planner draws from:
//  - schedulerRows feeds BOTH the due-review pass (getDueCapabilities) and the
//    scoped practice-review pass (builder.ts's activePracticeReviewCapabilities)
//    — removing a row here removes it from both.
//  - plannerInput.readyCapabilities feeds the new-introduction pass.
// plannerInput.learnerCapabilityStates is left untouched — audio capabilities
// are never a prerequisite for another capability (every audio cap in
// capabilityCatalog.ts depends ON a text capability, never the reverse), so an
// orphaned state entry for an already-filtered-out capability contributes
// nothing to buildUnlockedSourceRefs (pedagogy.ts) and is safely inert.
export function excludeListeningCapabilities(
  snapshot: CapabilitySessionDataSnapshot,
): CapabilitySessionDataSnapshot {
  const isAudioModality = (canonicalKey: string): boolean =>
    snapshot.capabilitiesByKey.get(canonicalKey)?.modality === 'audio'

  return {
    ...snapshot,
    schedulerRows: snapshot.schedulerRows.filter(row => !isAudioModality(row.canonicalKeySnapshot)),
    plannerInput: {
      ...snapshot.plannerInput,
      readyCapabilities: snapshot.plannerInput.readyCapabilities.filter(cap => !isAudioModality(cap.canonicalKey)),
    },
  }
}
