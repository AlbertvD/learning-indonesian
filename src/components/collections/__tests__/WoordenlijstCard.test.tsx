import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { IconTrophy } from '@tabler/icons-react'
import { describe, expect, it, vi } from 'vitest'
import { WoordenlijstCard, type WoordenlijstCardProps } from '../WoordenlijstCard'

function renderCard(overrides: Partial<WoordenlijstCardProps> = {}) {
  const props: WoordenlijstCardProps = {
    name: 'Top 100 woorden',
    description: 'De 100 meest gebruikte woorden.',
    kind: 'frequency',
    rankCutoff: 100,
    icon: <IconTrophy size={20} />,
    totalWords: 100,
    knownWords: 67,
    eligibleNow: 80,
    gain: 20,
    activated: false,
    saving: false,
    knownLabel: 'gekend',
    eligibleLabel: 'in oefeningen',
    gainWordsLabel: 'woorden',
    addedLabel: 'Toegevoegd',
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
  it('shows the name, description, rank chip and the known/eligible legend', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: /Top 100 woorden/ })).toBeInTheDocument()
    expect(screen.getByText('De 100 meest gebruikte woorden.')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument() // rank chip
    expect(screen.getByText(/67/)).toBeInTheDocument() // known
    expect(screen.getByText(/in oefeningen/)).toBeInTheDocument()
  })

  it('shows the gain pill with the marginal word count when not activated', () => {
    renderCard({ gain: 20, activated: false })
    expect(screen.getByText(/\+20/)).toBeInTheDocument()
  })

  it('replaces the gain pill with the added badge once activated', () => {
    renderCard({ activated: true, gain: 0 })
    expect(screen.getByText('Toegevoegd')).toBeInTheDocument()
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('names the toggle for a11y and reports flips', async () => {
    const props = renderCard({ activated: false })
    const toggle = screen.getByRole('switch', { name: 'In oefeningen: Top 100 woorden' })
    await userEvent.click(toggle)
    expect(props.onToggle).toHaveBeenCalledWith(true)
  })

  it('disables the toggle while saving', () => {
    renderCard({ saving: true })
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('handles a zero-word band without crashing', () => {
    renderCard({ totalWords: 0, knownWords: 0, eligibleNow: 0, gain: 0 })
    expect(screen.getByRole('heading', { name: /Top 100 woorden/ })).toBeInTheDocument()
  })

  it('omits the rank chip for theme packs', () => {
    renderCard({ kind: 'theme', rankCutoff: null, name: 'Eten & drinken' })
    expect(screen.queryByText('100')).not.toBeInTheDocument()
  })
})
