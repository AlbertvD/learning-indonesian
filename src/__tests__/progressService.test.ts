import { describe, it, expect, vi, beforeEach } from 'vitest'
import { progressService } from '@/services/progressService'
import { learnerProgressService } from '@/services/learnerProgressService'

// progressService is a thin façade over learnerProgressService for the
// Voortgang page (the four analytics methods). These tests verify the
// shape adaptation done by the façade — the underlying SQL function
// behaviour is exercised in learnerProgressService.test.ts.

vi.mock('@/services/learnerProgressService', () => ({
  learnerProgressService: {
    getRecallAccuracyByDirection: vi.fn(),
    getLapsePrevention: vi.fn(),
    getVulnerableCapabilities: vi.fn(),
    getReviewLatencyStats: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('progressService.getAccuracyBySkillType', () => {
  it('adapts raw counts to ratios', async () => {
    vi.mocked(learnerProgressService.getRecallAccuracyByDirection).mockResolvedValue({
      recognitionCorrect: 2,
      recognitionTotal: 3,
      recallCorrect: 1,
      recallTotal: 2,
    })

    const result = await progressService.getAccuracyBySkillType('user-1')

    expect(learnerProgressService.getRecallAccuracyByDirection).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(result.recognitionAccuracy).toBeCloseTo(2 / 3)
    expect(result.recognitionSampleSize).toBe(3)
    expect(result.recallAccuracy).toBe(0.5)
    expect(result.recallSampleSize).toBe(2)
  })

  it('returns zero accuracy for empty samples (no division by zero)', async () => {
    vi.mocked(learnerProgressService.getRecallAccuracyByDirection).mockResolvedValue({
      recognitionCorrect: 0,
      recognitionTotal: 0,
      recallCorrect: 0,
      recallTotal: 0,
    })

    const result = await progressService.getAccuracyBySkillType('user-1')

    expect(result.recognitionAccuracy).toBe(0)
    expect(result.recallAccuracy).toBe(0)
    expect(result.recognitionSampleSize).toBe(0)
    expect(result.recallSampleSize).toBe(0)
  })
})

describe('progressService.getLapsePrevention', () => {
  it('passes through the canonical service result', async () => {
    vi.mocked(learnerProgressService.getLapsePrevention).mockResolvedValue({
      atRisk: 1,
      rescued: 1,
    })

    const result = await progressService.getLapsePrevention('user-1')

    expect(learnerProgressService.getLapsePrevention).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(result).toEqual({ atRisk: 1, rescued: 1 })
  })
})

describe('progressService.getVulnerableItems', () => {
  it('adapts VulnerableCapability rows to the legacy VulnerableItem shape', async () => {
    vi.mocked(learnerProgressService.getVulnerableCapabilities).mockResolvedValue([
      {
        capabilityId: 'cap-1',
        canonicalKey: 'cap:v1:item:learning_items/selamat:form_recall:id_to_l1:text:nl',
        itemId: 'item-1',
        baseText: 'selamat',
        meaning: 'gegroet',
        lapseCount: 5,
        consecutiveFailureCount: 2,
      },
    ])

    const result = await progressService.getVulnerableItems('user-1')

    expect(learnerProgressService.getVulnerableCapabilities).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(result).toEqual([
      {
        id: 'item-1',
        indonesianText: 'selamat',
        meaning: 'gegroet',
        lapseCount: 5,
        consecutiveFailures: 2,
      },
    ])
  })

  it('returns empty array for no vulnerable items', async () => {
    vi.mocked(learnerProgressService.getVulnerableCapabilities).mockResolvedValue([])

    const result = await progressService.getVulnerableItems('user-1')

    expect(result).toEqual([])
  })
})

describe('progressService.getAvgLatencyMs', () => {
  it('passes through the canonical service result', async () => {
    vi.mocked(learnerProgressService.getReviewLatencyStats).mockResolvedValue({
      currentWeekMs: 18000,
      priorWeekMs: null,
    })

    const result = await progressService.getAvgLatencyMs('user-1')

    expect(learnerProgressService.getReviewLatencyStats).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(result).toEqual({ currentWeekMs: 18000, priorWeekMs: null })
  })
})
