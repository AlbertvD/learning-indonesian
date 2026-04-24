import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ListCard } from '@/components/page/primitives/ListCard'

describe('ListCard', () => {
  it('renders the icon', () => {
    render(
      <ListCard
        icon={<span data-testid="list-icon">★</span>}
        title="Les 1"
      />,
    )
    expect(screen.getByTestId('list-icon')).toBeInTheDocument()
  })

  it('renders the title', () => {
    render(<ListCard icon={<span />} title="Kennismaking" />)
    expect(screen.getByText('Kennismaking')).toBeInTheDocument()
  })

  it('renders the subtitle when provided', () => {
    render(
      <ListCard
        icon={<span />}
        title="Les 1"
        subtitle="5 van de 20 woorden"
      />,
    )
    expect(screen.getByText('5 van de 20 woorden')).toBeInTheDocument()
  })

  it('does NOT render a subtitle node when subtitle is absent', () => {
    const { container } = render(<ListCard icon={<span />} title="Les 1" />)
    const subtitleNodes = container.querySelectorAll('[class*="subtitle"]')
    expect(subtitleNodes.length).toBe(0)
  })

  it('renders IconChevronRight by default in the trailing slot', () => {
    const { container } = render(<ListCard icon={<span />} title="Les 1" />)
    // Tabler icons render an <svg> with class "tabler-icon-chevron-right".
    const svg = container.querySelector('svg.tabler-icon-chevron-right')
    expect(svg).not.toBeNull()
  })

  it('renders a custom trailing element when provided (overrides chevron)', () => {
    const { container } = render(
      <ListCard
        icon={<span />}
        title="Les 1"
        trailing={<span data-testid="custom-trailing">Meer</span>}
      />,
    )
    expect(screen.getByTestId('custom-trailing')).toBeInTheDocument()
    // Default chevron must not render when a custom trailing is passed.
    const chevron = container.querySelector('svg.tabler-icon-chevron-right')
    expect(chevron).toBeNull()
  })

  it('renders an <a> root with href when `to` is provided', () => {
    render(
      <MemoryRouter>
        <ListCard icon={<span />} title="Kennismaking" to="/lesson/1" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /kennismaking/i })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/lesson/1')
  })

  it('renders a <div> root when `to` is NOT provided', () => {
    const { container } = render(
      <ListCard icon={<span />} title="Kennismaking" />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
  })

  it('exposes the <a> variant with link role (keyboard-navigable)', () => {
    render(
      <MemoryRouter>
        <ListCard icon={<span />} title="Les 1" to="/lesson/1" />
      </MemoryRouter>,
    )
    // A real anchor with href is focusable and activatable via Enter by
    // default — the role assertion is a proxy for keyboard navigability.
    const link = screen.getByRole('link', { name: /les 1/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href')
  })

  it('has no trailing whitespace in className on either variant', () => {
    const { container: divContainer } = render(
      <ListCard icon={<span />} title="Les 1" />,
    )
    const divRoot = divContainer.firstChild as HTMLElement
    expect(divRoot.className).toBe(divRoot.className.trim())

    const { container: linkContainer } = render(
      <MemoryRouter>
        <ListCard icon={<span />} title="Les 1" to="/lesson/1" />
      </MemoryRouter>,
    )
    const linkRoot = linkContainer.querySelector('a') as HTMLElement
    expect(linkRoot.className).toBe(linkRoot.className.trim())
  })
})
