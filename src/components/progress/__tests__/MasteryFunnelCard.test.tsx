import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MasteryFunnelCard } from '../MasteryFunnelCard'
import { getMasteryFunnel } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getMasteryFunnel: vi.fn(),
}))

const funnels = {
  vocabulary: { not_assessed: 0, introduced: 5, learning: 3, strengthening: 2, mastered: 7, at_risk: 1 },
  grammar: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
}

describe('MasteryFunnelCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the vocabulary funnel rung counts', async () => {
    vi.mocked(getMasteryFunnel).mockResolvedValue(funnels)

    render(<MasteryFunnelCard userId="user-1" />)

    expect(await screen.findByText('7')).toBeInTheDocument() // mastered
    expect(screen.getByText('5')).toBeInTheDocument() // introduced
    expect(screen.getByText('3')).toBeInTheDocument() // learning
    expect(screen.getByText('2')).toBeInTheDocument() // strengthening
    expect(screen.getByText('1')).toBeInTheDocument() // at_risk
    expect(getMasteryFunnel).toHaveBeenCalledWith('user-1')
  })
})
