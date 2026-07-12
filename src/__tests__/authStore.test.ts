import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

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
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    schema: vi.fn(() => mockChain),
  },
}))

// The store's initialize()/SIGNED_IN handler fetches profile, admin, and
// entitlement IN PARALLEL via Promise.all([loadProfileData, checkAdmin,
// loadEntitlementStatus]) — each hits supabase.schema(...).maybeSingle() once,
// synchronously up to that call, so they consume mockChain.maybeSingle's
// mockResolvedValueOnce queue in that fixed order: profile, admin, entitlement.
function queueProfileAdminEntitlement(
  profile: { data: any; error?: any } | null,
  admin: { data: any } | null,
  entitlement: { data: any; error?: any } | null,
) {
  mockChain.maybeSingle.mockResolvedValueOnce(profile ?? { data: null, error: null })
  mockChain.maybeSingle.mockResolvedValueOnce(admin ?? { data: null })
  mockChain.maybeSingle.mockResolvedValueOnce(entitlement ?? { data: null, error: null })
}

const BASE_PROFILE_ROW = { data: { display_name: 'Test User', language: 'nl', preferred_session_size: 15, timezone: null }, error: null }

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

  it('signUp calls supabase.auth.signUp with credentials + full_name metadata and sets the user immediately', async () => {
    const mockUser = { id: 'user-2', email: 'new@example.com' }
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user: mockUser, session: {} as any }, error: null } as any)

    await useAuthStore.getState().signUp('new@example.com', 'password123', 'Jan de Vries')

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { full_name: 'Jan de Vries' } },
    })
    expect(useAuthStore.getState().user).toEqual(mockUser)
  })

  it('signUp throws on a GoTrue error and does not set the user', async () => {
    const authError = new Error('user_already_exists')
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user: null, session: null }, error: authError } as any)

    await expect(useAuthStore.getState().signUp('taken@example.com', 'password123', 'Jan')).rejects.toThrow()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('signInWithGoogle calls supabase.auth.signInWithOAuth with provider google and a /login redirect', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { url: 'https://accounts.google.com/...', provider: 'google' } as any, error: null })

    await useAuthStore.getState().signInWithGoogle()

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: expect.stringMatching(/\/login$/) },
    })
  })

  it('signInWithGoogle forwards a next param on the redirectTo so the round trip returns to the right page', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { url: 'https://accounts.google.com/...', provider: 'google' } as any, error: null })

    await useAuthStore.getState().signInWithGoogle('/progress?tab=woordenschat')

    const call = vi.mocked(supabase.auth.signInWithOAuth).mock.calls[0][0]
    expect(call.options?.redirectTo).toContain('/login?next=')
    expect(call.options?.redirectTo).toContain(encodeURIComponent('/progress?tab=woordenschat'))
  })

  it('signInWithGoogle throws on a GoTrue error', async () => {
    const oauthError = new Error('oauth_provider_error')
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { url: null, provider: 'google' }, error: oauthError } as any)

    await expect(useAuthStore.getState().signInWithGoogle()).rejects.toThrow()
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

    queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: null, error: null })

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
      isEntitled: false,
      timezone: null,
    })
    expect(useAuthStore.getState().loading).toBe(false)
  })

  it('initialize logs the failure and still resolves loading=false when session-restore throws (silent-failure fix)', async () => {
    const sessionError = new Error('Failed to fetch')
    vi.mocked(supabase.auth.getSession).mockRejectedValue(sessionError)

    await useAuthStore.getState().initialize()

    expect(logError).toHaveBeenCalledWith({ page: 'auth', action: 'initialize', error: sessionError })
    expect(useAuthStore.getState().loading).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('updateDisplayName updates profile in store and calls correct Supabase chain', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as any,
      profile: { id: 'user-1', fullName: 'Old Name', language: 'nl', preferredSessionSize: 15, isAdmin: false, isEntitled: false, timezone: null } as any
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
      profile: { id: 'user-1', fullName: 'Test User', language: 'nl', preferredSessionSize: 15, isAdmin: false, isEntitled: false, timezone: null } as any,
    })
    mockChain.select.mockResolvedValueOnce({ data: [{ id: 'user-1' }], error: null })

    await useAuthStore.getState().updateLanguage('en')

    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    )
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(useAuthStore.getState().profile?.language).toBe('en')
  })

  describe('entitlement / isEntitled', () => {
    const mockUser = { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } }

    beforeEach(() => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: mockUser } } } as any)
    })

    it.each(['active', 'past_due', 'comped'] as const)('isEntitled=true when the entitlement row status is %s', async (status) => {
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: { status, source: status === 'comped' ? 'comp' : 'stripe' }, error: null })

      await useAuthStore.getState().initialize()

      expect(useAuthStore.getState().profile?.isEntitled).toBe(true)
    })

    it('isEntitled=false when the entitlement row status is canceled', async () => {
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: { status: 'canceled', source: 'stripe' }, error: null })

      await useAuthStore.getState().initialize()

      expect(useAuthStore.getState().profile?.isEntitled).toBe(false)
    })

    it('isEntitled=false when there is no entitlement row at all', async () => {
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: null, error: null })

      await useAuthStore.getState().initialize()

      expect(useAuthStore.getState().profile?.isEntitled).toBe(false)
    })

    it('isEntitled=true for an admin even with no entitlement row (admin bypass)', async () => {
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: { role: 'admin' } }, { data: null, error: null })

      await useAuthStore.getState().initialize()

      expect(useAuthStore.getState().profile?.isAdmin).toBe(true)
      expect(useAuthStore.getState().profile?.isEntitled).toBe(true)
    })

    it('entitlement fetch failure does not break sign-in — isEntitled defaults to false and the failure is logged', async () => {
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: null, error: { message: 'read failed' } })

      await useAuthStore.getState().initialize()

      expect(useAuthStore.getState().user).toEqual(mockUser)
      expect(useAuthStore.getState().profile?.isEntitled).toBe(false)
      expect(logError).toHaveBeenCalledWith({ page: 'auth', action: 'load-entitlement', error: expect.anything() })
    })
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
      const existingProfile = { id: 'user-1', fullName: 'Existing', language: 'nl', preferredSessionSize: 15, isAdmin: false, isEntitled: false, timezone: null }
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

    it('SIGNED_IN still upserts the profile and reloads profile/admin/entitlement data', async () => {
      const listener = await initializeAndCaptureListener()
      vi.clearAllMocks()
      queueProfileAdminEntitlement(BASE_PROFILE_ROW, { data: null }, { data: null, error: null })

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
        isEntitled: false,
        timezone: null,
      })
    })
  })
})
