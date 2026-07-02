// src/lib/logger.ts
import { supabase } from '@/lib/supabase'

interface LogErrorParams {
  page: string
  action: string
  error: unknown
}

// Must mirror the error_logs_insert RLS policy caps in scripts/migration.sql —
// a message/page/action longer than these silently fails to insert otherwise.
const MAX_MESSAGE_LENGTH = 4000
const MAX_PAGE_ACTION_LENGTH = 200

export async function logError({ page, action, error }: LogErrorParams): Promise<void> {
  const rawMessage = error instanceof Error
    ? error.message
    : (error as any)?.message
      ? String((error as any).message)
      : String(error)
  const message = rawMessage.slice(0, MAX_MESSAGE_LENGTH)
  const code = (error as { code?: string })?.code ?? null

  // Fire-and-forget — never throws
  let userId: string | null = null
  try {
    userId = (await supabase.auth.getUser()).data.user?.id ?? null
  } catch {
    // Auth unavailable — log without user_id
  }

  supabase
    .schema('indonesian')
    .from('error_logs')
    .insert({
      user_id: userId,
      page: page.slice(0, MAX_PAGE_ACTION_LENGTH),
      action: action.slice(0, MAX_PAGE_ACTION_LENGTH),
      error_message: message,
      error_code: code,
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error('[logger] Failed to write error log:', dbErr.message)
    })
}
