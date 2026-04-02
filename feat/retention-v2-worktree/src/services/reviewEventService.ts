// src/services/reviewEventService.ts
import { supabase } from '@/lib/supabase'
import type { ReviewEvent } from '@/types/learning'

export const reviewEventService = {
  async logReviewEvent(event: Omit<ReviewEvent, 'id' | 'created_at'>): Promise<ReviewEvent> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .insert({ ...event, created_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getRecentEvents(userId: string, limit = 50): Promise<ReviewEvent[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },

  async getEventsBySession(sessionId: string): Promise<ReviewEvent[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  }
}
