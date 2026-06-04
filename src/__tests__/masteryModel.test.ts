import { describe, expect, it } from 'vitest'
import {
  createMasteryModel,
  deriveContentUnitMastery,
  deriveMasteryDimensions,
  derivePatternMastery,
  type CapabilityMasteryEvidence,
} from '@/lib/mastery/masteryModel'
import { CAPABILITY_TYPES } from '@/lib/capabilities'

const now = new Date('2026-04-25T12:00:00.000Z')

function evidence(overrides: Partial<CapabilityMasteryEvidence>): CapabilityMasteryEvidence {
  return {
    capabilityId: 'cap-1',
    canonicalKey: 'item:makan:text_recognition:id_to_l1',
    sourceKind: 'item',
    sourceRef: 'learning_items/makan',
    capabilityType: 'text_recognition',
    modality: 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonActivated: true,
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stability: null,
    lastReviewedAt: null,
    ...overrides,
  }
}

function fakeClient(tables: Record<string, any[]>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const filters: Array<(row: any) => boolean> = []
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            filters.push(row => row[column] === value)
            return builder
          },
          in: (column: string, values: unknown[]) => {
            filters.push(row => values.includes(row[column]))
            return builder
          },
          is: (column: string, value: unknown) => {
            // PostgREST `.is('col', null)` matches both NULL and absent columns;
            // fixture rows that don't set retired_at are treated as active.
            filters.push(row => value === null ? (row[column] == null) : (row[column] === value))
            return builder
          },
          then: (resolve: (value: { data: any[]; error: null }) => void) => {
            resolve({
              data: (tables[table] ?? []).filter(row => filters.every(fn => fn(row))),
              error: null,
            })
          },
        }
        return builder
      },
    }),
  }
}

describe('mastery model derivation', () => {
  it('uses not_assessed when capability evidence is absent', () => {
    const result = deriveContentUnitMastery({
      userId: 'user-1',
      contentUnitId: 'unit-1',
      evidence: [],
      now,
    })

    expect(result.label).toBe('not_assessed')
    expect(result.confidence).toBe('none')
    expect(result.assessedCapabilityCount).toBe(0)
  })

  it('does not infer production mastery from recognition mastery', () => {
    const result = deriveContentUnitMastery({
      userId: 'user-1',
      contentUnitId: 'unit-1',
      now,
      evidence: [
        evidence({
          capabilityId: 'cap-recognition',
          capabilityType: 'text_recognition',
          reviewCount: 5,
          stability: 20,
          lastReviewedAt: '2026-04-20T12:00:00.000Z',
        }),
        evidence({
          capabilityId: 'cap-form',
          canonicalKey: 'item:makan:form_recall:l1_to_id',
          capabilityType: 'form_recall',
          reviewCount: 1,
          stability: 1,
          lastReviewedAt: '2026-04-20T12:00:00.000Z',
        }),
        evidence({
          capabilityId: 'cap-choice',
          canonicalKey: 'item:makan:l1_to_id_choice:l1_to_id',
          capabilityType: 'l1_to_id_choice' as any,
          reviewCount: 3,
          stability: 6,
          lastReviewedAt: '2026-04-20T12:00:00.000Z',
        }),
      ],
    })

    expect(result.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'text_recognition', label: 'mastered' }),
      expect.objectContaining({ dimension: 'l1_to_id_choice', label: 'strengthening' }),
      expect.objectContaining({ dimension: 'form_recall', label: 'learning' }),
    ]))
    expect(result.label).toBe('learning')
  })

  it('keeps pattern mastery weakest-link aware', () => {
    const result = derivePatternMastery({
      userId: 'user-1',
      patternId: 'lesson-1/pattern-belum-vs-tidak',
      now,
      evidence: [
        evidence({
          capabilityId: 'cap-pattern-recognition',
          canonicalKey: 'pattern:belum-vs-tidak:pattern_recognition:none',
          sourceKind: 'pattern',
          sourceRef: 'lesson-1/pattern-belum-vs-tidak',
          capabilityType: 'pattern_recognition',
          reviewCount: 5,
          stability: 18,
          lastReviewedAt: '2026-04-21T12:00:00.000Z',
        }),
        evidence({
          capabilityId: 'cap-pattern-use',
          canonicalKey: 'pattern:belum-vs-tidak:pattern_contrast:none',
          sourceKind: 'pattern',
          sourceRef: 'lesson-1/pattern-belum-vs-tidak',
          capabilityType: 'pattern_contrast',
          reviewCount: 3,
          lapseCount: 1,
          stability: 4,
          lastReviewedAt: '2026-04-21T12:00:00.000Z',
        }),
      ],
    })

    expect(result.label).toBe('at_risk')
    expect(result.weakestDimension).toBe('pattern_use')
  })

  it('routes root_derived_recall capabilities into the morphology dimension', () => {
    const dimensions = deriveMasteryDimensions([
      evidence({
        capabilityId: 'cap-morph-recall',
        canonicalKey: 'item:berjalan:root_derived_recall:derived_to_root',
        capabilityType: 'root_derived_recall',
        reviewCount: 3,
        stability: 5,
        lastReviewedAt: '2026-04-21T12:00:00.000Z',
      }),
    ], now)

    expect(dimensions).toEqual([expect.objectContaining({ dimension: 'morphology', capabilityCount: 1 })])
  })

  it('does not silently route any current CapabilityType through the exposure default', () => {
    // Guard against future capability types being added to the union without a
    // matching case in dimensionForCapability. podcast_gist is the only type
    // intentionally mapped to 'exposure' (comprehensible-input listening).
    const intentionallyExposure = new Set(['podcast_gist'])
    for (const type of CAPABILITY_TYPES) {
      const [dimension] = deriveMasteryDimensions([evidence({ capabilityType: type })], now)
      if (intentionallyExposure.has(type)) {
        expect(dimension?.dimension, `${type} should map to exposure`).toBe('exposure')
      } else {
        expect(dimension?.dimension, `${type} should not fall through to exposure`).not.toBe('exposure')
      }
    }
  })

  it('does not label a pattern mastered when pattern use has not been assessed', () => {
    const result = derivePatternMastery({
      userId: 'user-1',
      patternId: 'lesson-1/pattern-zero-copula',
      now,
      evidence: [
        evidence({
          capabilityId: 'cap-pattern-recognition',
          canonicalKey: 'pattern:zero-copula:pattern_recognition:none',
          sourceKind: 'pattern',
          sourceRef: 'lesson-1/pattern-zero-copula',
          capabilityType: 'pattern_recognition',
          reviewCount: 6,
          stability: 30,
          lastReviewedAt: '2026-04-24T12:00:00.000Z',
        }),
      ],
    })

    expect(result.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'pattern_recognition', label: 'mastered' }),
      expect.objectContaining({ dimension: 'pattern_use', label: 'not_assessed', confidence: 'none' }),
    ]))
    expect(result.label).toBe('not_assessed')
    expect(result.weakestDimension).toBe('pattern_use')
  })
})

