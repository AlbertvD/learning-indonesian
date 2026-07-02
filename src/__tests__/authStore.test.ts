// src/__tests__/authStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'

// Build a chainable mock that mirrors supabase.schema('x').from('y').select().eq().maybeSingle()
function createChainableMock(terminal: Record<string, any> = {}) {
  const chain: any = {}
  const chainMethods = ['from', 'select', 'eq', 'in', 'order', 'limit', 'lte', 'update', 'upsert']
  for (const method of chainMethods) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  Object.assign(chain, terminal)
  return chain
}

const mockChain = createChainableMock()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    schema: vi.fn(() => mockChain),
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

    // First maybeSingle: loadProfileData
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { display_name: 'Test User', language: 'nl', preferred_session_size: 15, timezone: null },
      error: null,
    })
    // Second maybeSingle: checkAdmin
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null })

    await useAuthStore.getState().initialize()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(mockChain.from).toHaveBeenCalledWith('profiles')
    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().profile).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Test User',
      language: 'nl',
      preferredSessionSize: 15,
      isAdmin: false,
      timezone: null,
    })
    expect(useAuthStore.getState().loading).toBe(false)
  })

  it('updateDisplayName updates profile in store and calls correct Supabase chain', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as any,
      profile: { id: 'user-1', fullName: 'Old Name', language: 'nl', preferredSessionSize: 15, isAdmin: false, timezone: null } as any
    })
    // .update().eq().select() returns data
    mockChain.select.mockResolvedValueOnce({ data: [{ id: 'user-1' }], error: null })

    await useAuthStore.getState().updateDisplayName('New Name')

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(mockChain.from).toHaveBeenCalledWith('profiles')
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'New Name' })
    )
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(useAuthStore.getState().profile?.fullName).toBe('New Name')
  })

  it('updateLanguage updates language in store and verifies Supabase call', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as any,
      profile: { id: 'user-1', fullName: 'Test User', language: 'nl', preferredSessionSize: 15, isAdmin: false, timezone: null } as any,
    })
    mockChain.select.mockResolvedValueOnce({ data: [{ id: 'user-1' }], error: null })

    await useAuthStore.getState().updateLanguage('en')

    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    )
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(useAuthStore.getState().profile?.language).toBe('en')
  })

  describe('onAuthStateChange handler', () => {
    // Capture the listener that initialize() registers so tests can fire
    // synthetic auth events without going through a real Supabase session.
    async function initializeAndCaptureListener() {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any)
      await useAuthStore.getState().initialize()
      const call = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0]
      return call[0] as (event: string, session: any) => Promise<void> | void
    }

    it('TOKEN_REFRESHED with a session updates user without upserting or fetching the profile', async () => {
      const listener = await initializeAndCaptureListener()
      const existingProfile = { id: 'user-1', fullName: 'Existing', language: 'nl', preferredSessionSize: 15, isAdmin: false, timezone: null }
      useAuthStore.setState({ user: null, profile: existingProfile as any })
      vi.clearAllMocks()

      const mockUser = { id: 'user-1', email: 'test@example.com', user_metadata: {} }
      await listener('TOKEN_REFRESHED', { user: mockUser })

      expect(mockChain.upsert).not.toHaveBeenCalled()
      // No profile/admin reload — schema() should not be called for a profiles select.
      expect(mockChain.select).not.toHaveBeenCalled()
      expect(useAuthStore.getState().user).toEqual(mockUser)
      // Existing profile is preserved, not cleared or reloaded.
      expect(useAuthStore.getState().profile).toEqual(existingProfile)
    })

    it('SIGNED_IN still upserts the profile and reloads profile/admin data', async () => {
      const listener = await initializeAndCaptureListener()
      vi.clearAllMocks()
      mockChain.maybeSingle
        .mockResolvedValueOnce({ data: { display_name: 'Test User', language: 'nl', preferred_session_size: 15, timezone: null }, error: null })
        .mockResolvedValueOnce({ data: null })

      const mockUser = { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } }
      await listener('SIGNED_IN', { user: mockUser })
      // The handler defers work via setTimeout(0) to avoid the Supabase auth deadlock.
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true })
      )
      expect(useAuthStore.getState().user).toEqual(mockUser)
      expect(useAuthStore.getState().profile).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        language: 'nl',
        preferredSessionSize: 15,
        isAdmin: false,
        timezone: null,
      })
    })
  })
})
