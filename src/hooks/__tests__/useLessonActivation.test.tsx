import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { notifications } from '@mantine/notifications'
import { useLessonActivation } from '../useLessonActivation'

vi.mock('@/lib/lessons')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string }; profile: null }) => unknown) =>
    selector({ user: { id: 'user-uuid' }, profile: null }),
}))

import { isLessonActivated, setLessonActivated } from '@/lib/lessons'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isLessonActivated).mockResolvedValue(false)
  vi.mocked(setLessonActivated).mockResolvedValue(undefined)
})

describe('useLessonActivation', () => {
  it('hydrates activated state from the canonical lib on mount', async () => {
    vi.mocked(isLessonActivated).mockResolvedValue(true)

    const { result } = renderHook(() => useLessonActivation('lesson-abc'))

    expect(result.current.activated).toBe(false) // before resolve
    await waitFor(() => expect(result.current.activated).toBe(true))
    expect(isLessonActivated).toHaveBeenCalledWith('user-uuid', 'lesson-abc')
  })

  it('toggle optimistically flips activated and persists through the canonical write', async () => {
    const { result } = renderHook(() => useLessonActivation('lesson-abc'))
    await waitFor(() => expect(result.current.activated).toBe(false))

    await act(async () => {
      await result.current.toggle(true)
    })

    expect(setLessonActivated).toHaveBeenCalledWith('user-uuid', 'lesson-abc', true)
    expect(result.current.activated).toBe(true)
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'teal' }),
    )
  })

  it('reverts activated and notifies on write failure', async () => {
    vi.mocked(setLessonActivated).mockRejectedValue(new Error('rpc failed'))
    const { result } = renderHook(() => useLessonActivation('lesson-abc'))
    await waitFor(() => expect(result.current.activated).toBe(false))

    await act(async () => {
      await result.current.toggle(true)
    })

    expect(result.current.activated).toBe(false) // reverted
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red' }),
    )
  })
})
