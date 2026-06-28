import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { FollowAlongTranscript } from '@/pages/Podcast'
import type { TranscriptSegment } from '@/services/textService'

// jsdom doesn't implement scrollIntoView (used by the auto-scroll effect).
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const segments: TranscriptSegment[] = [
  {
    idx: 0,
    id: 'Kita bisa.',
    nl: 'Wij kunnen.',
    en: 'We can.',
    words: [
      { word: 'Kita', start: 0.1, end: 0.8 },
      { word: 'bisa.', start: 0.8, end: 1.1 },
    ],
  },
  {
    idx: 1,
    id: 'Itu beda.',
    nl: 'Dat is anders.',
    en: 'That is different.',
    words: [
      { word: 'Itu', start: 2.0, end: 2.4 },
      { word: 'beda.', start: 2.4, end: 2.9 },
    ],
  },
]

function renderTranscript(props: Partial<React.ComponentProps<typeof FollowAlongTranscript>> = {}) {
  const onSeek = vi.fn()
  render(
    <MantineProvider>
      <FollowAlongTranscript
        segments={segments}
        lang="id"
        fallback="FALLBACK"
        active={null}
        onSeek={onSeek}
        {...props}
      />
    </MantineProvider>,
  )
  return { onSeek }
}

describe('FollowAlongTranscript', () => {
  it('renders the Indonesian words and marks only the active word', () => {
    renderTranscript({ lang: 'id', active: { segmentIdx: 0, wordIdx: 1 } })

    // Every word is rendered.
    expect(screen.getByText('Kita')).toBeInTheDocument()
    expect(screen.getByText('Itu')).toBeInTheDocument()

    // Only "bisa." (segment 0, word 1) is the active word.
    expect(screen.getByText('bisa.').getAttribute('data-active')).toBe('true')
    expect(screen.getByText('Kita').getAttribute('data-active')).toBeNull()
    expect(screen.getByText('Itu').getAttribute('data-active')).toBeNull()
  })

  it('clicking a sentence seeks to that segment', async () => {
    const { onSeek } = renderTranscript({ lang: 'id', active: null })
    await userEvent.click(screen.getByText('Itu'))
    expect(onSeek).toHaveBeenCalledWith(1)
  })

  it('highlights the active LINE (not a word) on the translation tab', () => {
    renderTranscript({ lang: 'nl', active: { segmentIdx: 1, wordIdx: 0 } })
    // Translation renders sentence text, and the active segment's line is marked.
    const activeLine = screen.getByText('Dat is anders.')
    expect(activeLine.getAttribute('data-active-line')).toBe('true')
    expect(screen.getByText('Wij kunnen.').getAttribute('data-active-line')).toBeNull()
  })

  it('falls back to the prose blob when there are no segments', () => {
    renderTranscript({ segments: null })
    expect(screen.getByText('FALLBACK')).toBeInTheDocument()
  })
})
