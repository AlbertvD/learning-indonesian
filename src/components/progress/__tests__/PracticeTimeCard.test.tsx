import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PracticeTimeCard } from '../PracticeTimeCard'
import { engagement } from '@/lib/analytics/engagement'

vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceMinutesThisWeek: vi.fn() },
}))

describe('PracticeTimeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the weekly practice minutes from the engagement module', async () => {
    vi.mocked(engagement.practiceMinutesThisWeek).mockResolvedValue(45)

    render(<PracticeTimeCard userId="user-1" timezone="UTC" />)

    expect(await screen.findByText('45')).toBeInTheDocument()
    expect(engagement.practiceMinutesThisWeek).toHaveBeenCalledWith(
      'user-1',
      'UTC',
    )
  })

  it('shows zero before/without any practice', async () => {
    vi.mocked(engagement.practiceMinutesThisWeek).mockResolvedValue(0)

    render(<PracticeTimeCard userId="user-1" timezone="UTC" />)

    expect(await screen.findByText('0')).toBeInTheDocument()
  })
})
