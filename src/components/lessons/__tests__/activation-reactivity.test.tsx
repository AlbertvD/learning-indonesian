import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { ActivationGate } from '../ActivationGate'
import { PracticeActions } from '../PracticeActions'
import { useLessonActivation } from '@/hooks/useLessonActivation'

// Regression guard for the activation→CTA reactivity bug: before the lift to a
// single useLessonActivation at the composition root, ActivationGate and
// PracticeActions each held their own activation copy, so toggling the gate did
// not update the practice CTA until a manual page reload. This test renders the
// real host wiring (one hook, two children) and proves the CTA updates live.

vi.mock('@/lib/lessons')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; profile: null }) => unknown) =>
    selector({ user: { id: 'user-uuid' }, profile: null }),
}))

import {
  isLessonActivated,
  setLessonActivated,
  getLessonCapabilityPracticeSummaryByLessonId,
  buildLessonPracticeActions,
} from '@/lib/lessons'

// Host mirrors how every bespoke lesson page composes the two frameless
// components: call the hook once, hand the result to both.
function Host({ lessonId }: { lessonId: string }) {
  const activation = useLessonActivation(lessonId)
  return (
    <>
      <ActivationGate
        activated={activation.activated}
        saving={activation.saving}
        onToggle={activation.toggle}
      />
      <PracticeActions lessonId={lessonId} activated={activation.activated} />
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isLessonActivated).mockResolvedValue(false)
  vi.mocked(setLessonActivated).mockResolvedValue(undefined)
  vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
    readyCapabilityCount: 5,
    activePracticedCapabilityCount: 0,
  })
  // Realistic builder: a practice CTA appears only when there are ready items.
  vi.mocked(buildLessonPracticeActions).mockImplementation(({ state }) =>
    state.practiceReadyCount > 0
      ? [{ kind: 'practice', label: `Oefen deze les · ${state.practiceReadyCount} klaar`, href: '/session', priority: 'primary' }]
      : [],
  )
})

describe('activation → practice CTA reactivity', () => {
  it('updates the practice CTA the moment the lesson is activated (no reload)', async () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <Host lessonId="lesson-abc" />
        </MemoryRouter>
      </MantineProvider>,
    )

    // Not activated yet → empty-state button.
    expect(await screen.findByText(/Geen oefeningen beschikbaar/i)).toBeInTheDocument()

    // Activate via the gate checkbox.
    await userEvent.click(screen.getByRole('checkbox'))

    // CTA flips live, without remount/reload.
    expect(await screen.findByText(/Oefen deze les · 5 klaar/i)).toBeInTheDocument()
    expect(screen.queryByText(/Geen oefeningen beschikbaar/i)).not.toBeInTheDocument()
  })
})
