// src/services/leaderboardService.ts
import { supabase } from '@/lib/supabase'
import type { LeaderboardEntry, LeaderboardMetric } from '@/types/learning'

export const leaderboardService = {
  async getLeaderboard(metric: LeaderboardMetric, limit = 20): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('leaderboard')
      .select('*')
      .order(metric, { ascending: false })
      .limit(limit)
    if (error) throw error
    return data as LeaderboardEntry[]
  },
}
