import { describe, expect, it } from 'vitest'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { validateCapabilities, validateCapability } from '@/lib/capabilities/capabilityContracts'

const baseCapability: ProjectedCapability = {
  canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
  sourceKind: 'item',
  sourceRef: 'learning_items/item-1',
  capabilityType: 'meaning_recall',
  skillType: 'meaning_recall',
  direction: 'id_to_l1',
  modality: 'text',
  learnerLanguage: 'nl',
  requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
  requiredSourceProgress: { kind: 'none', reason: 'legacy_projection' },
  prerequisiteKeys: [],
  difficultyLevel: 2,
  goalTags: [],
  projectionVersion: 'capability-v1',
  sourceFingerprint: 'source',
  artifactFingerprint: 'artifact',
}

describe('capability contract validation', () => {
  it('allows ready capability only when required artifacts are approved', () => {
    expect(validateCapability({
      capability: baseCapability,
      artifacts: {
        'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
        'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })).toEqual({
      status: 'ready',
      allowedExercises: ['meaning_recall'],
    })
  })

  it.each(['draft', 'blocked', 'deprecated'] as const)('fails closed for %s artifacts', qualityStatus => {
    const result = validateCapability({
      capability: baseCapability,
      artifacts: {
        'meaning:l1': [{ qualityStatus, sourceRef: 'learning_items/item-1' }],
        'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })

    expect(result.status).toBe('blocked')
  })

  it('requires translation for contextual cloze feedback', () => {
    const result = validateCapability({
      capability: {
        ...baseCapability,
        capabilityType: 'contextual_cloze',
        requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
      },
      artifacts: {
        cloze_context: [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
        cloze_answer: [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })

    expect(result).toEqual({
      status: 'blocked',
      missingArtifacts: ['translation:l1'],
      reason: 'Missing approved artifacts: translation:l1',
    })
  })

  it('requires typed pattern examples for pattern recognition', () => {
    const result = validateCapability({
      capability: {
        ...baseCapability,
        capabilityType: 'pattern_recognition',
        requiredArtifacts: ['pattern_explanation:l1', 'pattern_example'],
      },
      artifacts: {
        'pattern_explanation:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })

    expect(result.status).toBe('blocked')
  })

  it('lets exercise availability tighten but not revive blocked readiness', () => {
    const result = validateCapability({
      capability: baseCapability,
      artifacts: {
        'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
        'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
      exerciseAvailability: { meaning_recall: false },
    })

    expect(result).toEqual({
      status: 'blocked',
      missingArtifacts: [],
      reason: 'No available exercise family for ready capability',
    })
  })

  it.each([
    ['exposure_only', 'exposure_only'],
    ['deprecated', 'deprecated'],
    ['unknown', 'unknown'],
  ] as const)('can return %s readiness', (readinessOverride, expected) => {
    expect(validateCapability({
      capability: baseCapability,
      artifacts: {},
      readinessOverride,
    }).status).toBe(expected)
  })

  it('counts blocked and unknown findings as critical in health reports', () => {
    const report = validateCapabilities({
      projection: {
        projectionVersion: 'capability-v1',
        capabilities: [baseCapability],
        aliases: [],
        diagnostics: [],
      },
      artifacts: {},
    })

    expect(report.criticalCount).toBe(1)
  })

  it('does not let artifacts from one source satisfy another capability', () => {
    const result = validateCapability({
      capability: baseCapability,
      artifacts: {
        'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/other-item' }],
        'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/other-item' }],
      },
    })

    expect(result.status).toBe('blocked')
  })
})
