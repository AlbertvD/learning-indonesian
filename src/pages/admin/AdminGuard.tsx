// src/pages/admin/AdminGuard.tsx
// Admin-only route guard. Renders full-page loader while auth is initializing
// (authStore.loading === true) to prevent redirect flicker; only redirects to
// / once loading is done AND profile is confirmed non-admin.
// See docs/plans/2026-04-23-exercise-framework-design.md §9.1

import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { useAuthStore } from '@/stores/authStore'
import type { ReactNode } from 'react'

interface AdminGuardProps {
  children: ReactNode
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { profile, loading } = useAuthStore()

  useEffect(() => {
    // Redirect happens via <Navigate> below for SR correctness.
  }, [profile, loading])

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    )
  }

  if (!profile?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
