// src/lib/analytics/memory/index.ts
//
// The `memory` sub-module of `lib/analytics/` — "how durable is what the learner
// knows?". Read-only (target-architecture.md:644): it derives the durability
// curve from the append-only `capability_review_events` log, it never writes.
//
// Revived per docs/plans/2026-06-30-voortgang-groei-dimension-design.md as the
// learner-facing home the 2026-06-11 redesign said `memory` lacked: average FSRS
// stability reconstructed per week-end (the over-time twin of the current-snapshot
// get_memory_health). Scoped to `stabilitySeries` only — single file mirroring the
// `engagement` precedent (createX + default instance, no adapter.ts split).
//
// Consumed by DIRECT import (`@/lib/analytics/memory`), NOT via the analytics
// barrel — matching how the sibling `mastery` reader is imported (architect W3).
import { supabase } from '@/lib/supabase'

interface SchemaClient {
  schema(schema: 'indonesian'): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }>
  }
}

interface StabilityWeekRow {
  week_start: string
  avg_stability_days: number | null
  sample_size: number
}

/** One week-end's average memory strength (FSRS stability, in days). */
export interface StabilityWeek {
  /** Timezone-local week-start date, `YYYY-MM-DD` (the x-axis label). */
  weekStart: string
  /**
   * Mean last-known stability (days) across the learner's reviewed capabilities
   * as of that week-end. `null` for weeks before the first review (sample of 0).
   */
  avgStabilityDays: number | null
  /** How many capabilities contributed (0 = no reviews yet as of that week-end). */
  sampleSize: number
}

export interface Memory {
  /**
   * Average memory strength per timezone-local week-end for the last `weeks`
   * weeks, chronological. Each point is a cumulative snapshot (last-known state
   * per cap as of that week-end), so it trends like the current get_memory_health
   * number over time.
   */
  stabilitySeries(userId: string, timezone: string, weeks: number): Promise<StabilityWeek[]>
}

export function createMemory(client: SchemaClient): Memory {
  return {
    async stabilitySeries(userId, timezone, weeks) {
      const { data, error } = await client
        .schema('indonesian')
        .rpc('get_stability_series', {
          p_user_id: userId,
          p_timezone: timezone,
          p_weeks: weeks,
        })
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as StabilityWeekRow[]
      return rows.map((r) => ({
        weekStart: r.week_start,
        avgStabilityDays: r.avg_stability_days == null ? null : Number(r.avg_stability_days),
        sampleSize: r.sample_size ?? 0,
      }))
    },
  }
}

export const memory: Memory = createMemory(supabase as unknown as SchemaClient)
