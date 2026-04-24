import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroCard } from '@/components/page/primitives/HeroCard'

describe('HeroCard', () => {
  it('renders children', () => {
    render(
      <HeroCard>
        <span data-testid="hero-child">Body content</span>
      </HeroCard>,
    )
    expect(screen.getByTestId('hero-child')).toBeInTheDocument()
    expect(screen.getByTestId('hero-child').textContent).toBe('Body content')
  })

  it('renders title when provided as an h2', () => {
    render(
      <HeroCard title="Planning van vandaag">
        <span>body</span>
      </HeroCard>,
    )
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Planning van vandaag',
    })
    expect(heading).toBeInTheDocument()
  })

  it('does NOT render a heading when title is absent', () => {
    render(
      <HeroCard>
        <span>body</span>
      </HeroCard>,
    )
    // No <h2> should exist anywhere in the card.
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('root is a <section> element', () => {
    const { container } = render(
      <HeroCard>
        <span>body</span>
      </HeroCard>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('SECTION')
  })

  it('children render inside the .body wrapper', () => {
    const { container } = render(
      <HeroCard>
        <span data-testid="inner">payload</span>
      </HeroCard>,
    )
    const bodyWrapper = container.querySelector('[class*="body"]')
    expect(bodyWrapper).not.toBeNull()
    const inner = screen.getByTestId('inner')
    expect(bodyWrapper?.contains(inner)).toBe(true)
  })

  it('multiple HeroCard instances render independently without conflict', () => {
    render(
      <>
        <HeroCard title="Card A">
          <span data-testid="a">alpha</span>
        </HeroCard>
        <HeroCard title="Card B">
          <span data-testid="b">bravo</span>
        </HeroCard>
      </>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Card A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Card B' })).toBeInTheDocument()
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  it('renders a very long title without crashing', () => {
    const longTitle = 'Planning '.repeat(50).trim()
    render(
      <HeroCard title={longTitle}>
        <span>body</span>
      </HeroCard>,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: longTitle }),
    ).toBeInTheDocument()
  })

  it('has no trailing whitespace in className', () => {
    const { container } = render(
      <HeroCard>
        <span>body</span>
      </HeroCard>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
