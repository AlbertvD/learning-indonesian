import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { OfflineBanner } from '@/components/OfflineBanner'

// useT reads profile.language off the auth store; null profile → default 'nl'.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}))

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function renderBanner() {
  return render(
    <MantineProvider>
      <OfflineBanner />
    </MantineProvider>,
  )
}

describe('OfflineBanner', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = navigator.onLine
  })

  afterEach(() => {
    setOnline(originalOnLine)
  })

  it('renders nothing while online', () => {
    setOnline(true)
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the banner when the offline event fires, and hides it again on reconnect', () => {
    setOnline(true)
    renderBanner()

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toHaveTextContent('Je bent offline')

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('dismisses on click, and re-arms for the next offline period', async () => {
    setOnline(true)
    renderBanner()
    const user = userEvent.setup()

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // Reconnect then drop again — dismissal must not persist across outages.
    act(() => window.dispatchEvent(new Event('online')))
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
