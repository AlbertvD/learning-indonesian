import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { WoordenlijstCard, type WoordenlijstCardProps } from '../WoordenlijstCard'

function renderCard(overrides: Partial<WoordenlijstCardProps> = {}) {
  const props: WoordenlijstCardProps = {
    name: 'Top 100 woorden',
    totalWords: 100,
    knownWords: 67,
    activated: false,
    saving: false,
    knownLabel: 'woorden gekend',
    activateLabel: 'In oefeningen',
    onToggle: vi.fn(),
    ...overrides,
  }
  render(
    <MantineProvider>
      <WoordenlijstCard {...props} />
    </MantineProvider>,
  )
  return props
}

describe('WoordenlijstCard', () => {
  it('shows the band name and the known/total coverage', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Top 100 woorden' })).toBeInTheDocument()
    expect(screen.getByText('67/100 woorden gekend')).toBeInTheDocument()
  })

  it('reflects activation in the toggle and names it for a11y', () => {
    renderCard({ activated: true })
    const toggle = screen.getByRole('switch', { name: 'In oefeningen: Top 100 woorden' })
    expect(toggle).toBeChecked()
  })

  it('calls onToggle with the next value when flipped', async () => {
    const props = renderCard({ activated: false })
    await userEvent.click(screen.getByRole('switch'))
    expect(props.onToggle).toHaveBeenCalledWith(true)
  })

  it('disables the toggle while saving', () => {
    renderCard({ saving: true })
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('handles a zero-word band without dividing by zero', () => {
    renderCard({ totalWords: 0, knownWords: 0 })
    expect(screen.getByText('0/0 woorden gekend')).toBeInTheDocument()
  })
})
