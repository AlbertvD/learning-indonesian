// src/lib/analytics/engagement/index.ts
//
// The `engagement` sub-module of `lib/analytics/` — "does the learner show up?".
// Read-only (target-architecture.md:644): it derives Practice Time from
// `learning_sessions`, it never writes. Practice Time is exercises-only — only
// the capability/review path produces a `learning_sessions` row (CONTEXT.md →
// Practice Time).
//
// Slice 2 (#207) owns the full Practice Time shape (streak / minutes-today /
// minutes-this-week / time-per-session / active-days / recency); it is the home
// the streak + recency reads folded out of `learnerProgressService`.
import { supabase } from '@/lib/supabase'

interface SchemaClient {
  schema(schema: 'indonesian'): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }>
  }
}

interface PracticeTimeRow {
  streak_days?: number | null
  minutes_today?: number | null
  minutes_this_week?: number | null
  minutes_last_week?: number | null
  minutes_this_month?: number | null
  minutes_last_month?: number | null
  avg_session_minutes?: number | null
  active_days_this_week?: number | null
  last_practice_age_days?: number | null
}

export interface PracticeTime {
  /** Consecutive calendar days with at least one exercise review, up to today. */
  streakDays: number
  /** Exercise minutes today (timezone-local). */
  minutesToday: number
  /** Exercise minutes in the current (timezone-local) week, Monday-based. */
  minutesThisWeek: number
  /** Exercise minutes in the prior week (for the week-over-week delta). */
  minutesLastWeek: number
  /** Exercise minutes in the current calendar month. */
  minutesThisMonth: number
  /** Exercise minutes in the prior calendar month (month-over-month delta). */
  minutesLastMonth: number
  /** Average exercise minutes per session (sessions with non-null duration). */
  avgSessionMinutes: number
  /** Distinct days with exercise practice in the current week. */
  activeDaysThisWeek: number
  /** Calendar-day age of the most recent practice, or null if never. */
  lastPracticeAgeDays: number | null
}

export interface Engagement {
  practiceTime(userId: string, timezone: string): Promise<PracticeTime>
}

const EMPTY: PracticeTime = {
  streakDays: 0,
  minutesToday: 0,
  minutesThisWeek: 0,
  minutesLastWeek: 0,
  minutesThisMonth: 0,
  minutesLastMonth: 0,
  avgSessionMinutes: 0,
  activeDaysThisWeek: 0,
  lastPracticeAgeDays: null,
}

export function createEngagement(client: SchemaClient): Engagement {
  return {
    async practiceTime(userId, timezone) {
      const { data, error } = await client
        .schema('indonesian')
        .rpc('get_practice_time', {
          p_user_id: userId,
          p_timezone: timezone,
        })
      if (error) throw new Error(error.message)
      const row = data as PracticeTimeRow | null
      if (!row) return { ...EMPTY }
      return {
        streakDays: row.streak_days ?? 0,
        minutesToday: row.minutes_today ?? 0,
        minutesThisWeek: row.minutes_this_week ?? 0,
        minutesLastWeek: row.minutes_last_week ?? 0,
        minutesThisMonth: row.minutes_this_month ?? 0,
        minutesLastMonth: row.minutes_last_month ?? 0,
        avgSessionMinutes: row.avg_session_minutes ?? 0,
        activeDaysThisWeek: row.active_days_this_week ?? 0,
        lastPracticeAgeDays: row.last_practice_age_days ?? null,
      }
    },
  }
}

export const engagement: Engagement = createEngagement(
  supabase as unknown as SchemaClient,
)
