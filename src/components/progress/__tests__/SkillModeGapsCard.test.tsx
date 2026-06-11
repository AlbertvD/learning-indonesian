import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillModeGapsCard } from '../SkillModeGapsCard'
import { getSkillModeGaps } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getSkillModeGaps: vi.fn(),
}))

describe('SkillModeGapsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the three skill modes with a coarse strength, gating low-data modes', async () => {
    vi.mocked(getSkillModeGaps).mockResolvedValue([
      { mode: 'recognise', label: 'mastered', confidence: 'high' },
      { mode: 'produce', label: 'at_risk', confidence: 'medium' },
      { mode: 'listen', label: 'not_assessed', confidence: 'none' },
    ])

    render(<SkillModeGapsCard userId="user-1" />)

    expect(await screen.findByText('Herkennen')).toBeInTheDocument()
    expect(screen.getByText('Produceren')).toBeInTheDocument()
    expect(screen.getByText('Luisteren')).toBeInTheDocument()
    // recognise = strong, produce = weak, listen = insufficient data
    expect(screen.getByText('Sterk')).toBeInTheDocument()
    expect(screen.getByText('Zwak')).toBeInTheDocument()
    expect(screen.getByText('Nog te weinig data')).toBeInTheDocument()
    expect(getSkillModeGaps).toHaveBeenCalledWith('user-1')
  })
})
