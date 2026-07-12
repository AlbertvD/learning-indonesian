import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { ActivationGate } from '../ActivationGate'

// useT reads profile.language off the auth store; null profile → default 'nl'.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}))

function renderGate(props: {
  activated: boolean
  saving?: boolean
  onToggle?: (next: boolean) => void
  loadFailed?: boolean
  onRetryLoad?: () => void
}) {
  return render(
    <MantineProvider>
      <ActivationGate
        activated={props.activated}
        saving={props.saving ?? false}
        onToggle={props.onToggle ?? (() => {})}
        loadFailed={props.loadFailed}
        onRetryLoad={props.onRetryLoad}
      />
    </MantineProvider>,
  )
}

describe('ActivationGate', () => {
  it('reflects the activated prop as the checkbox state', () => {
    renderGate({ activated: true })
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onToggle with the next value when clicked', async () => {
    const onToggle = vi.fn()
    renderGate({ activated: false, onToggle })
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('disables the checkbox while saving', () => {
    renderGate({ activated: false, saving: true })
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('renders an inline notice + retry instead of the checkbox when the load failed', async () => {
    const onRetryLoad = vi.fn()
    renderGate({ activated: false, loadFailed: true, onRetryLoad })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('lesson-activation-load-error')).toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: 'Probeer opnieuw' })
    await userEvent.click(retryButton)
    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })
})
