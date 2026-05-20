// Lesson activation API — replaces the source-progress state machine retired
// in retirement #6. Per the target architecture, capabilities are eligible
// for new-capability introduction only when their owning lesson is activated
// by the learner. This module is the single point of truth for reads/writes
// of `learner_lesson_activation` rows.
//
// Writes go through the `set_lesson_activation` RPC (SECURITY DEFINER) so the
// table can be SELECT-only for `authenticated` per the defense-in-depth
// pattern from retirement #5.

import { supabase } from '@/lib/supabase'

// Read clients only need .from(...). Write clients (used by
// setLessonActivated) additionally need .rpc(...). Splitting these
// lets callers pass narrower client mocks for read-only paths.
interface SupabaseReadClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

interface SupabaseRpcClient {
  schema(schema: 'indonesian'): {
    rpc(fn: string, args: Record<string, unknown>): any
  }
}

export async function isLessonActivated(
  userId: string,
  lessonId: string,
  client: SupabaseReadClient = supabase,
): Promise<boolean> {
  const { data, error } = await client
    .schema('indonesian')
    .from('learner_lesson_activation')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (error) throw error
  return data != null
}

export async function listActivatedLessons(
  userId: string,
  client: SupabaseReadClient = supabase,
): Promise<Set<string>> {
  const { data, error } = await client
    .schema('indonesian')
    .from('learner_lesson_activation')
    .select('lesson_id')
    .eq('user_id', userId)
  if (error) throw error
  return new Set(((data ?? []) as Array<{ lesson_id: string }>).map(row => row.lesson_id))
}

export async function setLessonActivated(
  userId: string,
  lessonId: string,
  activated: boolean,
  client: SupabaseRpcClient = supabase,
): Promise<void> {
  const { error } = await client
    .schema('indonesian')
    .rpc('set_lesson_activation', {
      p_user_id: userId,
      p_lesson_id: lessonId,
      p_activated: activated,
    })
  if (error) throw error
}
