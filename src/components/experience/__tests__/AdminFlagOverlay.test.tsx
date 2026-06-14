import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/services/contentFlagService', () => ({
  contentFlagService: { getFlagForItem: vi.fn(), getFlagForGrammarPattern: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

let mockState: { user: { id: string } | null; profile: { isAdmin: boolean } | null }
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}))

import { contentFlagService } from '@/services/contentFlagService'
import { AdminFlagOverlay } from '../AdminFlagOverlay'

function renderOverlay(props: { learningItemId: string | null }) {
  render(
    <MantineProvider>
      <AdminFlagOverlay learningItemId={props.learningItemId} exerciseType={'recognition_mcq' as any} />
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contentFlagService.getFlagForItem).mockResolvedValue(null)
  vi.mocked(contentFlagService.getFlagForGrammarPattern).mockResolvedValue(null)
})

describe('AdminFlagOverlay', () => {
  it('renders nothing for a non-admin learner', () => {
    mockState = { user: { id: 'u1' }, profile: { isAdmin: false } }
    renderOverlay({ learningItemId: 'item-1' })
    expect(screen.queryByRole('button', { name: 'Markeer voor review' })).not.toBeInTheDocument()
    expect(contentFlagService.getFlagForItem).not.toHaveBeenCalled()
  })

  it('shows the flag button for an admin and loads any existing flag', async () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    renderOverlay({ learningItemId: 'item-1' })
    expect(await screen.findByRole('button', { name: 'Markeer voor review' })).toBeInTheDocument()
    await waitFor(() =>
      expect(contentFlagService.getFlagForItem).toHaveBeenCalledWith('admin-1', 'item-1', 'recognition_mcq'),
    )
  })

  it('renders nothing for an admin when neither an item nor a grammar pattern is present', () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    renderOverlay({ learningItemId: null })
    expect(screen.queryByRole('button', { name: 'Markeer voor review' })).not.toBeInTheDocument()
    expect(contentFlagService.getFlagForItem).not.toHaveBeenCalled()
  })

  it('flags a grammar exercise via its pattern id (not an item)', async () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    render(
      <MantineProvider>
        <AdminFlagOverlay learningItemId={null} grammarPatternId="pat-7" exerciseType={'contrast_pair' as any} />
      </MantineProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Markeer voor review' })).toBeInTheDocument()
    await waitFor(() =>
      expect(contentFlagService.getFlagForGrammarPattern).toHaveBeenCalledWith('admin-1', 'pat-7', 'contrast_pair'),
    )
    expect(contentFlagService.getFlagForItem).not.toHaveBeenCalled()
  })
})
