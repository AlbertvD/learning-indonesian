import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
import type { CurrentContentSnapshot } from '@/lib/capabilities/capabilityTypes'

const snapshot: CurrentContentSnapshot = {
  learningItems: [{
    id: 'item-1',
    baseText: 'makan',
    meanings: [{ language: 'nl', text: 'eten' }],
    acceptedAnswers: { id: ['makan'], l1: ['eten'] },
    hasAudio: true,
  }],
  grammarPatterns: [{
    id: 'pattern-1',
    sourceRef: 'lesson-01/pattern-meN',
    name: 'meN- verbs',
    examples: ['membaca'],
  }],
  dialogueLines: [{
    id: 'dialogue-1',
    sourceRef: 'lesson-01/dialogue-1/line-1',
    text: 'Apa kabar?',
    translation: 'How are you?',
  }],
  podcastSegments: [{
    id: 'segment-1',
    sourceRef: 'podcast-warung/segment-1',
    hasAudio: true,
  }],
  podcastPhrases: [{
    id: 'phrase-1',
    sourceRef: 'podcast-warung/phrase-1',
    text: 'apa kabar',
    translation: 'how are you',
  }],
  affixedFormPairs: [{
    id: 'pair-1',
    sourceRef: 'lesson-1/morphology/meN-1',
    root: 'baca',
    derived: 'membaca',
  }],
  stagedLessons: [],
}

describe('capability catalog projection', () => {
  it('projects vocabulary text, meaning, form, and audio capability candidates', () => {
    const projection = projectCapabilities(snapshot)

    expect(projection.capabilities.map(capability => capability.capabilityType)).toEqual(
      expect.arrayContaining(['text_recognition', 'meaning_recall', 'l1_to_id_choice', 'form_recall', 'audio_recognition', 'dictation']),
    )
    expect(projection.capabilities.every(capability => capability.projectionVersion === 'capability-v3')).toBe(true)
  })

  it('requires learner-language meaning for text recognition and accepted answers for dictation', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'text_recognition')
    const dictation = projection.capabilities.find(capability => capability.capabilityType === 'dictation')

    expect(textRecognition?.learnerLanguage).toBe('nl')
    expect(textRecognition?.requiredArtifacts).toEqual(expect.arrayContaining(['base_text', 'meaning:l1']))
    expect(dictation?.direction).toBe('audio_to_id')
    expect(dictation?.requiredArtifacts).toEqual(expect.arrayContaining(['accepted_answers:id']))
  })

  it('chains prerequisites for vocabulary and audio capabilities', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'text_recognition')
    const choiceBridge = projection.capabilities.find(capability => capability.capabilityType === 'l1_to_id_choice')
    const formRecall = projection.capabilities.find(capability => capability.capabilityType === 'form_recall')
    const audioCapability = projection.capabilities.find(capability => capability.sourceKind === 'item' && capability.capabilityType === 'audio_recognition')

    expect(textRecognition?.sourceRef).toBe('learning_items/item-1')
    expect(choiceBridge).toEqual(expect.objectContaining({
      direction: 'l1_to_id',
      modality: 'text',
      skillType: 'meaning_recall',
      requiredArtifacts: expect.arrayContaining(['meaning:l1', 'base_text']),
      prerequisiteKeys: [textRecognition?.canonicalKey],
    }))
    expect(formRecall?.prerequisiteKeys).toEqual([choiceBridge?.canonicalKey])
    expect(audioCapability?.prerequisiteKeys).toEqual([textRecognition?.canonicalKey])
  })

  it('normalizes staged lesson source refs for grammar patterns', () => {
    const projection = projectCapabilities(snapshot)
    const pattern = projection.capabilities.find(capability => capability.sourceKind === 'pattern')

    expect(pattern?.sourceRef).toBe('lesson-1/pattern-meN')
    // PR 4 (Decision R): pattern caps render from typed grammar-exercise tables;
    // no capability_artifacts required (readiness off the legacy artifact bag).
    expect(pattern?.requiredArtifacts).toEqual([])
  })

  it('is deterministic for the same input', () => {
    expect(projectCapabilities(snapshot)).toEqual(projectCapabilities(snapshot))
  })

  it('projects non-vocabulary source kinds (post Decision 4 + 5b)', () => {
    // Decision 4: podcast_segment + podcast_phrase moved to
    // scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts.
    // Decision 5b: dialogue_line contextual_cloze moved to
    // capability-stage/projectors/vocab.ts (driven by clozeContexts).
    // The shared catalog now emits only `pattern` (grammar) and
    // `affixed_form_pair` (morphology) source kinds in addition to `item`.
    const sourceKinds = projectCapabilities(snapshot).capabilities.map(capability => capability.sourceKind)

    expect(sourceKinds).toEqual(expect.arrayContaining([
      'item',
      'pattern',
      'affixed_form_pair',
    ]))
    expect(sourceKinds).not.toContain('dialogue_line')
    expect(sourceKinds).not.toContain('podcast_segment')
    expect(sourceKinds).not.toContain('podcast_phrase')
  })

  it('Decision 5a: pattern_recognition has a sibling pattern_contrast capability', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(c => c.capabilityType === 'pattern_recognition')
    const contrast = projection.capabilities.find(c => c.capabilityType === 'pattern_contrast')

    expect(recognition).toBeDefined()
    expect(contrast).toBeDefined()
    expect(contrast?.sourceRef).toBe(recognition?.sourceRef)
    expect(contrast?.prerequisiteKeys).toEqual([recognition?.canonicalKey])
  })
})
