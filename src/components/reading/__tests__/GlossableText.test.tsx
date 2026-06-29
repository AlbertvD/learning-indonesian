import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { GlossableText } from '../GlossableText'
import type { GlossResult, ReadableText, ReadingToken } from '@/lib/reading'

const text: ReadableText = {
  id: 'p1',
  title: 'Test',
  level: 'A1',
  segments: [
    {
      idx: 0,
      id: 'Manu membaca buku.',
      nl: 'Manu leest een boek.',
      en: 'Manu reads a book.',
      tokens: [
        { raw: 'Manu', normalized: 'manu', isProperNoun: true, isWord: true },
        { raw: 'membaca', normalized: 'membaca', isProperNoun: false, isWord: true },
        { raw: 'buku.', normalized: 'buku', isProperNoun: false, isWord: true },
      ],
    },
  ],
}

const glossFor = (_seg: number, tok: ReadingToken): GlossResult => {
  if (tok.normalized === 'buku') return { text: 'boek', source: 'item', harvestableItemId: 'item-buku' }
  // membaca: morphology source, harvestable via its ROOT (baca)
  if (tok.normalized === 'membaca') return { text: 'lezen', source: 'morphology', harvestableItemId: 'item-baca', harvestRootLabel: 'baca' }
  return { text: null, source: 'none' }
}

function renderReader(onHarvest?: (itemId: string) => void | Promise<void>) {
  return render(
    <MantineProvider>
      <GlossableText text={text} glossFor={glossFor} onHarvest={onHarvest} />
    </MantineProvider>,
  )
}

describe('GlossableText', () => {
  it('renders glossable words as interactive', () => {
    renderReader()
    expect(screen.getByRole('button', { name: 'buku' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'membaca' })).toBeInTheDocument()
  })

  it('tapping a word reveals its gloss', async () => {
    const user = userEvent.setup()
    renderReader()
    await user.click(screen.getByRole('button', { name: 'buku' }))
    expect(await screen.findByText('boek')).toBeInTheDocument()
  })

  it('glosses an affixed word via its root', async () => {
    const user = userEvent.setup()
    renderReader()
    await user.click(screen.getByRole('button', { name: 'membaca' }))
    expect(await screen.findByText('lezen')).toBeInTheDocument()
  })

  it('does not make proper nouns interactive', () => {
    renderReader()
    expect(screen.queryByRole('button', { name: 'manu' })).not.toBeInTheDocument()
  })

  // Harvest (reader §4): suggest-then-confirm — the gloss is the suggestion, the
  // "+ leren" button is the explicit confirm. Only the exact tapped word, only when
  // it is item-backed (harvestableItemId set).
  // The popover dropdown is a Mantine/floating-ui portal; role queries treat it as
  // hidden in jsdom, so dropdown content is queried by text (as 'boek'/'lezen' above).
  it('shows a "+ leren" button for a harvestable (item-backed) word', async () => {
    const user = userEvent.setup()
    renderReader(vi.fn())
    await user.click(screen.getByRole('button', { name: 'buku' }))
    expect(await screen.findByText('+ leren')).toBeInTheDocument()
  })

  it('a derived word harvests its ROOT — button reads "+ leren: <root>"', async () => {
    const user = userEvent.setup()
    const onHarvest = vi.fn().mockResolvedValue(undefined)
    renderReader(onHarvest)
    await user.click(screen.getByRole('button', { name: 'membaca' }))
    expect(await screen.findByText('lezen')).toBeInTheDocument()
    await user.click(await screen.findByText('+ leren: baca'))
    expect(onHarvest).toHaveBeenCalledWith('item-baca')
  })

  it('clicking "+ leren" harvests the exact tapped word by its item id', async () => {
    const user = userEvent.setup()
    const onHarvest = vi.fn().mockResolvedValue(undefined)
    renderReader(onHarvest)
    await user.click(screen.getByRole('button', { name: 'buku' }))
    await user.click(await screen.findByText('+ leren'))
    expect(onHarvest).toHaveBeenCalledWith('item-buku')
  })

  it('after harvesting, the button confirms "Toegevoegd"', async () => {
    const user = userEvent.setup()
    const onHarvest = vi.fn().mockResolvedValue(undefined)
    renderReader(onHarvest)
    await user.click(screen.getByRole('button', { name: 'buku' }))
    await user.click(await screen.findByText('+ leren'))
    expect(await screen.findByText('Toegevoegd')).toBeInTheDocument()
  })
})
