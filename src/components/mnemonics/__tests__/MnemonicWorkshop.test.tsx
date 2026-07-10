// Smoke coverage for the redesigned Ezelsbruggetje modal — structure (title,
// the word it's for, the "Kies een insteek" section + three angle tiles) and
// the save flow. The component's own I/O is mocked; useT defaults to nl.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mnemonics', () => ({
  fetchMnemonic: vi.fn().mockResolvedValue(null),
  upsertMnemonic: vi.fn().mockResolvedValue(undefined),
}))

import { MnemonicWorkshop } from '../MnemonicWorkshop'
import { upsertMnemonic } from '@/lib/mnemonics'

function renderWorkshop(props: Partial<React.ComponentProps<typeof MnemonicWorkshop>> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <MantineProvider>
      <MemoryRouter>
        <MnemonicWorkshop
          userId="u1"
          sourceRef="ref-1"
          label="tiga ratus"
          opened
          onClose={onClose}
          onSaved={onSaved}
          {...props}
        />
      </MemoryRouter>
    </MantineProvider>,
  )
  return { onClose, onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('MnemonicWorkshop — redesigned modal', () => {
  it('renders the title, the word, the angle section, and the three angles', async () => {
    renderWorkshop()
    expect(await screen.findByText('Ezelsbruggetje maken')).toBeInTheDocument()
    expect(screen.getByText('tiga ratus')).toBeInTheDocument()
    expect(screen.getByText('Kies een insteek')).toBeInTheDocument()
    expect(screen.getByText(/Klank \+ beeld/)).toBeInTheDocument()
    expect(screen.getByText(/Een zin over jezelf/)).toBeInTheDocument()
    expect(screen.getByText(/Hak het in stukjes/)).toBeInTheDocument()
  })

  it('shows the affix-trainer link (to the trainer) for an affixed word', async () => {
    renderWorkshop({ isAffixed: true })
    const link = await screen.findByRole('link', { name: /Affix-trainer/ })
    expect(link).toHaveAttribute('href', '/morphology')
  })

  it('keeps Opslaan disabled until a note is typed, then saves and closes', async () => {
    const user = userEvent.setup()
    const { onClose, onSaved } = renderWorkshop()

    const save = await screen.findByRole('button', { name: 'Opslaan' })
    expect(save).toBeDisabled()

    const textarea = await screen.findByPlaceholderText('Schrijf hier je ezelsbruggetje...')
    await waitFor(() => expect(textarea).not.toBeDisabled())
    await user.type(textarea, 'tiga klinkt als tiger → 300 tijgers')

    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => {
      expect(upsertMnemonic).toHaveBeenCalledWith('u1', 'ref-1', 'tiga klinkt als tiger → 300 tijgers')
    })
    expect(onSaved).toHaveBeenCalledWith('tiga klinkt als tiger → 300 tijgers')
    expect(onClose).toHaveBeenCalled()
  })
})
