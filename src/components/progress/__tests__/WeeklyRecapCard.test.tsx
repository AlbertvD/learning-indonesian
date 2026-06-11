import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WeeklyRecapCard } from '../WeeklyRecapCard'
import { getWeeklyMovement } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getWeeklyMovement: vi.fn(),
}))

describe('WeeklyRecapCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the weekly rung-movement counts', async () => {
    vi.mocked(getWeeklyMovement).mockResolvedValue({ advanced: 12, reachedMastered: 3, slipped: 1 })

    render(<WeeklyRecapCard userId="user-1" timezone="UTC" />)

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(getWeeklyMovement).toHaveBeenCalledWith('user-1', 'UTC')
  })
})
