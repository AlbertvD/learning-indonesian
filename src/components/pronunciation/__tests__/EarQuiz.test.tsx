// Task U-C of docs/plans/2026-07-08-uitspraak-quick-wins.md — the "Test je
// oor" identification quiz (review UP2). Rendered via PitfallCard so the
// playable-pairs filter (both member urls resolving) is exercised end to end.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { PitfallCard } from '../PitfallCard'
import type { Pitfall } from '@/lib/pronunciation/pitfallCatalog'
import type { SessionAudioMap } from '@/services/audioService'

// PitfallCard/EarQuiz read T.pronunciation.* via useT() -> useAuthStore(...).profile.language.
const { authState } = vi.hoisted(() => ({
  authState: { profile: { language: 'nl' } as { language: string } | null },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

const PITFALL_DEAD_PAIR: Pitfall = {
  id: 'test-dead-pair',
  sound: 'x',
  l1: ['nl'],
  ruleNl: 'Test rule',
  ruleEn: 'Test rule',
  pitfallNl: 'Test mistake',
  pitfallEn: 'Test mistake',
  examples: ['voorbeeld'],
  minimalPairs: [
    {
      a: 'cari',
      b: 'kari',
      contrastNl: "'cari' vs 'kari'",
      contrastEn: "'cari' vs 'kari'",
    },
  ],
  rank: 1,
}

const PITFALL_PLAYABLE_PAIR: Pitfall = {
  id: 'test-playable-pair',
  sound: 'y',
  l1: ['nl'],
  ruleNl: 'Test rule',
  ruleEn: 'Test rule',
  pitfallNl: 'Test mistake',
  pitfallEn: 'Test mistake',
  examples: ['voorbeeld'],
  minimalPairs: [
    {
      a: 'cari',
      b: 'kari',
      contrastNl: "'cari' vs 'kari'",
      contrastEn: "'cari' vs 'kari'",
    },
  ],
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
  // playSequence/PlayButton construct `new Audio(url)` — resolve 'ended' listeners
  // are never invoked in this suite, matching the sibling PitfallCard.test.tsx idiom.
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
  // Deterministic round: Math.random() === 0 -> first (only) pair, and
  // playedMember 'a' (0 < 0.5). Tests select which button to tap to get
  // a correct vs wrong answer against that fixed played member.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

function renderCard(pitfall: Pitfall, audioMap: SessionAudioMap) {
  return render(
    <MantineProvider>
      <PitfallCard pitfall={pitfall} language="nl" audioMap={audioMap} />
    </MantineProvider>,
  )
}

describe('EarQuiz — "Test je oor" (Task U-C)', () => {
  it('renders no quiz when the pitfall has a pair lacking a b-side url', () => {
    // Only 'cari' resolves; 'kari' does not -> playablePairs is empty.
    const audioMap: SessionAudioMap = new Map([['cari|__default__', 'tts/achird/cari-abcd1234.mp3']])
    renderCard(PITFALL_DEAD_PAIR, audioMap)
    expect(screen.queryByText('Test je oor')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('renders the idle Start button when both pair urls resolve', () => {
    const audioMap: SessionAudioMap = new Map([
      ['cari|__default__', 'tts/achird/cari-abcd1234.mp3'],
      ['kari|__default__', 'tts/achird/kari-abcd1234.mp3'],
    ])
    renderCard(PITFALL_PLAYABLE_PAIR, audioMap)
    expect(screen.getByText('Test je oor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('shows correct feedback, increments the streak, and disables both options', async () => {
    const user = userEvent.setup()
    const audioMap: SessionAudioMap = new Map([
      ['cari|__default__', 'tts/achird/cari-abcd1234.mp3'],
      ['kari|__default__', 'tts/achird/kari-abcd1234.mp3'],
    ])
    renderCard(PITFALL_PLAYABLE_PAIR, audioMap)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Played member is fixed to 'a' ('cari') by the Math.random mock.
    const correctButton = screen.getByRole('button', { name: 'cari' })
    const otherButton = screen.getByRole('button', { name: 'kari' })
    await user.click(correctButton)

    expect(screen.getByText('Goed!')).toBeInTheDocument()
    expect(screen.getByText('Reeks: 1')).toBeInTheDocument()
    expect(correctButton).toBeDisabled()
    expect(otherButton).toBeDisabled()
  })

  it('shows the correct word and a continue button on a wrong answer, with no auto-advance', async () => {
    const user = userEvent.setup()
    const audioMap: SessionAudioMap = new Map([
      ['cari|__default__', 'tts/achird/cari-abcd1234.mp3'],
      ['kari|__default__', 'tts/achird/kari-abcd1234.mp3'],
    ])
    renderCard(PITFALL_PLAYABLE_PAIR, audioMap)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Played member is fixed to 'a' ('cari'); tapping 'kari' is wrong.
    await user.click(screen.getByRole('button', { name: 'kari' }))

    expect(screen.getByText('Het was cari')).toBeInTheDocument()
    expect(screen.getByText('Reeks: 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volgende' })).toBeInTheDocument()
  })
})
