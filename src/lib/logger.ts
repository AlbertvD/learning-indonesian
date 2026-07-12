// src/lib/logger.ts
import { supabase } from '@/lib/supabase'

interface LogErrorParams {
  page: string
  action: string
  error: unknown
}

// error_logs_insert RLS policy in scripts/migration.sql caps page/action at 200
// chars and error_message at 4000 — a longer value silently fails to insert
// otherwise. MAX_SANITIZED_MESSAGE_LENGTH (below) truncates well under that
// 4000 ceiling for its own reason (log-table hygiene), not to satisfy the RLS cap.
const MAX_PAGE_ACTION_LENGTH = 200

// 2026-07-11 prod-ready audit ("ERROR-LOG SCRUBBING"): error.message can embed
// whatever the failing call's request/response carried — a leaked Supabase JWT,
// an Authorization header, or a query-string apikey/password — and while
// error_logs has no read policy for end users (admin-only via Studio/psql),
// the raw text still shouldn't be persisted. sanitizeErrorMessage redacts known
// secret shapes before anything is written; the 500-char cap (well under the
// 4000 the RLS policy allows) is a hard backstop for whatever the specific
// patterns miss.
const MAX_SANITIZED_MESSAGE_LENGTH = 500

// JWTs (Supabase anon/service-role keys, access tokens) are 2-or-3 dot-
// separated base64url segments starting with the "eyJ" (base64 of `{"`) header
// prefix. `{1,2}` also matches a bare two-segment header.payload leak (no
// trailing signature) as well as the full three-part token.
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}/g
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi
const SECRET_QUERY_PARAM_PATTERN = /([?&](?:apikey|api_key|password)=)[^&\s'"]+/gi
// Catch-all for any other long unbroken base64-ish blob (a signed URL token, a
// raw key not shaped like the patterns above) — legitimate log text never
// needs a 100+-char run with no whitespace/punctuation breaks.
const LONG_BASE64ISH_RUN_PATTERN = /[A-Za-z0-9+/_-]{100,}={0,2}/g

export function sanitizeErrorMessage(rawMessage: string): string {
  const sanitized = rawMessage
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]')
    .replace(SECRET_QUERY_PARAM_PATTERN, '$1[REDACTED]')
    .replace(LONG_BASE64ISH_RUN_PATTERN, '[REDACTED]')
  return sanitized.slice(0, MAX_SANITIZED_MESSAGE_LENGTH)
}

export async function logError({ page, action, error }: LogErrorParams): Promise<void> {
  const rawMessage = error instanceof Error
    ? error.message
    : (error as any)?.message
      ? String((error as any).message)
      : String(error)
  // Error code/name are kept intact (never scrubbed) — only the free-text
  // message can carry an interpolated secret.
  const message = sanitizeErrorMessage(rawMessage)
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
