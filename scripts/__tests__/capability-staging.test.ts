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
        requiredSourceProgress: {
          kind: 'source_progress',
          sourceRef: 'learning_items/makan',
          requiredState: 'section_exposed',
        },
        difficultyLevel: 1,
        contentUnitSlugs: ['item-makan'],
      }),
      expect.objectContaining({
        canonicalKey: expect.stringContaining(':form_recall:'),
        prerequisiteKeys: [expect.stringContaining(':text_recognition:')],
        requiredSourceProgress: expect.objectContaining({ requiredState: 'intro_completed' }),
        difficultyLevel: 3,
      }),
    ]))
    expect(plan.exerciseAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quality_status: 'draft',
        payload_json: expect.objectContaining({
          placeholder: true,
        }),
      }),
    ]))
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

  it('keeps generated draft placeholders valid but rejects approved placeholder assets', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const plan = buildCapabilityStagingFromContent({ ...input, contentUnits })

    expect(validateExerciseAssets({
      exerciseAssets: plan.exerciseAssets,
      capabilities: plan.capabilities,
    })).toEqual([])

    const findings = validateExerciseAssets({
      exerciseAssets: [{
        ...plan.exerciseAssets[0]!,
        quality_status: 'approved',
      }],
      capabilities: plan.capabilities,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-approved-placeholder' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'exercise-asset-approved-value-missing' }),
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
