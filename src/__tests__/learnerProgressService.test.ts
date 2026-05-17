import { describe, expect, it, vi } from 'vitest'
import { createLearnerProgressService } from '@/services/learnerProgressService'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

const logErrorMock = vi.fn()
vi.mock('@/lib/logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

function makeRpc(returns: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data: returns, error: null }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

function makeQuery(response: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(() => Promise.resolve(response))
  const limit = vi.fn(() => ({ maybeSingle }))
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const schema = vi.fn(() => ({ rpc: vi.fn(), from }))
  return { schema, from, select, eq, order, limit, maybeSingle }
}

describe('learnerProgressService', () => {
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

  describe('getLastPracticeAgeDays', () => {
    it('returns null when the learner has no sessions yet', async () => {
      const { schema, from } = makeQuery({ data: null, error: null })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
        now: new Date('2026-05-17T10:00:00Z'),
      })

      expect(result).toBeNull()
      expect(from).toHaveBeenCalledWith('learning_sessions')
    })

    it('returns 0 when the most recent session is earlier today in the user timezone', async () => {
      const { schema } = makeQuery({
        // 10:00 local on 2026-05-17 in Europe/Amsterdam (UTC+2 in May).
        data: { started_at: '2026-05-17T08:00:00Z' },
        error: null,
      })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
        // 20:00 local on 2026-05-17 in Europe/Amsterdam — same day.
        now: new Date('2026-05-17T18:00:00Z'),
      })

      expect(result).toBe(0)
    })

    it('returns 3 when the most recent session is 3 calendar days ago in the user timezone', async () => {
      const { schema } = makeQuery({
        data: { started_at: '2026-05-14T08:00:00Z' },
        error: null,
      })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
        now: new Date('2026-05-17T10:00:00Z'),
      })

      expect(result).toBe(3)
    })

    it('clamps future timestamps to 0 (does not return a negative age)', async () => {
      const { schema } = makeQuery({
        data: { started_at: '2026-05-20T10:00:00Z' },
        error: null,
      })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
        now: new Date('2026-05-17T10:00:00Z'),
      })

      expect(result).toBe(0)
    })

    it('falls back to UTC when timezone is null', async () => {
      const { schema } = makeQuery({
        data: { started_at: '2026-05-15T23:30:00Z' },
        error: null,
      })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: null,
        now: new Date('2026-05-17T00:30:00Z'),
      })

      // In UTC: 2026-05-15 → 2026-05-17 is 2 calendar days.
      expect(result).toBe(2)
    })

    it('returns null and logs the error when the Supabase query fails', async () => {
      logErrorMock.mockClear()
      const { schema } = makeQuery({ data: null, error: { message: 'boom' } })
      const service = createLearnerProgressService({ schema })

      const result = await service.getLastPracticeAgeDays({
        userId: 'user-1',
        timezone: 'Europe/Amsterdam',
        now: new Date('2026-05-17T10:00:00Z'),
      })

      expect(result).toBeNull()
      expect(logErrorMock).toHaveBeenCalledTimes(1)
      expect(logErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 'dashboard', action: 'getLastPracticeAgeDays' }),
      )
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
