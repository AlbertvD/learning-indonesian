// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { storageKey: 'sb-supabase-auth-token' },
    // No explicit cookieOptions: the session cookie is HOST-ONLY, scoped to
    // whatever origin the app is served from.
    //
    // Until 2026-07-31 this pinned `domain: '.duin.home'` so the cookie would
    // be shared across homelab subdomains, for a future SSO with family-hub
    // (CLAUDE.md § Supabase Connection). That never shipped — family-hub stayed
    // on localStorage and is now unused — so the shared-domain cookie bought
    // nothing and actively blocked hosting anywhere else: a browser silently
    // DROPS a cookie whose Domain attribute doesn't match the page's origin, so
    // the app would appear to log in and then instantly be logged out on any
    // domain that isn't *.duin.home.
    //
    // Host-only is also simply correct now: the cloud deployment is a single
    // origin, and it removes the DEV special-case that existed only because
    // localhost rejected the .duin.home cookie. Works unchanged on localhost,
    // *.pages.dev, a custom domain, and the existing homelab container.
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
