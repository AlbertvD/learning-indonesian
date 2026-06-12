import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillModeGapsCard } from '../SkillModeGapsCard'
import { getSkillModeGaps } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getSkillModeGaps: vi.fn(),
}))

describe('SkillModeGapsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders per-mode known-word COUNTS (vocabulary sizes), gating low-data modes', async () => {
    vi.mocked(getSkillModeGaps).mockResolvedValue([
      { mode: 'recognise', knownWords: 91, practisedWords: 301, strongPct: 30, confidence: 'high' },
      { mode: 'produce', knownWords: 18, practisedWords: 84, strongPct: 21, confidence: 'high' },
      { mode: 'listen', knownWords: 0, practisedWords: 0, strongPct: 0, confidence: 'none' },
    ])

    render(<SkillModeGapsCard userId="user-1" />)

    expect(await screen.findByText('Herkennen')).toBeInTheDocument()
    expect(screen.getByText('Produceren')).toBeInTheDocument()
    expect(screen.getByText('Luisteren')).toBeInTheDocument()
    // the receptive (91) vs productive (18) gap shown as absolute word counts
    expect(screen.getByText('91')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    // denominator shown as context, not as the headline
    expect(screen.getByText(/van 301 geoefend/)).toBeInTheDocument()
    // a mode with no words is gated, not shown as a red 0
    expect(screen.getByText('Nog te weinig data')).toBeInTheDocument()
    // the anti-gap-shaming framing note is present
    expect(screen.getByText(/komen later in je leerroute/)).toBeInTheDocument()
    expect(getSkillModeGaps).toHaveBeenCalledWith('user-1')
  })
})
