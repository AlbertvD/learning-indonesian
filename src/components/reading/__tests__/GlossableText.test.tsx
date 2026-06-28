import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
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
  if (tok.normalized === 'buku') return { text: 'boek', source: 'item' }
  if (tok.normalized === 'membaca') return { text: 'lezen', source: 'morphology' }
  return { text: null, source: 'none' }
}

function renderReader() {
  return render(
    <MantineProvider>
      <GlossableText text={text} glossFor={glossFor} />
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
})
