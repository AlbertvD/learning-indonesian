import { describe, expect, it } from 'vitest'
import {
  buildCapabilityStagingFromContent,
  buildContentUnitsFromStaging,
  validateCapabilityStaging,
  validateExerciseAssets,
  type StagingLessonInput,
} from '../lib/content-pipeline-output'

const input: StagingLessonInput = {
  lessonNumber: 1,
  lesson: {
    title: 'Les 1 - Di Pasar',
    level: 'A1',
    module_id: 'module-1',
    order_index: 1,
    sections: [],
  },
  learningItems: [{
    base_text: 'makan',
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: 'eten',
    translation_en: 'to eat',
    source_page: 1,
    review_status: 'pending_review',
  }],
  grammarPatterns: [],
}

describe('capability staging', () => {
  it('creates capability metadata and durable content-unit relationships', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })

    expect(plan.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalKey: expect.stringContaining(':text_recognition:'),
        sourceRef: 'learning_items/makan',
        difficultyLevel: 1,
        contentUnitSlugs: ['item-makan'],
      }),
      expect.objectContaining({
        canonicalKey: expect.stringContaining(':l1_to_id_choice:'),
        capabilityType: 'l1_to_id_choice',
        skillType: 'meaning_recall',
        direction: 'l1_to_id',
        prerequisiteKeys: [expect.stringContaining(':text_recognition:')],
        relationshipKind: 'introduced_by',
      }),
      expect.objectContaining({
        canonicalKey: expect.stringContaining(':form_recall:'),
        prerequisiteKeys: [expect.stringContaining(':l1_to_id_choice:')],
        difficultyLevel: 3,
      }),
    ]))
    // The pipeline emits deterministic, approved artifacts directly -- no more
    // placeholder drafts. Each artifact_kind embeds the value sourced from
    // learningItems / grammarPatterns / affixedFormPairs.
    expect(plan.exerciseAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact_kind: 'base_text',
        quality_status: 'approved',
        payload_json: { value: 'makan' },
      }),
      expect.objectContaining({
        artifact_kind: 'meaning:l1',
        quality_status: 'approved',
        payload_json: { value: 'eten' },
      }),
      expect.objectContaining({
        artifact_kind: 'accepted_answers:l1',
        quality_status: 'approved',
        payload_json: { values: ['eten'] },
      }),
      expect.objectContaining({
        artifact_kind: 'accepted_answers:id',
        quality_status: 'approved',
        payload_json: { values: ['makan'] },
      }),
    ]))
    // No remnants of the old placeholder scaffold.
    expect(plan.exerciseAssets.every(asset => (asset.payload_json as Record<string, unknown>)?.placeholder !== true)).toBe(true)
    expect(plan.exerciseAssets.every(asset => asset.quality_status === 'approved')).toBe(true)
  })

  it('validates capability links to generated content units', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })
    const findings = validateCapabilityStaging({
      capabilities: [
        ...plan.capabilities,
        { ...plan.capabilities[0]!, contentUnitSlugs: ['missing-unit'] },
      ],
      contentUnits,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'capability-content-unit-missing' }),
    ]))
  })

  it('produces approved assets that pass validation and rejects forged placeholder approvals', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })

    // Natural output is all-approved and passes the validator.
    expect(validateExerciseAssets({
      exerciseAssets: plan.exerciseAssets,
      capabilities: plan.capabilities,
    })).toEqual([])

    // The validator still rejects a hand-crafted approved-but-placeholder asset
    // (e.g. if a future code path regresses to scaffold payloads).
    const targetAsset = plan.exerciseAssets[0]!
    const forgedPlaceholder = {
      ...targetAsset,
      quality_status: 'approved' as const,
      payload_json: { placeholder: true },
    }
    const findings = validateExerciseAssets({
      exerciseAssets: [forgedPlaceholder],
      capabilities: plan.capabilities,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-approved-placeholder' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-approved-value-missing' }),
    ]))
  })

  it('accepts reviewed accepted-answer assets that use values instead of a single value', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })
    const acceptedAnswerAsset = plan.exerciseAssets.find(asset => asset.artifact_kind === 'accepted_answers:l1')!

    const findings = validateExerciseAssets({
      exerciseAssets: [{
        ...acceptedAnswerAsset,
        quality_status: 'approved',
        payload_json: {
          values: ['eten', 'het eten'],
          reviewedBy: 'human',
          reviewedAt: '2026-04-26',
        },
      }],
      capabilities: plan.capabilities,
    })

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'exercise-asset-approved-value-missing' }),
    ]))
  })

  it('validates asset capability, artifact kind, status, and required artifact coverage', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })
    const requiredAsset = plan.exerciseAssets[0]!

    const findings = validateExerciseAssets({
      exerciseAssets: [{
        ...requiredAsset,
        capability_key: 'missing-capability',
        artifact_kind: 'exercise_variant',
        quality_status: 'published' as any,
        payload_json: { value: 'x' },
      }],
      capabilities: plan.capabilities,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-capability-missing' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-status-invalid' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-required-missing' }),
    ]))
  })
})
