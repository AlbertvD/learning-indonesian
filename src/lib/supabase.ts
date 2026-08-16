// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

/**
 * Is the app being served from a plaintext localhost origin (i.e. `bun run dev`)?
 * The ONLY case where the session cookie drops its Secure attribute — see the
 * cookieOptions comment below for why Safari makes that necessary, and why the
 * check is scoped to localhost rather than to "http" in general.
 */
function isPlaintextLocalhost(): boolean {
  if (typeof window === 'undefined') return false // SSR/build: assume secure
  const { protocol, hostname } = window.location
  if (protocol !== 'http:') return false
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

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
    // `secure` is TRUE everywhere except a plaintext localhost origin.
    //
    // This used to be an unconditional `true`, justified in a comment claiming
    // "browsers treat http://localhost as a trustworthy origin and accept
    // Secure cookies there". Chrome (89+) and Firefox do. **WebKit does not** —
    // Safari never implemented that exception and silently DISCARDS a Secure
    // cookie set over http. Since @supabase/ssr keeps the entire session in
    // that cookie, the effect was that signing in on Safari at
    // http://localhost:5173 appeared to work and then wasn't stored at all:
    // every subsequent request went out as `anon`, content tables returned
    // zero rows with no error, and even logError's own insert was refused
    // ("permission denied for table error_logs"). The UI still showed the user
    // as logged in, because the profile panel reads the in-memory token rather
    // than the server. Diagnosed 2026-08-16 from a dev-console capture:
    // `engine=Safari origin=http://localhost:5173 cookieNames=(none)`.
    //
    // The carve-out FAILS CLOSED — it is scoped to localhost, not to "http".
    // A plaintext deployment on a real hostname keeps Secure, so the cookie is
    // withheld (visible breakage) instead of the JWT crossing a network in the
    // clear (silent leak). Production is https and unaffected; the GDPR audit's
    // no-cookie-banner reasoning (docs/audits/2026-07-02-gdpr-pii-audit.md:86)
    // rests on the production flag, which is unchanged.
    cookieOptions: {
      path: '/',
      sameSite: 'lax' as const,
      secure: !isPlaintextLocalhost(),
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
