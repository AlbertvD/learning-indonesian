import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PracticeTimeCard } from '../PracticeTimeCard'
import { engagement } from '@/lib/analytics/engagement'

vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceTime: vi.fn() },
}))

const fullPractice = {
  streakDays: 4,
  minutesToday: 12,
  minutesThisWeek: 45,
  avgSessionMinutes: 8,
  activeDaysThisWeek: 3,
  lastPracticeAgeDays: 0,
}

describe('PracticeTimeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders streak, minutes today, minutes this week, and time per session', async () => {
    vi.mocked(engagement.practiceTime).mockResolvedValue(fullPractice)

    render(<PracticeTimeCard userId="user-1" timezone="UTC" />)

    expect(await screen.findByText('4')).toBeInTheDocument() // streak
    expect(screen.getByText('12')).toBeInTheDocument() // minutes today
    expect(screen.getByText('45')).toBeInTheDocument() // minutes this week
    expect(screen.getByText('8')).toBeInTheDocument() // avg session minutes
    expect(engagement.practiceTime).toHaveBeenCalledWith('user-1', 'UTC')
  })

  it('renders zeros before/without any practice', async () => {
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 0,
      minutesToday: 0,
      minutesThisWeek: 0,
      avgSessionMinutes: 0,
      activeDaysThisWeek: 0,
      lastPracticeAgeDays: null,
    })

    render(<PracticeTimeCard userId="user-1" timezone="UTC" />)

    expect(await screen.findAllByText('0')).toHaveLength(4)
  })
})
