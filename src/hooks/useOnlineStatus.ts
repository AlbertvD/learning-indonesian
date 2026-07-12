// src/hooks/useOnlineStatus.ts
//
// Tracks `navigator.onLine`, kept live via the browser's `online`/`offline`
// window events. Pure state — no service-worker or caching behaviour; the
// offline banner (OfflineBanner.tsx) is the only consumer today, but this is
// generic enough for any future "you're offline" affordance.
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
