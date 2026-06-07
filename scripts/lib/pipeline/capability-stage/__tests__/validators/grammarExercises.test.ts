import { describe, it, expect } from 'vitest'
import { buildGrammarExerciseRow, GRAMMAR_EXERCISE_TABLE } from '../../projectors/grammarExerciseRows'
import { validateGrammarExercises } from '../../validators/grammarExercises'
import type { CandidateLike } from '../../validators/candidatePayload'

// ─── buildGrammarExerciseRow (the shared payload → typed-columns mapper) ───

describe('buildGrammarExerciseRow', () => {
  it('maps contrast_pair to typed columns (options stay [{id,text}], audit I2)', () => {
    const built = buildGrammarExerciseRow('contrast_pair', {
      promptText: 'Welk woord?', targetMeaning: 'wij',
      options: [{ id: 'a', text: 'Kita' }, { id: 'b', text: 'Kami' }],
      correctOptionId: 'a', explanationText: 'kita = inclusief',
    }, { correctOptionId: 'a' })
    expect(built).toEqual({
      table: GRAMMAR_EXERCISE_TABLE.contrast_pair,
      columns: {
        prompt_text: 'Welk woord?', target_meaning: 'wij',
        options: [{ id: 'a', text: 'Kita' }, { id: 'b', text: 'Kami' }],
        correct_option_id: 'a', explanation_text: 'kita = inclusief',
      },
    })
  })

  it('maps cloze_mcq with options as string[] (audit I2) and prefers answer_key correctOptionId', () => {
    const built = buildGrammarExerciseRow('cloze_mcq', {
      sentence: 'Saya beli ___.', translation: 'Ik koop banaan.',
      options: ['pisang', 'rumah', 'pasar', 'hotel'], correctOptionId: 'IGNORED', explanationText: 'geen lidwoord',
    }, { correctOptionId: 'pisang' })
    expect(built?.table).toBe(GRAMMAR_EXERCISE_TABLE.cloze_mcq)
    expect(built?.columns.options).toEqual(['pisang', 'rumah', 'pasar', 'hotel'])
    expect(built?.columns.correct_option_id).toBe('pisang')  // answer_key wins
  })

  it('maps sentence_transformation (hint_text nullable, acceptable_answers from answer_key)', () => {
    const built = buildGrammarExerciseRow('sentence_transformation', {
      sourceSentence: 'Delapan turis.', transformationInstruction: 'Verander naar twintig', explanationText: 'telwoord verandert',
    }, { acceptableAnswers: ['Dua puluh turis.'] })
    expect(built?.columns).toMatchObject({
      source_sentence: 'Delapan turis.', transformation_instruction: 'Verander naar twintig',
      hint_text: null, acceptable_answers: ['Dua puluh turis.'], explanation_text: 'telwoord verandert',
    })
  })

  it('maps constrained_translation (disallowed_shortcut_forms defaults to [])', () => {
    const built = buildGrammarExerciseRow('constrained_translation', {
      sourceLanguageSentence: 'It is quarter past six.', requiredTargetPattern: 'clock-time-telling',
      explanationText: 'lewat seperempat', disallowedShortcutForms: null,
    }, { acceptableAnswers: ['Jam enam lewat seperempat.'] })
    expect(built?.columns).toMatchObject({
      required_target_pattern: 'clock-time-telling', disallowed_shortcut_forms: [],
      acceptable_answers: ['Jam enam lewat seperempat.'],
    })
  })

  it('returns null for a non-grammar exercise_type', () => {
    expect(buildGrammarExerciseRow('recognition_mcq', {}, {})).toBeNull()
  })
})

// ─── validateGrammarExercises (CS13) ───

function candidate(exercise_type: string, payload: Record<string, unknown>, review_status = 'approved'): CandidateLike {
  return { exercise_type, payload, review_status }
}

describe('validateGrammarExercises (CS13)', () => {
  it('passes valid candidates of all 4 types', () => {
    const findings = validateGrammarExercises([
      candidate('contrast_pair', { promptText: 'p', targetMeaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a', explanationText: 'e' }),
      candidate('sentence_transformation', { sourceSentence: 's', transformationInstruction: 'i', acceptableAnswers: ['a'], explanationText: 'e' }),
      candidate('constrained_translation', { sourceLanguageSentence: 's', requiredTargetPattern: 'p', acceptableAnswers: ['a'], explanationText: 'e' }),
      candidate('cloze_mcq', { sentence: 's ___', translation: 't', options: ['a', 'b'], correctOptionId: 'a', explanationText: 'e' }),
    ])
    expect(findings).toEqual([])
  })

  it('flags contrast_pair when correct_option_id does not match any option id', () => {
    const findings = validateGrammarExercises([
      candidate('contrast_pair', { promptText: 'p', targetMeaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'zzz', explanationText: 'e' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS13')
    expect(findings[0].severity).toBe('error')
  })

  it('flags cloze_mcq with empty options / missing fields', () => {
    const findings = validateGrammarExercises([
      candidate('cloze_mcq', { sentence: '', translation: 't', options: [], correctOptionId: '', explanationText: '' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS13')
  })

  it('flags sentence_transformation with empty acceptable_answers', () => {
    const findings = validateGrammarExercises([
      candidate('sentence_transformation', { sourceSentence: 's', transformationInstruction: 'i', acceptableAnswers: [], explanationText: 'e' }),
    ])
    expect(findings).toHaveLength(1)
  })

  it('skips non-grammar types and already-published candidates', () => {
    const findings = validateGrammarExercises([
      candidate('recognition_mcq', { anything: true }),
      candidate('contrast_pair', { /* malformed */ }, 'published'),
    ])
    expect(findings).toEqual([])
  })

  it('warns (severity warning, not error) when explanation_text is verbose (F4 conciseness)', () => {
    const verbose = 'A'.repeat(221) // > the 220-char soft cap
    const findings = validateGrammarExercises([
      candidate('contrast_pair', { promptText: 'p', targetMeaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a', explanationText: verbose }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS13')
    expect(findings[0].severity).toBe('warning')
  })

  it('does not warn for a concise explanation (F4)', () => {
    const findings = validateGrammarExercises([
      candidate('contrast_pair', { promptText: 'p', targetMeaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a', explanationText: 'kort en bondig' }),
    ])
    expect(findings).toEqual([])
  })
})
