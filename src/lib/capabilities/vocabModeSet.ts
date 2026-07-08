// The vocabulary mode-set contract (ADR 0027: vocabulary-mode-set-bounded).
//
// Bounds the per-word FSRS load to 3 introduced modes (2 at steady state, once
// #6 graduates #1 — Slice 2). Dependency-free (no Supabase / no browser client
// imports), same posture as `src/lib/analytics/mastery/mastered.ts`, so it is
// importable by both the app (runtime session-builder / analytics) and the
// pipeline (projector, one-off retirement script, health checks) without
// pulling either side's client.
//
// Single source of truth for the invariant — the projector (projectors/vocab.ts),
// the second capabilityCatalog.ts definition, the one-off retirement script
// (scripts/retire-dropped-vocab-modes.ts), and the HC-A/HC-B health checks
// (scripts/check-supabase-deep.ts) all import this rather than hard-coding the
// 3-mode split independently.

import type { CapabilityType } from './capabilityTypes'

/** The 3 modes every vocabulary item is introduced with (ADR 0027). */
export const KEPT_VOCAB_CAP_TYPES = [
  'recognise_meaning_from_text_cap', // #1 — root/scaffold, Phase-1 introduction vehicle
  'recognise_meaning_from_audio_cap', // #3 — aural, a distinct construct, never retired
  'produce_form_from_meaning_cap', // #6 — productive frontier, never retired
] as const satisfies readonly CapabilityType[]

/** The 3 modes retired from the vocabulary model entirely (ADR 0027). */
export const DROPPED_VOCAB_CAP_TYPES = [
  'recognise_form_from_meaning_cap', // #2
  'recall_meaning_from_text_cap', // #4
  'produce_form_from_audio_cap', // #5
] as const satisfies readonly CapabilityType[]
