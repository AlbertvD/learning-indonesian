import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageContainer } from '@/components/page/primitives/PageContainer'

describe('PageContainer', () => {
  it('renders children (element)', () => {
    render(<PageContainer><span data-testid="child">hi</span></PageContainer>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders children (string)', () => {
    render(<PageContainer>plain text child</PageContainer>)
    expect(screen.getByText('plain text child')).toBeInTheDocument()
  })

  it.each(['sm', 'md', 'lg', 'xl'] as const)('applies the %s size class', (size) => {
    const { container } = render(<PageContainer size={size}>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(new RegExp(`\\b.*${size}.*\\b`))
  })

  it('defaults to size="md" when size is omitted', () => {
    const { container } = render(<PageContainer>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/md/)
  })

  it('applies the fit class when fit=true', () => {
    const { container } = render(<PageContainer fit>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/fit/)
    expect(root.dataset.pageContainerFit).toBe('true')
  })

  it('does not apply fit class or data attribute by default', () => {
    const { container } = render(<PageContainer>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).not.toMatch(/fit/)
    expect(root.dataset.pageContainerFit).toBeUndefined()
  })

  it('has no trailing whitespace in className', () => {
    const { container } = render(<PageContainer>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
