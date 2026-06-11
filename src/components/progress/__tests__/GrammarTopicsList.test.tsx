import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarTopicsList } from '../GrammarTopicsList'
import { getGrammarTopics } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getGrammarTopics: vi.fn(),
}))

describe('GrammarTopicsList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists each named grammar topic with its ladder label', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([
      { slug: 'l3-meN-prefix', name: 'Het meN- voorvoegsel', shortExplanation: 'x', label: 'strengthening' },
      { slug: 'l4-ber-prefix', name: 'Het ber- voorvoegsel', shortExplanation: 'y', label: 'introduced' },
    ])

    render(<GrammarTopicsList userId="user-1" />)

    expect(await screen.findByText('Het meN- voorvoegsel')).toBeInTheDocument()
    expect(screen.getByText('Het ber- voorvoegsel')).toBeInTheDocument()
    expect(getGrammarTopics).toHaveBeenCalledWith('user-1')
  })

  it('shows the heading but no rows when the learner has no grammar topics yet', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([])
    const { container } = render(<GrammarTopicsList userId="user-1" />)
    await screen.findByRole('heading', { name: /grammatica|grammar/i })
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })
})
