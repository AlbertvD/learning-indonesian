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
  updateDisplayName: (name: string) => Promise<void>
  updateLanguage: (lang: 'nl' | 'en') => Promise<void>
}

// Stored outside the store so initialize() can be called multiple times safely
// (e.g. in tests) without leaking duplicate listeners.
let authSubscription: { unsubscribe: () => void } | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    // Unsubscribe any existing listener before registering a new one.
    authSubscription?.unsubscribe()

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const [{ displayName, language }, isAdmin] = await Promise.all([
        loadProfileData(session.user.id),
        checkAdmin(session.user.id),
      ])
      set({
        user: session.user,
        profile: toProfile(session.user, isAdmin, displayName, language),
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
          // Insert only — do NOT overwrite existing display_name or language.
          // ignoreDuplicates: true means existing data is never overwritten by
          // auth metadata on subsequent sign-ins.
          await supabase
            .schema('indonesian')
            .from('profiles')
            .upsert(
              { id: session.user!.id, display_name: session.user!.user_metadata?.full_name ?? null },
              { onConflict: 'id', ignoreDuplicates: true }
            )
          const [{ displayName, language }, isAdmin] = await Promise.all([
            loadProfileData(session.user!.id),
            checkAdmin(session.user!.id),
          ])
          set({ user: session.user, profile: toProfile(session.user!, isAdmin, displayName, language) })
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

  updateDisplayName: async (name) => {
    const user = get().user
    if (!user) return
    const { error } = await supabase
      .schema('indonesian')
      .from('profiles')
      .upsert({ id: user.id, display_name: name.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
    set((state) => ({
      profile: state.profile ? { ...state.profile, fullName: name.trim() || null } : null,
    }))
  },

  updateLanguage: async (lang) => {
    const user = get().user
    if (!user) return
    const { error } = await supabase
      .schema('indonesian')
      .from('profiles')
      .upsert({ id: user.id, language: lang, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
    set((state) => ({
      profile: state.profile ? { ...state.profile, language: lang } : null,
    }))
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

async function loadProfileData(userId: string): Promise<{ displayName: string | null; language: 'nl' | 'en' }> {
  const { data } = await supabase
    .schema('indonesian')
    .from('profiles')
    .select('display_name, language')
    .eq('id', userId)
    .maybeSingle()
  return {
    displayName: data?.display_name ?? null,
    language: (data?.language as 'nl' | 'en') ?? 'nl',
  }
}

function toProfile(user: User, isAdmin: boolean, displayName: string | null, language: 'nl' | 'en'): UserProfile {
  return {
    id: user.id,
    email: user.email!,
    fullName: displayName,
    language,
    isAdmin,
  }
}
