import type { CapabilityActivationRequest } from '@/lib/reviews/capabilityReviewProcessor'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityReviewSessionContext, SessionMode, SessionDiagnostic, SessionPlan, CapabilityFamily } from '@/lib/session-builder/model'
import type { DueCapability } from '@/lib/session-builder/dueFilter'

interface ResolutionFailure {
  reason: string
  details: string
}

export interface DueSessionCapabilityInput {
  capabilityId: string
  canonicalKeySnapshot: string
  stateVersion: number
  renderPlan?: ExerciseRenderPlan
  reviewContext: CapabilityReviewSessionContext
  resolutionFailure?: ResolutionFailure
}

export interface EligibleNewSessionCapabilityInput {
  capability: {
    id: string
    canonicalKey: string
  }
  renderPlan?: ExerciseRenderPlan
  reviewContext: CapabilityReviewSessionContext
  resolutionFailure?: ResolutionFailure
  activationRequest: CapabilityActivationRequest
}

export interface ComposeSessionInput {
  sessionId: string
  mode: SessionMode
  dueCapabilities: DueSessionCapabilityInput[]
  eligibleNewCapabilities: EligibleNewSessionCapabilityInput[]
  practiceReviewCapabilities?: DueSessionCapabilityInput[]
  diagnostics?: SessionDiagnostic[]
  limit: number
}

function diagnosticFor(failure: ResolutionFailure): SessionDiagnostic {
  return {
    severity: 'warn',
    reason: failure.reason,
    details: failure.details,
  }
}

export async function compose(input: ComposeSessionInput): Promise<SessionPlan> {
  const diagnostics: SessionDiagnostic[] = [...(input.diagnostics ?? [])]
  const blocks: SessionPlan['blocks'] = []

  for (const due of input.dueCapabilities) {
    if (!due.renderPlan) {
      if (due.resolutionFailure) diagnostics.push(diagnosticFor(due.resolutionFailure))
      continue
    }
    blocks.push({
      id: `${input.sessionId}:due:${due.canonicalKeySnapshot}`,
      kind: 'due_review',
      renderPlan: due.renderPlan,
      capabilityId: due.capabilityId,
      canonicalKeySnapshot: due.canonicalKeySnapshot,
      stateVersion: due.stateVersion,
      reviewContext: due.reviewContext,
    })
  }

  if (input.mode !== 'lesson_review') {
    for (const introduction of input.eligibleNewCapabilities) {
      if (!introduction.renderPlan) {
        if (introduction.resolutionFailure) diagnostics.push(diagnosticFor(introduction.resolutionFailure))
        continue
      }
      blocks.push({
        id: `${input.sessionId}:new:${introduction.capability.canonicalKey}`,
        kind: 'new_introduction',
        renderPlan: introduction.renderPlan,
        capabilityId: introduction.capability.id,
        canonicalKeySnapshot: introduction.capability.canonicalKey,
        reviewContext: introduction.reviewContext,
        pendingActivation: {
          capabilityId: introduction.capability.id,
          canonicalKeySnapshot: introduction.capability.canonicalKey,
          activationRequest: introduction.activationRequest,
          requiredActivationOwner: 'review_processor',
        },
      })
    }
  }

  for (const review of input.practiceReviewCapabilities ?? []) {
    if (!review.renderPlan) {
      if (review.resolutionFailure) diagnostics.push(diagnosticFor(review.resolutionFailure))
      continue
    }
    blocks.push({
      id: `${input.sessionId}:lesson-review:${review.canonicalKeySnapshot}`,
      kind: 'due_review',
      renderPlan: review.renderPlan,
      capabilityId: review.capabilityId,
      canonicalKeySnapshot: review.canonicalKeySnapshot,
      stateVersion: review.stateVersion,
      reviewContext: review.reviewContext,
    })
  }

  // Interleave by source_ref (Rule B of docs/plans/2026-05-18-capability-staging-gate.md).
  // Prevents two blocks sharing a source_ref from being within
  // INTERLEAVE_WINDOW positions of each other. Greedy single-pass, left-to-right,
  // swap with the nearest later block that doesn't violate the window. Accept
  // violations at end-of-queue or when all remaining blocks share a source_ref.
  // Deterministic: same input yields same output (Karpicke 2009 expanding
  // retrieval — two retrievals within working-memory range aren't real
  // retrieval practice; intervening items are required).
  interleaveBySourceRef(blocks, INTERLEAVE_WINDOW)

  return {
    id: input.sessionId,
    mode: input.mode,
    title: 'Dagelijkse Indonesische oefening',
    blocks: blocks.slice(0, input.limit),
    recapPolicy: 'standard',
    diagnostics,
  }
}

