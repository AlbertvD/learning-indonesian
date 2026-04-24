import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from '@/components/page/primitives/PageHeader'

describe('PageHeader', () => {
  it('renders the title as an <h1>', () => {
    render(<PageHeader title="Dashboard" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' })
    expect(heading).toBeInTheDocument()
    expect(heading.tagName).toBe('H1')
  })

  it('renders subtitle when provided', () => {
    render(<PageHeader title="Dashboard" subtitle="Your daily overview" />)
    expect(screen.getByText('Your daily overview')).toBeInTheDocument()
  })

  it('renders subtitle inside a <p> element', () => {
    const { container } = render(
      <PageHeader title="Dashboard" subtitle="Your daily overview" />,
    )
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.textContent).toBe('Your daily overview')
  })

  it('does NOT render a <p> subtitle when subtitle is omitted', () => {
    const { container } = render(<PageHeader title="Dashboard" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders the action slot when provided', () => {
    render(
      <PageHeader
        title="Dashboard"
        action={<button type="button">New</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })

  it('does NOT render the action slot element when action is not provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />)
    // No node should carry the `action` CSS-module class.
    const actionNodes = container.querySelectorAll('[class*="action"]')
    expect(actionNodes.length).toBe(0)
  })

  it('renders very long title content without crashing', () => {
    const longTitle = 'A'.repeat(500)
    render(<PageHeader title={longTitle} />)
    expect(
      screen.getByRole('heading', { level: 1, name: longTitle }),
    ).toBeInTheDocument()
  })

  it('renders multiple PageHeader instances without conflict', () => {
    render(
      <>
        <PageHeader title="First" />
        <PageHeader title="Second" />
      </>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'First' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Second' }),
    ).toBeInTheDocument()
  })

  it('has no trailing whitespace in className (no action, no subtitle)', () => {
    const { container } = render(<PageHeader title="Dashboard" />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className (with action and subtitle)', () => {
    const { container } = render(
      <PageHeader
        title="Dashboard"
        subtitle="Your daily overview"
        action={<button type="button">New</button>}
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
