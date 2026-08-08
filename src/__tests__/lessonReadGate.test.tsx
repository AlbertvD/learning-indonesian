// src/__tests__/lessonReadGate.test.tsx
//
// The READ gate on /lesson/:lessonId (2026-08-08). Until this shipped, the
// reader was open to everyone — only PRACTICE and AUDIO were paid — so a free
// account could open lesson 30 and read it end to end. The owner's decision was
// that a free account sees lesson 1 and nothing more.
//
// What matters most here is the SECOND assertion in each paid case: the bespoke
// page must not render. Each lesson's content.json rides in that page's lazy
// chunk, so declining to render is also declining to fetch the content.

import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Routes, Route } from 'react-router'
import { bespokeLessonMetas } from '@/pages/lessons/meta'
import { FREE_TIER_MAX_LESSON } from '@/services/entitlementService'

vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

const mockState = vi.hoisted(() => ({ profile: { isEntitled: false, language: 'nl' } as any }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) => selector(mockState),
}))

// Stand-in for the real bespoke pages: rendering it proves the gate let the
// lesson through, and its absence proves the lazy chunk was never reached.
// A Proxy rather than a built map — the mock factory is hoisted above every
// import, so it cannot reference meta.ts (or any other module) to build one.
vi.mock('@/pages/lessons/registry', () => ({
  bespokeLessonElements: new Proxy(
    {},
    { get: () => <div data-testid="bespoke-page" /> },
  ),
}))

const { LessonRouter } = await import('@/pages/LessonRouter')

const freeLesson = bespokeLessonMetas.find(m => m.orderIndex === FREE_TIER_MAX_LESSON)!
const paidLesson = bespokeLessonMetas.find(m => m.orderIndex === FREE_TIER_MAX_LESSON + 1)!

function renderAt(lessonId: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[`/lesson/${lessonId}`]}>
        <Routes>
          <Route path="/lesson/:lessonId" element={<LessonRouter />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('lesson read gate', () => {
  beforeEach(() => {
    mockState.profile = { isEntitled: false, language: 'nl' }
  })

  it('a non-entitled reader opening a PAID lesson gets the paywall, and the lesson never renders', () => {
    renderAt(paidLesson.id)
    expect(screen.getByTestId('paywall-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('bespoke-page')).not.toBeInTheDocument()
  })

  it('a non-entitled reader still gets the free-tier lesson itself', () => {
    renderAt(freeLesson.id)
    expect(screen.getByTestId('bespoke-page')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-panel')).not.toBeInTheDocument()
  })

  it('an entitled reader gets the paid lesson', () => {
    mockState.profile = { isEntitled: true, language: 'nl' }
    renderAt(paidLesson.id)
    expect(screen.getByTestId('bespoke-page')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-panel')).not.toBeInTheDocument()
  })

  it('an admin gets the paid lesson — isEntitled is true for admins (authStore.isEntitledFrom)', () => {
    mockState.profile = { isEntitled: true, isAdmin: true, language: 'nl' }
    renderAt(paidLesson.id)
    expect(screen.getByTestId('bespoke-page')).toBeInTheDocument()
  })
})
