// src/lib/session.ts
import { supabase } from '@/lib/supabase'
import type { SessionType } from '@/types/learning'

export async function startSession(userId: string, type: SessionType): Promise<string> {
  // Auto-complete any incomplete sessions for this user (per-user cleanup)
  const { data: incompleteSessions, error: fetchError } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .select('id, started_at')
    .eq('user_id', userId)
    .is('ended_at', null)

  if (fetchError) throw fetchError

  // Finalize each incomplete session with its elapsed time
  if (incompleteSessions && incompleteSessions.length > 0) {
    for (const session of incompleteSessions) {
      // Find the latest review event for this specific session
      const { data: latestReview } = await supabase
        .schema('indonesian')
        .from('review_events')
        .select('created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const endedAt = latestReview?.created_at || session.started_at

      const { error: updateError } = await supabase
        .schema('indonesian')
        .from('learning_sessions')
        .update({ ended_at: endedAt })
        .eq('id', session.id)

      if (updateError) throw updateError
    }
  }

  // Create new session
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .insert({ user_id: userId, session_type: type, started_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function endSession(sessionId: string): Promise<void> {
  const now = new Date().toISOString()

  // duration_seconds is a generated column (ended_at - started_at), so just set ended_at
  const { error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .update({ ended_at: now })
    .eq('id', sessionId)
  if (error) throw error
}
