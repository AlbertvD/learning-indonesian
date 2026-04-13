import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contentFlagService } from '@/services/contentFlagService'

vi.mock('@/lib/supabase')

const baseRow = {
  id: 'flag-1', user_id: 'user-1',
  learning_item_id: 'item-1', grammar_pattern_id: null,
  exercise_type: 'recognition_mcq', exercise_variant_id: null,
  flag_type: 'wrong_translation', comment: 'test', status: 'open',
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

describe('contentFlagService', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('upsertFlag (vocab) calls supabase with correct payload and conflict target', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockSingle = vi.fn().mockResolvedValue({ data: baseRow, error: null })
    const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) })
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any)

    const result = await contentFlagService.upsertFlag({
      userId: 'user-1',
      learningItemId: 'item-1',
      grammarPatternId: null,
      exerciseType: 'recognition_mcq',
      exerciseVariantId: null,
      flagType: 'wrong_translation',
      comment: 'test',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ learning_item_id: 'item-1', grammar_pattern_id: null }),
      { onConflict: 'user_id,learning_item_id,exercise_type' },
    )
    expect(result.id).toBe('flag-1')
    expect(result.learningItemId).toBe('item-1')
    expect(result.grammarPatternId).toBeNull()
  })

  it('upsertFlag (grammar) uses grammar conflict target', async () => {
    const { supabase } = await import('@/lib/supabase')
    const grammarRow = { ...baseRow, learning_item_id: null, grammar_pattern_id: 'gp-1' }
    const mockSingle = vi.fn().mockResolvedValue({ data: grammarRow, error: null })
    const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) })
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any)

    const result = await contentFlagService.upsertFlag({
      userId: 'user-1',
      learningItemId: null,
      grammarPatternId: 'gp-1',
      exerciseType: 'contrast_pair',
      exerciseVariantId: null,
      flagType: 'confusing',
      comment: null,
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ learning_item_id: null, grammar_pattern_id: 'gp-1' }),
      { onConflict: 'user_id,grammar_pattern_id,exercise_type' },
    )
    expect(result.grammarPatternId).toBe('gp-1')
    expect(result.learningItemId).toBeNull()
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

  it('getFlagForGrammarPattern returns null when no flag exists', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    const result = await contentFlagService.getFlagForGrammarPattern('user-1', 'gp-1', 'contrast_pair')
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
