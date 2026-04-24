import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LoadingState } from '@/components/page/primitives/LoadingState'

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('LoadingState', () => {
  it('renders a Mantine Loader (spinner element present)', () => {
    const { container } = renderWithMantine(<LoadingState />)
    // Mantine's default Loader renders an SVG/span node inside the root.
    // We assert presence of a Loader-classed descendant rather than a
    // specific ARIA role, because Mantine's Loader does not set aria-label
    // by default.
    const loader = container.querySelector('[class*="mantine-Loader-root"]')
    expect(loader).toBeInTheDocument()
  })

  it('renders caption when provided', () => {
    renderWithMantine(<LoadingState caption="Bezig met laden…" />)
    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument()
  })

  it('does NOT render caption when absent', () => {
    const { container } = renderWithMantine(<LoadingState />)
    // Filter out any Mantine-internal class that happens to contain "caption"
    // (none today, but future-proof); we only care about our module's class.
    const captionNodes = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="caption"]'),
    ).filter((el) => !el.className.includes('mantine'))
    expect(captionNodes.length).toBe(0)
  })

  it('caption is a <p> element', () => {
    renderWithMantine(<LoadingState caption="Even geduld" />)
    const caption = screen.getByText('Even geduld')
    expect(caption.tagName).toBe('P')
  })

  it('root carries a class so CSS module min-height can apply', () => {
    const { container } = renderWithMantine(<LoadingState />)
    // MantineProvider adds a wrapper node; our root is the descendant that
    // carries a class matching /root/. We check the class token (not
    // computed style — jsdom doesn't do layout).
    const root = container.querySelector('[class*="root"]') as HTMLElement
    expect(root).not.toBeNull()
    expect(root.className).toMatch(/root/)
  })

  it('has no trailing whitespace in className (no caption)', () => {
    const { container } = renderWithMantine(<LoadingState />)
    const root = container.querySelector('[class*="root"]') as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className (with caption)', () => {
    const { container } = renderWithMantine(<LoadingState caption="Laden" />)
    // Two nodes carry /root/ in their class now (MantineProvider's own
    // mantine-Loader-root + our LoadingState root). We want *our* root —
    // the outer container whose class starts with a hashed "root" token.
    const ourRoot = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="root"]'),
    ).find((el) => !el.className.includes('mantine'))!
    expect(ourRoot.className).toBe(ourRoot.className.trim())
  })

  it('two LoadingState instances render independently without class-name conflicts', () => {
    const { container } = renderWithMantine(
      <>
        <LoadingState />
        <LoadingState caption="Tweede" />
      </>,
    )
    // Filter Mantine-Loader internal roots out — we only want *our* roots.
    const ourRoots = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="root"]'),
    ).filter((el) => !el.className.includes('mantine'))
    expect(ourRoots.length).toBe(2)
    expect(screen.getByText('Tweede')).toBeInTheDocument()
  })
})
