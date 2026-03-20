// src/pages/Login.tsx
import { useEffect } from 'react'

export function Login() {
  useEffect(() => {
    const next = encodeURIComponent(window.location.origin + '/')
    window.location.replace(`https://auth.duin.home/login?next=${next}`)
  }, [])

  return null
}
