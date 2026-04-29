import { afterEach, describe, expect, it } from 'vitest'
import type { ExerciseItem, LearningItem, SessionQueueItem } from '@/types/learning'
import type { CapabilityHealthReport } from '@/lib/capabilities/capabilityContracts'
import type { CapabilityProjection, ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import {
  diagnoseSessionItems,
  runSessionCapabilityDiagnosticsIfEnabled,
  setSessionCapabilityDiagnosticsProvider,
} from '@/lib/capabilities/sessionCapabilityDiagnostics'

function item(id: string): LearningItem {
  return {
    id,
    item_type: 'word',
    base_text: 'makan',
    normalized_text: 'makan',
    language: 'id',
    level: 'A1',
    source_type: 'manual',
    source_vocabulary_id: null,
    source_card_id: null,
    notes: null,
    is_active: true,
    pos: null,
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
  }
}

function exercise(learningItem: LearningItem): ExerciseItem {
  return {
    learningItem,
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'meaning_recall',
    exerciseType: 'meaning_recall',
  }
}

function projectedCapability(overrides: Partial<ProjectedCapability> = {}): ProjectedCapability {
  return {
    canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    sourceKind: 'item',
    sourceRef: 'learning_items/item-1',
    capabilityType: 'meaning_recall',
    skillType: 'meaning_recall',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    prerequisiteKeys: [],
    difficultyLevel: overrides.difficultyLevel ?? 2,
    goalTags: overrides.goalTags ?? [],
    projectionVersion: 'capability-v1',
    sourceFingerprint: 'source',
    artifactFingerprint: 'artifact',
    ...overrides,
  }
}

describe('session capability diagnostics', () => {
  afterEach(() => {
    setSessionCapabilityDiagnosticsProvider(null)
  })

  it('reports ready mapped session items without mutating queue order', () => {
    const queue: SessionQueueItem[] = [{
      source: 'vocab',
      exerciseItem: exercise(item('item-1')),
      learnerItemState: null,
      learnerSkillState: null,
    }]
    const original = [...queue]

    const diagnostics = diagnoseSessionItems({
      items: queue,
      projection: {
        projectionVersion: 'capability-v1',
        capabilities: [projectedCapability()],
        aliases: [],
        diagnostics: [],
      },
      health: {
        readyCount: 1,
        blockedCount: 0,
        exposureOnlyCount: 0,
        deprecatedCount: 0,
        unknownCount: 0,
        criticalCount: 0,
        results: [{
          canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
          readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
        }],
      },
    })

    expect(queue).toEqual(original)
    expect(diagnostics).toEqual([{
      sessionItemId: 'vocab:item-1:meaning_recall:meaning_recall',
      impliedCapabilityKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
      severity: 'info',
      message: 'Session item maps to a ready capability.',
    }])
  })

  it('reports blocked mapped capability as critical', () => {
    const diagnostics = diagnoseSessionItems({
      items: [{
        source: 'vocab',
        exerciseItem: exercise(item('item-1')),
        learnerItemState: null,
        learnerSkillState: null,
      }],
      projection: {
        projectionVersion: 'capability-v1',
        capabilities: [projectedCapability()],
        aliases: [],
        diagnostics: [],
      } satisfies CapabilityProjection,
      health: {
        readyCount: 0,
        blockedCount: 1,
        exposureOnlyCount: 0,
        deprecatedCount: 0,
        unknownCount: 0,
        criticalCount: 1,
        results: [{
          canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
          readiness: { status: 'blocked', missingArtifacts: ['meaning:l1'], reason: 'Missing approved artifacts: meaning:l1' },
        }],
      } satisfies CapabilityHealthReport,
    })

    expect(diagnostics[0]?.severity).toBe('critical')
  })

  it('reports unmapped legacy items as warnings', () => {
    const diagnostics = diagnoseSessionItems({
      items: [{
        source: 'vocab',
        exerciseItem: exercise(item('item-1')),
        learnerItemState: null,
        learnerSkillState: null,
      }],
      projection: {
        projectionVersion: 'capability-v1',
        capabilities: [],
        aliases: [],
        diagnostics: [],
      },
      health: {
        readyCount: 0,
        blockedCount: 0,
        exposureOnlyCount: 0,
        deprecatedCount: 0,
        unknownCount: 0,
        criticalCount: 0,
        results: [],
      },
    })

    expect(diagnostics[0]?.severity).toBe('warn')
  })

  it('does not map a capability with the wrong skill type', () => {
    const diagnostics = diagnoseSessionItems({
      items: [{
        source: 'vocab',
        exerciseItem: {
          ...exercise(item('item-1')),
          skillType: 'form_recall',
        },
        learnerItemState: null,
        learnerSkillState: null,
      }],
      projection: {
        projectionVersion: 'capability-v1',
        capabilities: [projectedCapability({ skillType: 'meaning_recall' })],
        aliases: [],
        diagnostics: [],
      },
      health: {
        readyCount: 1,
        blockedCount: 0,
        exposureOnlyCount: 0,
        deprecatedCount: 0,
        unknownCount: 0,
        criticalCount: 0,
        results: [{
          canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
          readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
        }],
      },
    })

    expect(diagnostics[0]?.severity).toBe('warn')
  })

  it('is disabled unless the migration flag path enables it', () => {
    setSessionCapabilityDiagnosticsProvider(() => {
      throw new Error('should not run while disabled')
    })

    expect(runSessionCapabilityDiagnosticsIfEnabled({
      enabled: false,
      items: [],
    })).toEqual([])
  })
})
