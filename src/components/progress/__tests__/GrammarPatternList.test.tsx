import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarPatternList } from '../GrammarPatternList'
import { getGrammarTopics } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getGrammarTopics: vi.fn(),
}))

describe('GrammarPatternList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows only the given lesson’s patterns, as recognise/use chips with a practice count', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([
      {
        slug: 'lesson-3/pattern-meN', lessonNumber: 3, label: 'learning', reviewCount: 4,
        recognise: { label: 'strengthening', reviewCount: 3 }, use: { label: 'learning', reviewCount: 1 },
        name: 'meN- voorvoegsel', shortExplanation: 'maakt werkwoorden actief',
      },
      {
        slug: 'lesson-2/pattern-ander', lessonNumber: 2, label: 'introduced', reviewCount: 0,
        recognise: { label: 'introduced', reviewCount: 0 }, use: null,
        name: 'ander patroon', shortExplanation: 'iets anders',
      },
    ])

    render(<GrammarPatternList userId="user-1" lessonNumber={3} />)

    expect(await screen.findByText('meN- voorvoegsel')).toBeInTheDocument()
    // a pattern from another lesson is filtered out
    expect(screen.queryByText('ander patroon')).not.toBeInTheDocument()
    expect(screen.getByText('Herkennen')).toBeInTheDocument()
    expect(screen.getByText('Toepassen')).toBeInTheDocument()
    expect(screen.getByText('4× geoefend')).toBeInTheDocument()
  })
})
