import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageFormLayout } from '@/components/page/primitives/PageFormLayout'

describe('PageFormLayout', () => {
  it('renders children', () => {
    render(
      <PageFormLayout>
        <span data-testid="child">payload</span>
      </PageFormLayout>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders title as an <h1> when provided', () => {
    render(
      <PageFormLayout title="Login">
        <span>body</span>
      </PageFormLayout>,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'Login' })
    expect(heading).toBeInTheDocument()
  })

  it('does NOT render title when absent (no <h1> in the DOM)', () => {
    const { container } = render(
      <PageFormLayout>
        <span>body</span>
      </PageFormLayout>,
    )
    expect(container.querySelector('h1')).toBeNull()
  })

  it('card has the centering viewport class applied', () => {
    const { container } = render(
      <PageFormLayout>
        <span>body</span>
      </PageFormLayout>,
    )
    // The outer wrapper carries the .viewport class (centering math).
    const viewport = container.firstChild as HTMLElement
    expect(viewport.className).toMatch(/viewport/)
  })

  it('card has the max-width (card) class applied', () => {
    const { container } = render(
      <PageFormLayout>
        <span>body</span>
      </PageFormLayout>,
    )
    // The inner node carries the .card class (max-width cap).
    const card = container.querySelector('[class*="card"]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.className).toMatch(/card/)
  })

  it('multiple instances render without conflict', () => {
    render(
      <>
        <PageFormLayout title="Login">
          <span data-testid="a">alpha</span>
        </PageFormLayout>
        <PageFormLayout title="Register">
          <span data-testid="b">bravo</span>
        </PageFormLayout>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument()
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  it('has no trailing whitespace in className on the root viewport', () => {
    const { container } = render(
      <PageFormLayout title="Login">
        <span>body</span>
      </PageFormLayout>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('renders title ABOVE children in DOM order', () => {
    const { container } = render(
      <PageFormLayout title="Login">
        <span data-testid="child">body</span>
      </PageFormLayout>,
    )
    const card = container.querySelector('[class*="card"]') as HTMLElement
    const heading = screen.getByRole('heading', { level: 1, name: 'Login' })
    const child = screen.getByTestId('child')
    // Within the card, the heading must precede the child in DOM order.
    const children = Array.from(card.children)
    const headingIdx = children.indexOf(heading)
    const childParent = child.parentElement
    // `child` is wrapped by React in its own slot; either it's a direct child
    // of `.card` or its parent is. Handle both.
    const childIdx = children.indexOf(child as Element)
    const effectiveChildIdx = childIdx !== -1 ? childIdx : children.indexOf(childParent as Element)
    expect(headingIdx).toBeGreaterThanOrEqual(0)
    expect(effectiveChildIdx).toBeGreaterThan(headingIdx)
  })
})
