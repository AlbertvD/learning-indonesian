import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { PlayButton } from '@/components/PlayButton'

// jsdom does not implement HTMLAudioElement — mock window.Audio so useEffect
// inside PlayButton does not throw when audioUrl is provided.
beforeAll(() => {
  const mockAudio = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: 0,
  }
  // Must use a real constructor function (not arrow) so `new Audio()` works.
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
})
