// src/lib/session.ts
import { supabase, getAccessTokenSync } from '@/lib/supabase'
import type { SessionType } from '@/types/learning'

// Sessions older than this without ended_at are treated as definitely abandoned
// and safe to finalize when a new session starts. Anything fresher is left
// alone so an in-flight unmount cleanup or beacon doesn't get clobbered.
const STALE_SESSION_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

// Maximum duration we attribute to an abandoned session that has no review
// events. Caps the runaway 7-hour ghost sessions from tabs left open without
// any pagehide signal reaching the DB.
const MAX_INFERRED_DURATION_MS = 60 * 60 * 1000 // 1 hour

export async function startSession(userId: string, type: SessionType): Promise<string> {
  // Finalize obviously-abandoned sessions for this user. Only touch sessions
  // older than the stale threshold so we don't race with the previous page's
  // unmount/beacon that may still be in flight.
  const cutoffIso = new Date(Date.now() - STALE_SESSION_THRESHOLD_MS).toISOString()
  const { data: incompleteSessions, error: fetchError } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .select('id, started_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .lt('started_at', cutoffIso)

  if (fetchError) throw fetchError

  if (incompleteSessions && incompleteSessions.length > 0) {
    for (const session of incompleteSessions) {
      // Prefer the latest review event timestamp (true last-activity signal).
      // Otherwise cap the inferred duration so a tab left open overnight
      // doesn't show as 12h of study.
      const { data: latestReview } = await supabase
        .schema('indonesian')
        .from('review_events')
        .select('created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const startedMs = new Date(session.started_at).getTime()
      const cappedEnd = new Date(Math.min(Date.now(), startedMs + MAX_INFERRED_DURATION_MS)).toISOString()
      const endedAt = latestReview?.created_at || cappedEnd

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

// Fire-and-forget session close that survives page unload. Used by pagehide
// listeners on session pages so navigating away (closing the tab, switching
// apps on mobile, etc.) reliably writes ended_at.
//
// Uses fetch() with keepalive:true rather than navigator.sendBeacon because
// beacon only supports POST and we need PATCH against PostgREST. Modern
// browsers (Safari 13+, Chrome 66+, Firefox 79+) survive unload with this.
export function endSessionBeacon(sessionId: string): void {
  const token = getAccessTokenSync()
  if (!token) return

  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/learning_sessions?id=eq.${sessionId}`
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY
  void fetch(url, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
      'Authorization': `Bearer ${token}`,
      'apikey': apikey,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ended_at: new Date().toISOString() }),
  }).catch(() => {
    // Best-effort. The startSession sweep finalizes any session left open
    // for >1h, so a missed beacon doesn't leave the row open forever.
  })
}
