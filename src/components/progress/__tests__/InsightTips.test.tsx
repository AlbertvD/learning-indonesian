import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { InsightTips } from '../InsightTips'
import { STUDY_TIPS } from '@/lib/analytics/studyTips'

describe('InsightTips', () => {
  it('shows multiple evidence-based tips for the weak area, collapsible', async () => {
    render(<InsightTips area="produce" />)

    // title + every produce tip (nl default) rendered
    expect(screen.getByText(STUDY_TIPS.produce.title.nl)).toBeInTheDocument()
    for (const tip of STUDY_TIPS.produce.tips.nl) {
      expect(screen.getByText(tip)).toBeInTheDocument()
    }
    expect(STUDY_TIPS.produce.tips.nl.length).toBeGreaterThan(1)

    // collapsing hides the tips
    await userEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.queryByText(STUDY_TIPS.produce.tips.nl[0])).not.toBeInTheDocument()
  })
})
