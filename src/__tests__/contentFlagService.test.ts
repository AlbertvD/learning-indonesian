import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contentFlagService } from '@/services/contentFlagService'

vi.mock('@/lib/supabase')

describe('contentFlagService', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('upsertFlag calls supabase with correct payload', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'flag-1', user_id: 'user-1', learning_item_id: 'item-1',
        exercise_type: 'recognition_mcq', exercise_variant_id: null,
        flag_type: 'wrong_translation', comment: 'test', status: 'open',
        created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      error: null,
    })
    const mockChain = { upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }) }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    const result = await contentFlagService.upsertFlag({
      userId: 'user-1',
      learningItemId: 'item-1',
      exerciseType: 'recognition_mcq',
      exerciseVariantId: null,
      flagType: 'wrong_translation',
      comment: 'test',
    })

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(result.id).toBe('flag-1')
    expect(result.flagType).toBe('wrong_translation')
  })

  it('getFlagForItem returns null when no flag exists', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    const result = await contentFlagService.getFlagForItem('user-1', 'item-1', 'recognition_mcq')
    expect(result).toBeNull()
  })

  it('resolveFlag calls update with status resolved', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockChain = { update: vi.fn().mockReturnValue({ eq: mockEq }) }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    await contentFlagService.resolveFlag('flag-1')
    expect(mockChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }))
  })
})
