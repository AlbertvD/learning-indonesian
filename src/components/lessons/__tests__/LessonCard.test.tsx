import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LessonCard, type LessonCardProps } from '../LessonCard'

function renderCard(overrides: Partial<LessonCardProps> = {}) {
  const props: LessonCardProps = {
    banner: <div data-testid="banner-art" />,
    orderIndex: 10,
    title: 'Kantor Pos',
    level: 'A2',
    grammarTopics: 'Affixderivatie, Naamwoordvorming',
    practiced: { label: 'practiced', percent: 70 },
    mastered: { label: 'mastered', percent: 42 },
    status: { tone: 'accent', label: 'Active' },
    to: '/lesson/lesson-10',
    ...overrides,
  }
  return render(
    <MemoryRouter>
      <LessonCard {...props} />
    </MemoryRouter>,
  )
}

describe('LessonCard', () => {
  it('exposes the title as a heading (the card link is named by it — a11y)', () => {
    renderCard()
    // The title must be a real heading in the accessibility tree, not buried in
    // the aria-hidden banner art.
    const heading = screen.getByRole('heading', { name: 'Kantor Pos' })
    expect(heading).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/lesson/lesson-10')
    expect(link).toHaveTextContent('Kantor Pos')
  })

  it('renders the level badge and grammar row', () => {
    renderCard()
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('Affixderivatie, Naamwoordvorming')).toBeInTheDocument()
  })

  it('shows both nested bars with their labels and percents when activated', () => {
    renderCard()
    const link = screen.getByRole('link')
    expect(within(link).getByText('practiced')).toBeInTheDocument()
    expect(within(link).getByText('70%')).toBeInTheDocument()
    expect(within(link).getByText('mastered')).toBeInTheDocument()
    expect(within(link).getByText('42%')).toBeInTheDocument()
  })

  it('hides the bars but keeps the level badge + status when not activated (percent null)', () => {
    renderCard({
      practiced: { label: 'practiced', percent: null },
      mastered: { label: 'mastered', percent: null },
      status: { tone: 'neutral', label: 'Not started' },
    })
    expect(screen.queryByText('practiced')).not.toBeInTheDocument()
    expect(screen.queryByText('mastered')).not.toBeInTheDocument()
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('renders a non-navigable div (no link) when disabled', () => {
    renderCard({ to: '/lesson/x', disabled: true })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kantor Pos' })).toBeInTheDocument()
  })
})
