import { describe, it, expect } from 'vitest'
import { getPromptSummary } from '@/services/exerciseReviewService'
import type { ExerciseReviewRow } from '@/types/learning'

// getPromptSummary reads one column per typed row; partial fixtures cast through
// unknown keep the cases focused on the field under test.
const row = (over: Record<string, unknown>) => over as unknown as ExerciseReviewRow

describe('getPromptSummary', () => {
  it('extracts prompt_text for contrast_pair', () => {
    const result = getPromptSummary(row({ exercise_type: 'contrast_pair', prompt_text: 'Kies de goede vorm' }))
    expect(result).toBe('Kies de goede vorm')
  })

  it('extracts source_sentence for sentence_transformation', () => {
    const result = getPromptSummary(row({ exercise_type: 'sentence_transformation', source_sentence: 'Ibu pergi ke pasar.' }))
    expect(result).toBe('Ibu pergi ke pasar.')
  })

  it('extracts source_language_sentence for constrained_translation', () => {
    const result = getPromptSummary(row({ exercise_type: 'constrained_translation', source_language_sentence: 'De moeder gaat naar de markt.' }))
    expect(result).toBe('De moeder gaat naar de markt.')
  })

  it('truncates long text to 80 chars with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = getPromptSummary(row({ exercise_type: 'contrast_pair', prompt_text: long }))
    expect(result.length).toBe(80)
    expect(result.endsWith('…')).toBe(true)
  })

  it('replaces ___ with … in cloze sentences', () => {
    const result = getPromptSummary(row({ exercise_type: 'cloze_mcq', sentence: 'Saya ___ nasi.' }))
    expect(result).toBe('Saya … nasi.')
  })
})
