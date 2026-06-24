import { describe, it, expect } from 'vitest'
import { validateGrammarExerciseEffectiveness } from '../../validators/grammarExerciseEffectiveness'
import type { CandidateLike } from '../../validators/candidatePayload'

// CS24 is a THIN adapter over the grading-module predicate findIneffectiveProduceReason.
// These fixtures are the real live exercises from the 2026-06-24 produce-effectiveness
// audit, so the gate is proven against the exact data that motivated it.

function candidate(exercise_type: string, payload: Record<string, unknown>, review_status = 'approved'): CandidateLike {
  return { exercise_type, payload, review_status }
}

describe('validateGrammarExerciseEffectiveness (CS24)', () => {
  it('flags a slash word-group transform (grader splits "/" → fragment passes)', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('transform_sentence_ex', {
        sourceSentence: 'Saya minum teh di kamar.',
        transformationInstruction: 'Plaats schuine strepen tussen de woordgroepen.',
        acceptableAnswers: ['Saya / minum teh / di kamar.'], explanationText: 'e',
      }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS24')
    expect(findings[0].severity).toBe('error')
  })

  it('flags a capitalization-only transform (grader lowercases → unfixed prompt passes)', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('transform_sentence_ex', {
        sourceSentence: 'Saya pergi ke kantor pada hari rabu.',
        transformationInstruction: 'Er zit een spelfout in deze zin. Schrijf de zin correct op.',
        acceptableAnswers: ['Saya pergi ke kantor pada hari Rabu.'], explanationText: 'e',
      }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS24')
  })

  it('flags a slash constrained_translation (cross-language prompt, slash arm fires)', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('translate_sentence_ex', {
        sourceLanguageSentence: 'Teman koopt fruit op de markt.', requiredTargetPattern: 'woordgroepen',
        acceptableAnswers: ['Teman / beli buah / di pasar.'], explanationText: 'e',
      }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS24')
  })

  it('passes a genuine transform (answer differs from prompt under normalization)', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('transform_sentence_ex', {
        sourceSentence: 'Koper ini berat.', transformationInstruction: 'Vervang ini door itu.',
        acceptableAnswers: ['Koper itu berat.'], explanationText: 'e',
      }),
    ])
    expect(findings).toEqual([])
  })

  it('passes a genuine constrained_translation (different-language answer, no slash)', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('translate_sentence_ex', {
        sourceLanguageSentence: 'Mijn voet doet pijn.', requiredTargetPattern: 'p',
        acceptableAnswers: ['Kaki saya sakit.'], explanationText: 'e',
      }),
    ])
    expect(findings).toEqual([])
  })

  it('ignores non-produce grammar types and already-published candidates', () => {
    const findings = validateGrammarExerciseEffectiveness([
      candidate('choose_correct_form_ex', { promptText: 'p', targetMeaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a', explanationText: 'e' }),
      candidate('transform_sentence_ex', { sourceSentence: 's', transformationInstruction: 'i', acceptableAnswers: ['s'], explanationText: 'e' }, 'published'),
    ])
    expect(findings).toEqual([])
  })
})
