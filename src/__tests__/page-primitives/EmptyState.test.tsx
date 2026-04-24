import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/page/primitives/EmptyState'

describe('EmptyState', () => {
  it('renders the icon slot', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
      />,
    )
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('renders the message inside a <p>', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
      />,
    )
    const msg = screen.getByText('Nothing here yet')
    expect(msg.tagName).toBe('P')
  })

  it('renders the CTA slot when provided', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
        cta={<button type="button">Add one</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
  })

  it('does NOT render a CTA slot element when cta is not provided', () => {
    const { container } = render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
      />,
    )
    // No node should carry the `cta` CSS-module class.
    const ctaNodes = container.querySelectorAll('[class*="cta"]')
    expect(ctaNodes.length).toBe(0)
  })

  it('renders the CTA below the message in DOM order', () => {
    const { container } = render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
        cta={<button type="button">Add one</button>}
      />,
    )
    const root = container.firstChild as HTMLElement
    const children = Array.from(root.children) as HTMLElement[]
    const messageIndex = children.findIndex((c) => c.tagName === 'P')
    const ctaIndex = children.findIndex((c) =>
      /cta/.test(c.className),
    )
    expect(messageIndex).toBeGreaterThanOrEqual(0)
    expect(ctaIndex).toBeGreaterThan(messageIndex)
  })

  it('message element carries the message class (max-width guard)', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message={'A very long sentence that might otherwise stretch edge-to-edge across a wide container and hurt readability'}
      />,
    )
    const msg = screen.getByText(/A very long sentence/)
    expect(msg.className).toMatch(/message/)
  })

  it('two EmptyState instances render independently without class-name conflicts', () => {
    const { container } = render(
      <>
        <EmptyState
          icon={<svg data-testid="icon-1" />}
          message="First blank"
        />
        <EmptyState
          icon={<svg data-testid="icon-2" />}
          message="Second blank"
          cta={<button type="button">Go</button>}
        />
      </>,
    )
    // Both roots exist
    const roots = container.querySelectorAll('[class*="root"]')
    expect(roots.length).toBe(2)
    // Icons, messages, and the single CTA are all accounted for.
    expect(screen.getByTestId('icon-1')).toBeInTheDocument()
    expect(screen.getByTestId('icon-2')).toBeInTheDocument()
    expect(screen.getByText('First blank')).toBeInTheDocument()
    expect(screen.getByText('Second blank')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })

  it('has no trailing whitespace in className (no cta)', () => {
    const { container } = render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className (with cta)', () => {
    const { container } = render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        message="Nothing here yet"
        cta={<button type="button">Add one</button>}
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
