// src/__tests__/HoeHetWerkt.test.tsx
//
// The public explainer at /hoe-het-werkt. Built from
// docs/plans/2026-08-06-hoe-het-werkt-page-design.md.
//
// Two of these tests pin decisions rather than mechanics, because both are the
// kind of thing that erodes silently in a copy edit:
//   D6 — the four mastery stages ship WITH the sentence saying they describe
//        scheduling state, not competence. Without it, "Productief" reads as a
//        promise the product cannot keep, and the first learner who finds it
//        cannot will disbelieve everything else on the page.
//   D7 — this page carries no price. The landing band is the single pinned
//        place a price appears; a second unpinned one is how the €7→€9 change
//        went stale across four surfaces.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, beforeEach } from 'vitest'
import { HoeHetWerkt } from '@/pages/HoeHetWerkt'

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/hoe-het-werkt']}>
        <HoeHetWerkt />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('HoeHetWerkt', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('explains the activation model, which is the reason the page exists', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    // The non-obvious rule: nothing is practised until the learner activates
    // it, so a learner who activates nothing sees an empty session.
    expect(body).toMatch(/activeer je zelf/i)
    expect(body).toMatch(/één sessie/i)
  })

  it('names all four mastery stages', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    for (const stage of ['Inprenten', 'Oproepen', 'Productief', 'Onderhoud']) {
      expect(body).toContain(stage)
    }
  })

  // D6. The stages are real and displayed on the learner's own Voortgang page,
  // but they describe SCHEDULING STATE. Showing them without saying so turns a
  // true thing into an over-promise.
  it('says the stages describe scheduling state, not competence', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/niet wat je kunt/i)
  })

  // D7, and the honesty rules shared with the landing page.
  it('carries no price, no invented proof, and no efficacy claim', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/€/)
    expect(body).not.toMatch(/recensie|beoordeling|testimonial|review|sterren/i)
    expect(body).not.toMatch(/\d+\s*(×|x|keer)\s*sneller|\d+\s*times faster/i)
    expect(body).not.toMatch(/native speaker|moedertaalspreker|ingesproken/i)
  })

  // The strongest item on the page is an audit, not a citation — and it is
  // quoted from ADR 0007, so the figures must not drift. It also has to
  // disclaim endorsement: the researchers named do not know this product.
  it('quotes the ADR 0007 audit accurately and disclaims endorsement', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(body).toContain('36 uur')
    expect(body).toContain('30,1%')
    expect(body).toContain('31 seconden')
    expect(body).toMatch(/nooit gemeten/i)
    expect(body).toMatch(/kennen dit product niet/i)
  })

  it('offers a way back and the legal links a public page needs', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Voorwaarden' })).toHaveAttribute('href', '/voorwaarden')
    expect(screen.getByRole('link', { name: 'Restitutie' })).toHaveAttribute('href', '/restitutie')
  })

  // Dutch only since 2026-08-18, same reasoning as Landing.test.tsx.
  it('offers no language toggle — the page is Dutch only', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument()
  })
})
