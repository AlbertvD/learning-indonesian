import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { ActivationGate } from '../ActivationGate'

// useT reads profile.language off the auth store; null profile → default 'nl'.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}))

function renderGate(props: { activated: boolean; saving?: boolean; onToggle?: (next: boolean) => void }) {
  return render(
    <MantineProvider>
      <ActivationGate activated={props.activated} saving={props.saving ?? false} onToggle={props.onToggle ?? (() => {})} />
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
})
