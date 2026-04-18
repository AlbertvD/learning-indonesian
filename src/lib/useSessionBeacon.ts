import { useEffect } from 'react'
import { endSessionBeacon } from '@/lib/session'

// Attach pagehide + visibilitychange listeners that beacon the session's
// ended_at the moment the page goes away. Use alongside (not instead of) the
// useEffect cleanup endSession — the cleanup catches in-app navigation and
// the beacon catches tab close, mobile background, browser kill, etc.
//
// React's useEffect cleanup is a poor signal for "page going away" because:
//   1. The fetch it kicks off is fire-and-forget; if the browser kills the
//      tab before the fetch reaches the network, ended_at is never written.
//   2. Bfcache restores skip the cleanup entirely on some browsers.
// pagehide fires reliably on tab close + bfcache eviction, and visibilitychange
// catches the iOS/Android case where the user backgrounds the app.
export function useSessionBeacon(sessionIdRef: { current: string | null }): void {
  useEffect(() => {
    const fire = () => {
      if (sessionIdRef.current) endSessionBeacon(sessionIdRef.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fire()
    }
    window.addEventListener('pagehide', fire)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', fire)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sessionIdRef])
}
