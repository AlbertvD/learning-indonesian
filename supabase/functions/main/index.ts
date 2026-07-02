// supabase/functions/main/index.ts
//
// Router entrypoint for the self-hosted edge runtime (added 2026-07-02 when
// signup-with-invite became the second function). The container previously ran
// --main-service pointed straight at commit-capability-answer-report, which made
// EVERY /functions/v1/* path execute that one function regardless of name.
//
// Kong strips /functions/v1/ (kong.yml functions-v1-all, strip_path: true), so
// the first path segment here IS the function name. Modeled on the canonical
// supabase docker/volumes/functions/main example.

Deno.serve(async (request: Request) => {
  const url = new URL(request.url)
  const serviceName = url.pathname.split('/')[1]

  if (!serviceName || serviceName === 'main') {
    return new Response(JSON.stringify({ error: 'missing_function_name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const servicePath = `/home/deno/functions/${serviceName}`
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      cpuTimeSoftLimitMs: 10_000,
      cpuTimeHardLimitMs: 20_000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(request)
  } catch (error) {
    console.error(`worker_boot_failed for ${serviceName}`, error)
    return new Response(JSON.stringify({ error: 'function_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
