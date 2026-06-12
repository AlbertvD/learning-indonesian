import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StubbornWordsCard } from '../StubbornWordsCard'
import { getStubbornWords } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getStubbornWords: vi.fn(),
}))

function renderCard() {
  return render(
    <MantineProvider>
      <StubbornWordsCard userId="u1" />
    </MantineProvider>,
  )
}

describe('StubbornWordsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when there are no stubborn words (the empty safety net)', async () => {
    vi.mocked(getStubbornWords).mockResolvedValue([])
    renderCard()
    await waitFor(() => expect(getStubbornWords).toHaveBeenCalledWith('u1'))
    expect(screen.queryByText(/moeilijke woorden|stubborn words/i)).not.toBeInTheDocument()
  })

  it('lists unique words (deduped across skills) with the change-strategy tips', async () => {
    vi.mocked(getStubbornWords).mockResolvedValue([
      { sourceRef: 'learning_items/pintar', sourceKind: 'item', capabilityType: 'dictation', consecutiveFailures: 5 },
      { sourceRef: 'learning_items/pintar', sourceKind: 'item', capabilityType: 'meaning_recall', consecutiveFailures: 4 },
      { sourceRef: 'learning_items/becak', sourceKind: 'item', capabilityType: 'text_recognition', consecutiveFailures: 4 },
    ])
    renderCard()

    expect(await screen.findByText('pintar')).toBeInTheDocument()
    expect(screen.getByText('becak')).toBeInTheDocument()
    // two distinct words despite three stubborn capabilities
    expect(screen.getByText(/^2\s+(moeilijke woorden|stubborn words)$/i)).toBeInTheDocument()
  })
})
