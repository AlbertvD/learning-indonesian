import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoverageBar } from '../CoverageBar'

function widths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('span > span')).map(
    (el) => (el as HTMLElement).style.width,
  )
}

describe('CoverageBar', () => {
  it('splits known ⊂ eligible ⊂ total into three nested segments', () => {
    const { container } = render(<CoverageBar total={100} eligible={80} known={50} />)
    // known 50%, eligible-extra 30%, gain 20%
    expect(widths(container)).toEqual(['50%', '30%', '20%'])
  })

  it('collapses the gain segment to 0 when fully eligible (activated)', () => {
    const { container } = render(<CoverageBar total={100} eligible={100} known={40} />)
    expect(widths(container)).toEqual(['40%', '60%', '0%'])
  })

  it('never divides by zero on an empty list', () => {
    const { container } = render(<CoverageBar total={0} eligible={0} known={0} />)
    expect(widths(container)).toEqual(['0%', '0%', '0%'])
  })

  it('clamps inconsistent inputs (known > eligible) instead of going negative', () => {
    const { container } = render(<CoverageBar total={100} eligible={30} known={90} />)
    // known clamped to eligible (30); no negative segment
    expect(widths(container)).toEqual(['30%', '0%', '70%'])
  })
})
