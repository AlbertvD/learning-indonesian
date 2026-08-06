import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pins the cookie attributes `src/lib/supabase.ts` hands to createBrowserClient.
//
// Why this file exists: on 2026-07-31 the `.duin.home` cookie pin was removed to
// unblock hosting off the homelab, but it was removed by deleting the WHOLE
// cookieOptions object. @supabase/ssr then falls back to DEFAULT_COOKIE_OPTIONS
// (path + sameSite + httpOnly + maxAge, but no `secure`), so the session JWT
// cookie silently lost its Secure attribute. Nothing caught it — there was no
// test on this module and no health check covers cookie flags.
//
// The client is constructed at module-eval time, so the assertions read the
// options captured from that call rather than poking at a built client.

const clientStub = () => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(),
  },
})

const createBrowserClient = vi.fn(clientStub)

vi.mock('@supabase/ssr', () => ({ createBrowserClient }))

/** Re-evaluates the module and returns the third arg passed to createBrowserClient. */
async function loadClientOptions(): Promise<Record<string, any>> {
  vi.resetModules()
  createBrowserClient.mockClear()
  await import('@/lib/supabase')
  expect(createBrowserClient).toHaveBeenCalledTimes(1)
  return (createBrowserClient.mock.calls[0] as any[])[2]
}

describe('supabase browser client cookie options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks the session cookie Secure', async () => {
    const { cookieOptions } = await loadClientOptions()

    // The regression guard. Without this the auth JWT is sent over plaintext
    // HTTP to the same host — and HSTS only protects visitors who have already
    // completed one HTTPS visit.
    expect(cookieOptions?.secure).toBe(true)
  })

  it('leaves the cookie host-only so it survives any deployment origin', async () => {
    const { cookieOptions } = await loadClientOptions()

    // A Domain attribute that doesn't match the serving origin is silently
    // discarded by the browser, which presents as "logs in, instantly logged
    // out". Host-only works on localhost, *.pages.dev, a custom domain and the
    // homelab container alike.
    expect(cookieOptions).not.toHaveProperty('domain')
  })

  it('keeps path and sameSite explicit rather than inherited', async () => {
    const { cookieOptions } = await loadClientOptions()

    // These happen to match @supabase/ssr's defaults today. Asserting them
    // means a future defaults change is a visible test failure rather than a
    // silent behaviour shift in how the session cookie is scoped and sent.
    expect(cookieOptions?.path).toBe('/')
    expect(cookieOptions?.sameSite).toBe('lax')
  })

  it('pins the auth storage key', async () => {
    const { auth } = await loadClientOptions()

    // Changing this orphans every existing session cookie at once.
    expect(auth?.storageKey).toBe('sb-supabase-auth-token')
  })
})