const INTERLEAVE_WINDOW = 3

function interleaveBySourceRef(blocks: SessionPlan['blocks'], window: number): void {
  for (let i = 1; i < blocks.length; i += 1) {
    const current = blocks[i]!
    const recent = new Set<string>()
    for (let k = Math.max(0, i - window); k < i; k += 1) {
      recent.add(blocks[k]!.renderPlan.sourceRef)
    }
    if (!recent.has(current.renderPlan.sourceRef)) continue
    let swapWith = -1
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (!recent.has(blocks[j]!.renderPlan.sourceRef)) {
        swapWith = j
        break
      }
    }
    if (swapWith === -1) continue
    const tmp = blocks[i]!
    blocks[i] = blocks[swapWith]!
    blocks[swapWith] = tmp
  }
}

// ── Grammar due-floor ────────────────────────────────────────────────────────
// Guarantees grammar a minimum share of the due-review slots so it isn't drowned
// by the vocabulary majority in the due pool (grammar was ~6% of the owner's
// reviews; the due pass is otherwise family-blind). Applied to the family-agnostic,
// overdue-ordered due list BEFORE the session-size cut, in the composition layer:
// family knowledge stays in session-builder (via the `familyOf` callback the
// builder supplies), never threaded into the analytics-bound due projection.
// See docs/plans/2026-07-05-grammar-exposure-session-quota-design.md §4A.
//
// ⭐ TUNABLE — the single edit needed to retune the floor. Fraction of the session's
// due slots guaranteed to grammar-family caps when that much grammar is due. Valid
// range [0, 1]; 0 reproduces exact legacy behaviour. Change this one number (and
// redeploy) to optimise — no call-site or schema changes.
export const GRAMMAR_DUE_FLOOR_FRACTION = 0.2

// Pure and deterministic (given the already-ordered input). SESSION-SIZE INVARIANT:
// the returned length is exactly `min(limit, ordered.length)` — the floor only
// REORDERS which due caps win the slots, it never drops one, so it can never
// shorten the session below the preset size. When more than `limit` caps are due it
// returns exactly `limit`; when fewer are due it returns them all (the shortfall is
// filled by new introductions downstream, exactly as today).
//   - ≤ limit due  → return all (floor moot, nothing to cut);
//   - fraction 0 or no grammar due → plain most-overdue slice (legacy behaviour);
//   - else reserve up to floor(limit*fraction) of the MOST-overdue grammar caps,
//     then fill remaining slots with the most-overdue non-reserved caps; the result
//     is returned in the original overdue order.
export function reserveGrammarDueFloor(
  ordered: readonly DueCapability[],
  limit: number,
  familyOf: (canonicalKey: string) => CapabilityFamily | undefined,
  fraction: number = GRAMMAR_DUE_FLOOR_FRACTION,
): DueCapability[] {
  if (ordered.length <= limit) return [...ordered]
  const floorSlots = Math.floor(limit * fraction)
  if (floorSlots <= 0) return ordered.slice(0, limit)

  const reserved = ordered
    .filter(due => familyOf(due.canonicalKeySnapshot) === 'grammar')
    .slice(0, floorSlots)
  if (reserved.length === 0) return ordered.slice(0, limit)

  // Chosen = the reserved grammar ∪ the most-overdue non-reserved caps, filled to
  // exactly `limit`. Seeding `chosen` with the reserved ids guarantees they survive
  // even when they sort below the size cut; the fill loop then tops up to `limit`.
  const chosen = new Set(reserved.map(due => due.stateId))
  for (const due of ordered) {
    if (chosen.size >= limit) break
    chosen.add(due.stateId)
  }
  return ordered.filter(due => chosen.has(due.stateId))
}
