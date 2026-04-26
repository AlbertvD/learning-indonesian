const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_user_jwt' }, 401)
  }

  const body = await request.json().catch(() => null)
  const plan = body?.plan
  if (!plan || typeof plan !== 'object') {
    return jsonResponse({ error: 'missing_commit_plan' }, 400)
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: serviceRoleKey,
    },
  })
  if (!userResponse.ok) {
    return jsonResponse({ error: 'invalid_user_jwt' }, 401)
  }

  const user = await userResponse.json()
  if (user?.id !== plan.userId) {
    return jsonResponse({ error: 'user_mismatch' }, 403)
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/commit_capability_answer_report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
    },
    body: JSON.stringify({ p_command: plan }),
  })

  const result = await rpcResponse.json().catch(() => null)
  if (!rpcResponse.ok) {
    return jsonResponse({ error: 'commit_rpc_failed', details: result }, rpcResponse.status)
  }

  return jsonResponse(result)
})
