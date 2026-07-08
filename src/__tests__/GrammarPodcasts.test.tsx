// src/__tests__/GrammarPodcasts.test.tsx
//
// The Ontdek "Grammatica podcasts" hub lists every lesson's grammar episode and
// plays the one in the learner's app language — the same NL/EN convention as
// <LessonGrammarAudioBand/>, no cross-language fallback. These are the contract:
// rows appear in course order, each player points at the current-language URL,
// and a lesson lacking the current-language episode is dropped rather than
// shown in the other language.

import type { ReactElement } from 'react'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarPodcasts } from '@/pages/GrammarPodcasts'
import { GRAMMAR_TOPIC_SUMMARIES } from '@/lib/lessons/grammarTopicSummaries'

const render = (ui: ReactElement) =>
  rtlRender(<MantineProvider><MemoryRouter>{ui}</MemoryRouter></MantineProvider>)

const { authState } = vi.hoisted(() => ({
  authState: { profile: { language: 'nl' } as { language: string } | null },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

vi.mock('@/services/lessonService', () => ({
  lessonService: {
    getAudioUrl: (path: string) => `https://cdn.test/indonesian-lessons/${path}`,
    listGrammarPodcasts: vi.fn(async () => [
      { order_index: 1, audio_path: 'grammar/l1-nl.mp3', audio_path_en: 'grammar/l1-en.mp3' },
      { order_index: 2, audio_path: 'grammar/l2-nl.mp3', audio_path_en: null },
    ]),
  },
}))

beforeEach(() => {
  authState.profile = { language: 'nl' }
})

describe('GrammarPodcasts', () => {
  it('labels each row by lesson number + a friendly grammar summary (not the story title) and plays NL', async () => {
    render(<GrammarPodcasts />)

    // Row title is "Les N", subtitle is the authored grammar summary — no chapter title.
    expect(await screen.findByText('Les 1')).toBeInTheDocument()
    expect(screen.getByText(GRAMMAR_TOPIC_SUMMARIES[1].nl)).toBeInTheDocument()
    expect(screen.getByText('Les 2')).toBeInTheDocument()
    expect(screen.getByText(GRAMMAR_TOPIC_SUMMARIES[2].nl)).toBeInTheDocument()

    const players = screen.getAllByTestId('grammar-podcast-player')
    expect(players).toHaveLength(2)
    expect(players[0]).toHaveAttribute('src', 'https://cdn.test/indonesian-lessons/grammar/l1-nl.mp3')
    expect(players[1]).toHaveAttribute('src', 'https://cdn.test/indonesian-lessons/grammar/l2-nl.mp3')
  })

  it('plays the EN episode and drops a lesson without an EN twin (no fallback)', async () => {
    authState.profile = { language: 'en' }
    render(<GrammarPodcasts />)

    // Lesson 1 has an EN episode; lesson 2 does not → only lesson 1 is listenable.
    expect(await screen.findByText('Lesson 1')).toBeInTheDocument()
    expect(screen.getByText(GRAMMAR_TOPIC_SUMMARIES[1].en)).toBeInTheDocument()
    expect(screen.queryByText('Lesson 2')).toBeNull()

    const players = screen.getAllByTestId('grammar-podcast-player')
    expect(players).toHaveLength(1)
    expect(players[0]).toHaveAttribute('src', 'https://cdn.test/indonesian-lessons/grammar/l1-en.mp3')
  })
})
