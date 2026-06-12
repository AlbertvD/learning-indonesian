import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markSessionComplete } from '@/services/sessionService'

vi.mock('@/lib/supabase')

describe('markSessionComplete', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls the mark_session_complete RPC with the session id', async () => {
    const { supabase } = await import('@/lib/supabase')
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    await markSessionComplete('session-1')

    expect(rpc).toHaveBeenCalledWith('mark_session_complete', { p_session_id: 'session-1' })
  })

  it('throws a friendly error when the RPC errors', async () => {
    const { supabase } = await import('@/lib/supabase')
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    await expect(markSessionComplete('session-1')).rejects.toThrow('denied')
  })
})
