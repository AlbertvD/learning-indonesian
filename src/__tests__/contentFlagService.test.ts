import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contentFlagService } from '@/services/contentFlagService'

vi.mock('@/lib/supabase')

const baseRow = {
  id: 'flag-1', user_id: 'user-1',
  capability_id: 'cap-1',
  exercise_type: 'choose_meaning_ex', exercise_variant_id: null,
  flag_type: 'wrong_translation', comment: 'test', status: 'open',
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

describe('contentFlagService', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('upsertFlag anchors on capability_id with the capability conflict target', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockSingle = vi.fn().mockResolvedValue({ data: baseRow, error: null })
    const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) })
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any)

    const result = await contentFlagService.upsertFlag({
      userId: 'user-1',
      capabilityId: 'cap-1',
      exerciseType: 'choose_meaning_ex',
      exerciseVariantId: null,
      flagType: 'wrong_translation',
      comment: 'test',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ capability_id: 'cap-1' }),
      { onConflict: 'user_id,capability_id,exercise_type' },
    )
    expect(result.id).toBe('flag-1')
    expect(result.capabilityId).toBe('cap-1')
  })

  it('upsertFlag works for a capability-only exercise (dialogue cloze) — no item/pattern needed', async () => {
    const { supabase } = await import('@/lib/supabase')
    const clozeRow = { ...baseRow, exercise_type: 'cloze', capability_id: 'cap-dlg-9' }
    const mockSingle = vi.fn().mockResolvedValue({ data: clozeRow, error: null })
    const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) })
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any)

    const result = await contentFlagService.upsertFlag({
      userId: 'user-1',
      capabilityId: 'cap-dlg-9',
      exerciseType: 'type_missing_word_ex',
      exerciseVariantId: null,
      flagType: 'confusing',
      comment: null,
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ capability_id: 'cap-dlg-9' }),
      { onConflict: 'user_id,capability_id,exercise_type' },
    )
    expect(result.capabilityId).toBe('cap-dlg-9')
  })

  it('getFlagForCapability returns null when no flag exists', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    const result = await contentFlagService.getFlagForCapability('user-1', 'cap-1', 'choose_meaning_ex')
    expect(result).toBeNull()
  })

  it('getFlagForCapability maps a found row', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: baseRow, error: null })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn().mockReturnValue(mockChain) } as any)

    const result = await contentFlagService.getFlagForCapability('user-1', 'cap-1', 'choose_meaning_ex')
    expect(result?.capabilityId).toBe('cap-1')
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
