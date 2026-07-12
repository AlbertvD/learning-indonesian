import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { PlayButton } from '@/components/PlayButton'

let mockAudio: {
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  currentTime: number
}

beforeEach(() => {
  mockAudio = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: 0,
  }
  ;(window as any).Audio = function Audio() {
    return mockAudio
  }
})

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('PlayButton', () => {
  it('renders nothing when no audioUrl is provided', () => {
    renderWithProviders(<PlayButton audioUrl={undefined} />)
    expect(screen.queryByRole('button', { name: 'Play audio' })).toBeNull()
  })

  it('renders a button when audioUrl is provided', () => {
    renderWithProviders(<PlayButton audioUrl="https://example.com/audio.mp3" />)
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument()
  })

  it('autoplays when the session preference enables it', () => {
    renderWithProviders(<PlayButton audioUrl="https://example.com/audio.mp3" autoPlay />)
    expect(mockAudio.play).toHaveBeenCalledTimes(1)
  })

  it('does not enter the playing state when audio.play() rejects on toggle', async () => {
    const user = userEvent.setup()
    mockAudio.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    renderWithProviders(<PlayButton audioUrl="https://example.com/audio.mp3" />)
    const button = screen.getByRole('button', { name: 'Play audio' })

    await user.click(button)
    // If `playing` incorrectly flipped to true on a failed play() (the bug this
    // guards against), this second click would call pause() instead of retrying
    // play() — asserting play() fires twice and pause() never fires proves the
    // component stayed in the "not playing" state after the rejection.
    await user.click(button)

    expect(mockAudio.play).toHaveBeenCalledTimes(2)
    expect(mockAudio.pause).not.toHaveBeenCalled()
  })
})
