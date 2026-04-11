import { describe, it, expect } from 'vitest'
import { getPromptSummary } from '@/services/exerciseReviewService'

describe('getPromptSummary', () => {
  it('extracts promptText for contrast_pair', () => {
    const result = getPromptSummary('contrast_pair', { promptText: 'Kies de goede vorm' })
    expect(result).toBe('Kies de goede vorm')
  })

  it('extracts sourceSentence for sentence_transformation', () => {
    const result = getPromptSummary('sentence_transformation', { sourceSentence: 'Ibu pergi ke pasar.' })
    expect(result).toBe('Ibu pergi ke pasar.')
  })

  it('truncates long text to 80 chars with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = getPromptSummary('contrast_pair', { promptText: long })
    expect(result.length).toBe(80)
    expect(result.endsWith('…')).toBe(true)
  })

  it('replaces ___ with … in cloze sentences', () => {
    const result = getPromptSummary('cloze_mcq', { sentence: 'Saya ___ nasi.' })
    expect(result).toBe('Saya … nasi.')
  })

  it('returns empty string for unknown type with no matching field', () => {
    const result = getPromptSummary('unknown_type', {})
    expect(result).toBe('')
  })
})
