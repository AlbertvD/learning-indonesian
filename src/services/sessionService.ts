// src/services/sessionService.ts
//
// Session-completion write. Under retirement #5 the learning_sessions row is
// materialised lazily from answers; this marks it COMPLETED when the learner
// finishes their full session (ExperiencePlayer.onComplete). The streak + streak
// bar count completed sessions, not raw answers, so a single tap no longer keeps
// a streak. Backed by the security-definer mark_session_complete RPC (scoped to
// the caller's own row via auth.uid()).
import { supabase } from '@/lib/supabase'

export async function markSessionComplete(sessionId: string): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .rpc('mark_session_complete', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
}
