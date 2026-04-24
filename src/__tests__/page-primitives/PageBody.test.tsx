import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageBody } from '@/components/page/primitives/PageBody'

describe('PageBody', () => {
  it('renders children (element)', () => {
    render(<PageBody><span data-testid="child">hi</span></PageBody>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders children (string)', () => {
    render(<PageBody>plain text child</PageBody>)
    expect(screen.getByText('plain text child')).toBeInTheDocument()
  })

  it('applies the auto class by default', () => {
    const { container } = render(<PageBody>x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/auto/)
    expect(root.className).not.toMatch(/fit/)
  })

  it('applies the fit class when variant="fit"', () => {
    const { container } = render(<PageBody variant="fit">x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/fit/)
    expect(root.className).not.toMatch(/auto/)
  })

  it.each(['auto', 'fit'] as const)('emits data-page-body="true" for variant=%s', (variant) => {
    const { container } = render(<PageBody variant={variant}>x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.dataset.pageBody).toBe('true')
  })

  it('emits data-page-body="true" when variant is omitted', () => {
    const { container } = render(<PageBody>x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.dataset.pageBody).toBe('true')
  })

  it.each(['auto', 'fit'] as const)('has no trailing whitespace in className for variant=%s', (variant) => {
    const { container } = render(<PageBody variant={variant}>x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })

  it('has no trailing whitespace in className when variant is omitted', () => {
    const { container } = render(<PageBody>x</PageBody>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
