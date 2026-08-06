// src/__tests__/ReaderGrammarAudioBand.test.tsx
//
// Reader-page (content.json) variant of LessonGrammarAudioBand (§4, docs/plans/
// 2026-07-12-oauth-stripe-entitlement-design.md): meta.lesson_audio_url(_en)
// are RAW stored public-storage URLs baked into content.json — this wrapper
// signs them before LessonGrammarAudioBand ever sees a src.
import type { ReactElement } from 'react'
import { render as rtlRender, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReaderGrammarAudioBand } from '@/components/lessons/ReaderGrammarAudioBand'

const render = (ui: ReactElement) => rtlRender(<MantineProvider>{ui}</MantineProvider>)

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector({ profile: { language: 'nl' } }) : { profile: { language: 'nl' } },
  ),
}))

vi.mock('@/lib/signedAudioUrl', () => ({
  signStoredAudioUrl: vi.fn(),
}))

import { signStoredAudioUrl } from '@/lib/signedAudioUrl'

beforeEach(() => {
  vi.mocked(signStoredAudioUrl).mockReset()
})

const RAW_NL = 'https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-1-nl.mp3'
const RAW_EN = 'https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-1-en.mp3'

describe('ReaderGrammarAudioBand', () => {
  it('signs the raw content.json URL before the player mounts', async () => {
    vi.mocked(signStoredAudioUrl).mockResolvedValue('https://signed.example/grammar/lesson-1-nl.mp3?token=x')

    render(<ReaderGrammarAudioBand nlPath={RAW_NL} enPath={RAW_EN} />)

    expect(signStoredAudioUrl).toHaveBeenCalledWith(RAW_NL)
    expect(await screen.findByTestId('lesson-audio-player')).toHaveAttribute(
      'src',
      'https://signed.example/grammar/lesson-1-nl.mp3?token=x',
    )
  })

  it('renders nothing when signing fails', async () => {
    vi.mocked(signStoredAudioUrl).mockResolvedValue(null)

    render(<ReaderGrammarAudioBand nlPath={RAW_NL} enPath={RAW_EN} />)

    await vi.waitFor(() => expect(signStoredAudioUrl).toHaveBeenCalled())
    expect(screen.queryByTestId('lesson-audio-player')).not.toBeInTheDocument()
  })

  it('renders nothing when both paths are absent', () => {
    render(<ReaderGrammarAudioBand nlPath={null} enPath={null} />)
    expect(signStoredAudioUrl).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lesson-audio-player')).not.toBeInTheDocument()
  })
})