describe('mastery model data access', () => {
  it('derives content-unit mastery through capability_content_units relationships', async () => {
    const model = createMasteryModel(fakeClient({
      capability_content_units: [
        { content_unit_id: 'unit-1', capability_id: 'cap-1', relationship_kind: 'introduced_by' },
      ],
      learning_capabilities: [
        {
          id: 'cap-1',
          canonical_key: 'item:makan:text_recognition:id_to_l1',
          source_kind: 'item',
          source_ref: 'learning_items/makan',
          capability_type: 'text_recognition',
          modality: 'text',
          readiness_status: 'ready',
          publication_status: 'published',
          metadata_json: { requiredArtifacts: ['base_text', 'meaning:l1'] },
        },
        {
          id: 'cap-unlinked',
          canonical_key: 'item:minum:text_recognition:id_to_l1',
          source_kind: 'item',
          source_ref: 'learning_items/minum',
          capability_type: 'text_recognition',
          modality: 'text',
          readiness_status: 'ready',
          publication_status: 'published',
          metadata_json: { requiredArtifacts: ['base_text', 'meaning:l1'] },
        },
      ],
      learner_capability_state: [
        {
          user_id: 'user-1',
          capability_id: 'cap-1',
          review_count: 5,
          lapse_count: 0,
          consecutive_failure_count: 0,
          stability: 20,
          last_reviewed_at: new Date().toISOString(),
        },
      ],
      learner_lesson_activation: [
        { user_id: 'user-1', lesson_id: 'lesson-uuid' },
      ],
    }) as any)

    const result = await model.getContentUnitMastery('unit-1', 'user-1')

    expect(result.totalCapabilityCount).toBe(1)
    expect(result.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'text_recognition', reviewedCapabilityCount: 1 }),
    ]))
  })
})
