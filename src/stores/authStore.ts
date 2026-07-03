// src/stores/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/auth'
import { logError } from '@/lib/logger'
import { setLessonActivated } from '@/lib/lessons'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
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

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        // Only SIGNED_IN needs the profile upsert + profile/admin reload.
        // initialize() already runs its own getSession() + profile load on
        // startup, and supabase-js fires an INITIAL_SESSION event once the
        // listener below is registered — gating on SIGNED_IN only (not also
        // INITIAL_SESSION) avoids re-fetching what initialize() just loaded.
        // TOKEN_REFRESHED / USER_UPDATED fire hourly on long-lived tabs and
        // carry no new profile data, so they must not re-upsert or re-fetch.
        if (event === 'SIGNED_IN') {
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
              logError({ page: 'auth', action: 'load-profile-after-signin', error: err })
              set({ user: session.user, profile: null })
            }
          }, 0)

          // Auto-activate the legacy starter lessons (1-3) for new sign-ins.
          // Idempotent — set_lesson_activation uses ON CONFLICT DO NOTHING.
          // Deferred per the same auth-deadlock pattern as the profile load.
          setTimeout(() => {
            void activateStarterLessons(session.user!.id)
          }, 0)
        } else {
          // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, etc. — keep the
          // store's user fresh without re-upserting or re-fetching the
          // profile/admin state. Preserves the existing profile untouched.
          set({ user: session.user })
        }
      } else {
        set({ user: null, profile: null })
      }
    })
    authSubscription = data.subscription
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Set the user immediately: Login navigates to the `?next=` destination as
    // soon as this resolves, and ProtectedRoute would bounce that navigation if
    // it still saw user=null. The SIGNED_IN handler above defers its store
    // update behind a profile fetch (auth-deadlock setTimeout), which loses the
    // race. A user-without-profile store state is already legal — the
    // INITIAL_SESSION branch produces it too; the profile follows moments later.
    if (data.user) set({ user: data.user })
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

async function activateStarterLessons(userId: string): Promise<void> {
  try {
    const { data: lessons } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, order_index')
      .in('order_index', [1, 2, 3])

    const rows = (lessons ?? []) as Array<{ id: string; order_index: number }>
    if (rows.length === 0) return

    await Promise.allSettled(
      rows.map(lesson => setLessonActivated(userId, lesson.id, true)),
    )
  } catch (err) {
    logError({ page: 'auth', action: 'activate-starter-lessons', error: err })
    // non-blocking — user can self-activate via the lesson page
  }
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
