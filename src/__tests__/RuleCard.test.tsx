// src/__tests__/RuleCard.test.tsx
//
// RuleCard's grammar-podcast band (Change 2 of the harmonization plan, now
// re-plumbed for the entitlement-gating cutover, docs/plans/2026-07-12-oauth-
// stripe-entitlement-design.md §4): podcastNl/podcastEn are raw storage
// paths resolved via lessonService.getSignedAudioUrl in an async load
// effect, held in state, and only then handed to LessonGrammarAudioBand.
import type { ReactElement } from 'react'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RuleCard } from '@/components/morphology/RuleCard'
import type { AffixDetail } from '@/lib/morphology'
import { lessonService } from '@/services/lessonService'

const render = (ui: ReactElement) =>
  rtlRender(<MantineProvider><MemoryRouter>{ui}</MemoryRouter></MantineProvider>)

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector({ profile: { language: 'nl' } }) : { profile: { language: 'nl' } },
  ),
}))

vi.mock('@/services/lessonService', () => ({
  lessonService: { getSignedAudioUrl: vi.fn() },
}))

function detail(overrides: Partial<AffixDetail['rule']>): AffixDetail {
  return {
    affix: 'meN-',
    affixType: 'prefix',
    gloss: 'active verb-former',
    rank: 3,
    cefrLevel: 'A2',
    available: true,
    allomorphClasses: [],
    ruleNote: null,
    rule: {
      lessonNumber: 9,
      lessonId: 'lesson-9',
      patternSlug: null,
      patternName: null,
      patternExplanation: null,
      podcastNl: 'grammar/lesson-9-nl.mp3',
      podcastEn: null,
      ...overrides,
    },
    examples: [],
    families: [],
    progress: {
      label: 'introduced',
      funnel: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
      masteredCount: 0,
      practisedCount: 0,
      totalCount: 0,
      recognition: { masteredCount: 0, totalCount: 0 },
      production: { masteredCount: 0, totalCount: 0 },
    },
    practiceSourceRefs: [],
  }
}

beforeEach(() => {
  vi.mocked(lessonService.getSignedAudioUrl).mockReset()
})

describe('RuleCard grammar-podcast band', () => {
  it('renders the player once the signed URL resolves', async () => {
    vi.mocked(lessonService.getSignedAudioUrl).mockResolvedValue('https://signed.example/grammar/lesson-9-nl.mp3?token=x')

    render(<RuleCard detail={detail({})} audioMap={new Map()} />)

    expect(lessonService.getSignedAudioUrl).toHaveBeenCalledWith('grammar/lesson-9-nl.mp3')
    expect(await screen.findByTestId('lesson-audio-player')).toHaveAttribute(
      'src',
      'https://signed.example/grammar/lesson-9-nl.mp3?token=x',
    )
  })

  it('stays absent (no player) when signing fails — the non-entitled / missing-object path', async () => {
    vi.mocked(lessonService.getSignedAudioUrl).mockResolvedValue(null)

    render(<RuleCard detail={detail({})} audioMap={new Map()} />)

    await vi.waitFor(() => expect(lessonService.getSignedAudioUrl).toHaveBeenCalled())
    expect(screen.queryByTestId('lesson-audio-player')).not.toBeInTheDocument()
  })

  it('renders nothing when the introducing lesson has no podcast in either language', () => {
    render(<RuleCard detail={detail({ podcastNl: null, podcastEn: null })} audioMap={new Map()} />)

    expect(lessonService.getSignedAudioUrl).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lesson-audio-player')).not.toBeInTheDocument()
  })
})
