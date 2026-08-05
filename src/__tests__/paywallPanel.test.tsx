// src/__tests__/paywallPanel.test.tsx
//
// PaywallPanel (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md
// §3.1/§5): renders both prices, and each subscribe button calls
// create-checkout-session with its own plan id and redirects the browser to
// the returned url.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PaywallPanel } from '@/components/paywall/PaywallPanel'

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({ profile: { language: 'nl' } }),
}))

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

function renderPanel() {
  return render(
    <MantineProvider>
      <PaywallPanel />
    </MantineProvider>,
  )
}

describe('PaywallPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Never resolves in these tests — asserts the call args without letting
    // the component reach `window.location.href = url` (jsdom doesn't
    // implement navigation; the call-args assertion is the load-bearing part).
    mockInvoke.mockReturnValue(new Promise(() => {}))
  })

  it('shows both prices with the annual plan marked as the better deal', () => {
    renderPanel()
    expect(screen.getByText('€9')).toBeInTheDocument()
    expect(screen.getByText('€79')).toBeInTheDocument()
    expect(screen.getByText('Bespaar ~27%')).toBeInTheDocument()
  })

  it('the monthly button calls create-checkout-session with plan: "monthly"', async () => {
    const user = userEvent.setup()
    renderPanel()
    const buttons = screen.getAllByRole('button', { name: 'Abonneren' })
    await user.click(buttons[0])
    expect(mockInvoke).toHaveBeenCalledWith('create-checkout-session', { body: { plan: 'monthly' } })
  })

  it('the annual button calls create-checkout-session with plan: "annual"', async () => {
    const user = userEvent.setup()
    renderPanel()
    const buttons = screen.getAllByRole('button', { name: 'Abonneren' })
    await user.click(buttons[1])
    expect(mockInvoke).toHaveBeenCalledWith('create-checkout-session', { body: { plan: 'annual' } })
  })

  it('links to /voorwaarden and /restitutie', () => {
    renderPanel()
    expect(screen.getByRole('link', { name: 'Voorwaarden' })).toHaveAttribute('href', '/voorwaarden')
    expect(screen.getByRole('link', { name: 'Restitutiebeleid' })).toHaveAttribute('href', '/restitutie')
  })
})
