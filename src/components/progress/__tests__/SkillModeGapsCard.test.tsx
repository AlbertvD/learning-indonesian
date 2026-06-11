import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillModeGapsCard } from '../SkillModeGapsCard'
import { getSkillModeGaps } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getSkillModeGaps: vi.fn(),
}))

describe('SkillModeGapsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a per-mode proportion gauge (receptive-productive gap), gating low-data modes', async () => {
    vi.mocked(getSkillModeGaps).mockResolvedValue([
      { mode: 'recognise', strong: 90, total: 100, strongPct: 90, confidence: 'high' },
      { mode: 'produce', strong: 30, total: 100, strongPct: 30, confidence: 'high' },
      { mode: 'listen', strong: 0, total: 0, strongPct: 0, confidence: 'none' },
    ])

    render(<SkillModeGapsCard userId="user-1" />)

    expect(await screen.findByText('Herkennen')).toBeInTheDocument()
    expect(screen.getByText('Produceren')).toBeInTheDocument()
    expect(screen.getByText('Luisteren')).toBeInTheDocument()
    // proportions, not a fuzzy "weak" word — and the receptive (90%) vs productive (30%) gap
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    // a mode with no words is gated, not shown as a red 0%
    expect(screen.getByText('Nog te weinig data')).toBeInTheDocument()
    expect(getSkillModeGaps).toHaveBeenCalledWith('user-1')
  })
})
