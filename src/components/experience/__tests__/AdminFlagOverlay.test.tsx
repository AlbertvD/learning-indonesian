import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/services/contentFlagService', () => ({
  contentFlagService: { getFlagForCapability: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

let mockState: { user: { id: string } | null; profile: { isAdmin: boolean } | null }
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}))

import { contentFlagService } from '@/services/contentFlagService'
import { AdminFlagOverlay } from '../AdminFlagOverlay'

function renderOverlay(props: { capabilityId: string | null; exerciseType?: string }) {
  render(
    <MantineProvider>
      <AdminFlagOverlay
        capabilityId={props.capabilityId}
        exerciseType={(props.exerciseType ?? 'recognition_mcq') as any}
      />
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contentFlagService.getFlagForCapability).mockResolvedValue(null)
})

describe('AdminFlagOverlay', () => {
  it('renders nothing for a non-admin learner', () => {
    mockState = { user: { id: 'u1' }, profile: { isAdmin: false } }
    renderOverlay({ capabilityId: 'cap-1' })
    expect(screen.queryByRole('button', { name: 'Markeer voor review' })).not.toBeInTheDocument()
    expect(contentFlagService.getFlagForCapability).not.toHaveBeenCalled()
  })

  it('shows the flag button for an admin and loads any existing flag', async () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    renderOverlay({ capabilityId: 'cap-1' })
    expect(await screen.findByRole('button', { name: 'Markeer voor review' })).toBeInTheDocument()
    await waitFor(() =>
      expect(contentFlagService.getFlagForCapability).toHaveBeenCalledWith('admin-1', 'cap-1', 'recognition_mcq'),
    )
  })

  it('renders nothing for an admin when the capability id is missing', () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    renderOverlay({ capabilityId: null })
    expect(screen.queryByRole('button', { name: 'Markeer voor review' })).not.toBeInTheDocument()
    expect(contentFlagService.getFlagForCapability).not.toHaveBeenCalled()
  })

  it('flags a capability-only exercise (dialogue cloze) — previously unflaggable', async () => {
    mockState = { user: { id: 'admin-1' }, profile: { isAdmin: true } }
    renderOverlay({ capabilityId: 'cap-dlg-9', exerciseType: 'cloze' })
    expect(await screen.findByRole('button', { name: 'Markeer voor review' })).toBeInTheDocument()
    await waitFor(() =>
      expect(contentFlagService.getFlagForCapability).toHaveBeenCalledWith('admin-1', 'cap-dlg-9', 'cloze'),
    )
  })
})
