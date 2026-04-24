import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsCard } from '@/components/page/primitives/SettingsCard'

describe('SettingsCard', () => {
  it('renders title as an <h3>', () => {
    render(
      <SettingsCard title="Account">
        <span>body</span>
      </SettingsCard>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Account' })
    expect(heading).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <SettingsCard title="Timezone" description="Set your timezone for weekly goal tracking.">
        <span>body</span>
      </SettingsCard>,
    )
    expect(
      screen.getByText('Set your timezone for weekly goal tracking.'),
    ).toBeInTheDocument()
  })

  it('does NOT render description when absent', () => {
    const { container } = render(
      <SettingsCard title="Language">
        <span>body</span>
      </SettingsCard>,
    )
    // Only the h3 is a descendant text node at root; no <p> description.
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders children inside the .body wrapper', () => {
    const { container } = render(
      <SettingsCard title="Appearance">
        <span data-testid="inner">payload</span>
      </SettingsCard>,
    )
    const bodyWrapper = container.querySelector('[class*="body"]')
    expect(bodyWrapper).not.toBeNull()
    const inner = screen.getByTestId('inner')
    expect(bodyWrapper?.contains(inner)).toBe(true)
  })

  it('renders a very long title without crashing', () => {
    const longTitle = 'Appearance '.repeat(50).trim()
    render(
      <SettingsCard title={longTitle}>
        <span>body</span>
      </SettingsCard>,
    )
    expect(
      screen.getByRole('heading', { level: 3, name: longTitle }),
    ).toBeInTheDocument()
  })

  it('multiple SettingsCard instances render independently without conflict', () => {
    render(
      <>
        <SettingsCard title="Card A">
          <span data-testid="a">alpha</span>
        </SettingsCard>
        <SettingsCard title="Card B">
          <span data-testid="b">bravo</span>
        </SettingsCard>
      </>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Card A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Card B' })).toBeInTheDocument()
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  it('renders description as a <p> element', () => {
    const { container } = render(
      <SettingsCard title="Timezone" description="A helpful description.">
        <span>body</span>
      </SettingsCard>,
    )
    const paragraph = container.querySelector('p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.textContent).toBe('A helpful description.')
  })

  it('description has the dim-styling class applied', () => {
    const { container } = render(
      <SettingsCard title="Timezone" description="Helper text.">
        <span>body</span>
      </SettingsCard>,
    )
    const paragraph = container.querySelector('p')
    // CSS modules emit class names containing the source class name as a
    // substring — just assert it's non-empty and references `description`.
    expect(paragraph?.className).toMatch(/description/)
  })

  it('has no trailing whitespace in className on the root', () => {
    const { container } = render(
      <SettingsCard title="Account">
        <span>body</span>
      </SettingsCard>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('renders without a router (no Link semantics needed)', () => {
    // Plain render — no MemoryRouter wrapper. If the component accidentally
    // pulls in react-router, this test would throw at render time.
    expect(() =>
      render(
        <SettingsCard title="Account">
          <span>body</span>
        </SettingsCard>,
      ),
    ).not.toThrow()
  })

  it('root is a <section> element', () => {
    const { container } = render(
      <SettingsCard title="Account">
        <span>body</span>
      </SettingsCard>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('SECTION')
  })
})
