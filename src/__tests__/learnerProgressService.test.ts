import { describe, expect, it, vi } from 'vitest'
import { createLearnerProgressService } from '@/services/learnerProgressService'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

function makeRpc(returns: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data: returns, error: null }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

function makeRpcError(message: string) {
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message } }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

describe('learnerProgressService', () => {
  describe('getTodaysPlanRawCounts', () => {
    it('forwards snake_case args and maps response to camelCase', async () => {
      const { schema, rpc } = makeRpc([
        { due_raw: 5, new_raw: 3, weak_raw: 1, recall_supply_raw: 2, mean_latency_ms: 18000 },
      ])
      const service = createLearnerProgressService({ schema })
      const now = new Date('2026-05-01T10:00:00Z')

      const result = await service.getTodaysPlanRawCounts({ userId: 'user-1', now })

      expect(schema).toHaveBeenCalledWith('indonesian')
      expect(rpc).toHaveBeenCalledWith('compute_todays_plan_raw', {
        p_user_id: 'user-1',
        p_now: now.toISOString(),
      })
      expect(result).toEqual({
        dueRaw: 5,
        newRaw: 3,
        weakRaw: 1,
        recallSupplyRaw: 2,
        meanLatencyMs: 18000,
      })
    })

    it('returns zeroes for an empty result row', async () => {
      const { schema } = makeRpc([
        { due_raw: 0, new_raw: 0, weak_raw: 0, recall_supply_raw: 0, mean_latency_ms: 20000 },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getTodaysPlanRawCounts({ userId: 'user-2', now: new Date() })
      expect(result.dueRaw).toBe(0)
      expect(result.meanLatencyMs).toBe(20000)
    })

    it('throws with method context when the RPC errors', async () => {
      const { schema } = makeRpcError('boom')
      const service = createLearnerProgressService({ schema })

      await expect(
        service.getTodaysPlanRawCounts({ userId: 'user-3', now: new Date() })
      ).rejects.toThrow(/learnerProgressService\.getTodaysPlanRawCounts.*boom/)
    })
  })

  describe('getLapsingCount', () => {
    it('wraps the scalar int response in { count }', async () => {
      const { schema, rpc } = makeRpc(7)
      const service = createLearnerProgressService({ schema })

      const result = await service.getLapsingCount({ userId: 'user-1' })

      expect(rpc).toHaveBeenCalledWith('get_lapsing_count', { p_user_id: 'user-1' })
      expect(result).toEqual({ count: 7 })
    })

    it('coerces null to count: 0', async () => {
      const { schema } = makeRpc(null)
      const service = createLearnerProgressService({ schema })
      const result = await service.getLapsingCount({ userId: 'user-1' })
      expect(result).toEqual({ count: 0 })
    })
  })

  describe('getCurrentStreakDays', () => {
    it('forwards timezone and returns the scalar count', async () => {
      const { schema, rpc } = makeRpc(3)
      const service = createLearnerProgressService({ schema })

      const result = await service.getCurrentStreakDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
      })

      expect(rpc).toHaveBeenCalledWith('get_current_streak_days', {
        p_user_id: 'user-1',
        p_timezone: 'Europe/Amsterdam',
      })
      expect(result).toBe(3)
    })

    it('coerces null to 0', async () => {
      const { schema } = makeRpc(null)
      const service = createLearnerProgressService({ schema })
      const result = await service.getCurrentStreakDays({ userId: 'user-1', timezone: 'UTC' })
      expect(result).toBe(0)
    })
  })

  describe('getOverdueCount', () => {
    it('forwards timezone and returns the scalar count', async () => {
      const { schema, rpc } = makeRpc(2)
      const service = createLearnerProgressService({ schema })
      const result = await service.getOverdueCount({ userId: 'user-1', timezone: 'Europe/Amsterdam' })

      expect(rpc).toHaveBeenCalledWith('get_overdue_count', {
        p_user_id: 'user-1',
        p_timezone: 'Europe/Amsterdam',
      })
      expect(result).toBe(2)
    })
  })

  describe('getStudyDaysCount', () => {
    it('forwards week bounds and timezone', async () => {
      const { schema, rpc } = makeRpc(4)
      const service = createLearnerProgressService({ schema })
      const result = await service.getStudyDaysCount({
        userId: 'user-1',
        weekStartUtc: '2026-04-24T10:00:00Z',
        weekEndUtc: '2026-05-01T10:00:00Z',
        timezone: 'Europe/Amsterdam',
      })

      expect(rpc).toHaveBeenCalledWith('get_study_days_count', {
        p_user_id: 'user-1',
        p_week_start_utc: '2026-04-24T10:00:00Z',
        p_week_end_utc: '2026-05-01T10:00:00Z',
        p_timezone: 'Europe/Amsterdam',
      })
      expect(result).toBe(4)
    })
  })

  describe('getRecallStatsForWeek', () => {
    it('forwards week bounds and maps response to camelCase', async () => {
      const { schema, rpc } = makeRpc([
        { recognition_correct: 3, recognition_total: 4, recall_correct: 0, recall_total: 1 },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getRecallStatsForWeek({
        userId: 'user-1',
        weekStartUtc: '2026-04-24T10:00:00Z',
        weekEndUtc: '2026-05-01T10:00:00Z',
      })

      expect(rpc).toHaveBeenCalledWith('get_recall_stats_for_week', {
        p_user_id: 'user-1',
        p_week_start_utc: '2026-04-24T10:00:00Z',
        p_week_end_utc: '2026-05-01T10:00:00Z',
      })
      expect(result).toEqual({
        recognitionCorrect: 3,
        recognitionTotal: 4,
        recallCorrect: 0,
        recallTotal: 1,
      })
    })
  })

  describe('getUsableVocabularyGain', () => {
    it('forwards week bounds and returns the scalar count', async () => {
      const { schema, rpc } = makeRpc(1)
      const service = createLearnerProgressService({ schema })
      const result = await service.getUsableVocabularyGain({
        userId: 'user-1',
        weekStartUtc: '2026-04-24T10:00:00Z',
        weekEndUtc: '2026-05-01T10:00:00Z',
      })

      expect(rpc).toHaveBeenCalledWith('get_usable_vocabulary_gain', {
        p_user_id: 'user-1',
        p_week_start_utc: '2026-04-24T10:00:00Z',
        p_week_end_utc: '2026-05-01T10:00:00Z',
      })
      expect(result).toBe(1)
    })
  })

  describe('getMemoryHealth', () => {
    it('rounds raw numeric stabilities to 2 decimals (preserves legacy useProgressData display)', async () => {
      const { schema, rpc } = makeRpc([
        {
          avg_recognition_stability: '10.000000',
          recognition_sample_size: 3,
          avg_recall_stability: '1.500000',
          recall_sample_size: 2,
          avg_overall_stability: '6.6000000',
          overall_sample_size: 5,
        },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getMemoryHealth({ userId: 'user-1' })

      expect(rpc).toHaveBeenCalledWith('get_memory_health', { p_user_id: 'user-1' })
      expect(result).toEqual({
        avgRecognitionStability: 10,
        recognitionSampleSize: 3,
        avgRecallStability: 1.5,
        recallSampleSize: 2,
        avgOverallStability: 6.6,
        overallSampleSize: 5,
      })
    })

    it('handles fractional values rounded to 2 decimals', async () => {
      const { schema } = makeRpc([
        {
          avg_recognition_stability: '2.7367890123',
          recognition_sample_size: 1,
          avg_recall_stability: '0',
          recall_sample_size: 0,
          avg_overall_stability: '2.7367890123',
          overall_sample_size: 1,
        },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getMemoryHealth({ userId: 'user-1' })
      expect(result.avgRecognitionStability).toBe(2.74)
      expect(result.avgOverallStability).toBe(2.74)
    })
  })

  describe('getLapsePrevention', () => {
    it('maps response to camelCase', async () => {
      const { schema, rpc } = makeRpc([{ at_risk: 2, rescued: 0 }])
      const service = createLearnerProgressService({ schema })
      const result = await service.getLapsePrevention({ userId: 'user-1' })

      expect(rpc).toHaveBeenCalledWith('get_lapse_prevention', { p_user_id: 'user-1' })
      expect(result).toEqual({ atRisk: 2, rescued: 0 })
    })
  })

  describe('getReviewLatencyStats', () => {
    it('maps response and preserves nulls for empty windows', async () => {
      const { schema } = makeRpc([{ current_week_ms: 18000, prior_week_ms: null }])
      const service = createLearnerProgressService({ schema })
      const result = await service.getReviewLatencyStats({ userId: 'user-1' })
      expect(result).toEqual({ currentWeekMs: 18000, priorWeekMs: null })
    })
  })

  describe('getRecallAccuracyByDirection', () => {
    it('maps response to camelCase', async () => {
      const { schema } = makeRpc([
        { recognition_correct: 3, recognition_total: 4, recall_correct: 0, recall_total: 2 },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getRecallAccuracyByDirection({ userId: 'user-1' })
      expect(result).toEqual({
        recognitionCorrect: 3,
        recognitionTotal: 4,
        recallCorrect: 0,
        recallTotal: 2,
      })
    })
  })

  describe('getVulnerableCapabilities', () => {
    it('forwards limit and maps row shape to camelCase', async () => {
      const { schema, rpc } = makeRpc([
        {
          capability_id: 'cap-4',
          canonical_key: 'cap:v1:...',
          item_id: 'item-a',
          base_text: 'akhir',
          meaning: 'einde',
          lapse_count: 4,
          consecutive_failure_count: 2,
        },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getVulnerableCapabilities({ userId: 'user-1', limit: 5 })

      expect(rpc).toHaveBeenCalledWith('get_vulnerable_capabilities', {
        p_user_id: 'user-1',
        p_limit: 5,
      })
      expect(result).toEqual([
        {
          capabilityId: 'cap-4',
          canonicalKey: 'cap:v1:...',
          itemId: 'item-a',
          baseText: 'akhir',
          meaning: 'einde',
          lapseCount: 4,
          consecutiveFailureCount: 2,
        },
      ])
    })

    it('uses default limit=10 when omitted', async () => {
      const { schema, rpc } = makeRpc([])
      const service = createLearnerProgressService({ schema })
      await service.getVulnerableCapabilities({ userId: 'user-1' })
      expect(rpc).toHaveBeenCalledWith('get_vulnerable_capabilities', {
        p_user_id: 'user-1',
        p_limit: 10,
      })
    })
  })

  describe('getReviewForecast', () => {
    it('forwards days and timezone, maps date strings', async () => {
      const { schema, rpc } = makeRpc([
        { forecast_date: '2026-05-01', count: 5 },
        { forecast_date: '2026-05-02', count: 2 },
      ])
      const service = createLearnerProgressService({ schema })
      const result = await service.getReviewForecast({
        userId: 'user-1',
        days: 14,
        timezone: 'Europe/Amsterdam',
      })

      expect(rpc).toHaveBeenCalledWith('get_review_forecast', {
        p_user_id: 'user-1',
        p_days: 14,
        p_timezone: 'Europe/Amsterdam',
      })
      expect(result).toEqual([
        { date: '2026-05-01', count: 5 },
        { date: '2026-05-02', count: 2 },
      ])
    })

    it('uses default days=14 when omitted', async () => {
      const { schema, rpc } = makeRpc([])
      const service = createLearnerProgressService({ schema })
      await service.getReviewForecast({ userId: 'user-1', timezone: 'UTC' })
      expect(rpc).toHaveBeenCalledWith('get_review_forecast', {
        p_user_id: 'user-1',
        p_days: 14,
        p_timezone: 'UTC',
      })
    })
  })
})
