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
      expect.arrayContaining(['text_recognition', 'meaning_recall', 'form_recall', 'audio_recognition', 'dictation']),
    )
    expect(projection.capabilities.every(capability => capability.projectionVersion === 'capability-v1')).toBe(true)
  })

  it('requires learner-language meaning for text recognition and accepted answers for dictation', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'text_recognition')
    const dictation = projection.capabilities.find(capability => capability.capabilityType === 'dictation')

    expect(textRecognition?.learnerLanguage).toBe('nl')
    expect(textRecognition?.difficultyLevel).toBe(1)
    expect(textRecognition?.requiredArtifacts).toEqual(expect.arrayContaining(['base_text', 'meaning:l1']))
    expect(dictation?.direction).toBe('audio_to_id')
    expect(dictation?.difficultyLevel).toBe(4)
    expect(dictation?.requiredArtifacts).toEqual(expect.arrayContaining(['accepted_answers:id']))
  })

  it('lesson-sequences vocabulary and audio capabilities with explicit gates', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'text_recognition')
    const formRecall = projection.capabilities.find(capability => capability.capabilityType === 'form_recall')
    const audioCapability = projection.capabilities.find(capability => capability.sourceKind === 'item' && capability.capabilityType === 'audio_recognition')

    expect(textRecognition?.requiredSourceProgress).toEqual({
      kind: 'source_progress',
      sourceRef: 'learning_items/item-1',
      requiredState: 'section_exposed',
    })
    expect(formRecall?.requiredSourceProgress).toEqual({
      kind: 'source_progress',
      sourceRef: 'learning_items/item-1',
      requiredState: 'intro_completed',
    })
    expect(formRecall?.prerequisiteKeys).toEqual([textRecognition?.canonicalKey])
    expect(audioCapability?.requiredSourceProgress).toEqual({
      kind: 'source_progress',
      sourceRef: 'learning_items/item-1',
      requiredState: 'heard_once',
    })
    expect(audioCapability?.prerequisiteKeys).toEqual([textRecognition?.canonicalKey])
  })

  it('normalizes staged lesson source refs for grammar patterns', () => {
    const projection = projectCapabilities(snapshot)
    const pattern = projection.capabilities.find(capability => capability.sourceKind === 'pattern')

    expect(pattern?.sourceRef).toBe('lesson-1/pattern-meN')
    expect(pattern?.requiredArtifacts).toEqual(expect.arrayContaining(['pattern_explanation:l1', 'pattern_example']))
  })

  it('is deterministic for the same input', () => {
    expect(projectCapabilities(snapshot)).toEqual(projectCapabilities(snapshot))
  })

  it('projects non-vocabulary source kinds', () => {
    const sourceKinds = projectCapabilities(snapshot).capabilities.map(capability => capability.sourceKind)

    expect(sourceKinds).toEqual(expect.arrayContaining([
      'dialogue_line',
      'podcast_segment',
      'podcast_phrase',
      'affixed_form_pair',
    ]))
  })
})
