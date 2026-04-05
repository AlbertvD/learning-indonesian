import { describe, it, expect, vi, beforeEach } from 'vitest'
import { progressService } from '@/services/progressService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  },
}))

const mockChain = supabase as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
  // Re-wire chain methods to return `this` by default
  ;['schema', 'from', 'select', 'eq', 'in', 'gt', 'order', 'limit'].forEach((m) => {
    mockChain[m] = vi.fn().mockReturnThis()
  })
})

describe('progressService.getAccuracyBySkillType', () => {
  it('computes recognition and recall accuracy from review_events', async () => {
    mockChain['limit'] = vi.fn().mockResolvedValue({
      data: [
        { skill_type: 'recognition', was_correct: true },
        { skill_type: 'recognition', was_correct: true },
        { skill_type: 'recognition', was_correct: false },
        { skill_type: 'form_recall', was_correct: true },
        { skill_type: 'form_recall', was_correct: false },
      ],
      error: null,
    })
    // The actual terminal call is .in() not .limit() for this query
    mockChain['in'] = vi.fn().mockResolvedValue({
      data: [
        { skill_type: 'recognition', was_correct: true },
        { skill_type: 'recognition', was_correct: true },
        { skill_type: 'recognition', was_correct: false },
        { skill_type: 'form_recall', was_correct: true },
        { skill_type: 'form_recall', was_correct: false },
      ],
      error: null,
    })

    const result = await progressService.getAccuracyBySkillType('user-1')

    expect(result.recognitionAccuracy).toBeCloseTo(2 / 3)
    expect(result.recognitionSampleSize).toBe(3)
    expect(result.recallAccuracy).toBeCloseTo(0.5)
    expect(result.recallSampleSize).toBe(2)
  })

  it('returns 0 accuracy when there are no events', async () => {
    mockChain['in'] = vi.fn().mockResolvedValue({ data: [], error: null })

    const result = await progressService.getAccuracyBySkillType('user-1')

    expect(result.recognitionAccuracy).toBe(0)
    expect(result.recallAccuracy).toBe(0)
    expect(result.recognitionSampleSize).toBe(0)
    expect(result.recallSampleSize).toBe(0)
  })

  it('throws when supabase returns an error', async () => {
    mockChain['in'] = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })

    await expect(progressService.getAccuracyBySkillType('user-1')).rejects.toThrow('DB error')
  })
})

describe('progressService.getLapsePrevention', () => {
  it('correctly categorises at-risk and rescued skills', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    mockChain['gt'] = vi.fn().mockResolvedValue({
      data: [
        // at risk: has consecutive failures
        { lapse_count: 2, consecutive_failures: 1, last_reviewed_at: recent },
        // rescued: lapsed before but fixed recently
        { lapse_count: 1, consecutive_failures: 0, last_reviewed_at: recent },
        // not rescued: reviewed too long ago
        { lapse_count: 1, consecutive_failures: 0, last_reviewed_at: old },
      ],
      error: null,
    })

    const result = await progressService.getLapsePrevention('user-1')

    expect(result.atRisk).toBe(1)
    expect(result.rescued).toBe(1)
  })

  it('returns zero counts when no lapsed skills exist', async () => {
    mockChain['gt'] = vi.fn().mockResolvedValue({ data: [], error: null })

    const result = await progressService.getLapsePrevention('user-1')

    expect(result.atRisk).toBe(0)
    expect(result.rescued).toBe(0)
  })

  it('throws when supabase returns an error', async () => {
    mockChain['gt'] = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })

    await expect(progressService.getLapsePrevention('user-1')).rejects.toThrow('DB error')
  })
})

describe('progressService.getVulnerableItems', () => {
  it('maps supabase rows to VulnerableItem shape', async () => {
    mockChain['limit'] = vi.fn().mockResolvedValue({
      data: [
        {
          learning_item_id: 'item-1',
          lapse_count: 5,
          consecutive_failures: 2,
          learning_items: { base_text: 'selamat', item_meanings: [{ translation_text: 'gegroet', is_primary: true, translation_language: 'nl' }] },
        },
      ],
      error: null,
    })

    const result = await progressService.getVulnerableItems('user-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'item-1',
      indonesianText: 'selamat',
      meaning: 'gegroet',
      lapseCount: 5,
      consecutiveFailures: 2,
    })
  })

  it('returns empty array when there are no vulnerable items', async () => {
    mockChain['limit'] = vi.fn().mockResolvedValue({ data: [], error: null })

    const result = await progressService.getVulnerableItems('user-1')

    expect(result).toEqual([])
  })

  it('throws when supabase returns an error', async () => {
    mockChain['limit'] = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })

    await expect(progressService.getVulnerableItems('user-1')).rejects.toThrow('DB error')
  })
})
