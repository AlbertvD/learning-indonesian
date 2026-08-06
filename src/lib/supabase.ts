// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { storageKey: 'sb-supabase-auth-token' },
    // The session cookie is HOST-ONLY — no `domain`, so it is scoped to
    // whatever origin serves the app.
    //
    // Until 2026-07-31 this pinned `domain: '.duin.home'` so the cookie would
    // be shared across homelab subdomains, for a future SSO with family-hub
    // (CLAUDE.md § Supabase Connection). That never shipped — family-hub stayed
    // on localStorage and is now unused — so the shared-domain cookie bought
    // nothing and actively blocked hosting anywhere else: a browser silently
    // DROPS a cookie whose Domain attribute doesn't match the page's origin, so
    // the app would appear to log in and then instantly be logged out on any
    // domain that isn't *.duin.home. Works unchanged on localhost, *.pages.dev,
    // a custom domain, and the existing homelab container.
    //
    // All three keys are spelled out rather than left to @supabase/ssr's
    // DEFAULT_COOKIE_OPTIONS, which supplies `path` and `sameSite` but NOT
    // `secure` (@supabase/ssr/dist/main/utils/constants.js; merged at
    // cookies.js:357 as `{...DEFAULT_COOKIE_OPTIONS, ...cookieOptions}`).
    // Dropping the whole object to remove `domain` therefore also strips
    // Secure from the session JWT cookie — briefly the case on 2026-07-31,
    // and what supabaseClient.test.ts now pins. The GDPR audit's
    // no-cookie-banner reasoning cites this flag
    // (docs/audits/2026-07-02-gdpr-pii-audit.md:86).
    //
    // `secure: true` needs no dev carve-out: browsers treat http://localhost as
    // a trustworthy origin and accept Secure cookies there.
    cookieOptions: {
      path: '/',
      sameSite: 'lax' as const,
      secure: true,
    },
  }
)

// Sync access to the current JWT for pagehide/visibilitychange beacons that
// can't await getSession(). Keep in sync via onAuthStateChange below.
let currentAccessToken: string | null = null
export const getAccessTokenSync = (): string | null => currentAccessToken

supabase.auth.getSession().then(({ data }) => {
  currentAccessToken = data.session?.access_token ?? null
})
supabase.auth.onAuthStateChange((_event, session) => {
  currentAccessToken = session?.access_token ?? null
})
