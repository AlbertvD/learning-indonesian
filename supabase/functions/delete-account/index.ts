// supabase/functions/delete-account/index.ts
//
// Self-serve account erasure (GDPR Art. 17). Verifies the caller's JWT via
// GoTrue /auth/v1/user, then deletes the user via the GoTrue admin API
// DELETE /auth/v1/admin/users/{id} with the service key. Deleting the
// auth.users row triggers every ON DELETE CASCADE in scripts/migration.sql
// (see docs/plans/2026-07-02-gdpr-erasure-retention.md §1.2), wiping all
// learner data in one Postgres-native operation. error_logs +
// capability_resolution_failure_events survive with user_id nulled (SET NULL).
//
// Modeled on commit-capability-answer-report/index.ts (JWT verify) and
// signup-with-invite/index.ts (GoTrue admin fetch). Consumes NO invite code.
// Idempotent: a second call after the user is gone returns 200 (see §1.6).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
  }

  // Body is optional; if a userId is supplied it must match the JWT subject.
  const body = await request.json().catch(() => null)
  const claimedUserId = isRecord(body) && typeof body.userId === 'string' ? body.userId : null

  // 1. Verify the caller's JWT — the JWT subject is the sole delete target.
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: serviceRoleKey },
  })
  if (!userResponse.ok) {
    return publicReject(401, 'invalid_user_jwt')
  }
  const user = await userResponse.json()
  const userId = typeof user?.id === 'string' ? user.id : null
  if (!userId) {
    return publicReject(401, 'invalid_user_jwt')
  }
  if (claimedUserId && claimedUserId !== userId) {
    return publicReject(403, 'user_mismatch')
  }

  // 2. Delete via GoTrue admin API. 404 = already gone = idempotent success.
  // should_soft_delete: false is LOAD-BEARING (data-architect G1): a soft
  // delete would ban/scramble the auth.users row WITHOUT removing it, so the
  // ON DELETE CASCADE / SET NULL clauses never fire and every indonesian.*
  // learner row silently survives while the client sees { ok: true }. Hard
  // delete must additionally be proven at build time with a throwaway user
  // (see Testing) — never assumed from the flag alone.
  const deleteResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ should_soft_delete: false }),
    },
  )
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const detail = await deleteResponse.text().catch(() => '')
    console.error('gotrue_admin_delete_user_failed', { status: deleteResponse.status, detail })
    return publicReject(500, 'delete_failed')
  }

  return jsonResponse({ ok: true })
})
