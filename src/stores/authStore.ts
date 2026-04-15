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
  updatePreferredSessionSize: (size: number) => Promise<void>
  updateTimezone: (timezone: string) => Promise<void>
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

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const [{ displayName, language, preferredSessionSize, timezone }, isAdmin] = await Promise.all([
          loadProfileData(session.user.id),
          checkAdmin(session.user.id),
        ])
        set({
          user: session.user,
          profile: toProfile(session.user, isAdmin, displayName, language, preferredSessionSize, timezone),
          loading: false,
        })
      } else {
        set({ loading: false })
      }
    } catch {
      set({ loading: false })
    }

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // Use setTimeout(0) to avoid Supabase auth deadlock when fetching
        // user data immediately after sign-in inside onAuthStateChange.
        setTimeout(async () => {
          try {
            // Insert only — do NOT overwrite existing display_name or language.
            // ignoreDuplicates: true means existing data is never overwritten by
            // auth metadata on subsequent sign-ins.
            await supabase
              .schema('indonesian')
              .from('profiles')
              .upsert(
                { 
                  id: session.user!.id, 
                  display_name: session.user!.user_metadata?.full_name ?? null,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                { onConflict: 'id', ignoreDuplicates: true }
              )
            const [{ displayName, language, preferredSessionSize, timezone }, isAdmin] = await Promise.all([
              loadProfileData(session.user!.id),
              checkAdmin(session.user!.id),
            ])
            set({ user: session.user, profile: toProfile(session.user!, isAdmin, displayName, language, preferredSessionSize, timezone) })
          } catch (err) {
            console.error('[authStore] Failed to load profile after sign-in:', err)
            set({ user: session.user, profile: null })
          }
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
    await updateProfile(get, set, { display_name: name.trim() || null }, { fullName: name.trim() || null })
  },

  updateLanguage: async (lang) => {
    await updateProfile(get, set, { language: lang }, { language: lang })
  },

  updatePreferredSessionSize: async (size) => {
    await updateProfile(get, set, { preferred_session_size: size }, { preferredSessionSize: size })
  },

  updateTimezone: async (timezone) => {
    await updateProfile(get, set, { timezone }, { timezone })
  },
}))

async function updateProfile(
  get: () => AuthState,
  set: (partial: Partial<AuthState> | ((state: AuthState) => Partial<AuthState>)) => void,
  dbFields: Record<string, unknown>,
  profilePatch: Partial<UserProfile>,
): Promise<void> {
  const user = get().user
  if (!user) return
  const { data, error } = await supabase
    .schema('indonesian')
    .from('profiles')
    .update({ ...dbFields, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Profile not found or update blocked')
  set((state) => ({
    profile: state.profile ? { ...state.profile, ...profilePatch } : null,
  }))
}

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

async function loadProfileData(userId: string): Promise<{ displayName: string | null; language: 'nl' | 'en'; preferredSessionSize: number; timezone: string | null }> {
  const { data } = await supabase
    .schema('indonesian')
    .from('profiles')
    .select('display_name, language, preferred_session_size, timezone')
    .eq('id', userId)
    .maybeSingle()
  return {
    displayName: data?.display_name ?? null,
    language: data?.language === 'en' ? 'en' : 'nl',
    preferredSessionSize: data?.preferred_session_size ?? 15,
    timezone: data?.timezone ?? null,
  }
}

function toProfile(user: User, isAdmin: boolean, displayName: string | null, language: 'nl' | 'en', preferredSessionSize: number, timezone: string | null): UserProfile {
  return {
    id: user.id,
    email: user.email!,
    fullName: displayName,
    language,
    preferredSessionSize,
    timezone,
    isAdmin,
  }
}
