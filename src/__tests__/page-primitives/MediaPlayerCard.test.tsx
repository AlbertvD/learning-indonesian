import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaPlayerCard } from '@/components/page/primitives/MediaPlayerCard'

describe('MediaPlayerCard', () => {
  it('renders medallion, title as an <h3>, and the caller-owned player child', () => {
    render(
      <MediaPlayerCard medallion="01" title="Les 1">
        <audio data-testid="player" />
      </MediaPlayerCard>,
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Les 1' })).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(
      <MediaPlayerCard medallion="02" title="Les 2" subtitle="Vraagwoorden en getallen">
        <audio />
      </MediaPlayerCard>,
    )
    expect(screen.getByText('Vraagwoorden en getallen')).toBeInTheDocument()
  })

  it('does NOT render a subtitle <p> when absent', () => {
    const { container } = render(
      <MediaPlayerCard medallion="03" title="Les 3">
        <audio />
      </MediaPlayerCard>,
    )
    expect(container.querySelector('p')).toBeNull()
  })

  it('accepts a ReactNode medallion (icon instead of text)', () => {
    render(
      <MediaPlayerCard medallion={<svg data-testid="icon" />} title="Uitspraak">
        <audio />
      </MediaPlayerCard>,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})
