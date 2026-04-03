import { describe, it, expect } from 'vitest'
import {
  getExerciseMetadata,
  isImplemented,
  getImplementedExercises,
  getAllExercises,
  getExercisesByFocus,
  getGrammarAwareExercises,
  getApprovedContentExercises,
  getPrimarySkillFacet,
  type ExerciseType,
} from '@/domain/learning/exerciseCatalog'

describe('exerciseCatalog', () => {
  it('returns metadata for all exercise types', () => {
    const exercises: ExerciseType[] = [
      'recognition',
      'cued_recall',
      'typed_recall',
      'cloze',
      'contrast_pair',
      'sentence_transformation',
      'constrained_translation',
      'speaking',
    ]

    for (const type of exercises) {
      const metadata = getExerciseMetadata(type)
      expect(metadata.type).toBe(type)
      expect(['recognition', 'form_recall', 'meaning_recall', 'spoken_production']).toContain(
        metadata.primarySkillFacet
      )
    }
  })

  it('identifies implemented vs planned exercises', () => {
    expect(isImplemented('recognition')).toBe(true)
    expect(isImplemented('cued_recall')).toBe(true)
    expect(isImplemented('typed_recall')).toBe(true)
    expect(isImplemented('cloze')).toBe(true)
    expect(isImplemented('contrast_pair')).toBe(true)
    expect(isImplemented('sentence_transformation')).toBe(true)
    expect(isImplemented('constrained_translation')).toBe(true)
    expect(isImplemented('speaking')).toBe(false)
  })

  it('returns correct implemented exercises list', () => {
    const implemented = getImplementedExercises()
    expect(implemented.length).toBe(7)
    expect(implemented).not.toContain('speaking')
    expect(implemented).toContain('recognition')
  })

  it('returns all exercises including planned', () => {
    const all = getAllExercises()
    expect(all.length).toBe(8)
    expect(all).toContain('speaking')
  })

  it('filters exercises by content focus', () => {
    const vocab = getExercisesByFocus('vocabulary')
    expect(vocab.length).toBeGreaterThan(0)
    expect(vocab.every(ex => ex.contentFocus === 'vocabulary')).toBe(true)

    const grammar = getExercisesByFocus('grammar')
    expect(grammar.length).toBeGreaterThan(0)
    expect(grammar.every(ex => ex.contentFocus === 'grammar')).toBe(true)

    const production = getExercisesByFocus('production')
    expect(production.length).toBeGreaterThan(0)
  })

  it('identifies grammar-aware exercises', () => {
    const grammarExercises = getGrammarAwareExercises()
    const types = grammarExercises.map(ex => ex.type)

    expect(types).toContain('contrast_pair')
    expect(types).toContain('sentence_transformation')
    expect(types).toContain('constrained_translation')
    expect(types).not.toContain('recognition')
    expect(types).not.toContain('cued_recall')
  })

  it('identifies exercises requiring approved content', () => {
    const approvedExercises = getApprovedContentExercises()
    const types = approvedExercises.map(ex => ex.type)

    expect(types).toContain('contrast_pair')
    expect(types).toContain('sentence_transformation')
    expect(types).toContain('constrained_translation')
    expect(types).toContain('speaking')
    expect(types).not.toContain('recognition')
    expect(types).not.toContain('typed_recall')
  })

  it('returns primary skill facet for each exercise', () => {
    expect(getPrimarySkillFacet('recognition')).toBe('recognition')
    expect(getPrimarySkillFacet('cued_recall')).toBe('meaning_recall')
    expect(getPrimarySkillFacet('typed_recall')).toBe('form_recall')
    expect(getPrimarySkillFacet('cloze')).toBe('form_recall')
    expect(getPrimarySkillFacet('contrast_pair')).toBe('recognition')
    expect(getPrimarySkillFacet('sentence_transformation')).toBe('form_recall')
    expect(getPrimarySkillFacet('constrained_translation')).toBe('meaning_recall')
    expect(getPrimarySkillFacet('speaking')).toBe('spoken_production')
  })

  it('throws on unknown exercise type', () => {
    expect(() => getExerciseMetadata('unknown_type' as ExerciseType)).toThrow(
      'Unknown exercise type'
    )
  })
})
