import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/page/primitives/StatCard'

describe('StatCard', () => {
  it('renders the label text', () => {
    render(<StatCard label="CONSISTENTIE" value="0 / 4" />)
    expect(screen.getByText('CONSISTENTIE')).toBeInTheDocument()
  })

  it('renders a string value', () => {
    render(<StatCard label="CONSISTENTIE" value="0 / 4" />)
    expect(screen.getByText('0 / 4')).toBeInTheDocument()
  })

  it('renders an element value', () => {
    render(
      <StatCard
        label="ACHTERSTAND"
        value={<span data-testid="value-el">Op schema</span>}
      />,
    )
    expect(screen.getByTestId('value-el')).toBeInTheDocument()
    expect(screen.getByTestId('value-el').textContent).toBe('Op schema')
  })

  it('does NOT render a ring slot element when ring is not provided', () => {
    const { container } = render(<StatCard label="LABEL" value="42" />)
    // No node should carry the `ring` CSS-module class.
    const ringNodes = container.querySelectorAll('[class*="ring"]')
    expect(ringNodes.length).toBe(0)
  })

  it('renders the ring slot when provided', () => {
    render(
      <StatCard
        label="LABEL"
        value="42"
        ring={<div data-testid="ring-indicator" />}
      />,
    )
    expect(screen.getByTestId('ring-indicator')).toBeInTheDocument()
  })

  it('does NOT render a trailing slot element when trailing is not provided', () => {
    const { container } = render(<StatCard label="LABEL" value="42" />)
    // No node should carry the `trailing` CSS-module class.
    const trailingNodes = container.querySelectorAll('[class*="trailing"]')
    expect(trailingNodes.length).toBe(0)
  })

  it('renders the trailing slot when provided', () => {
    render(
      <StatCard
        label="LABEL"
        value="42"
        trailing={<span data-testid="pill">Op schema</span>}
      />,
    )
    expect(screen.getByTestId('pill')).toBeInTheDocument()
  })

  it('has no trailing whitespace in className (no ring, no trailing)', () => {
    const { container } = render(<StatCard label="LABEL" value="42" />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className (with ring and trailing)', () => {
    const { container } = render(
      <StatCard
        label="LABEL"
        value="42"
        ring={<div />}
        trailing={<span>pill</span>}
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
