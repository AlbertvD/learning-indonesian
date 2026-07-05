// src/lib/mnemonics/affordance.ts
// The pure decision function behind the feedback-screen mnemonic surface (design §6):
// resurface a saved note on any miss; offer to create one — prominently once the
// word has tipped stubborn, quietly on an earlier miss — otherwise show nothing.
// No I/O, no randomness, no Date.now() — deterministic, unit-tested.

import { isStubborn, type CapabilityMasteryEvidence } from '@/lib/analytics/mastery/masteryModel'
import type { MnemonicAffordance } from './model'

/**
 * The subset of `CapabilityMasteryEvidence` that `isStubborn` actually reads
 * (masteryModel.ts:642-646: `lapseCount`, `reviewCount`, `consecutiveFailureCount`).
 * Callers on the feedback screen only have the block's `CapabilityScheduleSnapshot`
 * (`capabilityReviewProcessor.ts:12-24`) on hand — not a full mastery-evidence row
 * with capability/content metadata — so this narrower shape is the actual contract.
 * `CapabilityScheduleSnapshot` already carries all three fields, so callers can pass
 * it straight through with no adapting.
 */
export interface MnemonicGateEvidence {
  lapseCount: number
  reviewCount: number
  consecutiveFailureCount: number
}

export interface ResolveMnemonicAffordanceInput {
  /** The failed capability's word-level content identity (`learning_capabilities.source_ref`). */
  sourceRef: string
  /** The word's saved note, if any — a host-prefetched `Map<sourceRef, note>` lookup. */
  note: string | undefined
  /** The just-failed capability's schedule snapshot (pre-this-attempt; see design §6 note (b)). */
  evidence: MnemonicGateEvidence
  outcome: 'correct' | 'wrong'
}

/**
 * The two-tier resurface/offer/none decision (design §6, "the one surface, three
 * states"). Evaluated only on a `wrong` outcome — a correct answer never shows
 * anything here, which is also the entire "disappearance rule" (no timer, no flag).
 */
export function resolveMnemonicAffordance(input: ResolveMnemonicAffordanceInput): MnemonicAffordance {
  if (input.outcome !== 'wrong') return { kind: 'none' }

  if (input.note) return { kind: 'resurface', note: input.note }

  // The evidence is the session-BUILD-time schedule snapshot (capabilityReviewProcessor):
  // it does NOT include the wrong answer the learner just gave. Count that answer — their
  // real consecutive-failure streak is one higher. Without this, a word's FIRST miss in a
  // session (snapshot streak 0) offered nothing at all, so a plain "I got it wrong" never
  // surfaced the create option (owner-reported 2026-07-05).
  const streak = input.evidence.consecutiveFailureCount + 1
  const adjusted: MnemonicGateEvidence = { ...input.evidence, consecutiveFailureCount: streak }

  // isStubborn() only reads lapseCount/reviewCount/consecutiveFailureCount, so a
  // MnemonicGateEvidence value structurally satisfies it despite being a strict
  // subset of CapabilityMasteryEvidence's required fields — the cast is safe.
  if (isStubborn(adjusted as CapabilityMasteryEvidence)) {
    return {
      kind: 'offer',
      tier: 'prominent',
      sourceRef: input.sourceRef,
      failureCount: streak,
    }
  }

  // Any other wrong answer on a note-less word → the quiet, no-reframe opt-in (design §6
  // case 3 / §6a A'). This includes a genuinely-lapsed word (lapseCount > 0) that isStubborn
  // rules out — deliberately: never suppress the ability to start a hook, just withhold the
  // alarmist "not on you, {n}x" framing from a retention failure rather than an acquisition one.
  return { kind: 'offer', tier: 'quiet', sourceRef: input.sourceRef }
}
