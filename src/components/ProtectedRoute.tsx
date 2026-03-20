// src/components/ProtectedRoute.tsx
import React, { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Center, Loader } from '@mantine/core'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  const redirectedRef = React.useRef(false)
  useEffect(() => {
    if (!loading && !user && !redirectedRef.current) {
      redirectedRef.current = true
      window.location.href = `https://auth.duin.home/login?next=${encodeURIComponent(window.location.href)}`
    }
  }, [user, loading])

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
