import { describe, expect, it } from 'vitest'
import {
  buildArtifactsForCapability,
  type ArtifactBuildContext,
  type StagingExerciseAsset,
} from '../content-pipeline-output'
import type { ProjectedCapability } from '../../../src/lib/capabilities/capabilityTypes'

const ITEM_SOURCE_REF = 'learning_items/makan'
const PATTERN_SOURCE_REF = 'lesson-1/pattern-noun-adjective'
const MORPHOLOGY_SOURCE_REF = 'lesson-9/morphology/meN-baca-membaca'

function makeItemContext(): ArtifactBuildContext {
  return {
    learningItemsBySourceRef: new Map([
      [ITEM_SOURCE_REF, { base_text: 'makan', translation_nl: 'eten' }],
    ]),
    grammarPatternsBySourceRef: new Map(),
    affixedFormPairsBySourceRef: new Map(),
  }
}

function makePatternContext(opts: { withExample?: boolean } = {}): ArtifactBuildContext {
  return {
    learningItemsBySourceRef: new Map(),
    grammarPatternsBySourceRef: new Map([
      [PATTERN_SOURCE_REF, {
        pattern_name: 'noun-adjective',
        description: 'Adjectives follow the noun in Indonesian.',
        example: opts.withExample === false ? undefined : 'Rumah besar — Een groot huis',
      }],
    ]),
    affixedFormPairsBySourceRef: new Map(),
  }
}

function makeMorphologyContext(): ArtifactBuildContext {
  return {
    learningItemsBySourceRef: new Map(),
    grammarPatternsBySourceRef: new Map(),
    affixedFormPairsBySourceRef: new Map([
      [MORPHOLOGY_SOURCE_REF, {
        root: 'baca',
        derived: 'membaca',
        allomorphRule: 'meN- becomes mem- before roots beginning with b.',
      }],
    ]),
  }
}

function makeCapability(partial: Partial<ProjectedCapability> & { canonicalKey: string; sourceRef: string; requiredArtifacts: ProjectedCapability['requiredArtifacts'] }): ProjectedCapability {
  return {
    sourceKind: 'item',
    capabilityType: 'text_recognition',
    skillType: 'recognition',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    prerequisiteKeys: [],
    difficultyLevel: 1,
    goalTags: [],
    lessonId: null,
    projectionVersion: 'capability-v2',
    sourceFingerprint: 'fp',
    artifactFingerprint: 'afp',
    ...partial,
  }
}

