// src/lib/analytics/engagement/index.ts
//
// The `engagement` sub-module of `lib/analytics/` — "does the learner show up?".
// Read-only (target-architecture.md:644): it derives Practice Time from
// `learning_sessions`, it never writes. Practice Time is exercises-only — only
// the capability/review path produces a `learning_sessions` row (CONTEXT.md →
// Practice Time).
//
// Slice 1 (#206) exposes only minutes-this-week, the tracer-bullet metric.
// Slice 2 (#207) thickens this to streak / minutes-per-day / time-per-session.
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
  minutes_this_week?: number | null
}

export interface Engagement {
  /** Minutes of exercise practice in the current (timezone-local) week. */
  practiceMinutesThisWeek(userId: string, timezone: string): Promise<number>
}

export function createEngagement(client: SchemaClient): Engagement {
  return {
    async practiceMinutesThisWeek(userId, timezone) {
      const { data, error } = await client
        .schema('indonesian')
        .rpc('get_practice_time', {
          p_user_id: userId,
          p_timezone: timezone,
        })
      if (error) throw new Error(error.message)
      return (data as PracticeTimeRow | null)?.minutes_this_week ?? 0
    },
  }
}

export const engagement: Engagement = createEngagement(
  supabase as unknown as SchemaClient,
)
