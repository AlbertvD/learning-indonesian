// src/lib/logger.ts
import { supabase } from '@/lib/supabase'

interface LogErrorParams {
  page: string
  action: string
  error: unknown
}

export async function logError({ page, action, error }: LogErrorParams): Promise<void> {
  const message = error instanceof Error
    ? error.message
    : (error as any)?.message
      ? String((error as any).message)
      : String(error)
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
      page,
      action,
      error_message: message,
      error_code: code,
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error('[logger] Failed to write error log:', dbErr.message)
    })
}
