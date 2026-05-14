import { describe, it, expect } from 'vitest'
import { feedbackCopyFor, FEEDBACK_COPY_NL, FEEDBACK_COPY_EN, CONTINUE_LABEL_NL, CONTINUE_LABEL_EN } from '../feedbackCopy'

describe('feedbackCopyFor', () => {
  it('17. returns NL bundle for nl', () => {
    const { copy, continueLabel } = feedbackCopyFor('nl')
    expect(copy).toBe(FEEDBACK_COPY_NL)
    expect(copy.outcomeCorrect).toBe('Correct')
    expect(copy.outcomeAlmost).toBe('Bijna goed')
    expect(continueLabel).toBe(CONTINUE_LABEL_NL)
    expect(continueLabel).toBe('Doorgaan')
  })

  it('17. returns EN bundle for en', () => {
    const { copy, continueLabel } = feedbackCopyFor('en')
    expect(copy).toBe(FEEDBACK_COPY_EN)
    expect(copy.outcomeAlmost).toBe('Almost')
    expect(copy.outcomeCorrect).toBe('Correct')
    expect(continueLabel).toBe(CONTINUE_LABEL_EN)
    expect(continueLabel).toBe('Continue')
  })

  it('17. NL and EN bundles have all 17 required keys', () => {
    const requiredKeys = [
      'outcomeCorrect', 'outcomeAlmost', 'outcomeWrong',
      'announceCorrect', 'announceWrong', 'announceFuzzy',
      'roleLabelHeard', 'roleLabelShown', 'roleLabelSaid',
      'roleLabelTarget', 'roleLabelYourAnswer', 'roleLabelMeaning',
      'roleLabelExplanation', 'alsoAccepted', 'replayAudio',
      'commitFailed', 'emptyAnswer',
    ]
    for (const key of requiredKeys) {
      expect(FEEDBACK_COPY_NL).toHaveProperty(key)
      expect(FEEDBACK_COPY_EN).toHaveProperty(key)
    }
  })
})
