// src/components/ProtectedRoute.tsx
import React, { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Center, Loader } from '@mantine/core'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  // Dev-only bypass: append `?bypassAuth=1` to any URL to view pages without signing in.
  // This is safe because it's only enabled during `vite` dev mode.
  const devBypass = import.meta.env.DEV && new URL(window.location.href).searchParams.get('bypassAuth') === '1'
  const devInitializedRef = React.useRef(false)

  // If devBypass is active, populate the auth store with a lightweight
  // fake user/profile so pages that read `useAuthStore().user` can fetch data
  // (or skip early-returns) instead of hanging on loaders.
  useEffect(() => {
    if (!devBypass || devInitializedRef.current) return
    devInitializedRef.current = true
    try {
      useAuthStore.setState({
        user: { id: 'dev-user', email: 'dev@local' } as any,
        profile: { id: 'dev-user', email: 'dev@local', fullName: 'Dev User', language: 'nl', isAdmin: true },
        loading: false,
      } as any)
    } catch {
      // ignore — dev helper only
    }
  }, [devBypass])

  const redirectedRef = React.useRef(false)
  useEffect(() => {
    if (!loading && !user && !redirectedRef.current && !devBypass) {
      redirectedRef.current = true
      if (import.meta.env.DEV) {
        // In dev mode, redirect to local login page instead of auth.duin.home
        window.location.href = '/login'
      } else {
        window.location.href = `https://auth.duin.home/login?next=${encodeURIComponent(window.location.href)}`
      }
    }
  }, [user, loading, devBypass])

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    )
  }

  if (!user) {
    if (devBypass) return <>{children}</>
    return null
  }

  return <>{children}</>
}
