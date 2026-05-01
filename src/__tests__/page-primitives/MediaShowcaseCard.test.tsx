import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MediaShowcaseCard } from '@/components/page/primitives/MediaShowcaseCard'

describe('MediaShowcaseCard', () => {
  it('renders the banner slot', () => {
    render(
      <MediaShowcaseCard
        banner={<div data-testid="banner">📍</div>}
        title="Les 1 — Di Pasar"
      />,
    )
    expect(screen.getByTestId('banner')).toBeInTheDocument()
  })

  it('renders the title as an h3', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Les 1 — Di Pasar" />,
    )
    const heading = container.querySelector('h3')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('Les 1 — Di Pasar')
  })

  it('renders the eyebrow label when provided', () => {
    render(
      <MediaShowcaseCard
        banner={<span />}
        eyebrow="LES 1"
        title="Di Pasar"
      />,
    )
    expect(screen.getByText('LES 1')).toBeInTheDocument()
  })

  it('does NOT render an eyebrow node when omitted', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" />,
    )
    const eyebrowNodes = container.querySelectorAll('[class*="eyebrow"]')
    expect(eyebrowNodes.length).toBe(0)
  })

  it('renders the tags slot when provided', () => {
    render(
      <MediaShowcaseCard
        banner={<span />}
        title="Di Pasar"
        tags={<span data-testid="tags">Werkwoord · Zelfstandig naamwoord</span>}
      />,
    )
    expect(screen.getByTestId('tags')).toBeInTheDocument()
  })

  it('renders the status slot when provided', () => {
    render(
      <MediaShowcaseCard
        banner={<span />}
        title="Di Pasar"
        status={<span data-testid="status">In oefening</span>}
      />,
    )
    expect(screen.getByTestId('status')).toBeInTheDocument()
  })

  it('renders the CTA label and arrow icon when cta + to are both provided', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaShowcaseCard
          banner={<span />}
          title="Di Pasar"
          cta="Doorgaan"
          to="/lesson/1"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Doorgaan')).toBeInTheDocument()
    expect(container.querySelector('svg.tabler-icon-arrow-right')).not.toBeNull()
  })

  it('renders the CTA label without the arrow when `to` is missing (label-only, non-actionable)', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" cta="Niet beschikbaar" />,
    )
    expect(screen.getByText('Niet beschikbaar')).toBeInTheDocument()
    // Arrow only appears when the card is actionable (has `to` and is not disabled).
    expect(container.querySelector('svg.tabler-icon-arrow-right')).toBeNull()
  })

  it('renders the CTA label without the arrow when disabled (even with `to` set)', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaShowcaseCard banner={<span />} title="Di Pasar" cta="Niet beschikbaar" to="/lesson/1" disabled />
      </MemoryRouter>,
    )
    expect(screen.getByText('Niet beschikbaar')).toBeInTheDocument()
    expect(container.querySelector('svg.tabler-icon-arrow-right')).toBeNull()
  })

  it('renders an <a> root with href when `to` is provided', () => {
    render(
      <MemoryRouter>
        <MediaShowcaseCard
          banner={<span />}
          title="Di Pasar"
          to="/lesson/1"
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /di pasar/i })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/lesson/1')
  })

  it('renders a <div> root when `to` is NOT provided', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
  })

  it('exposes the `featured` variant via a class modifier', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" featured />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/featured/i)
  })

  it('omits the `featured` modifier class when featured=false', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).not.toMatch(/featured/i)
  })

  it('renders a non-link disabled card with aria-disabled when `disabled` is true', () => {
    const { container } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" disabled />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('aria-disabled', 'true')
  })

  it('disabled overrides `to` so the card is not a link even when a target is supplied', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaShowcaseCard banner={<span />} title="Di Pasar" to="/lesson/1" disabled />
      </MemoryRouter>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
    expect(container.querySelector('a')).toBeNull()
  })

  it('has no trailing whitespace in className on either variant', () => {
    const { container: divContainer } = render(
      <MediaShowcaseCard banner={<span />} title="Di Pasar" />,
    )
    const divRoot = divContainer.firstChild as HTMLElement
    expect(divRoot.className).toBe(divRoot.className.trim())

    const { container: linkContainer } = render(
      <MemoryRouter>
        <MediaShowcaseCard banner={<span />} title="Di Pasar" to="/lesson/1" />
      </MemoryRouter>,
    )
    const linkRoot = linkContainer.querySelector('a') as HTMLElement
    expect(linkRoot.className).toBe(linkRoot.className.trim())
  })
})
