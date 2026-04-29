import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
