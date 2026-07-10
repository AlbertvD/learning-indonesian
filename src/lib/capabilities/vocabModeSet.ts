// The vocabulary mode-set contract (ADR 0027: vocabulary-mode-set-bounded,
// amended 2026-07-09 for the four-card ladder —
// docs/plans/2026-07-09-vocab-four-card-ladder.md PR-A).
//
// Bounds the per-word FSRS load to 4 introduced modes (2 at steady state, once
// #6 graduates #1 and #2 — PR-A/PR-B). Dependency-free (no Supabase / no
// browser client imports), same posture as `src/lib/analytics/mastery/mastered.ts`,
// so it is importable by both the app (runtime session-builder / analytics)
// and the pipeline (projector, one-off scripts, health checks) without
// pulling either side's client.
//
// Single source of truth for the invariant — the projector (projectors/vocab.ts),
// the second capabilityCatalog.ts definition, the one-off retirement/un-retirement
// scripts (scripts/retire-dropped-vocab-modes.ts, scripts/unretire-vocab-mode.ts),
// and the HC-A/HC-B health checks (scripts/check-supabase-deep.ts) all import this
// rather than hard-coding the mode split independently.

import type { CapabilityType } from './capabilityTypes'

/**
 * The 4 modes every vocabulary item is introduced with (four-card ladder,
 * 2026-07-09 amendment to ADR 0027). #2 moved back from DROPPED — it is the
 * production-direction MCQ scaffold that graduates once #6
 * (produce_form_from_meaning_cap) reaches mastery strength (`#2 ← #6`,
 * `graduation.ts`), mirroring #1's role on the comprehension side. Owner
 * decision 2026-07-09, ~2-week checkpoint (~2026-07-23): reversible one
 * flag-flip (re-retire #2) if acquisition load proves too heavy.
 */
export const KEPT_VOCAB_CAP_TYPES = [
  'recognise_meaning_from_text_cap', // #1 — root/scaffold, Phase-1 introduction vehicle
  'recognise_form_from_meaning_cap', // #2 — production MCQ scaffold, graduates at #6 strength
  'recognise_meaning_from_audio_cap', // #3 — aural, a distinct construct, never retired
  'produce_form_from_meaning_cap', // #6 — productive frontier, never retired
] as const satisfies readonly CapabilityType[]

/** The 2 modes retired from the vocabulary model entirely (ADR 0027). */
export const DROPPED_VOCAB_CAP_TYPES = [
  'recall_meaning_from_text_cap', // #4
  'produce_form_from_audio_cap', // #5
] as const satisfies readonly CapabilityType[]

// Spreektaal register-pair core (docs/plans/2026-07-09-spreektaal-lesson-woven
// -core.md §4). Informal (register='informal') items are RECEPTIVE-ONLY — they
// generate only the recognise caps, never the two production-direction modes
// (#2 recognise_form_from_meaning_cap, #6 produce_form_from_meaning_cap). Under
// §7's bidirectional grader acceptance, an informal #6 would be a near-duplicate
// of the formal twin's #6 (same NL prompt, same accepted set) — review load with
// no new teaching, the exact redundancy the four-card-ladder work just removed.

/** The 2 modes an informal vocabulary item is introduced with — a strict subset
 *  of KEPT_VOCAB_CAP_TYPES (spec §4). */
export const INFORMAL_VOCAB_CAP_TYPES = [
  'recognise_meaning_from_text_cap', // #1 — root/scaffold
  'recognise_meaning_from_audio_cap', // #3′ — aural
] as const satisfies readonly CapabilityType[]

/** The 2 production-direction modes an informal item must NEVER emit (spec §4,
 *  §8 health check 5). */
export const INFORMAL_FORBIDDEN_VOCAB_CAP_TYPES = [
  'recognise_form_from_meaning_cap', // #2
  'produce_form_from_meaning_cap', // #6
] as const satisfies readonly CapabilityType[]
