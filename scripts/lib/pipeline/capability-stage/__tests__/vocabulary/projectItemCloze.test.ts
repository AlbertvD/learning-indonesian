/**
 * cap-v2 vocabulary rebuild — item contextual_cloze cap emitter.
 *
 * The contract is identity-load-bearing: canonical_key is opaque/deterministic and
 * UNIQUE(source_ref, capability_type) will NOT catch a wrong `direction`. The
 * values below are VERIFIED against the only live contextual_cloze emitter
 * (projectors/dialogueCloze.ts:47-54): direction id_to_l1, modality text,
 * learnerLanguage none. NOT 'context_or_existing' (not in the CapabilityDirection
 * union — capabilityTypes.ts:61-68).
 */

import { describe, it, expect } from 'vitest'
import { projectItemClozeCaps } from '../../vocabulary/projectItemCloze'
import { buildCanonicalKey } from '@/lib/capabilities'

describe('projectItemClozeCaps', () => {
  it('emits one contextual_cloze cap per item with the verified live contract', () => {
    const caps = projectItemClozeCaps({
      itemsWithCloze: [{ indonesianText: 'makan' }],
      lessonId: 'L11',
    })
    expect(caps).toHaveLength(1)
    const cap = caps[0]
    expect(cap).toMatchObject({
      sourceKind: 'item',
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
      lessonId: 'L11',
      requiredArtifacts: [],
    })
    expect(cap.sourceRef).toBe('learning_items/makan')
    expect(cap.canonicalKey).toBe(
      buildCanonicalKey({
        sourceKind: 'item',
        sourceRef: 'learning_items/makan',
        capabilityType: 'contextual_cloze',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage: 'none',
      }),
    )
  })

  it("uses the item's text_recognition cap as the prerequisite (ADR 0007 sequencing)", () => {
    const [cap] = projectItemClozeCaps({
      itemsWithCloze: [{ indonesianText: 'makan' }],
      lessonId: 'L11',
    })
    expect(cap.prerequisiteKeys).toEqual([
      buildCanonicalKey({
        sourceKind: 'item',
        sourceRef: 'learning_items/makan',
        capabilityType: 'text_recognition',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage: 'nl',
      }),
    ])
  })

  it('emits nothing for an empty carrier set', () => {
    expect(projectItemClozeCaps({ itemsWithCloze: [], lessonId: 'L11' })).toEqual([])
  })
})
