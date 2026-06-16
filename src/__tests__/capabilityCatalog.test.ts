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
      expect.arrayContaining(['recognise_meaning_from_text_cap', 'recall_meaning_from_text_cap', 'recognise_form_from_meaning_cap', 'produce_form_from_meaning_cap', 'recognise_meaning_from_audio_cap', 'produce_form_from_audio_cap']),
    )
    expect(projection.capabilities.every(capability => capability.projectionVersion === 'capability-v3')).toBe(true)
  })

  it('requires learner-language meaning for text recognition and accepted answers for dictation', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'recognise_meaning_from_text_cap')
    const dictation = projection.capabilities.find(capability => capability.capabilityType === 'produce_form_from_audio_cap')

    expect(textRecognition?.learnerLanguage).toBe('nl')
    expect(textRecognition?.requiredArtifacts).toEqual(expect.arrayContaining(['base_text', 'meaning:l1']))
    expect(dictation?.direction).toBe('audio_to_id')
    expect(dictation?.requiredArtifacts).toEqual(expect.arrayContaining(['accepted_answers:id']))
  })

  it('chains prerequisites for vocabulary and audio capabilities', () => {
    const projection = projectCapabilities(snapshot)
    const textRecognition = projection.capabilities.find(capability => capability.capabilityType === 'recognise_meaning_from_text_cap')
    const choiceBridge = projection.capabilities.find(capability => capability.capabilityType === 'recognise_form_from_meaning_cap')
    const formRecall = projection.capabilities.find(capability => capability.capabilityType === 'produce_form_from_meaning_cap')
    const audioCapability = projection.capabilities.find(capability => capability.sourceKind === 'vocabulary_src' && capability.capabilityType === 'recognise_meaning_from_audio_cap')

    expect(textRecognition?.sourceRef).toBe('learning_items/item-1')
    expect(choiceBridge).toEqual(expect.objectContaining({
      direction: 'l1_to_id',
      modality: 'text',
      // cap-v2 Slice 1 mis-level fix: recognise_form_from_meaning_cap is recognition, not recall.
      skillType: 'recognise_mode',
      requiredArtifacts: expect.arrayContaining(['meaning:l1', 'base_text']),
      prerequisiteKeys: [textRecognition?.canonicalKey],
    }))
    expect(formRecall?.prerequisiteKeys).toEqual([choiceBridge?.canonicalKey])
    expect(audioCapability?.prerequisiteKeys).toEqual([textRecognition?.canonicalKey])
  })

  it('normalizes staged lesson source refs for grammar patterns', () => {
    const projection = projectCapabilities(snapshot)
    const pattern = projection.capabilities.find(capability => capability.sourceKind === 'grammar_pattern_src')

    expect(pattern?.sourceRef).toBe('lesson-1/pattern-meN')
    // PR 4 (Decision R): pattern caps render from typed grammar-exercise tables;
    // no capability_artifacts required (readiness off the legacy artifact bag).
    expect(pattern?.requiredArtifacts).toEqual([])
  })

  it('is deterministic for the same input', () => {
    expect(projectCapabilities(snapshot)).toEqual(projectCapabilities(snapshot))
  })

  it('projects non-vocabulary source kinds (post Decision 4 + 5b)', () => {
    // Decision 4: podcast_segment_src + podcast_phrase_src moved to
    // scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts.
    // Decision 5b: dialogue_line produce_form_from_context_cap moved to
    // capability-stage/projectors/vocab.ts (driven by clozeContexts).
    // The shared catalog now emits only `pattern` (grammar) and
    // `word_form_pair_src` (morphology) source kinds in addition to `item`.
    const sourceKinds = projectCapabilities(snapshot).capabilities.map(capability => capability.sourceKind)

    expect(sourceKinds).toEqual(expect.arrayContaining([
      'vocabulary_src',
      'grammar_pattern_src',
      'word_form_pair_src',
    ]))
    expect(sourceKinds).not.toContain('dialogue_line_src')
    expect(sourceKinds).not.toContain('podcast_segment_src')
    expect(sourceKinds).not.toContain('podcast_phrase_src')
  })

  it('Decision 5a: recognise_grammar_pattern_cap has a sibling contrast_grammar_pattern_cap capability', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(c => c.capabilityType === 'recognise_grammar_pattern_cap')
    const contrast = projection.capabilities.find(c => c.capabilityType === 'contrast_grammar_pattern_cap')

    expect(recognition).toBeDefined()
    expect(contrast).toBeDefined()
    expect(contrast?.sourceRef).toBe(recognition?.sourceRef)
    expect(contrast?.prerequisiteKeys).toEqual([recognition?.canonicalKey])
  })
})
