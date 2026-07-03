// src/components/ProtectedRoute.tsx
import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Center, Loader } from '@mantine/core'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

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

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    )
  }

  if (!user) {
    if (devBypass) return <>{children}</>
    // Logged-out visits land on the public landing page at `/` (desktop
    // program slice 1), carrying a `next` param the landing page forwards to
    // /login so the learner still lands back where they were headed. Never
    // bounce to `https://auth.duin.home/login` — the homelab SSO form converts
    // whatever the visitor types into `<name>@duin.home`, so it structurally
    // cannot authenticate a customer's own email (docs/audits/
    // 2026-07-02-ux-failure-modes-audit.md CRIT-1).
    //
    // NOTE: the Traefik-level `duinhuis-auth@docker` forward-auth middleware
    // on this container is a separate infra-layer gate that still bounces
    // unauthenticated requests before they ever reach this React app. That
    // middleware needs removing in homelab-configs at cloud-exposure time —
    // out of scope for this fix.
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/?next=${encodeURIComponent(next)}`} replace />
  }

  return <>{children}</>
}
