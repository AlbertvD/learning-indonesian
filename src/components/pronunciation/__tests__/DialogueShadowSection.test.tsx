// UP5 shape (c), docs/plans/2026-07-09-uitspraak-round2.md §3 — the
// "Schaduw de dialoog" section. Same U5 guard as PitfallCard.test.tsx's
// ShadowControl guard: with no model clip there is nothing to shadow, so
// neither the play nor the mic control renders for that row (the row's TEXT
// still renders — only the controls are conditional).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DialogueShadowSection } from '../DialogueShadowSection'
import { DIALOGUE_SHADOW_SET } from '@/lib/pronunciation/dialogueShadowSet'
import type { SessionAudioMap } from '@/services/audioService'

// DialogueShadowSection reads T.pronunciation.* via useT() -> useAuthStore(...).profile.language.
const { authState } = vi.hoisted(() => ({
  authState: { profile: { language: 'nl' } as { language: string } | null },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

let mockAudio: {
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  currentTime: number
}

beforeEach(() => {
  authState.profile = { language: 'nl' }
  // PlayButton constructs `new Audio(url)` when a resolved url is present.
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

function renderSection(audioMap: SessionAudioMap) {
  return render(
    <MantineProvider>
      <DialogueShadowSection audioMap={audioMap} />
    </MantineProvider>,
  )
}

describe('DialogueShadowSection (UP5 shape (c))', () => {
  it('renders the section heading', () => {
    renderSection(new Map())
    expect(screen.getByText('Schaduw de dialoog')).toBeInTheDocument()
  })

  it('renders every sentence text regardless of resolvability', () => {
    renderSection(new Map())
    for (const sentence of DIALOGUE_SHADOW_SET) {
      expect(screen.getByText(sentence.text)).toBeInTheDocument()
    }
  })

  it('renders play + mic controls for a sentence whose url resolves', () => {
    const first = DIALOGUE_SHADOW_SET[0]
    // Key shape per audioService.ts: `${normalizedText}|${voiceId ?? '__default__'}`.
    const normalized = first.text.toLowerCase().trim().replace(/\s+/g, ' ')
    const audioMap: SessionAudioMap = new Map([
      [`${normalized}|__default__`, 'tts/achird/shadow-abcd1234.mp3'],
    ])
    renderSection(audioMap)

    const row = screen.getByText(first.text).closest('.mantine-Group-root') as HTMLElement
    expect(row).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neem op' })).toBeInTheDocument()
  })

  it('renders NO play/mic controls for a sentence with no audio-map entry', () => {
    renderSection(new Map())
    expect(screen.queryByRole('button', { name: 'Play audio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neem op' })).not.toBeInTheDocument()
  })
})
