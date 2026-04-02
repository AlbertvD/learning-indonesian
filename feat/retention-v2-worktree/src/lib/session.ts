// src/lib/session.ts
import { supabase } from '@/lib/supabase'
import type { SessionType } from '@/types/learning'

export async function startSession(userId: string, type: SessionType): Promise<string> {
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
  const { error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}
