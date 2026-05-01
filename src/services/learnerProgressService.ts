// src/services/learnerProgressService.ts
//
// Canonical contract for surfacing-layer reads of user-progress data.
// See docs/plans/2026-05-01-learner-progress-service-spec.md for design.
//
// Every UI surface (Dashboard, Voortgang, lapsing card, weekly-goal evaluation)
// reads through this service. The service hides predicate parity with the
// session engine, transitive-closure source-progress satisfaction, slug-based
// joins, and timezone-correct day bucketing behind a typed TS interface.

import { supabase } from '@/lib/supabase'

// ----- Public types -----

export interface TodaysPlanRawCounts {
  dueRaw: number
  newRaw: number
  weakRaw: number
  recallSupplyRaw: number
  meanLatencyMs: number
}

export interface LapsingCountResult {
  count: number
}

export interface LapsePreventionResult {
  atRisk: number
  rescued: number
}

export interface MemoryHealthResult {
  avgRecognitionStability: number
  recognitionSampleSize: number
  avgRecallStability: number
  recallSampleSize: number
  avgOverallStability: number
  overallSampleSize: number
}

export interface ReviewLatencyStatsResult {
  currentWeekMs: number | null
  priorWeekMs: number | null
}

export interface RecallAccuracyResult {
  recognitionCorrect: number
  recognitionTotal: number
  recallCorrect: number
  recallTotal: number
}

export type RecallStatsForWeekResult = RecallAccuracyResult

export interface VulnerableCapability {
  capabilityId: string
  canonicalKey: string
  itemId: string
  baseText: string
  meaning: string
  lapseCount: number
  consecutiveFailureCount: number
}

export interface ReviewForecastDay {
  date: string
  count: number
}

export interface LearnerProgressService {
  getTodaysPlanRawCounts(input: { userId: string; now: Date }): Promise<TodaysPlanRawCounts>
  getLapsingCount(input: { userId: string }): Promise<LapsingCountResult>
  getLapsePrevention(input: { userId: string }): Promise<LapsePreventionResult>
  getMemoryHealth(input: { userId: string }): Promise<MemoryHealthResult>
  getReviewLatencyStats(input: { userId: string }): Promise<ReviewLatencyStatsResult>
  getRecallAccuracyByDirection(input: { userId: string }): Promise<RecallAccuracyResult>
  getVulnerableCapabilities(input: { userId: string; limit?: number }): Promise<VulnerableCapability[]>
  getReviewForecast(input: { userId: string; days?: number; timezone: string }): Promise<ReviewForecastDay[]>
  getStudyDaysCount(input: { userId: string; weekStartUtc: string; weekEndUtc: string; timezone: string }): Promise<number>
  getRecallStatsForWeek(input: { userId: string; weekStartUtc: string; weekEndUtc: string }): Promise<RecallStatsForWeekResult>
  getUsableVocabularyGain(input: { userId: string; weekStartUtc: string; weekEndUtc: string }): Promise<number>
  getOverdueCount(input: { userId: string; timezone: string }): Promise<number>
  getCurrentStreakDays(input: { userId: string; timezone: string }): Promise<number>
}

// ----- Internal row shapes (snake_case as returned by PostgREST) -----

interface PlanCountsRow {
  due_raw: number
  new_raw: number
  weak_raw: number
  recall_supply_raw: number
  mean_latency_ms: number
}

interface LapsePreventionRow {
  at_risk: number
  rescued: number
}

interface MemoryHealthRow {
  avg_recognition_stability: string | number
  recognition_sample_size: number
  avg_recall_stability: string | number
  recall_sample_size: number
  avg_overall_stability: string | number
  overall_sample_size: number
}

interface LatencyStatsRow {
  current_week_ms: number | null
  prior_week_ms: number | null
}

interface RecallAccuracyRow {
  recognition_correct: number
  recognition_total: number
  recall_correct: number
  recall_total: number
}

interface VulnerableCapabilityRow {
  capability_id: string
  canonical_key: string
  item_id: string
  base_text: string
  meaning: string
  lapse_count: number
  consecutive_failure_count: number
}

interface ForecastRow {
  forecast_date: string
  count: number
}

// ----- Factory (testable) -----

interface SchemaClient {
  // Loose shape: matches both the real supabase-js client (which returns a
  // PostgrestFilterBuilder that is awaitable but not strictly Promise) and
  // test mocks. We await it and read { data, error } off the resolved value.
  schema(name: 'indonesian'): { rpc: (fn: string, args: Record<string, unknown>) => any }
}

function round2(value: string | number): number {
  return Math.round(Number(value) * 100) / 100
}

