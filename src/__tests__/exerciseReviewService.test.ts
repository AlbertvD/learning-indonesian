import { describe, it, expect } from 'vitest'
import { getPromptSummary } from '@/services/exerciseReviewService'
import type { ExerciseReviewRow } from '@/types/learning'

// getPromptSummary reads one column per typed row; partial fixtures cast through
// unknown keep the cases focused on the field under test.
const row = (over: Record<string, unknown>) => over as unknown as ExerciseReviewRow

describe('getPromptSummary', () => {
  it('extracts prompt_text for choose_correct_form_ex', () => {
    const result = getPromptSummary(row({ exercise_type: 'choose_correct_form_ex', prompt_text: 'Kies de goede vorm' }))
    expect(result).toBe('Kies de goede vorm')
  })

  it('extracts source_sentence for transform_sentence_ex', () => {
    const result = getPromptSummary(row({ exercise_type: 'transform_sentence_ex', source_sentence: 'Ibu pergi ke pasar.' }))
    expect(result).toBe('Ibu pergi ke pasar.')
  })

  it('extracts source_language_sentence for translate_sentence_ex', () => {
    const result = getPromptSummary(row({ exercise_type: 'translate_sentence_ex', source_language_sentence: 'De moeder gaat naar de markt.' }))
    expect(result).toBe('De moeder gaat naar de markt.')
  })

  it('truncates long text to 80 chars with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = getPromptSummary(row({ exercise_type: 'choose_correct_form_ex', prompt_text: long }))
    expect(result.length).toBe(80)
    expect(result.endsWith('…')).toBe(true)
  })

  it('replaces ___ with … in cloze sentences', () => {
    const result = getPromptSummary(row({ exercise_type: 'choose_missing_word_ex', sentence: 'Saya ___ nasi.' }))
    expect(result).toBe('Saya … nasi.')
  })
})
