// src/lib/firstRun.ts — "Aan de slag" first-run checklist state (desktop
// program slice 3, docs/plans/2026-07-03-desktop-program-design.md §Slice 3).
//
// Two of the three steps are per-device localStorage flags by design — no
// persisted signal exists for them (the lesson reader is passive per ADR 0005,
// and lessons 1-3 are auto-activated at signup so activation rows are
// already-true for every new account). Worst case on a device switch: a step
// re-shows. Step ② reads real account state (a completed learning_sessions
// row). Zero Supabase changes.

import { supabase } from '@/lib/supabase'

export const FIRST_LESSON_OPENED_KEY = 'first_lesson_opened'
export const ONTDEK_VISITED_KEY = 'ontdek_visited'
// Uitspraak day-one hook (review UP6): a fourth per-device flag, same
// mechanism as ONTDEK_VISITED_KEY — set on first visit to /pronunciation.
export const PRONUNCIATION_VISITED_KEY = 'pronunciation_visited'

export function readFirstRunFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

export function setFirstRunFlag(key: string): void {
  try {
    localStorage.setItem(key, 'true')
  } catch {
    // private-mode storage failure just re-shows the step later
  }
}

/** Step ②: has this account ever completed a session? (learning_sessions rows
 * are lazily materialised on the first answer; completed_at is set by the
 * mark_session_complete RPC — the same signal the streak uses.) */
export async function hasCompletedSession(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_sessions')
    .select('id')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}
