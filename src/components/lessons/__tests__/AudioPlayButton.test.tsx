// src/components/lessons/__tests__/AudioPlayButton.test.tsx
//
// The shared component extracted from all 30 lesson Page.tsx files' inline
// `PlayButton` (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md
// code-review fix #11). URL resolution itself (the request-coalescing batch
// signer) is covered by signedAudioUrl.test.ts — this file mocks
// useSignedAudioSrc and exercises the component's own render/interaction
// contract, which must stay byte-identical to the pre-extraction behavior.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AudioPlayButton } from '@/components/lessons/AudioPlayButton'

const mockUseSignedAudioSrc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/signedAudioUrl', () => ({
  useSignedAudioSrc: mockUseSignedAudioSrc,
}))

describe('AudioPlayButton', () => {
  beforeEach(() => {
    mockUseSignedAudioSrc.mockReset()
  })

  it('renders nothing when src is undefined', () => {
    mockUseSignedAudioSrc.mockReturnValue(null)
    const { container } = render(<AudioPlayButton src={undefined} className="play" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the button but no <audio> element while the signed URL is still resolving', () => {
    mockUseSignedAudioSrc.mockReturnValue(null)
    render(<AudioPlayButton src="path/to/audio.mp3" className="play" />)
    expect(screen.getByRole('button', { name: 'Speel uit' })).toBeInTheDocument()
    expect(document.querySelector('audio')).not.toBeInTheDocument()
  })

  it('renders the <audio> element with the resolved signed URL and applies the caller className', () => {
    mockUseSignedAudioSrc.mockReturnValue('https://signed.example/audio.mp3?token=x')
    render(<AudioPlayButton src="path/to/audio.mp3" className="my-page-play-button" />)

    const button = screen.getByRole('button', { name: 'Speel uit' })
    expect(button).toHaveClass('my-page-play-button')
    const audio = document.querySelector('audio')
    expect(audio).toHaveAttribute('src', 'https://signed.example/audio.mp3?token=x')
  })

  it('toggles to the "Stop" aria-label and data-playing once playback starts', async () => {
    mockUseSignedAudioSrc.mockReturnValue('https://signed.example/audio.mp3?token=x')
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AudioPlayButton src="path/to/audio.mp3" className="play" />)

    await user.click(screen.getByRole('button', { name: 'Speel uit' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument())
    expect(playSpy).toHaveBeenCalled()
    playSpy.mockRestore()
  })
})
