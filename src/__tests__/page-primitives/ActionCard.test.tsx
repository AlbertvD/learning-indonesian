import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ActionCard } from '@/components/page/primitives/ActionCard'

describe('ActionCard', () => {
  it('renders the icon inside the icon box', () => {
    const { container } = render(
      <ActionCard
        tone="accent"
        icon={<span data-testid="action-icon">★</span>}
        title="Start review"
      />,
    )
    const iconBox = container.querySelector('[class*="iconBox"]')
    expect(iconBox).not.toBeNull()
    expect(iconBox?.querySelector('[data-testid="action-icon"]')).not.toBeNull()
  })

  it('renders the title', () => {
    render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    expect(screen.getByText('Start review')).toBeInTheDocument()
  })

  it('renders focus when provided', () => {
    render(
      <ActionCard
        tone="accent"
        icon={<span />}
        title="Start review"
        focus="12 cards due"
      />,
    )
    expect(screen.getByText('12 cards due')).toBeInTheDocument()
  })

  it('does NOT render focus when absent', () => {
    const { container } = render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    const focusNodes = container.querySelectorAll('[class*="focus"]')
    expect(focusNodes.length).toBe(0)
  })

  it('renders reason when provided', () => {
    render(
      <ActionCard
        tone="accent"
        icon={<span />}
        title="Start review"
        reason="Aangeraden nu"
      />,
    )
    expect(screen.getByText('Aangeraden nu')).toBeInTheDocument()
  })

  it('does NOT render reason when absent', () => {
    const { container } = render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    const reasonNodes = container.querySelectorAll('[class*="reason"]')
    expect(reasonNodes.length).toBe(0)
  })

  it.each(['accent', 'warning', 'danger'] as const)(
    'tone="%s" applies the matching root + iconBox classes',
    (tone) => {
      const { container } = render(
        <ActionCard tone={tone} icon={<span />} title="Action" />,
      )
      const root = container.firstChild as HTMLElement
      // Root carries a tone-specific class (e.g. toneAccent / toneWarning / toneDanger).
      const capitalized = tone[0].toUpperCase() + tone.slice(1)
      expect(root.className).toMatch(new RegExp(`tone${capitalized}`))
      // Icon box carries a matching iconBox-tone class.
      const iconBox = container.querySelector('[class*="iconBox"]') as HTMLElement
      expect(iconBox.className).toMatch(new RegExp(`iconBox${capitalized}`))
    },
  )

  it('renders an <a> root with href when `to` is provided', () => {
    render(
      <MemoryRouter>
        <ActionCard
          tone="accent"
          icon={<span />}
          title="Start review"
          to="/review"
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /start review/i })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/review')
  })

  it('renders a <div> root when `to` is NOT provided', () => {
    const { container } = render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
  })

  it('renders a trailing chevron', () => {
    const { container } = render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    const chevron = container.querySelector('svg.tabler-icon-chevron-right')
    expect(chevron).not.toBeNull()
  })

  it('has no trailing whitespace in className on either variant', () => {
    const { container: divContainer } = render(
      <ActionCard tone="accent" icon={<span />} title="Start review" />,
    )
    const divRoot = divContainer.firstChild as HTMLElement
    expect(divRoot.className).toBe(divRoot.className.trim())

    const { container: linkContainer } = render(
      <MemoryRouter>
        <ActionCard
          tone="accent"
          icon={<span />}
          title="Start review"
          to="/review"
        />
      </MemoryRouter>,
    )
    const linkRoot = linkContainer.querySelector('a') as HTMLElement
    expect(linkRoot.className).toBe(linkRoot.className.trim())
  })
})
