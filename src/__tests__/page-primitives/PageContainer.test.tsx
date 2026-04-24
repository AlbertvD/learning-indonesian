import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageContainer } from '@/components/page/primitives/PageContainer'

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer><span data-testid="child">hi</span></PageContainer>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('applies the size class', () => {
    const { container } = render(<PageContainer size="lg">x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/lg/)
  })

  it('applies the fit class when fit=true', () => {
    const { container } = render(<PageContainer fit>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/fit/)
  })
})
