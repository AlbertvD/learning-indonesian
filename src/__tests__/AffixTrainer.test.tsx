import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AffixTrainer } from '@/pages/AffixTrainer'
import * as morphology from '@/lib/morphology'
import type { AffixCatalogTile, AffixDetail } from '@/lib/morphology'

// Stable state reference (hoisted) — the real zustand store returns stable
// identities; a fresh object per call would change the effect's [user] dep every
// render and loop the page in a loading state.
const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 'user-1', email: 'learner@example.test' }, profile: { language: 'en' } },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: any) => unknown) =>
    selector ? selector(authState) : authState,
  ),
}))

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

vi.mock('@/lib/morphology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/morphology')>()
  return { ...actual, getAffixCatalog: vi.fn(), getAffixDetail: vi.fn() }
})

function emptyFunnel() {
  return { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 }
}

function tile(overrides: Partial<AffixCatalogTile>): AffixCatalogTile {
  return {
    affix: 'meN-',
    affixType: 'prefix',
    gloss: 'active verb-former',
    rank: 3,
    cefrLevel: 'A2',
    available: true,
    introLessonNumber: 9,
    progress: { label: 'introduced', funnel: { ...emptyFunnel(), mastered: 1, introduced: 1 }, masteredCount: 1, practisedCount: 1, totalCount: 2 },
    ...overrides,
  }
}

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <AffixTrainer />
      </MemoryRouter>
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.mocked(morphology.getAffixCatalog).mockReset()
  vi.mocked(morphology.getAffixDetail).mockReset()
})

describe('AffixTrainer page', () => {
  it('shows the sequenced affix catalog grid', async () => {
    vi.mocked(morphology.getAffixCatalog).mockResolvedValue([
      tile({ affix: 'ber-', rank: 1 }),
      tile({ affix: 'meN-', rank: 3 }),
    ])
    renderAt('/morphology')
    expect(await screen.findByRole('heading', { name: 'meN-' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ber-' })).toBeInTheDocument()
    // tiles link to the affix detail.
    const link = screen.getByRole('heading', { name: 'meN-' }).closest('a')
    expect(link).toHaveAttribute('href', '/morphology?affix=meN-')
  })

  it('shows the empty state when no affixes exist yet', async () => {
    vi.mocked(morphology.getAffixCatalog).mockResolvedValue([])
    renderAt('/morphology')
    expect(await screen.findByText(/no affixes to train yet/i)).toBeInTheDocument()
  })

  it('renders the affix detail: rule card, word family, and a practice launch', async () => {
    const detail: AffixDetail = {
      affix: 'meN-',
      affixType: 'prefix',
      gloss: 'active verb-former',
      rank: 3,
      cefrLevel: 'A2',
      available: true,
      allomorphClasses: ['me', 'mem', 'men'],
      ruleNote: 'ajar → mengajar',
      rule: { lessonNumber: 9, lessonId: 'lesson-9', patternSlug: 'l9-men', patternName: 'meN- prefix', patternExplanation: 'Forms active verbs.' },
      examples: [{ rootText: 'ajar', derivedText: 'mengajar', carrierText: 'Saya mengajar.', derivedMeaning: 'to teach' }],
      families: [
        {
          rootText: 'ajar',
          rootMeaning: 'to teach',
          rootKnown: true,
          forms: [
            { derivedText: 'mengajar', affix: 'meN-', productive: true, label: 'mastered', carrierText: null, derivedMeaning: 'to teach' },
            { derivedText: 'pengajar', affix: 'peN-', productive: false, label: 'not_assessed', carrierText: null, derivedMeaning: null },
          ],
        },
      ],
      progress: { label: 'introduced', funnel: emptyFunnel(), masteredCount: 1, practisedCount: 1, totalCount: 2 },
      practiceSourceRefs: ['affixed_form_pairs/men-ajar'],
    }
    vi.mocked(morphology.getAffixDetail).mockResolvedValue(detail)
    renderAt('/morphology?affix=meN-')

    expect(await screen.findByRole('heading', { name: 'meN-' })).toBeInTheDocument()
    expect(screen.getByText('Rule')).toBeInTheDocument()
    // mengajar appears in both the rule example and the word family — both are wanted.
    expect(screen.getAllByText('mengajar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('pengajar')).toBeInTheDocument()
    expect(screen.getByText(/vocabulary, not rule-formed/i)).toBeInTheDocument() // frozen marking
    // practice launches a scoped session with the affix in the URL.
    const practice = screen.getByRole('link', { name: /practise this affix/i })
    expect(practice).toHaveAttribute('href', '/session?mode=affix_practice&affix=meN-')
  })

  it('shows a not-found state for an unknown affix', async () => {
    vi.mocked(morphology.getAffixDetail).mockResolvedValue(null)
    renderAt('/morphology?affix=zzz')
    expect(await screen.findByText(/does not exist/i)).toBeInTheDocument()
  })
})