export function createLearnerProgressService(client: SchemaClient): LearnerProgressService {
  async function rpc<T>(rpcName: string, methodName: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.schema('indonesian').rpc(rpcName, args)
    if (error) {
      throw new Error(`learnerProgressService.${methodName} failed: ${error.message}`)
    }
    return data as T
  }

  return {
    async getTodaysPlanRawCounts({ userId, now }) {
      const rows = await rpc<PlanCountsRow[]>('compute_todays_plan_raw', 'getTodaysPlanRawCounts', {
        p_user_id: userId,
        p_now: now.toISOString(),
      })
      const r = rows[0]
      return {
        dueRaw: r.due_raw,
        newRaw: r.new_raw,
        weakRaw: r.weak_raw,
        recallSupplyRaw: r.recall_supply_raw,
        meanLatencyMs: r.mean_latency_ms,
      }
    },

    async getLapsingCount({ userId }) {
      const data = await rpc<number | null>('get_lapsing_count', 'getLapsingCount', { p_user_id: userId })
      return { count: data ?? 0 }
    },

    async getLapsePrevention({ userId }) {
      const rows = await rpc<LapsePreventionRow[]>('get_lapse_prevention', 'getLapsePrevention', { p_user_id: userId })
      const r = rows[0]
      return { atRisk: r.at_risk, rescued: r.rescued }
    },

    async getMemoryHealth({ userId }) {
      const rows = await rpc<MemoryHealthRow[]>('get_memory_health', 'getMemoryHealth', { p_user_id: userId })
      const r = rows[0]
      return {
        avgRecognitionStability: round2(r.avg_recognition_stability),
        recognitionSampleSize: r.recognition_sample_size,
        avgRecallStability: round2(r.avg_recall_stability),
        recallSampleSize: r.recall_sample_size,
        avgOverallStability: round2(r.avg_overall_stability),
        overallSampleSize: r.overall_sample_size,
      }
    },

    async getReviewLatencyStats({ userId }) {
      const rows = await rpc<LatencyStatsRow[]>('get_review_latency_stats', 'getReviewLatencyStats', { p_user_id: userId })
      const r = rows[0]
      return { currentWeekMs: r.current_week_ms, priorWeekMs: r.prior_week_ms }
    },

    async getRecallAccuracyByDirection({ userId }) {
      const rows = await rpc<RecallAccuracyRow[]>('get_recall_accuracy_by_direction', 'getRecallAccuracyByDirection', {
        p_user_id: userId,
      })
      const r = rows[0]
      return {
        recognitionCorrect: r.recognition_correct,
        recognitionTotal: r.recognition_total,
        recallCorrect: r.recall_correct,
        recallTotal: r.recall_total,
      }
    },

    async getVulnerableCapabilities({ userId, limit = 10 }) {
      const rows = await rpc<VulnerableCapabilityRow[]>('get_vulnerable_capabilities', 'getVulnerableCapabilities', {
        p_user_id: userId,
        p_limit: limit,
      })
      return rows.map(r => ({
        capabilityId: r.capability_id,
        canonicalKey: r.canonical_key,
        itemId: r.item_id,
        baseText: r.base_text,
        meaning: r.meaning,
        lapseCount: r.lapse_count,
        consecutiveFailureCount: r.consecutive_failure_count,
      }))
    },

    async getReviewForecast({ userId, days = 14, timezone }) {
      const rows = await rpc<ForecastRow[]>('get_review_forecast', 'getReviewForecast', {
        p_user_id: userId,
        p_days: days,
        p_timezone: timezone,
      })
      return rows.map(r => ({ date: r.forecast_date, count: r.count }))
    },

    async getStudyDaysCount({ userId, weekStartUtc, weekEndUtc, timezone }) {
      const data = await rpc<number | null>('get_study_days_count', 'getStudyDaysCount', {
        p_user_id: userId,
        p_week_start_utc: weekStartUtc,
        p_week_end_utc: weekEndUtc,
        p_timezone: timezone,
      })
      return data ?? 0
    },

    async getRecallStatsForWeek({ userId, weekStartUtc, weekEndUtc }) {
      const rows = await rpc<RecallAccuracyRow[]>('get_recall_stats_for_week', 'getRecallStatsForWeek', {
        p_user_id: userId,
        p_week_start_utc: weekStartUtc,
        p_week_end_utc: weekEndUtc,
      })
      const r = rows[0]
      return {
        recognitionCorrect: r.recognition_correct,
        recognitionTotal: r.recognition_total,
        recallCorrect: r.recall_correct,
        recallTotal: r.recall_total,
      }
    },

    async getUsableVocabularyGain({ userId, weekStartUtc, weekEndUtc }) {
      const data = await rpc<number | null>('get_usable_vocabulary_gain', 'getUsableVocabularyGain', {
        p_user_id: userId,
        p_week_start_utc: weekStartUtc,
        p_week_end_utc: weekEndUtc,
      })
      return data ?? 0
    },

    async getOverdueCount({ userId, timezone }) {
      const data = await rpc<number | null>('get_overdue_count', 'getOverdueCount', {
        p_user_id: userId,
        p_timezone: timezone,
      })
      return data ?? 0
    },

    async getCurrentStreakDays({ userId, timezone }) {
      const data = await rpc<number | null>('get_current_streak_days', 'getCurrentStreakDays', {
        p_user_id: userId,
        p_timezone: timezone,
      })
      return data ?? 0
    },
  }
}

export const learnerProgressService: LearnerProgressService = createLearnerProgressService(supabase)
