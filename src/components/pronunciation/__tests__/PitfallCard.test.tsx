// Task U-A of docs/plans/2026-07-08-uitspraak-quick-wins.md — the ShadowControl
// guard: with no model clip there is nothing to shadow, so the mic control must
// not render (PitfallCard.tsx `{url && <ShadowControl .../>}`).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { PitfallCard } from '../PitfallCard'
import type { Pitfall } from '@/lib/pronunciation/pitfallCatalog'
import type { SessionAudioMap } from '@/services/audioService'

// PitfallCard reads T.pronunciation.* via useT() -> useAuthStore(...).profile.language.
const { authState } = vi.hoisted(() => ({
  authState: { profile: { language: 'nl' } as { language: string } | null },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

const PITFALL_NO_URL: Pitfall = {
  id: 'test-no-url',
  sound: 'x',
  l1: ['nl'],
  ruleNl: 'Test rule',
  ruleEn: 'Test rule',
  pitfallNl: 'Test mistake',
  pitfallEn: 'Test mistake',
  examples: ['geenaudio'],
  rank: 1,
}

const PITFALL_WITH_URL: Pitfall = {
  id: 'test-with-url',
  sound: 'y',
  l1: ['nl'],
  ruleNl: 'Test rule',
  ruleEn: 'Test rule',
  pitfallNl: 'Test mistake',
  pitfallEn: 'Test mistake',
  examples: ['welaudio'],
  rank: 2,
}

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

function renderCard(pitfall: Pitfall, audioMap: SessionAudioMap) {
  return render(
    <MantineProvider>
      <PitfallCard pitfall={pitfall} language="nl" audioMap={audioMap} />
    </MantineProvider>,
  )
}

describe('PitfallCard — ShadowControl guard (Task U-A)', () => {
  it('renders no mic (shadow) button for an example word with no audio-map entry', () => {
    const audioMap: SessionAudioMap = new Map()
    renderCard(PITFALL_NO_URL, audioMap)
    expect(screen.getByText('geenaudio')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neem op' })).not.toBeInTheDocument()
  })

  it('renders a mic (shadow) button for an example word whose url resolves', () => {
    // Key shape per audioService.ts: `${normalizedText}|${voiceId ?? '__default__'}`.
    const audioMap: SessionAudioMap = new Map([['welaudio|__default__', 'tts/achird/welaudio-abcd1234.mp3']])
    renderCard(PITFALL_WITH_URL, audioMap)
    expect(screen.getByText('welaudio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neem op' })).toBeInTheDocument()
  })
})