describe('buildArtifactsForCapability', () => {
  it('emits base_text with learning_item.base_text as the value', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/makan:text_recognition:id_to_l1:text:nl',
      sourceRef: ITEM_SOURCE_REF,
      requiredArtifacts: ['base_text'],
    })
    const result = buildArtifactsForCapability(cap, makeItemContext())
    const expected: StagingExerciseAsset[] = [{
      asset_key: 'cap:v1:item:learning_items/makan:text_recognition:id_to_l1:text:nl:base_text',
      capability_key: 'cap:v1:item:learning_items/makan:text_recognition:id_to_l1:text:nl',
      artifact_kind: 'base_text',
      quality_status: 'approved',
      payload_json: { value: 'makan' },
    }]
    expect(result).toEqual(expected)
  })

  it('emits accepted_answers:id with base_text wrapped in a values array', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl',
      sourceRef: ITEM_SOURCE_REF,
      capabilityType: 'form_recall',
      skillType: 'form_recall',
      direction: 'l1_to_id',
      requiredArtifacts: ['accepted_answers:id'],
    })
    const result = buildArtifactsForCapability(cap, makeItemContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl:accepted_answers:id',
      capability_key: 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl',
      artifact_kind: 'accepted_answers:id',
      quality_status: 'approved',
      payload_json: { values: ['makan'] },
    }])
  })

  it('emits accepted_answers:l1 with translation_nl wrapped in a values array', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
      sourceRef: ITEM_SOURCE_REF,
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
      requiredArtifacts: ['accepted_answers:l1'],
    })
    const result = buildArtifactsForCapability(cap, makeItemContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl:accepted_answers:l1',
      capability_key: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
      artifact_kind: 'accepted_answers:l1',
      quality_status: 'approved',
      payload_json: { values: ['eten'] },
    }])
  })

  it('emits meaning:l1 with translation_nl as the single value', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
      sourceRef: ITEM_SOURCE_REF,
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
      requiredArtifacts: ['meaning:l1'],
    })
    const result = buildArtifactsForCapability(cap, makeItemContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl:meaning:l1',
      capability_key: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
      artifact_kind: 'meaning:l1',
      quality_status: 'approved',
      payload_json: { value: 'eten' },
    }])
  })

  it('emits root_derived_pair with root + derived from the affixed-form-pair source', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
      sourceKind: 'affixed_form_pair',
      sourceRef: MORPHOLOGY_SOURCE_REF,
      capabilityType: 'root_derived_recall',
      skillType: 'form_recall',
      direction: 'root_to_derived',
      learnerLanguage: 'none',
      requiredArtifacts: ['root_derived_pair'],
    })
    const result = buildArtifactsForCapability(cap, makeMorphologyContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none:root_derived_pair',
      capability_key: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
      artifact_kind: 'root_derived_pair',
      quality_status: 'approved',
      payload_json: { root: 'baca', derived: 'membaca' },
    }])
  })

  it('emits allomorph_rule with the rule string from morphology', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
      sourceKind: 'affixed_form_pair',
      sourceRef: MORPHOLOGY_SOURCE_REF,
      capabilityType: 'root_derived_recall',
      skillType: 'form_recall',
      direction: 'root_to_derived',
      learnerLanguage: 'none',
      requiredArtifacts: ['allomorph_rule'],
    })
    const result = buildArtifactsForCapability(cap, makeMorphologyContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none:allomorph_rule',
      capability_key: 'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
      artifact_kind: 'allomorph_rule',
      quality_status: 'approved',
      payload_json: { rule: 'meN- becomes mem- before roots beginning with b.' },
    }])
  })

  it('emits pattern_explanation:l1 with the description as the value', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none',
      sourceKind: 'pattern',
      sourceRef: PATTERN_SOURCE_REF,
      capabilityType: 'pattern_recognition',
      skillType: 'recognition',
      direction: 'none',
      learnerLanguage: 'none',
      requiredArtifacts: ['pattern_explanation:l1'],
    })
    const result = buildArtifactsForCapability(cap, makePatternContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none:pattern_explanation:l1',
      capability_key: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none',
      artifact_kind: 'pattern_explanation:l1',
      quality_status: 'approved',
      payload_json: { value: 'Adjectives follow the noun in Indonesian.' },
    }])
  })

  it('emits pattern_example with the example string as the value', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none',
      sourceKind: 'pattern',
      sourceRef: PATTERN_SOURCE_REF,
      capabilityType: 'pattern_recognition',
      skillType: 'recognition',
      direction: 'none',
      learnerLanguage: 'none',
      requiredArtifacts: ['pattern_example'],
    })
    const result = buildArtifactsForCapability(cap, makePatternContext())
    expect(result).toEqual([{
      asset_key: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none:pattern_example',
      capability_key: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none',
      artifact_kind: 'pattern_example',
      quality_status: 'approved',
      payload_json: { value: 'Rumah besar — Een groot huis' },
    }])
  })

  it('throws when the grammar pattern has no example field', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:pattern:lesson-1/pattern-noun-adjective:pattern_recognition:none:text:none',
      sourceKind: 'pattern',
      sourceRef: PATTERN_SOURCE_REF,
      capabilityType: 'pattern_recognition',
      requiredArtifacts: ['pattern_example'],
    })
    expect(() => buildArtifactsForCapability(cap, makePatternContext({ withExample: false }))).toThrow(/example/)
  })

  it('throws when source data is missing for the capability', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/missing:text_recognition:id_to_l1:text:nl',
      sourceRef: 'learning_items/missing',
      requiredArtifacts: ['base_text'],
    })
    expect(() => buildArtifactsForCapability(cap, makeItemContext())).toThrow(/learning_items\/missing/)
  })

  it('throws on an unknown artifact_kind', () => {
    const cap = makeCapability({
      canonicalKey: 'cap:v1:item:learning_items/makan:text_recognition:id_to_l1:text:nl',
      sourceRef: ITEM_SOURCE_REF,
      requiredArtifacts: ['exercise_variant'],
    })
    expect(() => buildArtifactsForCapability(cap, makeItemContext())).toThrow(/Unknown artifact_kind|exercise_variant/)
  })
})
