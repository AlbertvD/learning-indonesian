import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/page/primitives/StatusPill'

describe('StatusPill', () => {
  it('renders children', () => {
    render(<StatusPill tone="success">Op schema</StatusPill>)
    expect(screen.getByText('Op schema')).toBeInTheDocument()
  })

  it.each(['success', 'warning', 'danger', 'accent', 'neutral'] as const)(
    'tone="%s" applies the matching tone class',
    (tone) => {
      const { container } = render(<StatusPill tone={tone}>label</StatusPill>)
      const root = container.firstChild as HTMLElement
      const capitalized = tone[0].toUpperCase() + tone.slice(1)
      expect(root.className).toMatch(new RegExp(`tone${capitalized}`))
    },
  )

  it('root element is a <span> (inline in-flow)', () => {
    const { container } = render(<StatusPill tone="success">label</StatusPill>)
    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('SPAN')
  })

  it('has no trailing whitespace in className', () => {
    const { container } = render(<StatusPill tone="success">label</StatusPill>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe(root.className.trim())
  })
})
