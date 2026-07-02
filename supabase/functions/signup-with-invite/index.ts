// supabase/functions/signup-with-invite/index.ts
//
// Invite-gated signup. Replaces the public `supabase.auth.signUp` call in
// Register.tsx (item 1 of the pre-cloud-hardening plan). Flow:
//   1. per-IP rate limit
//   2. redeem the invite code (atomic — fails fast on invalid/exhausted)
//   3. create the user via the GoTrue admin API (bypasses public signup)
//   4. on user-creation failure, restore the invite code so it isn't burned
//
// Modeled on supabase/functions/commit-capability-answer-report/index.ts —
// same jsonResponse/isRecord/safeString idioms and service-role env vars.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

interface SignupRequest {
  email: string
  password: string
  fullName: string
  inviteCode: string
}

function isSignupRequest(value: unknown): value is SignupRequest {
  if (!isRecord(value)) return false
  return typeof value.email === 'string' && value.email.length > 0
    && typeof value.password === 'string' && value.password.length > 0
    && typeof value.fullName === 'string' && value.fullName.length > 0
    && typeof value.inviteCode === 'string' && value.inviteCode.length > 0
}

// ── Rate limiting ────────────────────────────────────────────────────────
// Per-instance, best-effort: a Map living in this function's process memory,
// reset on cold start / restart. It does NOT protect against distributed
// abuse (many source IPs, or the runtime scaling to multiple instances).
// Real rate limiting for a customer-facing preview belongs at the gateway
// (a Kong plugin or Traefik middleware), not in application code — this is
// a cheap first line of defense only.
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return 'unknown'
  const [first] = forwarded.split(',')
  return first?.trim() || 'unknown'
}

// ── Invite code RPCs ─────────────────────────────────────────────────────

async function redeemInviteCode(supabaseUrl: string, serviceRoleKey: string, code: string): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/redeem_invite_code`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
    },
    body: JSON.stringify({ p_code: code }),
  })
  if (!response.ok) throw new Error(`redeem_invite_code_failed:${response.status}`)
  const result = await response.json().catch(() => null)
  return result === true
}

async function restoreInviteCode(supabaseUrl: string, serviceRoleKey: string, code: string): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/restore_invite_code`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
        'Accept-Profile': 'indonesian',
        'Content-Profile': 'indonesian',
      },
      body: JSON.stringify({ p_code: code }),
    })
    if (!response.ok) {
      console.error('restore_invite_code_failed', { status: response.status })
    }
  } catch (error) {
    // Best-effort — a stuck decremented code is an admin-fixable annoyance
    // (re-issue a code), not worth failing the caller's response over.
    console.error('restore_invite_code_error', error)
  }
}

// ── GoTrue admin user creation ───────────────────────────────────────────

type CreateUserResult = { ok: true } | { ok: false; code: 'email_taken' | 'signup_failed' }

async function createGoTrueUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
  password: string,
  fullName: string,
): Promise<CreateUserResult> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  })
  if (response.ok) return { ok: true }

  const errorBody = await response.json().catch(() => null)
  const message = isRecord(errorBody)
    ? String(errorBody.msg ?? errorBody.error_description ?? errorBody.error_code ?? errorBody.error ?? '')
    : ''
  const isEmailTaken = /already.*registered|already.*exists|email_exists|user_already_exists/i.test(message)

  console.error('gotrue_admin_create_user_failed', { status: response.status, message })
  return { ok: false, code: isEmailTaken ? 'email_taken' : 'signup_failed' }
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  if (isRateLimited(clientIp(request))) {
    return publicReject(429, 'rate_limited')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return publicReject(500, 'server_not_configured')
  }

  const body = await request.json().catch(() => null)
  if (!isSignupRequest(body)) {
    return publicReject(400, 'invalid_request')
  }
  const { email, password, fullName, inviteCode } = body

  let redeemed: boolean
  try {
    redeemed = await redeemInviteCode(supabaseUrl, serviceRoleKey, inviteCode)
  } catch (error) {
    console.error('redeem_invite_code_error', error)
    return publicReject(500, 'invite_check_failed')
  }
  if (!redeemed) {
    return publicReject(403, 'invalid_invite_code')
  }

  const userResult = await createGoTrueUser(supabaseUrl, serviceRoleKey, email, password, fullName)
  if (!userResult.ok) {
    await restoreInviteCode(supabaseUrl, serviceRoleKey, inviteCode)
    const status = userResult.code === 'email_taken' ? 409 : 500
    return publicReject(status, userResult.code)
  }

  return jsonResponse({ ok: true })
})
