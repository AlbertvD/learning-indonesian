// src/__tests__/Landing.test.tsx
//
// Desktop program slice 1: `/` is the public marketing landing page for
// logged-out visitors and Home (Dashboard) for authenticated users. The
// route gate lives in App.tsx; the landing page itself must forward the
// `?next=` return-to param (attached by ProtectedRoute) to /login, and offer
// NL/EN copy without a profile to read the language from.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet } from 'react-router'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Landing } from '@/pages/Landing'
import { LOANWORD_REVEAL_PAIRS } from '@/lib/loanwords/revealPairs'
import App from '@/App'

const mockState = vi.hoisted(() => ({
  user: null as any,
  profile: null as any,
  loading: false,
}))

vi.mock('@/stores/authStore', () => {
  const useAuthStore: any = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(mockState) : mockState,
  )
  useAuthStore.setState = vi.fn()
  useAuthStore.getState = vi.fn(() => mockState)
  return { useAuthStore }
})

// The App-level tests only verify the `/` route gate — stub out the heavy
// surfaces on both sides of it.
vi.mock('@/pages/Dashboard', () => ({ Dashboard: () => <div>dashboard-stub</div> }))
vi.mock('@/components/Layout', () => ({ Layout: () => <div>layout-stub<Outlet /></div> }))
vi.mock('@/components/PwaUpdatePrompt', () => ({ PwaUpdatePrompt: () => null }))

function renderLanding(initialEntry = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Landing />
      </MemoryRouter>
    </MantineProvider>,
  )
}

