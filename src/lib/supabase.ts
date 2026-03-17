// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
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
