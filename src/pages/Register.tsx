// src/pages/Register.tsx
import { useEffect } from 'react'

export function Register() {
  useEffect(() => {
    const next = encodeURIComponent(window.location.origin + '/')
    window.location.replace(`https://auth.duin.home/login?next=${next}`)
  }, [])

  return null
}