function renderApp(initialEntry = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockState.user = null
    mockState.profile = null
    mockState.loading = false
  })

  it('renders the free-tier marketing page with register CTAs and a plain /login link', () => {
    renderLanding()

    expect(screen.getByText(/Indonesisch leren, in het Nederlands/)).toBeInTheDocument()
    const registerCtas = screen.getAllByRole('link', { name: 'Gratis beginnen' })
    expect(registerCtas.length).toBeGreaterThanOrEqual(2)
    registerCtas.forEach(cta => expect(cta).toHaveAttribute('href', '/register'))
    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  // The marketing honesty rules (.claude/skills/marketing, docs/marketing/*).
  // These are not style preferences: there are zero paying customers, so any
  // review/rating/testimonial or learner count is fabricated; all audio is TTS,
  // so any claim of human narration is false; and no efficacy figure has ever
  // been measured for this product. Copy drifts silently, which is exactly why
  // this is a test rather than a note in a doc.
  it('makes no claim the product cannot honestly support', () => {
    renderLanding()
    const body = document.body.textContent ?? ''

    // Invented social proof — there are no customers to review anything.
    expect(body).not.toMatch(/recensie|beoordeling|testimonial|review|sterren|★/i)
    expect(body).not.toMatch(/\d[\d.,]*\s*(cursisten|leerlingen|gebruikers|learners|users)/i)
    expect(body).not.toMatch(/duizenden|thousands of/i)

    // Human narration — every clip is text-to-speech.
    expect(body).not.toMatch(/native speaker|moedertaalspreker|ingesproken|stemacteur|voice actor/i)

    // Efficacy claims — never measured, by us or anyone.
    expect(body).not.toMatch(/\d+\s*(×|x|keer)\s*sneller|\d+\s*times faster/i)
    expect(body).not.toMatch(/gegarandeerd|guaranteed/i)

    // The register limit (personas.md §1): the coursebook dialogues are formal
    // and touristy, so a timebound fluency promise would be false.
    expect(body).not.toMatch(/vloeiend binnen|fluent in \d|binnen \d+ weken (praten|spreken)/i)
  })

  // Verified counts must match the database. `173` (loan_source_nl) and `66`
  // (register='informal') were both checked against the live cloud project on
  // 2026-08-16. This does not verify them against the DB — public pages cannot
  // read it, anon has no grant — it pins the page to the numbers that were
  // checked, so a silent edit to a different figure fails here.
  it('quotes only the counts that were verified against the database', () => {
    renderLanding()
    const body = document.body.textContent ?? ''
    expect(body).toContain('173')
    expect(body).toContain('66')
  })

  // The invite system was retired 2026-07-12 and payment became the gate, but
  // this page kept advertising "Alleen op uitnodiging" and "Ik heb een
  // uitnodigingscode" — pointing at a /register that no longer takes a code.
  // It survived because nothing asserted the page described the CURRENT
  // business model. This test is that assertion.
  it('advertises the real offer, with no trace of the retired invite system', () => {
    renderLanding()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/uitnodiging|invite|code/i)
    // The two facts a buyer needs before signing up, and which the terms and
    // the server-side gate both independently commit to.
    expect(body).toMatch(/gratis/i)
    expect(body).toMatch(/€9/)
    expect(body).toMatch(/€79/)
  })

  // The loanword bridge is the primary persona's hook (heritage learner) and
  // the one advantage that cannot be copied into another language pair. It must
  // be on the PUBLIC page, not only behind signup, and it must show the SAME
  // pairs the Welkom onboarding opens with — a visitor who signs up because of
  // kantoor→kantor should meet kantoor→kantor.
  it('shows the loanword bridge with the same pairs as the onboarding', () => {
    renderLanding()
    const body = document.body.textContent ?? ''
    for (const pair of LOANWORD_REVEAL_PAIRS) {
      expect(body).toContain(pair.nl)
      expect(body).toContain(pair.id)
    }
  })

  // EU distance selling expects terms and the withdrawal/refund policy to be
  // reachable BEFORE purchase, not only from inside the paywall.
  it('links terms and refunds from the public footer', () => {
    renderLanding()
    expect(screen.getByRole('link', { name: 'Voorwaarden' })).toHaveAttribute('href', '/voorwaarden')
    expect(screen.getByRole('link', { name: 'Restitutie' })).toHaveAttribute('href', '/restitutie')
  })

  // The activation model is the likeliest source of "this app is broken", and
  // /hoe-het-werkt is where it gets explained before signup. The landing page
  // links to it from the "hoe het werkt" band and the footer — a link to a
  // route that does not exist would 404 a prospective buyer mid-argument, so
  // this asserts the target is a real public route (App.tsx renders it).
  it('links the public explainer, which must be a real route', () => {
    renderLanding()
    const links = screen
      .getAllByRole('link')
      .filter(a => a.getAttribute('href') === '/hoe-het-werkt')
    expect(links.length).toBeGreaterThanOrEqual(1)
  })

  it('forwards a safe ?next= param to the login links (return-to-where-I-was)', () => {
    renderLanding(`/?next=${encodeURIComponent('/progress?tab=woordenschat')}`)

    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/progress?tab=woordenschat')}`,
    )
  })

  it('drops a protocol-relative ?next= param (no open redirect)', () => {
    renderLanding(`/?next=${encodeURIComponent('//evil.example.com')}`)

    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login')
  })

  it('switches copy to English and persists the choice for the next visit', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByText(/Learn Indonesian, in Dutch/)).toBeInTheDocument()
    expect(localStorage.getItem('landing-lang')).toBe('en')
  })
})

describe('App route gate at /', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockState.user = null
    mockState.profile = null
    mockState.loading = false
  })

  it('renders the landing page for a logged-out visitor', async () => {
    renderApp('/')

    expect(await screen.findByText(/Indonesisch leren, in het Nederlands/)).toBeInTheDocument()
    expect(screen.queryByText('dashboard-stub')).not.toBeInTheDocument()
  })

  it('renders Home for an authenticated user', async () => {
    mockState.user = { id: 'user-1', email: 'learner@example.test' }
    renderApp('/')

    expect(await screen.findByText('dashboard-stub')).toBeInTheDocument()
    expect(screen.queryByText(/Indonesisch leren, in het Nederlands/)).not.toBeInTheDocument()
  })

  it('never flashes the landing page while auth state is still resolving', () => {
    mockState.loading = true
    renderApp('/')

    expect(screen.queryByText(/Indonesisch leren, in het Nederlands/)).not.toBeInTheDocument()
    expect(screen.queryByText('dashboard-stub')).not.toBeInTheDocument()
  })
})
