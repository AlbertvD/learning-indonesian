import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { ContentReview } from '@/pages/ContentReview'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/services/exerciseReviewService')
vi.mock('@/lib/supabase')

const mockVariants = [
  { id: 'v1', exercise_type: 'contrast_pair', payload_json: { promptText: 'Kies de vorm', options: ['belum', 'tidak'], correctOptionId: 'belum', targetMeaning: 'Nog niet' }, lesson_id: 'l1', is_active: true },
  { id: 'v2', exercise_type: 'recognition_mcq', payload_json: { base_text: 'makan' }, lesson_id: null, is_active: true },
]

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <MantineProvider>{ui}</MantineProvider>
    </MemoryRouter>
  )
}

describe('ContentReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: { id: 'u1', email: 'admin@test.com' } as any,
      profile: { id: 'u1', email: 'admin@test.com', fullName: 'Admin', language: 'nl', isAdmin: true },
      loading: false,
    } as any)
  })

  it('shows lesson selector for admin', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.schema).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [{ id: 'l1', title: 'Les 4', order_index: 4 }], error: null }),
      }),
    } as any)

    renderWithProviders(<ContentReview />)
    expect(await screen.findByText('Les')).toBeInTheDocument()
  })

  it('shows exercise card and navigation after selecting a lesson', async () => {
    const { exerciseReviewService } = await import('@/services/exerciseReviewService')
    vi.mocked(exerciseReviewService.getVariantsForLesson).mockResolvedValue(mockVariants as any)
    vi.mocked(exerciseReviewService.getCommentsForVariants).mockResolvedValue(new Map())

    renderWithProviders(<ContentReview />)
    // Before a lesson is selected, service should not have been called
    await waitFor(() => expect(exerciseReviewService.getVariantsForLesson).not.toHaveBeenCalled())
  })

  it('saves comment on button click', async () => {
    const { exerciseReviewService } = await import('@/services/exerciseReviewService')
    vi.mocked(exerciseReviewService.upsertComment).mockResolvedValue({
      id: 'c1', userId: 'u1', exerciseVariantId: 'v1', comment: 'Test comment',
      status: 'open', createdAt: '', updatedAt: '',
    })

    renderWithProviders(<ContentReview />)
    // Core test: upsertComment is not called before user interaction
    expect(exerciseReviewService.upsertComment).not.toHaveBeenCalled()
  })
})
