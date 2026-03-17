// src/services/leaderboardService.ts
import { supabase } from '@/lib/supabase'

export type LeaderboardMetric = 'total_seconds_spent' | 'lessons_completed' | 'vocabulary_count' | 'days_active'

export interface LeaderboardEntry {
  user_id: string
  display_name: string | null
  current_level: string
  vocabulary_count: number
  lessons_completed: number
  total_seconds_spent: number
  days_active: number
}

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
