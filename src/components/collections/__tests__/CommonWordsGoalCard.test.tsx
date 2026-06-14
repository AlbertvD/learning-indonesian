import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/collections')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; profile: null }) => unknown) =>
    selector({ user: { id: 'user-uuid' }, profile: null }),
}))

import { getCollectionsOverview, type CollectionOverview } from '@/lib/collections'
import { CommonWordsGoalCard } from '../CommonWordsGoalCard'

const band = (over: Partial<CollectionOverview>): CollectionOverview => ({
  collectionId: 'c', slug: 's', name: 'n', kind: 'frequency',
  rankCutoff: 100, isActivated: false, totalWords: 100, knownWords: 0, ...over,
})

function renderGoal() {
  render(
    <MantineProvider>
      <MemoryRouter>
        <CommonWordsGoalCard />
      </MemoryRouter>
    </MantineProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('CommonWordsGoalCard', () => {
  it('picks the largest-cutoff frequency band and shows its coverage when activated', async () => {
    vi.mocked(getCollectionsOverview).mockResolvedValue([
      band({ collectionId: 'a', name: 'Top 100', rankCutoff: 100, isActivated: true, knownWords: 67, totalWords: 100 }),
      band({ collectionId: 'b', name: 'Top 1000', rankCutoff: 1000, isActivated: true, knownWords: 300, totalWords: 1000 }),
    ])
    renderGoal()
    expect(await screen.findByText('Top 1000')).toBeInTheDocument()
    expect(screen.getByText('300/1000 woorden gekend')).toBeInTheDocument()
  })

  it('shows the pick-a-list CTA when the headline band is not activated', async () => {
    vi.mocked(getCollectionsOverview).mockResolvedValue([
      band({ name: 'Top 100', isActivated: false }),
    ])
    renderGoal()
    expect(await screen.findByText('Top 100')).toBeInTheDocument()
    expect(screen.getByText('Kies een woordenlijst')).toBeInTheDocument()
  })

  it('renders nothing when there are no frequency bands', async () => {
    vi.mocked(getCollectionsOverview).mockResolvedValue([])
    const { container } = render(
      <MantineProvider><MemoryRouter><CommonWordsGoalCard /></MemoryRouter></MantineProvider>,
    )
    await waitFor(() => expect(getCollectionsOverview).toHaveBeenCalled())
    expect(container.querySelector('a')).toBeNull()
  })
})
