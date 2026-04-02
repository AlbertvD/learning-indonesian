// src/__tests__/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logError } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnValue({ then: vi.fn((cb) => cb({ error: null })) }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

describe('logError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls supabase with correct parameters for an Error object', async () => {
    const error = new Error('Test error')
    ;(error as any).code = 'ERR_CODE'

    await logError({ page: 'test-page', action: 'test-action', error })

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(supabase.from).toHaveBeenCalledWith('error_logs')
    expect((supabase as any).insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      page: 'test-page',
      action: 'test-action',
      error_message: 'Test error',
      error_code: 'ERR_CODE',
    })
  })

  it('calls supabase with correct parameters for a string error', async () => {
    await logError({ page: 'test-page', action: 'test-action', error: 'String error' })

    expect((supabase as any).insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      page: 'test-page',
      action: 'test-action',
      error_message: 'String error',
      error_code: null,
    })
  })

  it('does not throw even if insert fails', async () => {
    // Mock insert to simulate a failure
    vi.mocked((supabase as any).insert).mockReturnValue({
      then: vi.fn((cb) => cb({ error: { message: 'DB Error' } })),
    } as any)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      logError({ page: 'test', action: 'test', error: new Error('oops') })
    ).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith('[logger] Failed to write error log:', 'DB Error')
    consoleSpy.mockRestore()
  })

  it('handles user not being logged in', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({ data: { user: null } } as any)

    await logError({ page: 'test', action: 'test', error: 'no user' })

    expect((supabase as any).insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
      })
    )
  })
})
