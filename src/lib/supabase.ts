// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { storageKey: 'sb-supabase-auth-token' },
    // In dev (localhost), omit cookieOptions entirely — browsers reject cookies
    // with domain=.duin.home when the page is at localhost, silently dropping auth.
    cookieOptions: import.meta.env.DEV ? undefined : {
      domain: '.duin.home',
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
