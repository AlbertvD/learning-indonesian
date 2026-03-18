// src/__tests__/authStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  },
}))

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: null, profile: null, loading: false })
  })

  it('signIn calls supabase.auth.signInWithPassword with correct credentials', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: {} as any, error: null })
    
    await useAuthStore.getState().signIn('test@example.com', 'password')
    
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    })
  })

  it('signOut calls supabase and clears state', async () => {
    useAuthStore.setState({ user: { id: '1' } as any, profile: { id: '1' } as any })
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })

    await useAuthStore.getState().signOut()

    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('initialize sets user if session exists', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } }
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: mockUser } } } as any)
    vi.mocked(supabase.schema).mockReturnThis()
    vi.mocked(supabase.from).mockReturnThis()
    vi.mocked((supabase as any).select).mockReturnThis()
    vi.mocked((supabase as any).eq).mockReturnThis()
    
    // First maybeSingle: loadProfileData
    vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({
      data: { display_name: 'Test User', language: 'nl' },
      error: null,
    })
    // Second maybeSingle: checkAdmin
    vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({ data: null })

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().profile).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Test User',
      language: 'nl',
      isAdmin: false,
    })
    expect(useAuthStore.getState().loading).toBe(false)
  })

  it('updateDisplayName updates profile in store', async () => {
    useAuthStore.setState({ 
      user: { id: 'user-1' } as any, 
      profile: { id: 'user-1', fullName: 'Old Name', language: 'nl', isAdmin: false } as any 
    })
    vi.mocked((supabase as any).upsert).mockResolvedValue({ error: null })

    await useAuthStore.getState().updateDisplayName('New Name')

    expect((supabase as any).upsert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'New Name' }),
      { onConflict: 'id' }
    )
    expect(useAuthStore.getState().profile?.fullName).toBe('New Name')
  })

  it('updateLanguage updates language in store', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as any,
      profile: { id: 'user-1', fullName: 'Test User', language: 'nl', isAdmin: false } as any,
    })
    vi.mocked((supabase as any).upsert).mockResolvedValue({ error: null })

    await useAuthStore.getState().updateLanguage('en')

    expect((supabase as any).upsert).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' }),
      { onConflict: 'id' }
    )
    expect(useAuthStore.getState().profile?.language).toBe('en')
  })
})
