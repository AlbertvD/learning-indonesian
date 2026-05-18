import { describe, it, expect } from 'vitest'
import { compose, type DueSessionCapabilityInput } from '@/lib/session-builder/compose'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityReviewSessionContext, SessionPlan } from '@/lib/session-builder/model'

// Plan: docs/plans/2026-05-18-capability-staging-gate.md §5, §7.2

const renderPlan = (sourceRef: string, capabilityKey: string): ExerciseRenderPlan => ({
  capabilityKey,
  sourceRef,
  exerciseType: 'recognition_mcq',
  capabilityType: 'text_recognition',
  skillType: 'recognition',
  requiredArtifacts: ['base_text', 'meaning:l1'],
})

const reviewContext: CapabilityReviewSessionContext = {
  schedulerSnapshot: {
    stateVersion: 1,
    activationState: 'active',
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  },
  currentStateVersion: 1,
  artifactVersionSnapshot: {},
  capabilityReadinessStatus: 'ready',
  capabilityPublicationStatus: 'published',
}

const dueInput = (n: number, sourceRef: string): DueSessionCapabilityInput => ({
  capabilityId: `cap-${n}`,
  canonicalKeySnapshot: `key-${n}`,
  stateVersion: 1,
  renderPlan: renderPlan(sourceRef, `key-${n}`),
  reviewContext,
})

const composePlan = async (dueCapabilities: DueSessionCapabilityInput[], limit = 100): Promise<SessionPlan> =>
  compose({
    sessionId: 'sess-1',
    mode: 'standard',
    dueCapabilities,
    eligibleNewCapabilities: [],
    limit,
  })

const refs = (plan: SessionPlan): string[] => plan.blocks.map(b => b.renderPlan.sourceRef)

describe('composer interleave (Rule B)', () => {
  it('preserves order when no source_refs repeat', async () => {
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'b'),
      dueInput(2, 'c'),
      dueInput(3, 'd'),
    ])
    expect(refs(plan)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('swaps when the same source_ref appears at positions 0 and 1', async () => {
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'a'), // adjacent same-ref → swap target
      dueInput(2, 'b'),
      dueInput(3, 'c'),
    ])
    const out = refs(plan)
    // position 1 should now hold the first different-ref; position 1's 'a' moves later.
    expect(out[0]).toBe('a')
    expect(out[1]).not.toBe('a')
    // The original 'a' at position 1 must still be in the queue somewhere.
    expect(out.filter(r => r === 'a')).toHaveLength(2)
  })

  it('keeps a same-source-ref pair at positions 0 and 3 (window=3 looks back at 0,1,2)', async () => {
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'b'),
      dueInput(2, 'c'),
      dueInput(3, 'a'),
      dueInput(4, 'd'),
    ])
    // Position 3 looking back at [0,1,2] sees 'a' at 0 — within window. Will swap with later different-ref.
    const out = refs(plan)
    // index 0 stays 'a'; index 3 should no longer be 'a' (swapped with 'd' at 4)
    expect(out[0]).toBe('a')
    expect(out[3]).not.toBe('a')
  })

  it('keeps a same-source-ref pair at positions 0 and 4 (gap = 4, outside window)', async () => {
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'b'),
      dueInput(2, 'c'),
      dueInput(3, 'd'),
      dueInput(4, 'a'),
    ])
    // Position 4 looking back at [1,2,3] sees no 'a' → no swap needed.
    expect(refs(plan)).toEqual(['a', 'b', 'c', 'd', 'a'])
  })

  it('spaces three blocks with the same source_ref maximally', async () => {
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'a'),
      dueInput(2, 'a'),
      dueInput(3, 'b'),
      dueInput(4, 'c'),
      dueInput(5, 'd'),
      dueInput(6, 'e'),
      dueInput(7, 'f'),
      dueInput(8, 'g'),
      dueInput(9, 'h'),
    ])
    // All three 'a' should be at least 3 positions apart from each other in the output.
    const out = refs(plan)
    const aPositions = out.map((r, i) => r === 'a' ? i : -1).filter(i => i >= 0)
    expect(aPositions).toHaveLength(3)
    for (let i = 1; i < aPositions.length; i += 1) {
      expect(aPositions[i]! - aPositions[i - 1]!).toBeGreaterThanOrEqual(4)
    }
  })

  it('accepts violations when all remaining blocks share the same source_ref', async () => {
    // No infinite loop, no crash.
    const plan = await composePlan([
      dueInput(0, 'a'),
      dueInput(1, 'a'),
      dueInput(2, 'a'),
      dueInput(3, 'a'),
    ])
    expect(plan.blocks).toHaveLength(4)
    // All four 'a' present; order doesn't matter beyond completeness.
    expect(refs(plan).filter(r => r === 'a')).toHaveLength(4)
  })

  it('is deterministic — same input yields same output', async () => {
    const inputs = [
      dueInput(0, 'a'),
      dueInput(1, 'a'),
      dueInput(2, 'b'),
      dueInput(3, 'c'),
      dueInput(4, 'a'),
      dueInput(5, 'd'),
    ]
    const planA = await composePlan(inputs)
    const planB = await composePlan(inputs)
    expect(refs(planA)).toEqual(refs(planB))
  })

  it('handles many same-source-ref blocks in the practice-review pass (lesson_practice mode)', async () => {
    // Construct 6 same-ref blocks via the practice-review pass; mix in some
    // different-ref due caps. The greedy interleave preserves the macro
    // three-pass order (due → new → practice-review per plan §5.3) and only
    // re-sorts locally. With 6 of 11 sharing a ref, the tail necessarily
    // contains adjacent same-ref blocks once the algorithm exhausts non-
    // conflicting forward swaps — plan §5 documents this as accepted.
    const sharedRef = 'learning_items/shared-item'
    const practiceReview: DueSessionCapabilityInput[] = Array.from({ length: 6 }, (_, i) => dueInput(100 + i, sharedRef))
    const due: DueSessionCapabilityInput[] = ['a', 'b', 'c', 'd', 'e'].map((r, i) => dueInput(i, r))
    const plan = await compose({
      sessionId: 'sess-2',
      mode: 'lesson_practice',
      dueCapabilities: due,
      eligibleNewCapabilities: [],
      practiceReviewCapabilities: practiceReview,
      limit: 100,
    })
    expect(plan.blocks).toHaveLength(11)
    const out = refs(plan)
    const sharedPositions = out.map((r, i) => r === sharedRef ? i : -1).filter(i => i >= 0)
    expect(sharedPositions).toHaveLength(6)
    // Contract: the algorithm terminates and preserves all blocks. The first
    // distinct-ref block ('a') stays at position 0 because the practice-review
    // appends at the end — this confirms macro ordering is preserved.
    expect(out[0]).toBe('a')
  })
})
