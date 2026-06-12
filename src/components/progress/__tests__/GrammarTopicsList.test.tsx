import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { GrammarTopicsList } from '../GrammarTopicsList'
import { getGrammarTopics } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getGrammarTopics: vi.fn(),
}))

function renderCard() {
  return render(
    <MantineProvider>
      <GrammarTopicsList userId="user-1" />
    </MantineProvider>,
  )
}

describe('GrammarTopicsList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to the latest lesson and shows its patterns with recognise/use bars', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([
      {
        slug: 'lesson-3/pattern-l3-meN-prefix', lessonNumber: 3, label: 'strengthening', reviewCount: 8,
        recognise: { label: 'mastered', reviewCount: 5 }, use: { label: 'strengthening', reviewCount: 3 },
        name: 'Het meN- voorvoegsel', shortExplanation: 'maakt werkwoorden actief',
      },
      {
        slug: 'lesson-4/pattern-l4-ber-prefix', lessonNumber: 4, label: 'learning', reviewCount: 4,
        recognise: { label: 'strengthening', reviewCount: 3 }, use: { label: 'learning', reviewCount: 1 },
        name: 'Het ber- voorvoegsel', shortExplanation: 'bezit of toestand',
      },
    ])

    renderCard()

    // defaults to the latest lesson (4): its pattern shows, lesson 3's is filtered out
    expect(await screen.findByText('Het ber- voorvoegsel')).toBeInTheDocument()
    expect(screen.queryByText('Het meN- voorvoegsel')).not.toBeInTheDocument()
    // per-pattern recognise + use dimension bars and the practice count
    expect(screen.getByText('Herkennen')).toBeInTheDocument()
    expect(screen.getByText('Toepassen')).toBeInTheDocument()
    expect(screen.getByText('4× geoefend')).toBeInTheDocument()
    expect(getGrammarTopics).toHaveBeenCalledWith('user-1')
  })

  it('shows the heading but no rows when the learner has no grammar topics yet', async () => {
    vi.mocked(getGrammarTopics).mockResolvedValue([])
    const { container } = renderCard()
    await screen.findByRole('heading', { name: /grammatica|grammar/i })
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })
})
