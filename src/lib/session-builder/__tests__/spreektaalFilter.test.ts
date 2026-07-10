import { describe, expect, it } from 'vitest'
import { excludeSpreektaalCapabilities } from '@/lib/session-builder/spreektaalFilter'
import type { CapabilitySessionDataSnapshot } from '@/lib/session-builder/builder'
import type { LearnerCapabilityStateRow } from '@/lib/session-builder/dueFilter'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { PlannerCapability } from '@/lib/session-builder/pedagogy'

// Spec docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §5: wires the
// "Spreektaal (informele woorden) oefenen" Profile toggle into session
// composition by stripping every capability anchored to a register='informal'
// learning_items row from the assembled snapshot, client-side, before the
// planner runs. Mirrors listeningFilter.test.ts's structure.

function cap(overrides: Partial<ProjectedCapability> & { canonicalKey: string; sourceRef: string }): ProjectedCapability {
  return {
    sourceKind: 'vocabulary_src',
    capabilityType: 'recognise_meaning_from_text_cap',
    skillType: 'recognise_mode',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: [],
    prerequisiteKeys: [],
    projectionVersion: 'capability-v3',
    ...overrides,
  }
}

function stateRow(overrides: Partial<LearnerCapabilityStateRow> & { canonicalKeySnapshot: string }): LearnerCapabilityStateRow {
  return {
    id: `state-${overrides.canonicalKeySnapshot}`,
    userId: 'user-1',
    capabilityId: `cap-${overrides.canonicalKeySnapshot}`,
    activationState: 'active',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    stability: 1,
    difficulty: 5,
    lastReviewedAt: '2026-07-01T00:00:00.000Z',
    nextDueAt: '2026-07-01T00:00:00.000Z',
    reviewCount: 1,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stateVersion: 1,
    ...overrides,
  }
}

function plannerCap(overrides: Partial<PlannerCapability> & { canonicalKey: string; sourceRef: string }): PlannerCapability {
  return {
    id: `planner-${overrides.canonicalKey}`,
    sourceKind: 'vocabulary_src',
    capabilityType: 'recognise_meaning_from_text_cap',
    skillType: 'recognise_mode',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    prerequisiteKeys: [],
    lessonId: null,
    ...overrides,
  }
}

function snapshot(input: {
  capabilities: ProjectedCapability[]
  schedulerRows: LearnerCapabilityStateRow[]
  readyCapabilities: PlannerCapability[]
}): CapabilitySessionDataSnapshot {
  return {
    schedulerRows: input.schedulerRows,
    plannerInput: {
      userId: 'user-1',
      preferredSessionSize: 15,
      dueCount: input.schedulerRows.length,
      readyCapabilities: input.readyCapabilities,
      learnerCapabilityStates: [],
      activatedLessons: new Set<string>(),
    },
    capabilitiesByKey: new Map(input.capabilities.map(c => [c.canonicalKey, c])),
    readinessByKey: new Map(),
    currentLessonId: null,
    nextLessonNeedsExposure: false,
    reviewedTodayRefs: new Set<string>(),
  }
}

describe('excludeSpreektaalCapabilities', () => {
  it('strips informal-item rows from schedulerRows (due + practice-review passes), keeping formal rows', () => {
    const formal = cap({ canonicalKey: 'formal-key', sourceRef: 'learning_items/tidak' })
    const informal = cap({ canonicalKey: 'informal-key', sourceRef: 'learning_items/nggak' })
    const input = snapshot({
      capabilities: [formal, informal],
      schedulerRows: [
        stateRow({ canonicalKeySnapshot: 'formal-key' }),
        stateRow({ canonicalKeySnapshot: 'informal-key' }),
      ],
      readyCapabilities: [],
    })

    const filtered = excludeSpreektaalCapabilities(input, new Set(['learning_items/nggak']))

    expect(filtered.schedulerRows.map(r => r.canonicalKeySnapshot)).toEqual(['formal-key'])
  })

  it('strips informal-item entries from plannerInput.readyCapabilities (new-introduction pass), keeping formal entries', () => {
    const formal = cap({ canonicalKey: 'formal-key', sourceRef: 'learning_items/tidak' })
    const informal = cap({ canonicalKey: 'informal-key', sourceRef: 'learning_items/nggak' })
    const input = snapshot({
      capabilities: [formal, informal],
      schedulerRows: [],
      readyCapabilities: [
        plannerCap({ canonicalKey: 'formal-key', sourceRef: 'learning_items/tidak' }),
        plannerCap({ canonicalKey: 'informal-key', sourceRef: 'learning_items/nggak' }),
      ],
    })

    const filtered = excludeSpreektaalCapabilities(input, new Set(['learning_items/nggak']))

    expect(filtered.plannerInput.readyCapabilities.map(c => c.canonicalKey)).toEqual(['formal-key'])
  })

  it('is a no-op when the informal ref set is empty (toggle on, or pre-schema no data yet)', () => {
    const a = cap({ canonicalKey: 'a', sourceRef: 'learning_items/a' })
    const b = cap({ canonicalKey: 'b', sourceRef: 'learning_items/b' })
    const input = snapshot({
      capabilities: [a, b],
      schedulerRows: [stateRow({ canonicalKeySnapshot: 'a' }), stateRow({ canonicalKeySnapshot: 'b' })],
      readyCapabilities: [plannerCap({ canonicalKey: 'b', sourceRef: 'learning_items/b' })],
    })

    const filtered = excludeSpreektaalCapabilities(input, new Set())

    expect(filtered.schedulerRows).toHaveLength(2)
    expect(filtered.plannerInput.readyCapabilities).toHaveLength(1)
  })

  it('keeps a scheduler row whose capability is missing from capabilitiesByKey (defensive — treated as not-informal) without throwing', () => {
    const input = snapshot({
      capabilities: [],
      schedulerRows: [stateRow({ canonicalKeySnapshot: 'unknown-key' })],
      readyCapabilities: [],
    })

    const filtered = excludeSpreektaalCapabilities(input, new Set(['learning_items/nggak']))

    expect(filtered.schedulerRows.map(r => r.canonicalKeySnapshot)).toEqual(['unknown-key'])
  })
})
