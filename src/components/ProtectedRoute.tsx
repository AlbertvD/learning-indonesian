// src/components/ProtectedRoute.tsx
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Center, Loader } from '@mantine/core'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  useEffect(() => {
    if (!loading && !user) {
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
