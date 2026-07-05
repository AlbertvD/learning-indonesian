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

  // isStubborn() only reads lapseCount/reviewCount/consecutiveFailureCount, so a
  // MnemonicGateEvidence value structurally satisfies it despite being a strict
  // subset of CapabilityMasteryEvidence's required fields — the cast is safe.
  if (isStubborn(input.evidence as CapabilityMasteryEvidence)) {
    return {
      kind: 'offer',
      tier: 'prominent',
      sourceRef: input.sourceRef,
      failureCount: input.evidence.consecutiveFailureCount,
    }
  }

  // An earlier miss (1-3 consecutive failures) on a word with no note yet: the
  // quiet, no-reframe affordance (design §6 case 3 / §6a A'). Also fires for a
  // genuinely-lapsed word (lapseCount > 0) that isn't yet re-flagged stubborn by
  // isStubborn's own gate — deliberately: never suppress the ability to start a
  // hook, just withhold the alarmist "not on you, {n}x" framing from a word that
  // has a retention history rather than a pure acquisition failure.
  if (input.evidence.consecutiveFailureCount >= 1) {
    return { kind: 'offer', tier: 'quiet', sourceRef: input.sourceRef }
  }

  return { kind: 'none' }
}
