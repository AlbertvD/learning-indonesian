import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { notifications } from '@mantine/notifications'

vi.mock('@/lib/collections')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; profile: null }) => unknown) =>
    selector({ user: { id: 'user-uuid' }, profile: null }),
}))

import { getCollectionsOverview, setCollectionActivated, type CollectionOverview } from '@/lib/collections'
import { Woordenlijsten } from '../Woordenlijsten'

const band = (over: Partial<CollectionOverview> = {}): CollectionOverview => ({
  collectionId: 'c1',
  slug: 'top-100',
  name: 'Top 100 woorden',
  kind: 'frequency',
  rankCutoff: 100,
  isActivated: false,
  totalWords: 100,
  knownWords: 67,
  ...over,
})

function renderList() {
  render(
    <MantineProvider>
      <Woordenlijsten />
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCollectionsOverview).mockResolvedValue([band()])
  vi.mocked(setCollectionActivated).mockResolvedValue(undefined)
})

describe('Woordenlijsten', () => {
  it('renders a card per collection from the coverage model', async () => {
    renderList()
    expect(await screen.findByRole('heading', { name: 'Top 100 woorden' })).toBeInTheDocument()
    expect(screen.getByText('67/100 woorden gekend')).toBeInTheDocument()
    expect(getCollectionsOverview).toHaveBeenCalledWith('user-uuid')
  })

  it('optimistically activates a band and persists via the RPC write', async () => {
    renderList()
    const toggle = await screen.findByRole('switch')
    await userEvent.click(toggle)

    expect(setCollectionActivated).toHaveBeenCalledWith('user-uuid', 'c1', true)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'teal' }))
  })

  it('reverts and notifies on write failure', async () => {
    vi.mocked(setCollectionActivated).mockRejectedValue(new Error('rpc failed'))
    renderList()
    const toggle = await screen.findByRole('switch')
    await userEvent.click(toggle)

    await waitFor(() => expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })))
    expect(toggle).not.toBeChecked() // reverted
  })

  it('renders nothing until a band is seeded (empty overview)', async () => {
    vi.mocked(getCollectionsOverview).mockResolvedValue([])
    const { container } = render(
      <MantineProvider>
        <Woordenlijsten />
      </MantineProvider>,
    )
    await waitFor(() => expect(getCollectionsOverview).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Woordenlijsten' })).not.toBeInTheDocument()
    // section root absent
    expect(container.querySelector('section')).toBeNull()
  })
})
