import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VocabMasteryPanel } from '../VocabMasteryPanel'
import { getTroublesomeWords } from '@/lib/analytics/mastery/masteryModel'
import type { MasteryFunnelPanelProps } from '../MasteryFunnelPanel'
import type { TroublesomeWordsSheetProps } from '@/components/mnemonics/TroublesomeWordsSheet'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getTroublesomeWords: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

// Stand-ins so this test stays a unit test of VocabMasteryPanel's own wiring
// (the at-risk trigger → sheet seam) rather than a full funnel/sheet
// integration test — mirrors MnemonicWordChips.test.tsx's MnemonicWorkshop stub.
vi.mock('../MasteryFunnelPanel', () => ({
  MasteryFunnelPanel: ({ onAtRiskClick, footer }: MasteryFunnelPanelProps) => (
    <div data-testid="funnel-panel">
      <button type="button" onClick={onAtRiskClick}>trigger-at-risk</button>
      {footer?.({ all: true, lessonNumber: null })}
    </div>
  ),
}))
vi.mock('../StubbornWordsCard', () => ({
  StubbornWordsCard: () => <div data-testid="stubborn-stub" />,
}))
vi.mock('@/components/mnemonics/TroublesomeWordsSheet', () => ({
  TroublesomeWordsSheet: ({ entries, onClose }: TroublesomeWordsSheetProps) => (
    <div data-testid="sheet">
      {entries.length} entries
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}))

function renderPanel() {
  return render(
    <MantineProvider>
      <VocabMasteryPanel userId="u1" />
    </MantineProvider>,
  )
}

describe('VocabMasteryPanel (slice 2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the funnel panel + stubborn-words footer, and no sheet until triggered', async () => {
    vi.mocked(getTroublesomeWords).mockResolvedValue([])
    renderPanel()

    expect(await screen.findByTestId('funnel-panel')).toBeInTheDocument()
    expect(screen.getByTestId('stubborn-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })

  it('opens the sheet with the full troublesome set when the at-risk box is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(getTroublesomeWords).mockResolvedValue([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
      { sourceRef: 'learning_items/becak', sourceKind: 'vocabulary_src' },
    ])
    renderPanel()

    await waitFor(() => expect(getTroublesomeWords).toHaveBeenCalledWith('u1'))
    await user.click(screen.getByRole('button', { name: 'trigger-at-risk' }))

    expect(await screen.findByTestId('sheet')).toHaveTextContent('2 entries')
  })
})
