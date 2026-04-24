import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionHeading } from '@/components/page/primitives/SectionHeading'

describe('SectionHeading', () => {
  it('renders children as an <h2>', () => {
    render(<SectionHeading>Geheugensterkte</SectionHeading>)
    const heading = screen.getByRole('heading', { level: 2, name: 'Geheugensterkte' })
    expect(heading).toBeInTheDocument()
    expect(heading.tagName).toBe('H2')
  })

  it('renders divider (the aria-hidden div) regardless of whether action is provided', () => {
    const { container: withAction } = render(
      <SectionHeading action={<a href="#">See all</a>}>Label</SectionHeading>,
    )
    const { container: withoutAction } = render(
      <SectionHeading>Label</SectionHeading>,
    )
    expect(withAction.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(withoutAction.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('renders divider when action IS provided', () => {
    const { container } = render(
      <SectionHeading action={<a href="#">See all</a>}>Label</SectionHeading>,
    )
    const divider = container.querySelector('[aria-hidden="true"]')
    expect(divider).not.toBeNull()
  })

  it('renders divider when action is NOT provided', () => {
    const { container } = render(<SectionHeading>Label</SectionHeading>)
    const divider = container.querySelector('[aria-hidden="true"]')
    expect(divider).not.toBeNull()
  })

  it('renders action slot when provided', () => {
    render(
      <SectionHeading action={<a href="/all">See all</a>}>Label</SectionHeading>,
    )
    expect(screen.getByRole('link', { name: 'See all' })).toBeInTheDocument()
  })

  it('does NOT render an action slot element when action is not provided', () => {
    const { container } = render(<SectionHeading>Label</SectionHeading>)
    // No node should carry the `action` CSS-module class.
    const actionNodes = container.querySelectorAll('[class*="action"]')
    expect(actionNodes.length).toBe(0)
  })

  it('divider has aria-hidden="true" for screen readers', () => {
    const { container } = render(<SectionHeading>Label</SectionHeading>)
    const divider = container.querySelector('[aria-hidden="true"]')
    expect(divider).not.toBeNull()
    expect(divider?.getAttribute('aria-hidden')).toBe('true')
  })

  it('has no trailing whitespace in className (no action)', () => {
    const { container } = render(<SectionHeading>Label</SectionHeading>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className (with action)', () => {
    const { container } = render(
      <SectionHeading action={<a href="#">See all</a>}>Label</SectionHeading>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('renders element children inside the <h2>', () => {
    render(
      <SectionHeading>
        <span data-testid="inner">Geheugen</span>
      </SectionHeading>,
    )
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toContainElement(screen.getByTestId('inner'))
  })
})
