import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MnemonicWordChips } from '../MnemonicWordChips'
import { fetchMnemonicsForRefs, labelForSourceRef } from '@/lib/mnemonics'

vi.mock('@/lib/mnemonics', () => ({
  fetchMnemonicsForRefs: vi.fn(),
  labelForSourceRef: vi.fn((sourceRef: string) => sourceRef.replace(/^learning_items\//, '')),
}))

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

// A minimal stand-in so the test doesn't depend on MnemonicWorkshop's own I/O.
vi.mock('../MnemonicWorkshop', () => ({
  MnemonicWorkshop: ({ sourceRef, label, isAffixed }: { sourceRef: string; label: string; isAffixed: boolean }) => (
    <div data-testid="workshop">
      workshop:{sourceRef}:{label}:{isAffixed ? 'affixed' : 'plain'}
    </div>
  ),
}))

function renderChips(entries: Parameters<typeof MnemonicWordChips>[0]['entries']) {
  return render(
    <MantineProvider>
      <MnemonicWordChips userId="u1" entries={entries} />
    </MantineProvider>,
  )
}

describe('MnemonicWordChips', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(labelForSourceRef).mockImplementation((sourceRef: string) => sourceRef.replace(/^learning_items\//, ''))
    vi.mocked(fetchMnemonicsForRefs).mockResolvedValue(new Map())
  })

  it('renders nothing for an empty entry list', () => {
    renderChips([])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders one chip per entry, labelled via labelForSourceRef', async () => {
    renderChips([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
      { sourceRef: 'learning_items/becak', sourceKind: 'vocabulary_src' },
    ])
    expect(await screen.findByText('pintar')).toBeInTheDocument()
    expect(screen.getByText('becak')).toBeInTheDocument()
    await waitFor(() => expect(fetchMnemonicsForRefs).toHaveBeenCalledWith('u1', ['learning_items/pintar', 'learning_items/becak']))
  })

  it('shows the has-note dot only for words with an existing hook', async () => {
    vi.mocked(fetchMnemonicsForRefs).mockResolvedValue(new Map([['learning_items/pintar', 'painter mnemonic']]))
    renderChips([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
      { sourceRef: 'learning_items/becak', sourceKind: 'vocabulary_src' },
    ])
    const pintarChip = await screen.findByRole('button', { name: /pintar/ })
    const becakChip = screen.getByRole('button', { name: /becak/ })
    await waitFor(() => expect(pintarChip.querySelector('span[aria-hidden="true"]')).not.toBeNull())
    expect(becakChip.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('opens MnemonicWorkshop with the right sourceRef/label/isAffixed on tap', async () => {
    const user = userEvent.setup()
    renderChips([{ sourceRef: 'lesson-3/word-form-pair/meN-baca', sourceKind: 'word_form_pair_src' }])
    const chip = await screen.findByRole('button')
    await user.click(chip)
    expect(await screen.findByTestId('workshop')).toHaveTextContent(
      'workshop:lesson-3/word-form-pair/meN-baca:lesson-3/word-form-pair/meN-baca:affixed',
    )
  })
})
