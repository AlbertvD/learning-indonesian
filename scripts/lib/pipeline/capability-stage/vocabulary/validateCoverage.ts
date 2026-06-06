/**
 * cap-v2 Slice 1 — distractor coverage validator (CS15, pointer path).
 *
 * The one invariant deterministic selection does NOT give for free: a
 * distractor-bearing capability whose Pool(N) is too small to supply the runtime
 * floor. (Answer-leak and out-of-pool — the old CS16 quality arms — ARE
 * structurally impossible now: the planner only points at non-answer Pool(N)
 * items and the FK guarantees existence, so re-validating them would be
 * redundant mechanism.) A flagged capability stays schedulable via its typed
 * exercises; only the under-supplied MCQ render is skipped at runtime
 * (`insufficient_distractor_pool`). Typed capabilities are never flagged.
 *
 * Used by the writer's verify gate (over planned counts) and the live-DB health
 * check (over written counts) — one helper, two call sites.
 */

import type { ValidationFinding } from '../model'
import { capWantsDistractors } from './planDistractors'

/** Runtime floor: fewer than this and the MCQ cannot render plausibly. */
export const DISTRACTOR_FLOOR = 2

export interface CapDistractorCount {
  capabilityId: string
  capabilityType: string
  distractorCount: number
}

export function validateDistractorCoverage(
  caps: CapDistractorCount[],
  floor: number = DISTRACTOR_FLOOR,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const cap of caps) {
    if (!capWantsDistractors(cap.capabilityType)) continue
    if (cap.distractorCount < floor) {
      findings.push({
        gate: 'CS15',
        severity: 'warning',
        message:
          `Capability ${cap.capabilityId} (${cap.capabilityType}) has ` +
          `${cap.distractorCount} distractor(s), below the floor of ${floor} — ` +
          `insufficient_distractor_pool. The MCQ render is skipped; the capability ` +
          `stays schedulable via its typed exercises.`,
        context: { capabilityKey: cap.capabilityId },
      })
    }
  }
  return findings
}
