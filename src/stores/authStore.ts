// src/stores/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/auth'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

// Stored outside the store so initialize() can be called multiple times safely
// (e.g. in tests) without leaking duplicate listeners.
let authSubscription: { unsubscribe: () => void } | null = null

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    // Unsubscribe any existing listener before registering a new one.
    authSubscription?.unsubscribe()

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const isAdmin = await checkAdmin(session.user.id)
      set({
        user: session.user,
        profile: toProfile(session.user, isAdmin),
        loading: false,
      })
    } else {
      set({ loading: false })
    }

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // Use setTimeout(0) to avoid Supabase auth deadlock when fetching
        // user data immediately after sign-in inside onAuthStateChange.
        setTimeout(async () => {
          // Upsert profile on every sign-in so display_name stays current.
          // This also handles users migrated from the old app who sign in
          // but never signed up through this app.
          await supabase
            .schema('indonesian')
            .from('profiles')
            .upsert(
              { id: session.user!.id, display_name: session.user!.user_metadata?.full_name ?? null },
              { onConflict: 'id' }
            )
          const isAdmin = await checkAdmin(session.user!.id)
          set({ user: session.user, profile: toProfile(session.user!, isAdmin) })
        }, 0)
      } else {
        set({ user: null, profile: null })
      }
    })
    authSubscription = data.subscription
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))

async function checkAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .schema('indonesian')
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  return !!data
}

function toProfile(user: User, isAdmin: boolean): UserProfile {
  return {
    id: user.id,
    email: user.email!,
    fullName: user.user_metadata?.full_name ?? null,
    isAdmin,
  }
}
