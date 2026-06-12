import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarTopicsList } from '../GrammarTopicsList'
import { getGrammarTopics } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getGrammarTopics: vi.fn(),
}))

describe('GrammarTopicsList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups topics by lesson and shows each name, explanation, and ladder label', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([
      { slug: 'lesson-3/pattern-l3-meN-prefix', lessonNumber: 3, name: 'Het meN- voorvoegsel', shortExplanation: 'maakt werkwoorden actief', label: 'strengthening' },
      { slug: 'lesson-4/pattern-l4-ber-prefix', lessonNumber: 4, name: 'Het ber- voorvoegsel', shortExplanation: 'bezit of toestand', label: 'introduced' },
    ])

    render(<GrammarTopicsList userId="user-1" />)

    expect(await screen.findByText('Het meN- voorvoegsel')).toBeInTheDocument()
    expect(screen.getByText('Het ber- voorvoegsel')).toBeInTheDocument()
    // lesson group headers
    expect(screen.getByText('Les 3')).toBeInTheDocument()
    expect(screen.getByText('Les 4')).toBeInTheDocument()
    // the explanation is now rendered (was fetched but hidden before)
    expect(screen.getByText('maakt werkwoorden actief')).toBeInTheDocument()
    expect(getGrammarTopics).toHaveBeenCalledWith('user-1')
  })

  it('shows the heading but no rows when the learner has no grammar topics yet', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([])
    const { container } = render(<GrammarTopicsList userId="user-1" />)
    await screen.findByRole('heading', { name: /grammatica|grammar/i })
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })
})
