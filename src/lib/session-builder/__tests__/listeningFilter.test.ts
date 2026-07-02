import { describe, expect, it } from 'vitest'
import { excludeListeningCapabilities } from '@/lib/session-builder/listeningFilter'
import type { CapabilitySessionDataSnapshot } from '@/lib/session-builder/builder'
import type { LearnerCapabilityStateRow } from '@/lib/session-builder/dueFilter'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { PlannerCapability } from '@/lib/session-builder/pedagogy'

// Round 2.4b — CRIT-2 (docs/audits/2026-07-02-a11y-i18n-audit.md): wires the
// "disable listening exercises" Profile toggle into session composition by
// stripping every audio-modality capability from the assembled snapshot,
// client-side, before the planner runs.

function textCap(overrides: Partial<ProjectedCapability> & { canonicalKey: string; sourceRef: string }): ProjectedCapability {
  return {
    sourceKind: 'vocabulary_src',
    capabilityType: 'recall_meaning_from_text_cap',
    skillType: 'recall_mode',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: [],
    prerequisiteKeys: [],
    projectionVersion: 'capability-v3',
    ...overrides,
  }
}

function audioCap(overrides: Partial<ProjectedCapability> & { canonicalKey: string; sourceRef: string }): ProjectedCapability {
  return textCap({
    capabilityType: 'recognise_meaning_from_audio_cap',
    skillType: 'recognise_mode',
    direction: 'audio_to_l1',
    modality: 'audio',
    ...overrides,
  })
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
    capabilityType: 'recall_meaning_from_text_cap',
    skillType: 'recall_mode',
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

describe('excludeListeningCapabilities', () => {
  it('strips audio-modality rows from schedulerRows (due + practice-review passes), keeping text rows', () => {
    const text = textCap({ canonicalKey: 'text-key', sourceRef: 'learning_items/a' })
    const audio = audioCap({ canonicalKey: 'audio-key', sourceRef: 'learning_items/b' })
    const input = snapshot({
      capabilities: [text, audio],
      schedulerRows: [
        stateRow({ canonicalKeySnapshot: 'text-key' }),
        stateRow({ canonicalKeySnapshot: 'audio-key' }),
      ],
      readyCapabilities: [],
    })

    const filtered = excludeListeningCapabilities(input)

    expect(filtered.schedulerRows.map(r => r.canonicalKeySnapshot)).toEqual(['text-key'])
  })

  it('strips audio-modality entries from plannerInput.readyCapabilities (new-introduction pass), keeping text entries', () => {
    const text = textCap({ canonicalKey: 'text-key', sourceRef: 'learning_items/a' })
    const audio = audioCap({ canonicalKey: 'audio-key', sourceRef: 'learning_items/b' })
    const input = snapshot({
      capabilities: [text, audio],
      schedulerRows: [],
      readyCapabilities: [
        plannerCap({ canonicalKey: 'text-key', sourceRef: 'learning_items/a' }),
        plannerCap({ canonicalKey: 'audio-key', sourceRef: 'learning_items/b', capabilityType: 'recognise_meaning_from_audio_cap' }),
      ],
    })

    const filtered = excludeListeningCapabilities(input)

    expect(filtered.plannerInput.readyCapabilities.map(c => c.canonicalKey)).toEqual(['text-key'])
  })

  it('is a no-op when no capability has modality "audio"', () => {
    const a = textCap({ canonicalKey: 'a', sourceRef: 'learning_items/a' })
    const b = textCap({ canonicalKey: 'b', sourceRef: 'learning_items/b' })
    const input = snapshot({
      capabilities: [a, b],
      schedulerRows: [stateRow({ canonicalKeySnapshot: 'a' }), stateRow({ canonicalKeySnapshot: 'b' })],
      readyCapabilities: [plannerCap({ canonicalKey: 'b', sourceRef: 'learning_items/b' })],
    })

    const filtered = excludeListeningCapabilities(input)

    expect(filtered.schedulerRows).toHaveLength(2)
    expect(filtered.plannerInput.readyCapabilities).toHaveLength(1)
  })

  it('drops a scheduler row whose capability is missing from capabilitiesByKey (defensive — treated as not-audio, so kept) without throwing', () => {
    const input = snapshot({
      capabilities: [],
      schedulerRows: [stateRow({ canonicalKeySnapshot: 'unknown-key' })],
      readyCapabilities: [],
    })

    const filtered = excludeListeningCapabilities(input)

    expect(filtered.schedulerRows.map(r => r.canonicalKeySnapshot)).toEqual(['unknown-key'])
  })
})
