import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render as rtlRender, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'

const render = (ui: ReactElement) => rtlRender(<MantineProvider>{ui}</MantineProvider>)

// Mutable language so each test can pick NL or EN.
const { authState } = vi.hoisted(() => ({
  authState: { profile: { language: 'nl' } as { language: string } | null },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

const NL = 'https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-1-nl.mp3'
const EN = 'https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-1-en.mp3'

beforeEach(() => {
  authState.profile = { language: 'nl' }
})

describe('LessonGrammarAudioBand', () => {
  it('plays the NL episode for a Dutch learner', () => {
    authState.profile = { language: 'nl' }
    render(<LessonGrammarAudioBand nl={NL} en={EN} />)
    expect(screen.getByTestId('lesson-audio-player')).toHaveAttribute('src', NL)
  })

  it('plays the EN episode for an English learner', () => {
    authState.profile = { language: 'en' }
    render(<LessonGrammarAudioBand nl={NL} en={EN} />)
    expect(screen.getByTestId('lesson-audio-player')).toHaveAttribute('src', EN)
  })

  it('renders nothing when the current language episode is absent (no cross-language fallback)', () => {
    authState.profile = { language: 'en' }
    render(<LessonGrammarAudioBand nl={NL} en={null} />)
    expect(screen.queryByTestId('lesson-audio-player')).toBeNull()
  })

  it('renders nothing when both episodes are absent', () => {
    render(<LessonGrammarAudioBand nl={null} en={null} />)
    expect(screen.queryByTestId('lesson-audio-player')).toBeNull()
  })

  it('falls back to NL when profile is null (default language)', () => {
    authState.profile = null
    render(<LessonGrammarAudioBand nl={NL} en={EN} />)
    expect(screen.getByTestId('lesson-audio-player')).toHaveAttribute('src', NL)
  })

  it('renders the optional caption label', () => {
    render(<LessonGrammarAudioBand nl={NL} en={EN} label="Uitleg bij de grammatica · audio" />)
    expect(screen.getByText('Uitleg bij de grammatica · audio')).toBeInTheDocument()
  })
})
